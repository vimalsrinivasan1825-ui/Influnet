import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { CollabRequestSchema } from '@/lib/validators';
import { notifyUser } from '@/lib/notify';
import { z } from 'zod';

// PATCH Collab Schema (since it only exists here for now)
const PatchCollabSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'declined', 'cancelled'])
});

// GET all collaboration requests for the authenticated user
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Rate limit: collab listing runs a RLS query with a project look-up.
    const limited = await enforceRateLimit(req, {
      bucket: 'collabs:list', limit: 30, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    // Get as sender or receiver
    const { data: collabs, error } = await supabase
      .from('collab_requests')
      .select(`
        *,
        sender:profiles!collab_requests_from_user_id_fkey(name, role),
        receiver:profiles!collab_requests_to_user_id_fkey(name, role)
      `)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      return jsonError(500, 'Database query error', error);
    }

    // Annotate each request with what actually became of it. Without this the
    // page shows a long-finished collaboration as a live "Accepted" request
    // still needing attention.
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select('id, title, status, current_stage, owner_user_id, counterparty_user_id, collab_request_id, created_at')
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`);

    // Terms nobody has accepted are NOT this request's outcome. A brand and a
    // creator reuse one request row across successive deals, so a brand-new
    // proposal would otherwise relabel a collaboration that already finished —
    // which is exactly how a completed Product-Launch came to read
    // "Terms awaiting approval". Pending terms live in the conversation; they
    // never describe the state of a past deal.
    const realProjects = (projects || []).filter((p: any) => p.status !== 'pending_acceptance');

    const pairKey = (a: string, b: string) => [a, b].sort().join('|');
    const byPair = new Map<string, any[]>();
    for (const p of realProjects) {
      const key = pairKey(p.owner_user_id, p.counterparty_user_id);
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(p);
    }

    // Sending is no longer gated on admin approval — the creator sees the
    // sender's approval status instead, so an unverified business is a
    // visible choice rather than a silent block. One batched query for every
    // business sender in this list, not per-row.
    const senderBusinessIds = [
      ...new Set(
        (collabs || [])
          .filter((c: any) => c.sender?.role === 'business_owner')
          .map((c: any) => c.from_user_id)
      ),
    ];
    const approvalByUserId = new Map<string, string>();
    if (senderBusinessIds.length > 0) {
      const { data: senderBiz, error: bizErr } = await supabase
        .from('business_profiles')
        .select('user_id, approval_status')
        .in('user_id', senderBusinessIds);
      // Reading another business's approval_status needs the GRANT from
      // migration 094. Until that is applied this errors, and swallowing it was
      // the worst of both worlds: the approval GATE had already been removed
      // (an unreviewed business can message creators now), while the precaution
      // that replaced it silently rendered nothing. Creators got neither.
      //
      // Logged rather than 500'd — the request list is far more useful than the
      // flag — but the flag now fails SAFE, below.
      if (bizErr) {
        console.error(
          '[collabs] could not read sender approval status (is migration 094 applied?):',
          bizErr.message,
        );
      }
      for (const b of senderBiz || []) approvalByUserId.set(b.user_id, b.approval_status);
    }

    const annotated = (collabs || []).map((c: any) => {
      const mine = byPair.get(pairKey(c.from_user_id, c.to_user_id)) || [];
      // Prefer the project this exact request produced; fall back to the pair's
      // most recent one, since projects created before collab_request_id
      // existed have it NULL.
      const exact = mine.find((p) => p.collab_request_id === c.id);
      const latest = [...mine].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      const project = exact ?? latest ?? null;
      const open = mine.find((p) => p.status !== 'completed' && p.status !== 'cancelled');
      return {
        ...c,
        project: project ? { id: project.id, title: project.title, status: project.status } : null,
        // Fail safe: a business sender whose status we could not read is
        // reported as 'unknown', not null. Both clients show the precaution for
        // any value other than 'approved', so an unreadable status now reads as
        // "not confirmed approved" — which is exactly what it is. Null meant
        // "hide the flag", i.e. the failure mode presented an unreviewed
        // business as if it had been reviewed.
        sender_business_approval_status:
          c.sender?.role === 'business_owner'
            ? (approvalByUserId.get(c.from_user_id) ?? 'unknown')
            : null,
        deal_state:
          c.status !== 'accepted' ? c.status
          : open ? 'in_progress'
          : project?.status === 'completed' ? 'completed'
          : project?.status === 'cancelled' ? 'project_cancelled'
          : 'in_discussion',
      };
    });

    return NextResponse.json({ collabs: annotated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// POST a new collab request
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req, { role: 'business_owner' });
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // A business still awaiting review (pending_review) may now reach out —
    // sending is no longer blocked on admin approval. The creator sees a
    // "not yet verified by Influnet" flag on the incoming request instead
    // (GET below embeds sender_business_approval_status), so they can decide
    // with that context rather than being silently protected from it.
    //
    // A business an admin actively REJECTED stays blocked — that's a real
    // negative decision about this specific account, not "hasn't been looked
    // at yet," and isn't something a flag on the request should substitute for.
    const { data: bizProfile } = await supabase
      .rpc('get_own_business_profile')
      .single();

    if ((bizProfile as { approval_status?: string } | null)?.approval_status === 'rejected') {
      return jsonError(403, 'Your business account was not approved. Contact support if you think this is a mistake.');
    }

    // Guard against collab-request spam (one business blasting many creators).
    const limited = await enforceRateLimit(req, { bucket: 'collabs:create', limit: 20, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = CollabRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { to_user_id, project_title, project_description, budget } = result.data;

    // A block stops contact in BOTH directions — the RLS RESTRICTIVE policy
    // (migration 076) enforces this regardless, but checking here first gives
    // a clear message instead of a bare RLS violation surfacing as a 500.
    const { data: blocked } = await supabase.rpc('is_blocked_pair', {
      a: user.id,
      b: to_user_id,
    });
    if (blocked) {
      return jsonError(403, 'You can no longer send requests to this account.');
    }

    // Combine project_title + message into the `message` field for storage
    const messageText = [project_title, project_description].filter(Boolean).join('\n\n');

    const { data, error } = await supabase
      .from('collab_requests')
      .insert({
        from_user_id: user.id,
        to_user_id,
        message: messageText || project_title || 'Collaboration Request',
        budget: budget || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return jsonError(409, 'You already have a pending request to this user');
      }
      return jsonError(500, 'Failed to insert collab request', error);
    }

    await notifyUser({
      userId: to_user_id,
      type: 'collab_request',
      title: 'New collaboration request',
      body: project_title
        ? `A brand reached out about “${project_title}”. Accept it to open a conversation and talk terms.`
        : 'A brand reached out to collaborate. Accept it to open a conversation and talk terms.',
      link: '/dashboard/requests',
    });

    return NextResponse.json({ collab: data });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// PATCH to update status — and auto-create project + conversation on accept
export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PatchCollabSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { id, status } = result.data;

    // Fetch the collab request before updating so we have both user IDs + state.
    const { data: collab, error: fetchError } = await supabase
      .from('collab_requests')
      .select('id, from_user_id, to_user_id, status, message, budget')
      .eq('id', id)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .single();

    if (fetchError || !collab) {
      return jsonError(404, 'Request not found or access denied', fetchError);
    }

    // State-machine guard. Without this a request could be declined/cancelled
    // AFTER it was accepted (desyncing it from the project the accept created),
    // or a party could act on the wrong side (sender declining, receiver
    // cancelling). Accept is enforced separately in accept_collab_request().
    const isSender = collab.from_user_id === user.id;
    const isReceiver = collab.to_user_id === user.id;

    if (status === 'pending') {
      // Reopening: the one path back for a creator who declined a request and
      // changed their mind. A brand can already reach a creator again with a
      // brand-new request — creators can't initiate contact at all (Discover
      // is business-only), so without this a decline was permanently terminal
      // from their side. Only the receiver may reopen, and only a request
      // they themselves declined; accepted/cancelled requests stay terminal.
      if (collab.status !== 'declined') {
        return jsonError(400, 'Only a declined request can be reopened.');
      }
      if (!isReceiver) {
        return jsonError(403, 'Only the recipient can reopen a request they declined.');
      }
    } else if (status !== 'accepted') {
      if (collab.status !== 'pending') {
        return jsonError(409, `This request is already ${collab.status} and can no longer be changed.`);
      }
      if (status === 'declined' && !isReceiver) {
        return jsonError(403, 'Only the recipient can decline a request.');
      }
      if (status === 'cancelled' && !isSender) {
        return jsonError(403, 'Only the sender can cancel a request.');
      }
    }

    let updated;
    let conversationId: string | null = null;

    if (status === 'accepted') {
      // Accepting opens the CONVERSATION only. No project is created here —
      // the two sides negotiate first and then either of them proposes a
      // project with the agreed terms (POST /api/projects).
      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_collab_request', {
        request_id: id
      });
      if (rpcError) return jsonError(500, 'Failed to accept collab request', rpcError);
      conversationId = (rpcResult?.conversation_id as string | undefined) ?? null;

      await notifyUser({
        userId: collab.from_user_id,
        type: 'collab_accepted',
        title: 'Your collaboration request was accepted',
        body: 'The creator accepted — start the conversation to agree on scope and budget, then create the project.',
        link: conversationId ? `/dashboard/messages?conv=${conversationId}` : '/dashboard/messages',
      });

      // Fetch the updated collab to return
      const { data: fetchUpdated, error: refetchError } = await supabase
        .from('collab_requests')
        .select('*')
        .eq('id', id)
        .single();
      if (refetchError) return jsonError(500, 'Failed to refetch updated collab', refetchError);
      updated = fetchUpdated;
    } else {
      // Standard update for declined / cancelled / reopened (guarded above).
      const { data: stdUpdated, error: updateError } = await supabase
        .from('collab_requests')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (updateError) {
        // Reopening can collide with the one-pending-per-pair unique index if
        // the sender already sent a fresh request to this creator in the
        // meantime — that new request is the live one to act on instead.
        if (updateError.code === '23505' && status === 'pending') {
          return jsonError(409, 'There’s already a newer pending request between you two — respond to that one instead.');
        }
        return jsonError(500, 'Failed to update request status', updateError);
      }
      updated = stdUpdated;

      if (status === 'declined') {
        await notifyUser({
          userId: collab.from_user_id,
          type: 'collab_declined',
          title: 'Collaboration request declined',
          body: 'The creator passed on this one.',
          link: '/dashboard/requests',
        });
      }

      if (status === 'pending') {
        await notifyUser({
          userId: collab.from_user_id,
          type: 'collab_request',
          title: 'A creator reopened your request',
          body: 'They changed their mind — it’s back on. Accept it to open a conversation.',
          link: '/dashboard/requests',
        });
      }
    }

    return NextResponse.json({ collab: updated, conversation_id: conversationId });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

