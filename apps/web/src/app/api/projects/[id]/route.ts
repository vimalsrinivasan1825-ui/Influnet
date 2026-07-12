import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const PatchProjectActionSchema = z.object({
  action: z.enum(['advance', 'update_stage', 'update_project', 'request_cancellation', 'decline_cancellation', 'accept_cancellation']),
  stage_key: z.string().optional(),
  updates: z.any().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  deliverables: z.string().optional(),
});

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    // Fetch single project with participant profiles
    const { data: project, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return jsonError(404, 'Project not found', error);
    }

    // Verify user is participant
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Fetch project assets if any
    const { data: assets, error: assetsErr } = await supabase
      .from('project_assets')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    if (assetsErr) {
      return jsonError(500, 'Failed to fetch project assets', assetsErr);
    }

    return NextResponse.json({ project, assets: assets || [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PatchProjectActionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    // Verify user is participant
    const { data: project, error: fetchErr } = await supabase
      .from('campaign_projects')
      .select('id, owner_user_id, counterparty_user_id, current_stage, stage_progress')
      .eq('id', id)
      .single();

    if (fetchErr || !project) {
      return jsonError(404, 'Project not found', fetchErr);
    }
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    const { action } = result.data;
    const { STAGES, ALLOWED_TRANSITIONS, STAGE_ACTOR, Stage } = require('@/lib/project-lifecycle');

    // Get user's role in the project
    const userRole = project.owner_user_id === user.id ? 'business' : 'creator';

    // 1) Advance to next stage
    if (action === 'advance') {
      const currentIdx = STAGES.indexOf(project.current_stage);
      if (currentIdx === -1) {
        return jsonError(400, 'Invalid current stage');
      }

      const currentStageActor = STAGE_ACTOR[project.current_stage as typeof Stage] || 'either';
      if (currentStageActor !== 'either' && currentStageActor !== userRole) {
        return jsonError(403, `Only the ${currentStageActor} can advance the stage from ${project.current_stage}`);
      }

      const { stage_key } = result.data;
      let nextStage: string;

      if (stage_key) {
        // Enforce transition map
        const allowed = ALLOWED_TRANSITIONS[project.current_stage] || [];
        if (!allowed.includes(stage_key)) {
          return jsonError(400, `Invalid stage transition from ${project.current_stage} to ${stage_key}`);
        }
        nextStage = stage_key;
      } else {
        if (currentIdx >= STAGES.length - 1) {
          return jsonError(400, 'Already at final stage');
        }
        nextStage = STAGES[currentIdx + 1];
      }

      // Mark current stage as completed in stage_progress
      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      stageProgress[project.current_stage] = {
        ...(stageProgress[project.current_stage] || {}),
        status: 'completed',
        completed_at: new Date().toISOString(),
      };

      stageProgress[nextStage] = {
        ...(stageProgress[nextStage] || {}),
        status: 'current',
        started_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({
          current_stage: nextStage,
          stage_progress: stageProgress,
          status: nextStage === 'project_completed' ? 'completed' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return jsonError(500, 'Failed to advance stage', updateErr);
      return NextResponse.json({ project: updated });
    }

    // 2) Update stage progress details (notes, meeting_link, deliverables)
    if (action === 'update_stage') {
      const { stage_key, updates } = result.data;
      if (!stage_key || !updates) {
        return jsonError(400, 'stage_key and updates required');
      }

      if (!STAGES.includes(stage_key)) {
        return jsonError(400, `Invalid stage key: ${stage_key}`);
      }

      // Sanitize updates to prevent tampering with stage status/dates directly
      const sanitizedUpdates = { ...updates };
      delete sanitizedUpdates.status;
      delete sanitizedUpdates.started_at;
      delete sanitizedUpdates.completed_at;

      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      stageProgress[stage_key] = {
        ...(stageProgress[stage_key] || { status: 'current', started_at: new Date().toISOString() }),
        ...sanitizedUpdates,
      };

      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({
          stage_progress: stageProgress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return jsonError(500, 'Failed to update stage progress', updateErr);
      return NextResponse.json({ project: updated });
    }

    // 3) Update project title / description / deliverables
    if (action === 'update_project') {
      const { title, description, deliverables } = result.data;
      const updateData: any = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (deliverables !== undefined) updateData.deliverables = deliverables;

      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return jsonError(500, 'Failed to update project details', updateErr);
      return NextResponse.json({ project: updated });
    }

    // 4) Cancellation flows
    if (action === 'request_cancellation') {
      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) return jsonError(500, 'Failed to request cancellation', updateErr);
      return NextResponse.json({ project: updated });
    }

    if (action === 'decline_cancellation') {
      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update({ cancel_requested_by: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (updateErr) return jsonError(500, 'Failed to decline cancellation', updateErr);
      return NextResponse.json({ project: updated });
    }

    if (action === 'accept_cancellation') {
      const { data: cancelProject, error: fetchCancelErr } = await supabase
        .from('campaign_projects')
        .select('cancel_requested_by')
        .eq('id', id)
        .single();
      if (fetchCancelErr) return jsonError(500, 'Failed to fetch project', fetchCancelErr);
      if (!cancelProject.cancel_requested_by) {
        return jsonError(400, 'No active cancellation request found');
      }
      if (cancelProject.cancel_requested_by === user.id) {
        return jsonError(400, 'Cannot accept your own cancellation request');
      }

      const { error: deleteErr } = await supabase
        .from('campaign_projects')
        .delete()
        .eq('id', id);

      if (deleteErr) return jsonError(500, 'Failed to delete project', deleteErr);
      return NextResponse.json({ ok: true, deleted: true });
    }

    return jsonError(400, 'Unknown action');
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
