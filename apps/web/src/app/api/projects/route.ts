import { NextResponse } from 'next/server';

// GET all campaign projects for the authenticated user
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    console.log("[GET /api/projects] Auth header:", authHeader ? authHeader.substring(0, 30) + "..." : "null/missing");
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[GET /api/projects] getUser failed:", userError ? userError.message : "User is null");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // Retrieve projects where caller is owner or counterparty
    const { data: projects, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, email, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, email, role)
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error("[GET /api/projects] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH a project (advance stage / status)
export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, current_stage, status, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Verify user is owner or counterparty of the project
    const { data: project, error: fetchErr } = await supabase
      .from('campaign_projects')
      .select('id, owner_user_id, counterparty_user_id, cancel_requested_by')
      .eq('id', id)
      .single();

    if (fetchErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Handle cancellation flow actions
    if (action === 'request_cancellation') {
      const { data: updatedProject, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return NextResponse.json({ project: updatedProject });
    }

    if (action === 'decline_cancellation') {
      const { data: updatedProject, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return NextResponse.json({ project: updatedProject });
    }

    if (action === 'accept_cancellation') {
      if (!project.cancel_requested_by) {
        return NextResponse.json({ error: 'No active cancellation request found' }, { status: 400 });
      }
      if (project.cancel_requested_by === user.id) {
        return NextResponse.json({ error: 'Cannot accept your own cancellation request' }, { status: 400 });
      }

      // Perform deletion of the project
      const { error: deleteErr } = await supabase
        .from('campaign_projects')
        .delete()
        .eq('id', id);

      if (deleteErr) throw deleteErr;
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Default stage/status advancement flow
    const updateData: any = {};
    if (current_stage) updateData.current_stage = current_stage;
    if (status) updateData.status = status;
    updateData.updated_at = new Date().toISOString();

    const { data: updatedProject, error: updateErr } = await supabase
      .from('campaign_projects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ project: updatedProject });
  } catch (error: any) {
    console.error("[PATCH /api/projects] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
