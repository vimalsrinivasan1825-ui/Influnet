import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';

// GET all collaboration requests (admin view)
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    // Fetch all collab requests with sender and receiver info
    const { data: collabs, error } = await supabase
      .from('collab_requests')
      .select(`
        *,
        sender:profiles!collab_requests_from_user_id_fkey(id, name, email, role),
        receiver:profiles!collab_requests_to_user_id_fkey(id, name, email, role)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ collabs: collabs || [] });
  } catch (error) {
    return jsonError(500, 'Could not load collaboration requests', error);
  }
}

// DELETE a collab request (admin force-delete)
export async function DELETE(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { collab_id } = await req.json();
    if (!collab_id) {
      return NextResponse.json({ error: 'collab_id is required' }, { status: 400 });
    }

    // Fetch the collab request first
    const { data: collab } = await supabase
      .from('collab_requests')
      .select('id')
      .eq('id', collab_id)
      .single();

    if (!collab) {
      return NextResponse.json({ error: 'Collaboration request not found' }, { status: 404 });
    }

    // Admin force-delete bypasses RLS
    const { error: deleteErr } = await supabase
      .from('collab_requests')
      .delete()
      .eq('id', collab_id);

    if (deleteErr) throw deleteErr;

    await auditAdmin({
      actorId: user.id, actorEmail: user.email, action: 'collab_deleted',
      targetId: String(collab_id), targetType: 'collab_request', req,
    });

    return NextResponse.json({
      ok: true,
      deleted: true,
      message: 'Collaboration request has been deleted by admin.'
    });
  } catch (error) {
    return jsonError(500, 'Could not delete this request', error);
  }
}

// PATCH to update a collab request status (admin override)
export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = await req.json();
    const { collab_id, status } = body;

    if (!collab_id || !status) {
      return NextResponse.json({ error: 'collab_id and status are required' }, { status: 400 });
    }

    if (!['pending', 'accepted', 'declined', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('collab_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', collab_id)
      .select()
      .single();

    if (error) throw error;

    await auditAdmin({
      actorId: user.id, actorEmail: user.email, action: 'collab_deleted',
      targetId: String(collab_id), targetType: 'collab_request',
      metadata: { override_status: status }, req,
    });

    return NextResponse.json({ collab: updated });
  } catch (error) {
    return jsonError(500, 'Could not update this request', error);
  }
}
