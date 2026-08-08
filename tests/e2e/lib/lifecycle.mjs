// Helpers that drive a collaboration from "brand found a creator" all the way
// to "project completed", through the real endpoints.
//
// The stage machine has three different ways to leave a stage and it matters
// which one a test uses:
//   • mutual sign-off  — both sides PATCH {action:'signoff'}; the second one
//                        flips the stage. Used by 8 of the 12 stages.
//   • advance          — a single actor PATCHes {action:'advance'}; used by the
//                        NON_SIGNOFF stages (sent_for_review, revisions,
//                        final_payment, project_completed).
//   • skip             — propose_skip + confirm_skip, for skippable stages.
// Every one of them is gated on the stage's REQUIRED checklist items being
// ticked by the side that owns them.

import { sql, lit } from './sql.mjs';

export const STAGES = [
  'collaboration_started', 'project_discussion', 'advance_payment',
  'content_planning', 'content_confirmation', 'shooting_in_progress',
  'editing_in_progress', 'sent_for_review', 'revisions', 'final_approval',
  'final_payment', 'project_completed',
];

export const NON_SIGNOFF_STAGES = new Set([
  'sent_for_review', 'revisions', 'final_payment', 'project_completed',
]);

export const STAGE_ACTOR = {
  collaboration_started: 'either', project_discussion: 'either',
  advance_payment: 'business', content_planning: 'creator',
  content_confirmation: 'business', shooting_in_progress: 'creator',
  editing_in_progress: 'creator', sent_for_review: 'business',
  revisions: 'creator', final_approval: 'business',
  final_payment: 'business', project_completed: 'either',
};

/**
 * Take a collaboration from an accepted collab_request to a live project.
 * Returns { conversationId, proposalId, projectId }.
 */
export async function openProject(biz, creator, { requestId, title, budget, advance }) {
  const conv = await biz.post('/api/conversations', { other_user_id: creator.userId });
  const conversationId = conv.body?.conversation?.id;
  if (!conversationId) {
    throw new Error(`openProject: no conversation (${conv.status} ${JSON.stringify(conv.body).slice(0, 200)})`);
  }

  // A little negotiation, because a proposal that arrives in an empty
  // conversation isn't the flow real users take.
  await biz.post(`/api/conversations/${conversationId}/messages`, {
    content: `Hi! We'd like to work with you on ${title}. Budget around ₹${budget.toLocaleString('en-IN')}.`,
  });
  await creator.post(`/api/conversations/${conversationId}/messages`, {
    content: 'Thanks for reaching out — that works. Send the terms across.',
  });

  const prop = await biz.post(`/api/conversations/${conversationId}/deal`, {
    collab_request_id: requestId, title, budget, advance_amount: advance,
    description: 'Audit lifecycle project.',
    due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  });
  const proposalId = prop.body?.proposal_id;
  if (!proposalId) {
    throw new Error(`openProject: no proposal (${prop.status} ${JSON.stringify(prop.body).slice(0, 200)})`);
  }

  const acc = await creator.patch(`/api/conversations/${conversationId}/deal`, {
    proposal_id: proposalId, action: 'accept',
  });
  const [row] = await sql(
    `select id, current_stage, status from campaign_projects
     where owner_user_id = ${lit(biz.userId)} and counterparty_user_id = ${lit(creator.userId)}
     order by created_at desc limit 1`);

  return {
    conversationId, proposalId,
    projectId: row?.id ?? null,
    acceptStatus: acc.status,
    acceptBody: acc.body,
    project: row,
  };
}

/** Tick every REQUIRED checklist item of `stage` that `actor` is allowed to tick. */
export async function tickChecklist(actor, projectId, stage, role) {
  const res = await actor.get(`/api/projects/${projectId}/stage-items`);
  const items = res.body?.items || [];
  const mine = items.filter(
    (it) => it.stage_key === stage && it.is_required && !it.done_at &&
            (it.owner_role === 'both' || it.owner_role === role),
  );
  const out = [];
  for (const it of mine) {
    const r = await actor.patch(`/api/projects/${projectId}/stage-items`, { item_id: it.id, done: true });
    out.push({ label: it.label, status: r.status, owner_role: it.owner_role });
  }
  return out;
}

/** Read the project's live stage straight from the DB (not the API's view of it). */
export async function currentStage(projectId) {
  const [row] = await sql(
    `select current_stage, status, stage_progress from campaign_projects where id = ${lit(projectId)}`);
  return row;
}

/**
 * Move the project out of its current stage using whichever mechanism that
 * stage actually uses. Returns { from, to, how, responses }.
 */
export async function passStage(projectId, biz, creator) {
  const before = await currentStage(projectId);
  const stage = before.current_stage;
  const responses = [];

  // Both sides tick what they own — required items are the gate for BOTH the
  // signoff and the advance path.
  responses.push({ who: 'business', ticks: await tickChecklist(biz, projectId, stage, 'business') });
  responses.push({ who: 'creator', ticks: await tickChecklist(creator, projectId, stage, 'creator') });

  let how;
  if (stage === 'final_payment') {
    // final_payment is the one stage that leaves via neither signoff nor
    // advance: it closes through the dual `confirm_completion` handshake, and
    // `advance` from here is explicitly refused. The creator's half is gated on
    // the final-payment checklist item, which only opens on a signed webhook.
    how = 'confirm_completion';
    responses.push({ who: 'business', res: await biz.patch(`/api/projects/${projectId}`, { action: 'confirm_completion' }) });
    responses.push({ who: 'creator', res: await creator.patch(`/api/projects/${projectId}`, { action: 'confirm_completion' }) });
  } else if (NON_SIGNOFF_STAGES.has(stage)) {
    how = 'advance';
    const who = STAGE_ACTOR[stage] === 'creator' ? creator : biz;
    // sent_for_review forks — say explicitly which way, or the route refuses
    // to guess (which is correct behaviour).
    const payload = stage === 'sent_for_review'
      ? { action: 'advance', stage_key: 'final_approval' }
      : { action: 'advance' };
    responses.push({ who: STAGE_ACTOR[stage], res: await who.patch(`/api/projects/${projectId}`, payload) });
  } else {
    how = 'signoff';
    responses.push({ who: 'business', res: await biz.patch(`/api/projects/${projectId}`, { action: 'signoff' }) });
    responses.push({ who: 'creator', res: await creator.patch(`/api/projects/${projectId}`, { action: 'signoff' }) });
  }

  const after = await currentStage(projectId);
  return { from: stage, to: after.current_stage, how, moved: after.current_stage !== stage, responses, after };
}
