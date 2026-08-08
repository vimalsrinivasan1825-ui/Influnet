import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { blockingItems, type StageItem } from '@/lib/project-stage-items';
import { evaluateStageGate } from '@/lib/stage-items-gate';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { logActivity } from '@/lib/activity';
import { logger, requestId } from '@/lib/logger';
import { CANCELLATION_REASONS, cancellationReasonLabel } from '@influnet/core';

const CANCELLATION_REASON_VALUES = CANCELLATION_REASONS.map((r) => r.value) as [string, ...string[]];

const PatchProjectActionSchema = z.object({
  action: z.enum(['advance', 'signoff', 'revoke_signoff', 'propose_skip', 'confirm_skip', 'cancel_skip', 'confirm_completion', 'update_stage', 'update_project', 'request_cancellation', 'decline_cancellation', 'accept_cancellation', 'delete_project', 'restore_project']),
  stage_key: z.string().optional(),
  updates: z.any().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  deliverables: z.string().optional(),
  note: z.string().max(2000).optional(),
  // request_cancellation only. The requester's choice, shown to the other
  // side before they decide — see packages/core/src/project-cancellation.ts.
  reason_category: z.enum(CANCELLATION_REASON_VALUES).optional(),
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

    // Rate limit: project mutations are high-impact actions.
    const limited = await enforceRateLimit(req, {
      bucket: 'projects:update', limit: 20, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

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

    // A cancelled project is a frozen record — no further changes beyond
    // the cancellation RPCs (which already check for this themselves).
    // Without this gate the advance/signoff/skip flows proceed until they
    // hit the UPDATE policy (status <> 'cancelled') and return an opaque RLS
    // error instead of a clean message.
    if (statusRow?.status === 'cancelled') {
      return jsonError(
        409,
        'This project has been cancelled. The record is available for reference, but no further changes can be made.',
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
    // Names for the email templates below. Fetched once for every branch —
    // this handler has eight notify sites and each would otherwise repeat the
    // same two-id lookup.
    const names = await profileNames([counterpartyId, user.id]);
    const actorName = nameOf(names, user.id);
    const recipientName = nameOf(names, counterpartyId);
    const projectName = project.title || 'your project';

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
      //
      // evaluateStageGate MATERIALISES the checklist before reading it. It used
      // to read whatever rows existed, and rows were only ever created by
      // GET /stage-items — so a project nobody had opened had no rows, nothing
      // to block on, and every gate stood open, including the two money gates.
      // See lib/stage-items-gate.ts.
      const gate = await evaluateStageGate(supabase, id, project.current_stage);
      if (gate.reason === 'unavailable') {
        log.warn('stage checklist unavailable, skipping gate', { stage: project.current_stage });
      }
      if (!gate.open) {
        if (gate.reason === 'not_seeded') {
          log.error('stage checklist missing for a stage that requires items', {
            stage: project.current_stage,
          });
        }
        return NextResponse.json(
          {
            error: gate.reason === 'not_seeded'
              ? 'We could not verify this stage’s checklist, so the project has not been moved. Open the project and try again.'
              : 'Complete the required checklist items before advancing.',
            blocking: gate.blocking,
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
        // Default target = the stage's only legal transition, NOT the next
        // array element. The explicit-stage_key branch above already validates
        // against ALLOWED_TRANSITIONS; this branch skipped that check entirely
        // and walked the array, so a bare "Advance" on `revisions` jumped to
        // `final_approval` — past the re-review that ALLOWED_TRANSITIONS.revisions
        // exists to require.
        //
        // A forking stage (sent_for_review) has no single default and must be
        // told which way to go, which is what the review fork's buttons do.
        const defaultNext: string[] = ALLOWED_TRANSITIONS[project.current_stage] || [];
        if (defaultNext.length !== 1) {
          return jsonError(
            400,
            `The ${STAGE_LABELS[project.current_stage] || project.current_stage} stage needs an explicit decision — pick where it goes next.`,
          );
        }
        nextStage = defaultNext[0];
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
          // The handler already knows whose move it is, so say so: "your turn"
          // is a different email from "FYI, it moved".
          email: yourTurn
            ? {
                templateId: 'project_action_needed',
                dedupeKey: `stage_turn:${id}:${nextStage}`,
                data: {
                  recipientName,
                  projectName,
                  stage: nextStage,
                  action: `${actorName} moved this to ${STAGE_LABELS[nextStage] || nextStage}. It cannot move on until you act.`,
                  waitingSince: null,
                  dashboardUrl: projectLink,
                },
              }
            : {
                templateId: 'project_stage',
                dedupeKey: `stage:${id}:${nextStage}`,
                data: {
                  recipientName,
                  projectName,
                  stage: nextStage,
                  actorName,
                  note: null,
                  dashboardUrl: projectLink,
                },
              },
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

      if (action === 'revoke_signoff') {
        const { error: revErr } = await supabase.rpc('revoke_stage_signoff', {
          p_project_id: Number(id),
          p_stage: currentStage,
        });
        if (revErr) return jsonError(500, 'Failed to revoke sign-off', revErr);
        const { data: updated } = await supabase
          .from('campaign_projects').select('*').eq('id', id).single();
        return NextResponse.json({ project: updated });
      }

      // Gate: required checklist items must be done before this side can sign
      // off. Same materialise-then-evaluate as the advance path — sign-off is
      // how 8 of the 12 stages are left, so leaving it on the old read-only
      // check would have kept the bypass alive for most of the pipeline.
      const gate = await evaluateStageGate(supabase, id, currentStage);
      if (gate.reason === 'unavailable') {
        log.warn('stage checklist unavailable, skipping gate', { stage: currentStage });
      }
      if (!gate.open) {
        if (gate.reason === 'not_seeded') {
          log.error('stage checklist missing for a stage that requires items', { stage: currentStage });
        }
        return NextResponse.json(
          {
            error: gate.reason === 'not_seeded'
              ? 'We could not verify this stage’s checklist, so your confirmation was not recorded. Open the project and try again.'
              : 'Complete the required steps before confirming this stage.',
            blocking: gate.blocking,
          },
          { status: 409 },
        );
      }

      // Where this stage goes if BOTH sides have now signed. Computed here, not
      // in SQL, because ALLOWED_TRANSITIONS (packages/core) is the single source
      // of truth for the transition map — including the revisions →
      // sent_for_review back-edge that an index-based guess gets wrong. The RPC
      // only advances when both signatures are actually present, so passing a
      // target cannot move a stage nobody agreed to.
      //
      // A sign-off stage has exactly one exit by definition; anything with a
      // fork (sent_for_review) is in NON_SIGNOFF_STAGES and never reaches here.
      // Bail rather than guess if that ever stops being true.
      const allowedNext: string[] = ALLOWED_TRANSITIONS[currentStage] || [];
      if (currentIdx < STAGES.length - 1 && allowedNext.length !== 1) {
        return jsonError(
          500,
          `The ${STAGE_LABELS[currentStage] || currentStage} stage has no single next step, so it can't advance by sign-off.`,
        );
      }
      const candidateNext = currentIdx < STAGES.length - 1 ? allowedNext[0] : null;

      // Atomic: the RPC takes a row lock, re-reads stage_progress, writes ONLY
      // this side's keys and advances only if both are present (migration 114).
      //
      // This used to be a read-modify-write in JS over the whole jsonb column.
      // Two people confirming at the same instant both read a state with neither
      // signature, and the second write — built from a stale snapshot — blanked
      // the first. enforce_project_consent caught it and raised
      // consent_violation, which surfaced as a 500 while the losing side's
      // confirmation vanished and the stage stuck. See the migration for the
      // reproduction.
      const { data: signoffResult, error: updErr } = await supabase.rpc('record_stage_signoff', {
        p_project_id: Number(id),
        p_stage: currentStage,
        p_next_stage: candidateNext,
      });
      if (updErr) return jsonError(500, 'Failed to record sign-off', updErr);

      // The stage moved while this request was in flight — the other side got
      // there first, or this is a double-click. Not an error: the user's intent
      // (this stage is confirmed) is already satisfied.
      if (signoffResult?.ok === false) {
        if (signoffResult.reason === 'stage_moved') {
          const { data: fresh } = await supabase
            .from('campaign_projects').select('*').eq('id', id).single();
          return NextResponse.json({ project: fresh, alreadyMoved: true });
        }
        if (signoffResult.reason === 'cancelled') {
          return jsonError(409, 'This project has been cancelled, so it can no longer be confirmed.');
        }
      }

      const bothSigned = Boolean(signoffResult?.both_signed);
      const nextStage: string | null = signoffResult?.advanced ? candidateNext : null;

      const { data: updated } = await supabase
        .from('campaign_projects').select('*').eq('id', id).single();

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
          // No nextStage means only one side has signed off, so the mail is a
          // request for the other signature rather than a progress report.
          email: nextStage
            ? {
                templateId: 'project_stage',
                dedupeKey: `signoff_moved:${id}:${nextStage}`,
                data: {
                  recipientName,
                  projectName,
                  stage: nextStage,
                  actorName,
                  note: null,
                  dashboardUrl: projectLink,
                },
              }
            : {
                templateId: 'project_action_needed',
                dedupeKey: `signoff_awaiting:${id}:${currentStage}`,
                data: {
                  recipientName,
                  projectName,
                  stage: currentStage,
                  action: `${actorName} confirmed this stage. Confirm on your side to move the project forward.`,
                  waitingSince: null,
                  dashboardUrl: projectLink,
                },
              },
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
            email: {
              templateId: 'project_action_needed',
              dedupeKey: `skip_proposed:${id}:${currentStage}`,
              data: {
                recipientName,
                projectName,
                stage: currentStage,
                action: `${actorName} proposed skipping the ${STAGE_LABELS[currentStage] || currentStage} stage. It stays where it is until you confirm or reject.`,
                waitingSince: null,
                dashboardUrl: projectLink,
              },
            },
          });
        }
        return NextResponse.json({ project: updated });
      }

      // confirm_skip — must be the OTHER party confirming a pending proposal.
      const proposedBy = entry.skip_proposed_by;
      if (!proposedBy) return jsonError(400, 'No skip has been proposed for this stage.');
      if (proposedBy === user.id) return jsonError(400, 'The other party has to confirm the skip you proposed.');
      if (currentIdx >= STAGES.length - 1) return jsonError(400, 'Already at the final stage');

      // Same rule as sign-off above: the transition map decides where a stage
      // leads, never the array order. No skippable stage forks or loops today,
      // so this is defence in depth rather than a live fix — but it is the
      // identical hazard, and leaving one of the two paths advancing by index
      // is how they drift apart again.
      const skipAllowed: string[] = ALLOWED_TRANSITIONS[currentStage] || [];
      if (skipAllowed.length !== 1) {
        return jsonError(
          500,
          `The ${STAGE_LABELS[currentStage] || currentStage} stage has no single next step, so it can't be skipped.`,
        );
      }
      const skipNext = skipAllowed[0];
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
          email: {
            templateId: 'project_stage',
            dedupeKey: `skip_confirmed:${id}:${currentStage}`,
            data: {
              recipientName,
              projectName,
              stage: skipNext,
              actorName,
              note: `Both sides agreed to skip the ${STAGE_LABELS[currentStage] || currentStage} stage.`,
              dashboardUrl: projectLink,
            },
          },
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

      // The CREATOR may not confirm completion while the final payment gate is
      // still open. Completing publishes the collaboration and a rating on their
      // public profile and closes the change-request window — so "done" has to
      // mean "and I was paid".
      //
      // Every other stage checks its required items before it can move; this one
      // never did, which made final_payment the one gate a project could walk
      // past. When in-app payments are configured that item only opens on a
      // signed webhook, so this is a real money check, not a checkbox.
      //
      // Deliberately one-sided. The BUSINESS is the payer: if they want to close
      // a project having settled off-platform, that is their money and their
      // call, and blocking them would strand every manual-payment project. The
      // creator is the one who needs protecting here, and they still hold the
      // other half of the dual-confirm either way.
      if (userRole === 'creator') {
        // Materialise-then-evaluate, like the other two gates. This is the last
        // money check in the pipeline: without it a creator can be talked into
        // marking a project complete — which publishes it and closes the
        // change-request window — before the final payment has landed.
        const finalGate = await evaluateStageGate(supabase, id, 'final_payment');
        if (finalGate.reason === 'unavailable') {
          log.warn('final payment checklist unavailable, skipping gate');
        }
        if (!finalGate.open) {
          if (finalGate.reason === 'not_seeded') {
            log.error('final_payment checklist missing');
          }
          return NextResponse.json(
            {
              error:
                'The final payment hasn’t been recorded yet. Once it is, you can confirm the project is complete.',
              blocking: finalGate.blocking,
            },
            { status: 409 },
          );
        }
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
          email: bothConfirmed
            ? {
                templateId: 'project_completed',
                dedupeKey: `project_completed:${id}`,
                data: {
                  recipientName,
                  partnerName: actorName,
                  projectName,
                  reviewUrl: projectLink,
                },
              }
            : {
                templateId: 'project_action_needed',
                dedupeKey: `completion_awaiting:${id}`,
                data: {
                  recipientName,
                  projectName,
                  stage: 'completed',
                  action: `${actorName} confirmed the project is finished. Confirm on your side to close it out and open reviews.`,
                  waitingSince: null,
                  dashboardUrl: projectLink,
                },
              },
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

    // 4) Cancellation flows — bilateral: one requests with a reason, the
    //
    // NOTE: these branches come AFTER the cancelled-status gate above, so
    // they will never see a cancelled project. The RPCs guard themselves
    // anyway (cannot_cancel_now / already_cancelled); this comment exists
    // so a future reader doesn't wonder why the gate is above and the
    // cancellation handlers are here.
    // OTHER side accepts or declines. Enforced again at the database level
    // (migration 089's extension of enforce_project_consent), so this route
    // is the friendly error path, not the only guard.
    if (action === 'request_cancellation') {
      if (!result.data.reason_category) {
        return jsonError(400, 'Choose a reason for the cancellation.');
      }

      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
        'request_project_cancellation',
        {
          p_project_id: Number(id),
          p_reason_category: result.data.reason_category,
          p_reason_text: result.data.note ?? null,
        },
      );

      if (rpcErr) {
        const known: Record<string, [number, string]> = {
          cannot_cancel_now: [409, 'Only an active project can be cancelled.'],
          cancellation_already_pending: [409, 'A cancellation request is already waiting on a response.'],
          invalid_reason_category: [400, 'Choose a reason from the list.'],
          reason_text_required: [400, "Add a note explaining what's changed."],
          not_a_participant: [403, 'You are not part of this project.'],
        };
        const hit = Object.entries(known).find(([k]) => rpcErr.message?.includes(k));
        if (hit) return jsonError(hit[1][0], hit[1][1]);
        return jsonError(500, 'Failed to request cancellation', rpcErr);
      }

      const reasonLabel = cancellationReasonLabel(result.data.reason_category);
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'cancellation_requested',
        summary: `Requested to cancel the project — ${reasonLabel}`,
        metadata: { reason_category: result.data.reason_category, reason_text: result.data.note ?? null },
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: `${projectLabel}: cancellation requested`,
          body: `The ${userRole === 'business' ? 'brand' : 'creator'} asked to cancel this project — ${reasonLabel}. Open it to discuss or respond.`,
          link: projectLink,
          email: {
            // project_stage would wrongly read as forward progress.
            templateId: 'decision_outcome',
            dedupeKey: `cancel_requested:${id}:${user.id}`,
            data: {
              recipientName,
              actorName,
              subjectName: projectName,
              decision: 'Cancellation requested',
              note: reasonLabel,
              consequence:
                'Nothing is cancelled yet — the project stays open until you respond, and the record and any payments remain available either way.',
              ctaLabel: 'Open the project',
              dashboardUrl: projectLink,
            },
          },
        });
      }
      return NextResponse.json({ project: rpcData?.project ?? rpcData });
    }

    if (action === 'decline_cancellation') {
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
        'decline_project_cancellation',
        { p_project_id: Number(id) },
      );
      if (rpcErr) {
        if (rpcErr.message?.includes('no_cancellation_requested')) {
          return jsonError(400, 'There is no pending cancellation request to decline.');
        }
        if (rpcErr.message?.includes('not_a_participant')) {
          return jsonError(403, 'You are not part of this project.');
        }
        return jsonError(500, 'Failed to decline cancellation', rpcErr);
      }

      // Same action either declines the OTHER side's request or withdraws
      // your own — the RPC doesn't distinguish, so neither does the summary.
      const wasRequester = rpcData?.was_requested_by === user.id;
      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'cancellation_declined',
        summary: wasRequester ? 'Withdrew the cancellation request' : 'Declined the cancellation — project continues',
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: wasRequester ? `${projectLabel}: cancellation withdrawn` : `${projectLabel}: cancellation declined`,
          body: wasRequester
            ? 'The cancellation request was withdrawn. The project continues.'
            : 'Your request to cancel this project was declined. The project continues.',
          link: projectLink,
          email: {
            templateId: 'decision_outcome',
            dedupeKey: `cancel_declined:${id}:${user.id}:${wasRequester ? 'withdrawn' : 'declined'}`,
            data: {
              recipientName,
              actorName,
              subjectName: projectName,
              decision: wasRequester ? 'Cancellation withdrawn' : 'Cancellation declined',
              note: null,
              consequence: wasRequester
                ? 'The project continues as normal — nothing changed.'
                : 'The project continues. Open it to talk it through.',
              ctaLabel: 'Open the project',
              dashboardUrl: projectLink,
            },
          },
        });
      }
      return NextResponse.json({ project: rpcData?.project ?? rpcData });
    }

    if (action === 'accept_cancellation') {
      // Cancelling is a STATE CHANGE, not a delete. The row, its payment
      // ledger, its activity timeline and its assets all survive — both sides
      // keep a read-only record of what was agreed and what was paid.
      const { data: cancelResult, error: cancelErr } = await (supabase.rpc as any)('cancel_project', {
        p_project_id: Number(id),
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
      });

      const requesterId = cancelResult?.notify_user_id as string | undefined;
      if (requesterId) {
        await notifyUser({
          userId: requesterId,
          type: 'project_cancel',
          title: `${projectLabel} was cancelled`,
          body: 'Your cancellation request was accepted. The project is closed — the record and any payments stay available.',
          link: projectLink,
          email: {
            templateId: 'decision_outcome',
            dedupeKey: `cancel_accepted:${id}`,
            data: {
              recipientName: nameOf(names, requesterId),
              actorName,
              subjectName: projectName,
              decision: 'Project cancelled',
              note: null,
              consequence:
                'Your cancellation request was accepted and the project is now closed. Nothing was deleted — the record and any payments stay available on the project page.',
              ctaLabel: 'View the project',
              dashboardUrl: projectLink,
            },
          },
        });
      }

      return NextResponse.json({ ok: true, cancelled: true, project: cancelResult?.project ?? null });
    }

    if (action === 'delete_project') {
      // Unilateral — either participant, no counterparty confirmation, any
      // status. Nothing is actually removed (migration 103): this just moves
      // the row out of both participants' main list into Deleted Projects.
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('delete_project', {
        p_project_id: Number(id),
      });
      if (rpcErr) {
        const known: Record<string, [number, string]> = {
          already_deleted: [409, 'This project is already deleted.'],
          not_a_participant: [403, 'You are not part of this project.'],
        };
        const hit = Object.entries(known).find(([k]) => rpcErr.message?.includes(k));
        if (hit) return jsonError(hit[1][0], hit[1][1]);
        return jsonError(500, 'Failed to delete this project', rpcErr);
      }

      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'project_deleted',
        summary: 'Removed this project from the active list',
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: `${projectLabel} was deleted`,
          body: 'The other side removed this project from their list. It still exists and you can find it under Deleted Projects.',
          link: projectLink,
        });
      }

      return NextResponse.json({ ok: true, project: rpcData?.project ?? null });
    }

    if (action === 'restore_project') {
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('restore_project', {
        p_project_id: Number(id),
      });
      if (rpcErr) {
        const known: Record<string, [number, string]> = {
          not_deleted: [409, 'This project is not deleted.'],
          not_a_participant: [403, 'You are not part of this project.'],
        };
        const hit = Object.entries(known).find(([k]) => rpcErr.message?.includes(k));
        if (hit) return jsonError(hit[1][0], hit[1][1]);
        return jsonError(500, 'Failed to restore this project', rpcErr);
      }

      await logActivity(supabase, {
        projectId: id, actorUserId: user.id, type: 'project_restored',
        summary: 'Restored this project from Deleted Projects',
      });
      if (counterpartyId) {
        await notifyUser({
          userId: counterpartyId,
          type: 'project_cancel',
          title: `${projectLabel} was restored`,
          body: 'The other side restored this project — it is back on your active list.',
          link: projectLink,
        });
      }

      return NextResponse.json({ ok: true, project: rpcData?.project ?? null });
    }

    return jsonError(400, 'Unknown action');
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
