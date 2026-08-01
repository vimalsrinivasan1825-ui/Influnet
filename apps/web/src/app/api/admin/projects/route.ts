import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';

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
  } catch (error) {
    return jsonError(500, 'Could not load projects', error);
  }
}

// DELETE a project (admin force-delete)
export async function DELETE(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

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

    await auditAdmin({
      actorId: user.id, actorEmail: user.email, action: 'project_deleted',
      targetId: String(project_id), targetType: 'campaign_project',
      metadata: { title: project.title }, req,
    });

    return NextResponse.json({
      ok: true,
      deleted: true,
      message: `Project "${project.title}" has been deleted by admin.`
    });
  } catch (error) {
    return jsonError(500, 'Could not delete this project', error);
  }
}
