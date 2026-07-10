import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET all collaboration requests (admin view)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

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
  } catch (error: any) {
    console.error('[Admin GET /api/admin/collabs] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a collab request (admin force-delete)
export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

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

    return NextResponse.json({
      ok: true,
      deleted: true,
      message: 'Collaboration request has been deleted by admin.'
    });
  } catch (error: any) {
    console.error('[Admin DELETE /api/admin/collabs] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH to update a collab request status (admin override)
export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

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

    return NextResponse.json({ collab: updated });
  } catch (error: any) {
    console.error('[Admin PATCH /api/admin/collabs] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
