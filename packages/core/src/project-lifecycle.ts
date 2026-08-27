/**
 * Project lifecycle — table-driven by flow.
 *
 * Every consumer goes through flowOf() to get a stage list. Nothing reads
 * STAGES directly any more. STAGES / ALLOWED_TRANSITIONS stay exported as
 * STAGE_FLOWS.full.* so existing callers keep compiling, and are migrated
 * call site by call site.
 */

// ─── Flow key ───────────────────────────────────────────────────────────

export type FlowKey = 'full' | 'short_pay_after' | 'short_pay_before';

// ─── Stage flow definition ──────────────────────────────────────────────

export interface StageFlow {
  stages: readonly string[];
  transitions: Record<string, string[]>;
  actor: Record<string, 'business' | 'creator' | 'either'>;
  phase: Record<string, StagePhase | null>;
  labels: Record<string, string>;
  /** Stages that do NOT use plain two-sided sign-off. */
  nonSignoffStages: ReadonlySet<string>;
  /** Stages that can NEVER be skipped. */
  nonSkippableStages: ReadonlySet<string>;
}

// ─── Full flow (12 stages, the existing pipeline) ───────────────────────

const FULL_STAGES = [
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

const FULL_TRANSITIONS: Record<string, string[]> = {
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

const FULL_ACTOR: Record<string, 'business' | 'creator' | 'either'> = {
  collaboration_started: 'either',
  project_discussion: 'either',
  advance_payment: 'business',
  content_planning: 'creator',
  content_confirmation: 'business',
  shooting_in_progress: 'creator',
  editing_in_progress: 'creator',
  sent_for_review: 'business',
  revisions: 'creator',
  final_approval: 'business',
  final_payment: 'business',
  project_completed: 'either',
};

const FULL_LABELS: Record<string, string> = {
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

// ─── Short flows (3 stages + terminal) ──────────────────────────────────

const SHORT_STAGES_PAY_AFTER = [
  'quick_agreement',
  'quick_delivery',
  'quick_payment',
  'project_completed',
] as const;

const SHORT_STAGES_PAY_BEFORE = [
  'quick_agreement',
  'quick_payment',
  'quick_delivery',
  'project_completed',
] as const;

const SHORT_TRANSITIONS: Record<string, string[]> = {
  quick_agreement: ['quick_delivery'],
  quick_delivery: ['quick_payment'],
  quick_payment: ['project_completed'],
  project_completed: [],
};

const SHORT_TRANSITIONS_PAY_BEFORE: Record<string, string[]> = {
  quick_agreement: ['quick_payment'],
  quick_payment: ['quick_delivery'],
  quick_delivery: ['project_completed'],
  project_completed: [],
};

const SHORT_ACTOR: Record<string, 'business' | 'creator' | 'either'> = {
  quick_agreement: 'either',
  quick_delivery: 'creator',
  quick_payment: 'business',
  project_completed: 'either',
};

const SHORT_LABELS: Record<string, string> = {
  quick_agreement: 'Agreement',
  quick_delivery: 'Delivery',
  quick_payment: 'Payment',
  project_completed: 'Completed',
};

const SHORT_PHASE: Record<string, StagePhase | null> = {
  quick_agreement: 'Setup',
  quick_delivery: 'Production',
  quick_payment: 'Payment',
  project_completed: null,
};

// All short stages except project_completed are non-signoff (use their own
// dedicated controls) and non-skippable (only 3 real stages — skipping one
// is skipping the whole project).
const SHORT_NON_SIGNOFF = new Set(['project_completed']);
const SHORT_NON_SKIPPABLE = new Set([
  'quick_agreement',
  'quick_delivery',
  'quick_payment',
  'project_completed',
]);

// ─── Flow registry ──────────────────────────────────────────────────────

export const STAGE_FLOWS: Record<FlowKey, StageFlow> = {
  full: {
    stages: FULL_STAGES,
    transitions: FULL_TRANSITIONS,
    actor: FULL_ACTOR,
    phase: {
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
      project_completed: null,
    },
    labels: FULL_LABELS,
    nonSignoffStages: new Set(['sent_for_review', 'revisions', 'final_payment', 'project_completed']),
    nonSkippableStages: new Set([
      'advance_payment', 'final_payment', 'final_approval',
      'sent_for_review', 'revisions', 'project_completed',
    ]),
  },
  short_pay_after: {
    stages: SHORT_STAGES_PAY_AFTER,
    transitions: SHORT_TRANSITIONS,
    actor: SHORT_ACTOR,
    phase: SHORT_PHASE,
    labels: SHORT_LABELS,
    nonSignoffStages: SHORT_NON_SIGNOFF,
    nonSkippableStages: SHORT_NON_SKIPPABLE,
  },
  short_pay_before: {
    stages: SHORT_STAGES_PAY_BEFORE,
    transitions: SHORT_TRANSITIONS_PAY_BEFORE,
    actor: SHORT_ACTOR,
    phase: SHORT_PHASE,
    labels: SHORT_LABELS,
    nonSignoffStages: SHORT_NON_SIGNOFF,
    nonSkippableStages: SHORT_NON_SKIPPABLE,
  },
};

// ─── Backward-compatible aliases ────────────────────────────────────────
// Existing callers that read STAGES, ALLOWED_TRANSITIONS, STAGE_ACTOR, etc.
// keep compiling. These are migrated call site by call site.

export const STAGES = STAGE_FLOWS.full.stages;
export type Stage = typeof STAGES[number];
export const ALLOWED_TRANSITIONS = STAGE_FLOWS.full.transitions as Record<Stage, Stage[]>;
export const STAGE_ACTOR = STAGE_FLOWS.full.actor as Record<Stage, 'business' | 'creator' | 'either'>;
export const STAGE_LABELS = STAGE_FLOWS.full.labels as Record<Stage, string>;

// ─── Flow lookup ────────────────────────────────────────────────────────

/** Every consumer goes through here. Nothing reads STAGES directly any more. */
export function flowOf(project: { flow_key?: string | null }): StageFlow {
  const key = (project.flow_key ?? 'full') as FlowKey;
  return STAGE_FLOWS[key] ?? STAGE_FLOWS.full;
}

// ─── Derived helpers (flow-aware) ──────────────────────────────────────

export const stageProgressPercent = (s: string, flow?: StageFlow) => {
  const f = flow ?? STAGE_FLOWS.full;
  const index = f.stages.indexOf(s);
  if (index === -1) return 0;
  return Math.round((index / (f.stages.length - 1)) * 100);
};

// ─── Stage phases (kept for backward compat, full flow only) ────────────

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

export const STAGE_PHASE = STAGE_FLOWS.full.phase as Record<Stage, StagePhase | null>;

export function phaseOf(stage: string, flow?: StageFlow): StagePhase | null {
  const f = flow ?? STAGE_FLOWS.full;
  return f.phase[stage] ?? null;
}
