import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api';

// GET all campaign projects (admin view)
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

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
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

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
