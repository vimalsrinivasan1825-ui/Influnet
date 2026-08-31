import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { CollabRequestSchema } from '@/lib/validators';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { requireVerifiedOwnership } from '@/lib/ownership-gate';
import { requireQuota } from '@/lib/entitlements';
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
      .select('id, title, status, current_stage, flow_key, owner_user_id, counterparty_user_id, collab_request_id, created_at')
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
        /**
         * `current_stage` and `flow_key` ride along so the request list can
         * draw how far a live collaboration has actually got.
         *
         * Both were already being selected above for the annotation pass and
         * then thrown away here, so this costs nothing. `flow_key` matters as
         * much as the stage: the full flow has twelve stages and the short
         * ones have four, and a strip that assumed twelve would report a
         * finished short project as a third done.
         */
        project: project
          ? {
              id: project.id,
              title: project.title,
              status: project.status,
              current_stage: project.current_stage,
              flow_key: project.flow_key ?? null,
            }
          : null,
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

    // The RECIPIENT must be a creator. Only the sender's role was ever checked
    // (withAuth above), so a business could send a collab request to another
    // business: the row was created, appeared in the recipient's inbox, and —
    // since the deal flow keys off the request rather than the roles — could be
    // carried into a conversation and a project between two brands, in a data
    // model that assumes owner = business and counterparty = creator throughout.
    const { data: recipient, error: recipientErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', to_user_id)
      .maybeSingle();

    if (recipientErr) {
      return jsonError(500, 'Could not check who this request is for', recipientErr);
    }
    if (!recipient) {
      return jsonError(404, 'That account no longer exists.');
    }
    if (recipient.role !== 'influencer') {
      return jsonError(400, 'Collaboration requests can only be sent to creators.');
    }

    // Combine project_title + message into the `message` field for storage
    const messageText = [project_title, project_description].filter(Boolean).join('\n\n');

    // Plan quota. Deliberately the LAST check before the write: everything that
    // could reject this request on its own merits (blocks, recipient role,
    // validation) has already run, so a unit is only ever spent on a request
    // that is genuinely about to be created.
    //
    // It still has to come BEFORE the insert rather than after, because
    // consume_quota() increments and tests in one statement — that is what stops
    // two requests sent at the same instant both passing on the last free slot.
    // The cost of that ordering is handled by the release in the error path below.
    const overQuota = await requireQuota(
      { supabase, user },
      'requests_month',
      'You have used all your collaboration requests for this month. Upgrade to Pro for more.',
    );
    if (overQuota) return overQuota;

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
      // The request was not created, so give the quota unit back. Without this
      // a user who taps "send" twice on the same creator — which lands on the
      // 23505 branch below — pays two units for the one request they got.
      // Fire-and-forget: failing to refund must never turn a handled 4xx into
      // a 500, and the counter resets monthly regardless.
      void (supabase.rpc as any)('release_quota', { p_meter: 'requests_month' }).then(
        () => {},
        () => {},
      );

      // These are USER-INPUT errors, not server faults, and they were all
      // falling through to a 500 — which is both the wrong answer for the
      // caller and noise in error monitoring.
      if (error.code === '23505') {
        return jsonError(409, 'You already have a pending request to this user');
      }
      if (error.code === '23514') {
        // CHECK violation — collab_requests_no_self is the only one here.
        return jsonError(400, 'You can’t send a collaboration request to yourself.');
      }
      if (error.code === '23503') {
        // FK violation — to_user_id doesn't exist.
        return jsonError(404, 'That account no longer exists.');
      }
      if (error.code === '22P05') {
        // Postgres rejects   in text. Reaching here means an unprintable
        // character survived validation; tell the caller rather than 500.
        return jsonError(400, 'That message contains characters we can’t store. Please remove any unusual symbols and try again.');
      }
      return jsonError(500, 'Failed to insert collab request', error);
    }

    const names = await profileNames([to_user_id, user.id]);

    await notifyUser({
      userId: to_user_id,
      type: 'collab_request',
      title: 'New collaboration request',
      body: project_title
        ? `A brand reached out about “${project_title}”. Accept it to open a conversation and talk terms.`
        : 'A brand reached out to collaborate. Accept it to open a conversation and talk terms.',
      link: '/dashboard/requests',
      email: {
        templateId: 'collab_request',
        // Keyed on the request row, so a client retry that hits the unique
        // index and re-POSTs can't mail the creator twice.
        dedupeKey: `collab_request:${data.id}`,
        data: {
          creatorName: nameOf(names, to_user_id),
          businessName: nameOf(names, user.id),
          projectName: project_title || 'a collaboration',
          budget: budget || null,
          deliverables: project_description || null,
          deadline: null,
          dashboardUrl: '/dashboard/requests',
        },
      },
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
    const { supabase, user, role } = auth;

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

    // Both sides' names, for whichever notification branch runs below. Fetched
    // here rather than beside the row fetch so the guards above — which can
    // return 400/403/409 — don't pay for a lookup nothing will use. POST stores
    // `project_title\n\ndescription` in one column, so the title is line one.
    const names = await profileNames([collab.from_user_id, collab.to_user_id]);
    const businessName = nameOf(names, collab.from_user_id);
    const creatorName = nameOf(names, collab.to_user_id);
    const projectName = collab.message?.split('\n')[0]?.trim() || 'a collaboration';

    let updated;
    let conversationId: string | null = null;

    if (status === 'accepted') {
      // A creator who hasn't proven ownership of their Instagram yet can't
      // accept — see lib/ownership-gate.ts. Businesses aren't subject to this.
      const gateRes = await requireVerifiedOwnership(supabase, user, role);
      if (gateRes) return gateRes;

      // Accepting opens the CONVERSATION only. No project is created here —
      // the two sides negotiate first and then either of them proposes a
      // project with the agreed terms (POST /api/projects).
      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_collab_request', {
        request_id: id
      });
      if (rpcError) return jsonError(500, 'Failed to accept collab request', rpcError);
      conversationId = (rpcResult?.conversation_id as string | undefined) ?? null;

      const chatLink = conversationId
        ? `/dashboard/messages?conv=${conversationId}`
        : '/dashboard/messages';

      await notifyUser({
        userId: collab.from_user_id,
        type: 'collab_accepted',
        title: 'Your collaboration request was accepted',
        body: 'The creator accepted — start the conversation to agree on scope and budget, then create the project.',
        link: chatLink,
        email: {
          templateId: 'collab_accepted',
          dedupeKey: `collab_accepted:${collab.id}`,
          data: { businessName, creatorName, projectName, dashboardUrl: chatLink },
        },
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
          email: {
            templateId: 'collab_declined',
            dedupeKey: `collab_declined:${collab.id}`,
            data: { businessName, creatorName, projectName, discoveryUrl: '/dashboard/discover' },
          },
        });
      }

      if (status === 'pending') {
        await notifyUser({
          userId: collab.from_user_id,
          type: 'collab_request',
          title: 'A creator reopened your request',
          body: 'They changed their mind — it’s back on. Accept it to open a conversation.',
          link: '/dashboard/requests',
          email: {
            // Deliberately `generic`, not collab_request: that template is
            // addressed to the creator ("X wants to work with you") and the
            // recipient here is the business getting its own request back.
            templateId: 'generic',
            // A request can be declined and reopened repeatedly, so the row id
            // alone would suppress every reopen after the first. updated_at
            // moves on each transition, which is exactly the granularity we
            // want: retries of one reopen collapse, a later reopen does not.
            dedupeKey: `collab_reopened:${collab.id}:${
              (stdUpdated as { updated_at?: string } | null)?.updated_at ?? ''
            }`,
            data: {
              title: `${creatorName} reopened your request`,
              body: `${creatorName} changed their mind about “${projectName}” — the request is back in your dashboard. Accepting opens a conversation where you agree the details.`,
              link: '/dashboard/requests',
              ctaLabel: 'Open the request',
            },
          },
        });
      }
    }

    return NextResponse.json({ collab: updated, conversation_id: conversationId });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

