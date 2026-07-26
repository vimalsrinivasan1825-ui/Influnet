import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { blockingItems, type StageItem } from '@/lib/project-stage-items';
import { notifyUser } from '@/lib/notify';
import { logActivity } from '@/lib/activity';
import { logger, requestId } from '@/lib/logger';

const PatchProjectActionSchema = z.object({
  action: z.enum(['advance', 'signoff', 'revoke_signoff', 'propose_skip', 'confirm_skip', 'cancel_skip', 'confirm_completion', 'update_stage', 'update_project', 'request_cancellation', 'decline_cancellation', 'accept_cancellation']),
  stage_key: z.string().optional(),
  updates: z.any().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  deliverables: z.string().optional(),
  note: z.string().max(2000).optional(),
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
    const log = logger.child({
      route: 'PATCH /api/projects/[id]',
      requestId: requestId(req),
      projectId: id,
      userId: user.id,
    });

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

    // Verify user is participant. Select only columns that always exist so this
    // works even before the completion-confirmation migration (056) is applied;
    // the confirm_completion branch reads those columns separately.
    const { data: project, error: fetchErr } = await supabase
      .from('campaign_projects')
      .select('id, title, owner_user_id, counterparty_user_id, current_stage, stage_progress')
      .eq('id', id)
      .single();

    if (fetchErr || !project) {
      return jsonError(404, 'Project not found', fetchErr);
    }
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    const { action } = result.data;
    const { STAGES, ALLOWED_TRANSITIONS, STAGE_ACTOR, STAGE_LABELS, Stage } = require('@/lib/project-lifecycle');

    // Legacy safety net. Migration 071 stopped creating 'pending_acceptance'
    // projects (terms now live in project_proposals until accepted), but rows
    // created by 069 can still be sitting in that state on a database that
    // hasn't caught up. Without this gate such a project renders as a normal
    // live one and a single "Advance stage" click would start work neither
    // side ever agreed to. Read separately so it degrades cleanly if the
    // column isn't there.
    const { data: statusRow } = await supabase
      .from('campaign_projects')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (statusRow?.status === 'pending_acceptance') {
      return jsonError(
        409,
        'These terms have not been accepted by both sides yet, so this project cannot move. Accept or decline them from the conversation first.',
      );
    }

    // Get user's role in the project
    const userRole = project.owner_user_id === user.id ? 'business' : 'creator';
    // The other participant — the person to notify when this user acts.
    const counterpartyId =
      userRole === 'business' ? project.counterparty_user_id : project.owner_user_id;
    const recipientRole = userRole === 'business' ? 'creator' : 'business';
    const projectLabel = project.title ? `“${project.title}”` : 'Your project';
    const projectLink = `/dashboard/projects/${id}`;

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

      // Gate: every REQUIRED checklist item of the current stage must be done
      // before the project can move on. Enforced here (not just in the UI) so a
      // direct PATCH can't skip payment/approval gates.
      const { data: stageItems, error: itemsErr } = await supabase
        .from('project_stage_items')
        .select('*')
        .eq('project_id', id)
        .eq('stage_key', project.current_stage);
      // Fail OPEN if the checklist table isn't there yet (migration 054 not
      // applied): the gate is an enhancement, not a reason to block advancing.
      // Log so it's visible, but don't 500 the user.
      if (itemsErr) log.warn('stage checklist unavailable, skipping gate', { err: itemsErr.message });
      const pending = itemsErr ? [] : blockingItems(project.current_stage, (stageItems || []) as StageItem[]);
      if (pending.length > 0) {
        return NextResponse.json(
          {
            error: 'Complete the required checklist items before advancing.',
            blocking: pending.map((it) => it.label),
          },
          { status: 409 },
        );
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

      // Completion is DUAL-CONFIRM (see 1b and migration 056) — but this older
      // `advance` path could still walk straight into 'project_completed', and
      // STAGE_ACTOR['final_payment'] is 'business'. That meant a brand alone
      // could close a project the creator never agreed was finished, which ends
      // the change-request window, locks the workspace, and now also publishes
      // the collaboration and a rating on the creator's public profile.
      // Completion has exactly one door, and it is confirm_completion.
      if (nextStage === 'project_completed') {
        return jsonError(
          400,
          'Completion needs both sides. Use “Confirm completion” — the project closes once you and the other party have both confirmed.',
        );
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

      // Audit trail: who moved which project from which stage to which.
      log.info('project stage advanced', { from: project.current_stage, to: nextStage, actor: userRole });

      // Timeline entry. The review fork gets its own verbs.
      const advanceActivity =
        project.current_stage === 'sent_for_review' && nextStage === 'revisions'
          ? { type: 'revisions_requested' as const, summary: 'Requested revisions on the draft' }
          : project.current_stage === 'sent_for_review' && nextStage === 'final_approval'
          ? { type: 'draft_approved' as const, summary: 'Approved the draft' }
          : { type: 'stage_advanced' as const, summary: `Moved the project to ${STAGE_LABELS[nextStage] || nextStage}` };
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, ...advanceActivity,
        metadata: { from: project.current_stage, to: nextStage },
      });

      // Tell the counterparty the stage moved, and whether the ball is now in
      // their court. Best-effort — never blocks the response on a failed write.
      if (counterpartyId) {
        const nextActor = STAGE_ACTOR[nextStage as typeof Stage] || 'either';
        const yourTurn = nextActor === 'either' || nextActor === recipientRole;
        await notifyUser({
          userId: counterpartyId,
          type: 'project_stage',
          title: `${projectLabel} moved to ${STAGE_LABELS[nextStage] || nextStage}`,
          body: yourTurn
            ? "It's your turn to move this project forward."
            : `Now waiting on the ${nextActor === 'business' ? 'brand' : 'creator'}.`,
          link: projectLink,
        });
      }

      return NextResponse.json({ project: updated });
    }

    // 1a) Bilateral stage sign-off (Guided mode). Each side confirms the current
    // stage; when BOTH have confirmed (and the required checklist items are done)
    // the project auto-advances to the next stage. Sign-off state lives in the
    // stage_progress JSONB (owner_signoff_at / creator_signoff_at) so no new
    // table/migration is needed. Special stages (review fork, final payment) keep
    // their own controls and are rejected here.
    if (action === 'signoff' || action === 'revoke_signoff') {
      const { isMutualSignoffStage } = require('@/lib/project-stage-guide');
      const currentStage = project.current_stage as string;
      const currentIdx = STAGES.indexOf(currentStage);
      if (currentIdx === -1) return jsonError(400, 'Invalid current stage');
      if (!isMutualSignoffStage(currentStage)) {
        return jsonError(400, `The ${STAGE_LABELS[currentStage] || currentStage} stage does not use sign-off.`);
      }

      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      const entry = { ...(stageProgress[currentStage] || { status: 'current', started_at: new Date().toISOString() }) };
      const myKey = userRole === 'business' ? 'owner_signoff_at' : 'creator_signoff_at';
      const myByKey = userRole === 'business' ? 'owner_signoff_by' : 'creator_signoff_by';
      const otherKey = userRole === 'business' ? 'creator_signoff_at' : 'owner_signoff_at';

      if (action === 'revoke_signoff') {
        entry[myKey] = null;
        entry[myByKey] = null;
        stageProgress[currentStage] = entry;
        const { data: updated, error: updErr } = await supabase
          .from('campaign_projects')
          .update({ stage_progress: stageProgress, updated_at: new Date().toISOString() })
          .eq('id', id).select().single();
        if (updErr) return jsonError(500, 'Failed to revoke sign-off', updErr);
        return NextResponse.json({ project: updated });
      }

      // Gate: required checklist items must be done before this side can sign off.
      const { data: stageItems, error: itemsErr } = await supabase
        .from('project_stage_items')
        .select('*')
        .eq('project_id', id)
        .eq('stage_key', currentStage);
      if (itemsErr) log.warn('stage checklist unavailable, skipping gate', { err: itemsErr.message });
      const pending = itemsErr ? [] : blockingItems(currentStage, (stageItems || []) as StageItem[]);
      if (pending.length > 0) {
        return NextResponse.json(
          { error: 'Complete the required steps before confirming this stage.', blocking: pending.map((it) => it.label) },
          { status: 409 },
        );
      }

      const now = new Date().toISOString();
      entry[myKey] = entry[myKey] || now;
      entry[myByKey] = user.id;
      const bothSigned = !!entry[myKey] && !!entry[otherKey];

      let nextStage: string | null = null;
      if (bothSigned && currentIdx < STAGES.length - 1) {
        // Both confirmed → complete this stage and move to the next one.
        entry.status = 'completed';
        entry.completed_at = now;
        const ns = STAGES[currentIdx + 1] as string;
        nextStage = ns;
        stageProgress[currentStage] = entry;
        stageProgress[ns] = {
          ...(stageProgress[ns] || {}),
          status: 'current',
          started_at: now,
        };
      } else {
        stageProgress[currentStage] = entry;
      }

      const { data: updated, error: updErr } = await supabase
        .from('campaign_projects')
        .update({
          stage_progress: stageProgress,
          ...(nextStage ? { current_stage: nextStage, status: nextStage === 'project_completed' ? 'completed' : 'active' } : {}),
          updated_at: now,
        })
        .eq('id', id).select().single();
      if (updErr) return jsonError(500, 'Failed to record sign-off', updErr);

      log.info('project stage sign-off', { stage: currentStage, actor: userRole, bothSigned, advancedTo: nextStage });

      if (nextStage) {
        await logActivity(supabase, {
          projectId: id, actorUserId: user.id, type: 'stage_advanced',
          summary: `Confirmed ${STAGE_LABELS[currentStage] || currentStage} — both sides agreed, moved to ${STAGE_LABELS[nextStage] || nextStage}`,
          metadata: { from: currentStage, to: nextStage, both: true },
        });
      } else {
        await logActivity(supabase, {
          projectId: id, actorUserId: user.id, type: 'stage_signoff',
          summary: `Confirmed the ${STAGE_LABELS[currentStage] || currentStage} stage`,
          metadata: { stage: currentStage },
        });
      }

      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_stage',
          title: nextStage
            ? `${projectLabel} moved to ${STAGE_LABELS[nextStage] || nextStage}`
            : `${projectLabel}: ${STAGE_LABELS[currentStage] || currentStage} confirmed`,
          body: nextStage
            ? 'Both sides confirmed — the project moved to the next stage.'
            : `The ${userRole === 'business' ? 'brand' : 'creator'} confirmed this stage. Confirm on your side to move forward.`,
          link: projectLink,
        });
      }

      return NextResponse.json({ project: updated, both_confirmed: bothSigned });
    }

    // 1a-skip) Skip a stage by MUTUAL consent. One side proposes, the other
    // confirms; only then does the project move past the (skippable) stage.
    // Payment / final-approval / review / terminal stages can never be skipped.
    if (action === 'propose_skip' || action === 'confirm_skip' || action === 'cancel_skip') {
      const { isSkippableStage } = require('@/lib/project-stage-guide');
      const currentStage = project.current_stage as string;
      const currentIdx = STAGES.indexOf(currentStage);
      if (currentIdx === -1) return jsonError(400, 'Invalid current stage');
      if (!isSkippableStage(currentStage)) {
        return jsonError(400, `The ${STAGE_LABELS[currentStage] || currentStage} stage can’t be skipped.`);
      }

      const stageProgress = (project.stage_progress || {}) as Record<string, any>;
      const entry = { ...(stageProgress[currentStage] || { status: 'current', started_at: new Date().toISOString() }) };
      const now = new Date().toISOString();

      if (action === 'cancel_skip') {
        entry.skip_proposed_by = null;
        entry.skip_proposed_at = null;
        stageProgress[currentStage] = entry;
        const { data: updated, error: e } = await supabase
          .from('campaign_projects')
          .update({ stage_progress: stageProgress, updated_at: now })
          .eq('id', id).select().single();
        if (e) return jsonError(500, 'Failed to cancel the skip', e);
        return NextResponse.json({ project: updated });
      }

      if (action === 'propose_skip') {
        entry.skip_proposed_by = user.id;
        entry.skip_proposed_at = now;
        stageProgress[currentStage] = entry;
        const { data: updated, error: e } = await supabase
          .from('campaign_projects')
          .update({ stage_progress: stageProgress, updated_at: now })
          .eq('id', id).select().single();
        if (e) return jsonError(500, 'Failed to propose the skip', e);
        if (counterpartyId) {
          await notifyUser({
            userId: counterpartyId,
            type: 'project_stage',
            title: `${projectLabel}: skip proposed`,
            body: `The ${userRole === 'business' ? 'brand' : 'creator'} suggested skipping the ${STAGE_LABELS[currentStage] || currentStage} stage. Confirm or reject it.`,
            link: projectLink,
          });
        }
        return NextResponse.json({ project: updated });
      }

      // confirm_skip — must be the OTHER party confirming a pending proposal.
      const proposedBy = entry.skip_proposed_by;
      if (!proposedBy) return jsonError(400, 'No skip has been proposed for this stage.');
      if (proposedBy === user.id) return jsonError(400, 'The other party has to confirm the skip you proposed.');
      if (currentIdx >= STAGES.length - 1) return jsonError(400, 'Already at the final stage');

      const skipNext = STAGES[currentIdx + 1] as string;
      entry.status = 'skipped';
      entry.skipped_at = now;
      entry.skip_confirmed_by = user.id;
      entry.skip_proposed_by = null;
      entry.skip_proposed_at = null;
      stageProgress[currentStage] = entry;
      stageProgress[skipNext] = { ...(stageProgress[skipNext] || {}), status: 'current', started_at: now };

      const { data: updated, error: e } = await supabase
        .from('campaign_projects')
        .update({
          stage_progress: stageProgress,
          current_stage: skipNext,
          status: skipNext === 'project_completed' ? 'completed' : 'active',
          updated_at: now,
        })
        .eq('id', id).select().single();
      if (e) return jsonError(500, 'Failed to skip the stage', e);

      log.info('project stage skipped', { stage: currentStage, to: skipNext, by: userRole });
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'stage_skipped',
        summary: `Skipped the ${STAGE_LABELS[currentStage] || currentStage} stage — both sides agreed`,
        metadata: { from: currentStage, to: skipNext },
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_stage',
          title: `${projectLabel} skipped ${STAGE_LABELS[currentStage] || currentStage}`,
          body: `Both sides agreed to skip it — now on ${STAGE_LABELS[skipNext] || skipNext}.`,
          link: projectLink,
        });
      }
      return NextResponse.json({ project: updated });
    }

    // 1b) Dual-confirm completion: BOTH participants must confirm before a
    // project reaches 'project_completed' (which unlocks reviews + means paid).
    if (action === 'confirm_completion') {
      if (project.current_stage !== 'final_payment') {
        return jsonError(400, 'Completion can only be confirmed at the final payment stage');
      }

      // Read the confirmation columns here (added in migration 056). If they're
      // not present yet, guide the operator to apply the migration rather than
      // silently misbehaving.
      const { data: confirmRow, error: confirmErr } = await supabase
        .from('campaign_projects')
        .select('owner_confirmed_complete, counterparty_confirmed_complete')
        .eq('id', id)
        .single();
      if (confirmErr) {
        return jsonError(400, 'Completion confirmations are not enabled yet. Apply migration 056 to enable dual-confirm completion.');
      }

      const ownerConfirmed = userRole === 'business' ? true : !!confirmRow.owner_confirmed_complete;
      const counterpartyConfirmed = userRole === 'creator' ? true : !!confirmRow.counterparty_confirmed_complete;
      const bothConfirmed = ownerConfirmed && counterpartyConfirmed;

      const updateData: Record<string, unknown> = {
        owner_confirmed_complete: ownerConfirmed,
        counterparty_confirmed_complete: counterpartyConfirmed,
        updated_at: new Date().toISOString(),
      };

      if (bothConfirmed) {
        const stageProgress = (project.stage_progress || {}) as Record<string, any>;
        stageProgress['final_payment'] = { ...(stageProgress['final_payment'] || {}), status: 'completed', completed_at: new Date().toISOString() };
        stageProgress['project_completed'] = { ...(stageProgress['project_completed'] || {}), status: 'current', started_at: new Date().toISOString() };
        updateData.current_stage = 'project_completed';
        updateData.status = 'completed';
        updateData.stage_progress = stageProgress;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('campaign_projects')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return jsonError(500, 'Failed to confirm completion', updateErr);

      log.info('project completion confirmed', { actor: userRole, bothConfirmed });

      await logActivity(supabase, {
        projectId: id, actorUserId: user.id,
        type: bothConfirmed ? 'project_completed' : 'completion_confirmed',
        summary: bothConfirmed ? 'Both sides confirmed — project completed' : 'Confirmed completion',
        metadata: { bothConfirmed },
      });

      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_stage',
          title: bothConfirmed
            ? `${projectLabel} is complete`
            : `${projectLabel}: completion confirmed`,
          body: bothConfirmed
            ? 'Both parties confirmed — the project is complete and reviews are open.'
            : 'The other party confirmed completion. Confirm on your side to finish.',
          link: projectLink,
        });
      }

      return NextResponse.json({ project: updated, both_confirmed: bothConfirmed });
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

      // Allow-list, not a deny-list: stage_progress[stage_key] is also where
      // sign-off consent state lives (owner_signoff_at, creator_signoff_at,
      // skip_proposed_by, ...). A deny-list of just status/started_at/
      // completed_at left those forgeable — either party could write the
      // COUNTERPARTY's sign-off/skip-proposal into their own entry and then
      // satisfy the "both sides agreed" check alone. Only presentational
      // fields may be merged here.
      const ALLOWED_STAGE_FIELDS = ['notes', 'meeting_link', 'deliverables'] as const;
      const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates as Record<string, unknown>).filter(([k]) =>
          (ALLOWED_STAGE_FIELDS as readonly string[]).includes(k),
        ),
      );
      if (Object.keys(sanitizedUpdates).length === 0) {
        return jsonError(400, 'No updatable fields provided.');
      }

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

    // 3) Update project title / description / deliverables.
    //
    // These are exactly the fields the propose -> notify -> accept loop in
    // /api/projects/[id]/change-requests exists to protect: any change is
    // meant to be proposed, snapshotted against its previous value, and
    // notified to the other side before it takes effect. Editing them
    // directly here bypassed all of that — no consent, no notification, no
    // activity entry, and no length limit (change-requests caps these at
    // 4000 chars). The only safe direct edit is the proposer tidying up terms
    // nobody has accepted yet; once a project is active, this must go through
    // a change request instead.
    if (action === 'update_project') {
      const { data: statusForEdit } = await supabase
        .from('campaign_projects')
        .select('status, created_by_user_id')
        .eq('id', id)
        .maybeSingle();

      if (statusForEdit?.status !== 'pending_acceptance' || statusForEdit?.created_by_user_id !== user.id) {
        return jsonError(
          409,
          'Agreed terms can only be changed through a change request, so the other side can review it.',
        );
      }

      const EditableTermsSchema = z.object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(4000).optional(),
        deliverables: z.string().max(4000).optional(),
      });
      const termsResult = EditableTermsSchema.safeParse(result.data);
      if (!termsResult.success) {
        return NextResponse.json({ error: 'Validation failed', details: termsResult.error.format() }, { status: 400 });
      }
      const { title, description, deliverables } = termsResult.data;

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

      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'terms_edited',
        summary: 'Edited the proposed terms before they were accepted',
      });

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
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'cancellation_requested',
        summary: 'Requested to cancel the project',
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: `${projectLabel}: cancellation requested`,
          body: `The ${userRole === 'business' ? 'brand' : 'creator'} asked to cancel this project. Review it to accept or decline.`,
          link: projectLink,
        });
      }
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
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'cancellation_declined',
        summary: 'Declined the cancellation — project continues',
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: `${projectLabel}: cancellation declined`,
          body: 'Your request to cancel this project was declined. The project continues.',
          link: projectLink,
        });
      }
      return NextResponse.json({ project: updated });
    }

    if (action === 'accept_cancellation') {
      // Cancelling is a STATE CHANGE, not a delete. The row, its payment
      // ledger, its activity timeline and its assets all survive — both sides
      // keep a read-only record of what was agreed and what was paid.
      const { data: cancelResult, error: cancelErr } = await supabase.rpc('cancel_project', {
        p_project_id: Number(id),
        p_reason: result.data.note ?? null,
      });
      if (cancelErr) {
        const known: Record<string, [number, string]> = {
          no_cancellation_requested: [400, 'No active cancellation request found.'],
          requester_cannot_accept: [400, 'The other party has to accept the cancellation you requested.'],
          already_cancelled: [409, 'This project is already cancelled.'],
          cannot_cancel_completed: [409, 'A completed project cannot be cancelled.'],
          not_a_participant: [403, 'You are not part of this project.'],
        };
        const hit = Object.entries(known).find(([k]) => cancelErr.message?.includes(k));
        if (hit) return jsonError(hit[1][0], hit[1][1]);
        return jsonError(500, 'Failed to cancel the project', cancelErr);
      }

      log.info('project cancelled by mutual agreement', { actor: userRole });
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'cancellation_accepted',
        summary: 'Both sides agreed to cancel the project',
        metadata: { reason: result.data.note ?? null },
      });

      const requesterId = cancelResult?.notify_user_id as string | undefined;
      if (requesterId) {
        await notifyUser({
          userId: requesterId,
          type: 'project_cancel',
          title: `${projectLabel} was cancelled`,
          body: 'Your cancellation request was accepted. The project is closed — the record and any payments stay available.',
          link: projectLink,
        });
      }

      return NextResponse.json({ ok: true, cancelled: true });
    }

    return jsonError(400, 'Unknown action');
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
