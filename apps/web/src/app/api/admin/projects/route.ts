import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET all campaign projects (admin view)
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

    // Fetch all projects with owner and counterparty info
    const { data: projects, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, email, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, email, role)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ projects: projects || [] });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/projects] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a project (admin force-delete)
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

    const { project_id } = await req.json();
    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Fetch the project first to confirm it exists
    const { data: project } = await supabase
      .from('campaign_projects')
      .select('id, title')
      .eq('id', project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Admin force-delete bypasses RLS
    const { error: deleteErr } = await supabase
      .from('campaign_projects')
      .delete()
      .eq('id', project_id);

    if (deleteErr) throw deleteErr;

    return NextResponse.json({
      ok: true,
      deleted: true,
      message: `Project "${project.title}" has been deleted by admin.`
    });
  } catch (error: any) {
    console.error('[Admin DELETE /api/admin/projects] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
