import { NextResponse } from 'next/server';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
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

    // Fetch single project with participant profiles
    const { data: project, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, email, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, email, role)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user is participant
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch project assets if any
    const { data: assets } = await supabase
      .from('project_assets')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ project, assets: assets || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
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

    // Verify user is participant
    const { data: project, error: fetchErr } = await supabase
      .from('campaign_projects')
      .select('id, owner_user_id, counterparty_user_id, current_stage, stage_progress')
      .eq('id', id)
      .single();

    if (fetchErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // 1) Advance to next stage
    if (body.action === 'advance') {
      const STAGES = [
        'collaboration_started', 'project_discussion', 'advance_payment',
        'content_planning', 'content_confirmation', 'shooting_in_progress',
        'editing_in_progress', 'sent_for_review', 'revisions',
        'final_approval', 'final_payment', 'project_completed'
      ];
      const currentIdx = STAGES.indexOf(project.current_stage);
      if (currentIdx === -1 || currentIdx >= STAGES.length - 1) {
        return NextResponse.json({ error: 'Already at final stage' }, { status: 400 });
      }

      // Mark current stage as completed in stage_progress
      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      stageProgress[project.current_stage] = {
        ...(stageProgress[project.current_stage] || {}),
        status: 'completed',
        completed_at: new Date().toISOString(),
      };

      const nextStage = STAGES[currentIdx + 1];
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

      if (updateErr) throw updateErr;
      return NextResponse.json({ project: updated });
    }

    // 2) Update stage progress details (notes, meeting_link, deliverables)
    if (body.action === 'update_stage') {
      const { stage_key, updates } = body;
      if (!stage_key || !updates) {
        return NextResponse.json({ error: 'stage_key and updates required' }, { status: 400 });
      }

      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      stageProgress[stage_key] = {
        ...(stageProgress[stage_key] || { status: 'current', started_at: new Date().toISOString() }),
        ...updates,
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

      if (updateErr) throw updateErr;
      return NextResponse.json({ project: updated });
    }

    // 3) Update project title / description / deliverables
    if (body.action === 'update_project') {
      const { title, description, deliverables } = body;
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

      if (updateErr) throw updateErr;
      return NextResponse.json({ project: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
