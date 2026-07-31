export const STAGES = [
  'collaboration_started',
  'project_discussion',
  'advance_payment',
  'content_planning',
  'content_confirmation',
  'shooting_in_progress',
  'editing_in_progress',
  'sent_for_review',
  'revisions',
  'final_approval',
  'final_payment',
  'project_completed',
] as const;

export type Stage = typeof STAGES[number];

export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  collaboration_started: ['project_discussion'],
  project_discussion: ['advance_payment'],
  advance_payment: ['content_planning'],
  content_planning: ['content_confirmation'],
  content_confirmation: ['shooting_in_progress'],
  shooting_in_progress: ['editing_in_progress'],
  editing_in_progress: ['sent_for_review'],
  sent_for_review: ['revisions', 'final_approval'],
  revisions: ['sent_for_review'],
  final_approval: ['final_payment'],
  final_payment: ['project_completed'],
  project_completed: [],
};

// Who is allowed to MOVE OUT of a given stage. 'business' = owner, 'creator' = counterparty.
export const STAGE_ACTOR: Record<Stage, 'business' | 'creator' | 'either'> = {
  collaboration_started: 'either',
  project_discussion: 'either',
  advance_payment: 'business', // payer confirms deposit
  content_planning: 'creator',
  content_confirmation: 'business', // brand approves the concept
  shooting_in_progress: 'creator',
  editing_in_progress: 'creator', // creator finishes editing and submits the draft
  sent_for_review: 'business', // brand reviews the draft: request revisions OR approve
  revisions: 'creator', // creator reworks and resubmits
  final_approval: 'business', // brand approves final content
  final_payment: 'business', // payer confirms final payment
  project_completed: 'either',
};

export const stageProgressPercent = (s: Stage) => {
  const index = STAGES.indexOf(s);
  if (index === -1) return 0;
  return Math.round((index / (STAGES.length - 1)) * 100);
};

/**
 * The 12 stages collapsed into the four things that actually happen in a
 * collaboration. Twelve bars on a phone is a wall of noise; four answers the
 * question a dashboard is for — where is my work piling up?
 *
 * Grouped by what the stage is FOR, not by who acts in it: 'Review' covers the
 * whole approval loop (submit → revisions → final sign-off) because a project
 * bouncing between those three is stuck in one place from the outside.
 */
export const STAGE_PHASES = ['Setup', 'Production', 'Review', 'Payment'] as const;
export type StagePhase = typeof STAGE_PHASES[number];

export const STAGE_PHASE: Record<Stage, StagePhase | null> = {
  collaboration_started: 'Setup',
  project_discussion: 'Setup',
  advance_payment: 'Setup',
  content_planning: 'Production',
  content_confirmation: 'Production',
  shooting_in_progress: 'Production',
  editing_in_progress: 'Production',
  sent_for_review: 'Review',
  revisions: 'Review',
  final_approval: 'Review',
  final_payment: 'Payment',
  // Terminal: a finished project is not sitting in any phase.
  project_completed: null,
};

export function phaseOf(stage: string): StagePhase | null {
  return STAGE_PHASE[stage as Stage] ?? null;
}

export const STAGE_LABELS: Record<Stage, string> = {
  collaboration_started: 'Collaboration Started',
  project_discussion: 'Discussion',
  advance_payment: 'Advance Payment',
  content_planning: 'Content Planning',
  content_confirmation: 'Content Confirmation',
  shooting_in_progress: 'Shooting in Progress',
  editing_in_progress: 'Editing in Progress',
  sent_for_review: 'Sent for Review',
  revisions: 'Revisions',
  final_approval: 'Final Approval',
  final_payment: 'Final Payment',
  project_completed: 'Completed',
};
