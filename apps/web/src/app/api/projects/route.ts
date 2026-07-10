import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { ProjectUpdateSchema } from '@/lib/validators';
import { z } from 'zod';

const PatchProjectSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['request_cancellation', 'decline_cancellation', 'accept_cancellation']).optional(),
}).merge(ProjectUpdateSchema);

// GET all campaign projects for the authenticated user
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

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

    if (error) return jsonError(500, 'Database query error', error);

    return NextResponse.json({ projects });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// PATCH a project (advance stage / status)
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

    const result = PatchProjectSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { id, current_stage, status, action } = result.data;

    // Verify user is owner or counterparty of the project
    const { data: project, error: fetchErr } = await supabase
      .from('campaign_projects')
      .select('id, owner_user_id, counterparty_user_id, cancel_requested_by')
      .eq('id', id)
      .single();

    if (fetchErr || !project) {
      return jsonError(404, 'Project not found', fetchErr);
    }

    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Handle cancellation flow actions
    if (action === 'request_cancellation') {
      const { data: updatedProject, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) return jsonError(500, 'Failed to request cancellation', updateErr);
      return NextResponse.json({ project: updatedProject });
    }

    if (action === 'decline_cancellation') {
      const { data: updatedProject, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) return jsonError(500, 'Failed to decline cancellation', updateErr);
      return NextResponse.json({ project: updatedProject });
    }

    if (action === 'accept_cancellation') {
      if (!project.cancel_requested_by) {
        return jsonError(400, 'No active cancellation request found');
      }
      if (project.cancel_requested_by === user.id) {
        return jsonError(400, 'Cannot accept your own cancellation request');
      }

      // Perform deletion of the project
      const { error: deleteErr } = await supabase
        .from('campaign_projects')
        .delete()
        .eq('id', id);

      if (deleteErr) return jsonError(500, 'Failed to delete project', deleteErr);
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

    if (updateErr) return jsonError(500, 'Failed to update project', updateErr);

    return NextResponse.json({ project: updatedProject });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
