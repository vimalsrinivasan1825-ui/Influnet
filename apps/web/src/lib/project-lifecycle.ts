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
