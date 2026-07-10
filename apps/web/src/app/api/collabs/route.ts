import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
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
        sender:profiles!collab_requests_from_user_id_fkey(name, email, role),
        receiver:profiles!collab_requests_to_user_id_fkey(name, email, role)
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

    // Fetch the collab request before updating so we have both user IDs
    const { data: collab, error: fetchError } = await supabase
      .from('collab_requests')
      .select('id, from_user_id, to_user_id, message, budget')
      .eq('id', id)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .single();

    if (fetchError || !collab) {
      return jsonError(404, 'Request not found or access denied', fetchError);
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
      // Standard update for rejected or other statuses
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

