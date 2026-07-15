import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { CollabRequestSchema } from '@/lib/validators';
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

    return NextResponse.json({ collabs });
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

    // Approval gate: pending/rejected businesses can browse the dashboard (soft
    // banner) but cannot reach out to creators until an admin approves them.
    // Enforced server-side — the UI lock is not a security boundary.
    const { data: bizProfile } = await supabase
      .rpc('get_own_business_profile')
      .single();

    if ((bizProfile as { approval_status?: string } | null)?.approval_status !== 'approved') {
      return jsonError(403, 'Your business account is still under review. You can reach out to creators once it’s approved.');
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

    if (status !== 'accepted') {
      if (collab.status !== 'pending') {
        return jsonError(409, `This request is already ${collab.status} and can no longer be changed.`);
      }
      if (status === 'declined' && !isReceiver) {
        return jsonError(403, 'Only the recipient can decline a request.');
      }
      if (status === 'cancelled' && !isSender) {
        return jsonError(403, 'Only the sender can cancel a request.');
      }
      if (status === 'pending') {
        return jsonError(400, 'A request cannot be moved back to pending.');
      }
    }

    let updated;

    if (status === 'accepted') {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_collab_request', {
        request_id: id
      });
      if (rpcError) return jsonError(500, 'Failed to accept collab request', rpcError);

      // Fetch the updated collab to return
      const { data: fetchUpdated, error: refetchError } = await supabase
        .from('collab_requests')
        .select('*')
        .eq('id', id)
        .single();
      if (refetchError) return jsonError(500, 'Failed to refetch updated collab', refetchError);
      updated = fetchUpdated;
    } else {
      // Standard update for declined / cancelled (guarded above).
      const { data: stdUpdated, error: updateError } = await supabase
        .from('collab_requests')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (updateError) return jsonError(500, 'Failed to update request status', updateError);
      updated = stdUpdated;
    }

    return NextResponse.json({ collab: updated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

