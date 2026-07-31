// Per-stage guidance for the Guided (step-by-step) project mode. Pure content —
// no DB. Tells BOTH sides what a stage is for and what each party must do in it,
// so a brand and a creator always know the next concrete action.
//
// Bilateral sign-off model: most stages require BOTH the brand (owner) and the
// creator (counterparty) to confirm before the project advances. A few stages
// are special and keep their existing dedicated flows instead of a plain
// two-sided confirm:
//   - sent_for_review  → the brand forks (request revisions OR approve draft)
//   - revisions        → the creator reworks and resubmits (one-sided)
//   - final_payment    → dual-confirm completion (existing confirm_completion)
//   - project_completed → terminal, nothing to confirm
// Those are listed in NON_SIGNOFF_STAGES and the UI renders their own controls.

import type { Stage } from './project-lifecycle';

export interface StageGuide {
  // One-line purpose of the stage, shown to both parties.
  summary: string;
  // Concrete actions for each side during this stage.
  brand: string[];
  creator: string[];
}

export const STAGE_GUIDE: Record<Stage, StageGuide> = {
  collaboration_started: {
    summary: 'Say hello and align on what this collaboration is about before diving into details.',
    brand: ['Introduce your brand and the campaign idea', 'Share what outcome you are hoping for'],
    creator: ['Introduce yourself and your content style', 'Confirm the collaboration looks like a fit'],
  },
  project_discussion: {
    summary: 'Agree on the deliverables, timeline, and budget in writing before any money moves.',
    brand: ['Spell out deliverables, platforms, and usage rights', 'Propose a budget and rough timeline'],
    creator: ['Share your quote and what it includes', 'Confirm the deliverables and dates you can commit to'],
  },
  advance_payment: {
    summary: 'Lock the deal with an advance so both sides are committed before work starts.',
    brand: ['Set a payment deadline for the advance', 'Pay the advance / deposit securely'],
    creator: ['Confirm your quote and payment details', 'Acknowledge the advance once it arrives'],
  },
  content_planning: {
    summary: 'Turn the brief into a concrete plan — concept, script, and shot ideas.',
    brand: ['Share references, do/don’t notes, and must-say points', 'Review the plan the creator proposes'],
    creator: ['Draft the concept / script / storyboard', 'Share the content plan for the brand to review'],
  },
  content_confirmation: {
    summary: 'The brand signs off on the concept so shooting starts on the right foot.',
    brand: ['Review the concept and script', 'Approve it, or request changes before shooting'],
    creator: ['Answer any questions on the concept', 'Adjust the plan if the brand asks'],
  },
  shooting_in_progress: {
    summary: 'The creator captures the content agreed in the plan.',
    brand: ['Stay reachable for quick questions', 'Provide product / assets if needed'],
    creator: ['Shoot the content per the approved concept', 'Flag any blockers early'],
  },
  editing_in_progress: {
    summary: 'The creator edits the footage into the deliverable.',
    brand: ['Hold for the draft — no action needed yet', 'Line up your reviewers'],
    creator: ['Edit to the agreed spec and length', 'Prepare the draft for review'],
  },
  sent_for_review: {
    summary: 'The brand reviews the draft and either approves it or requests changes.',
    brand: ['Watch the draft carefully', 'Approve it, or send specific revision notes'],
    creator: ['Submit the draft for review', 'Wait for the brand’s decision'],
  },
  revisions: {
    summary: 'The creator applies the requested changes and resubmits.',
    brand: ['Be specific about what still needs to change', 'Re-review once resubmitted'],
    creator: ['Apply the requested revisions', 'Resubmit the updated draft'],
  },
  final_approval: {
    summary: 'The brand gives the final green light on the finished content.',
    brand: ['Confirm the final content is good to publish', 'Note any usage / posting instructions'],
    creator: ['Deliver the final files', 'Confirm posting details if you are publishing'],
  },
  final_payment: {
    summary: 'Settle the remaining balance, then both sides confirm the project is done.',
    brand: ['Pay the remaining balance', 'Confirm completion on your side'],
    creator: ['Confirm the final payment arrived', 'Confirm completion on your side'],
  },
  project_completed: {
    summary: 'The collaboration is complete. Leave a review to close it out.',
    brand: ['Leave a review for the creator'],
    creator: ['Leave a review for the brand'],
  },
};

// Stages that do NOT use plain two-sided sign-off — they have their own controls.
//
// `revisions` is one-sided on purpose. The brand has already spoken: it asked
// for changes, which is what put the project here. The stage is the creator
// doing the rework, and the brand's next say is the re-review it goes back to —
// STAGE_ACTOR has always said 'creator' and the stage guide has always read
// "Resubmit the updated draft". Running it as a mutual sign-off made the brand
// confirm that someone else's work was finished, then immediately review it
// again: two approvals for one decision, and the first one meaningless.
export const NON_SIGNOFF_STAGES: ReadonlySet<string> = new Set([
  'sent_for_review',
  'revisions',
  'final_payment',
  'project_completed',
]);

// Does this stage advance via mutual sign-off (both sides confirm)?
export function isMutualSignoffStage(stageKey: string): boolean {
  return !NON_SIGNOFF_STAGES.has(stageKey);
}

// Stages that can NEVER be skipped: money stages (both must be honoured), the
// brand's final green light, the review fork (needs a decision, not a skip), the
// revision loop, and the terminal stage. Everything else can be skipped by
// MUTUAL consent — one side proposes, the other confirms.
export const NON_SKIPPABLE_STAGES: ReadonlySet<string> = new Set([
  'advance_payment',
  'final_payment',
  'final_approval',
  'sent_for_review',
  'revisions',
  'project_completed',
]);

export function isSkippableStage(stageKey: string): boolean {
  return !NON_SKIPPABLE_STAGES.has(stageKey);
}

// A pending skip proposal on a stage, read out of stage_progress. Null if none.
export function stageSkipProposal(
  stageProgress: Record<string, any> | null | undefined,
  stageKey: string,
): { by: string; at: string } | null {
  const e = stageProgress?.[stageKey];
  if (e?.skip_proposed_by && e?.skip_proposed_at) {
    return { by: e.skip_proposed_by, at: e.skip_proposed_at };
  }
  return null;
}

// Read a side's sign-off timestamp for a stage out of the project's
// stage_progress JSONB. Returns null when not signed off.
export function stageSignoffAt(
  stageProgress: Record<string, any> | null | undefined,
  stageKey: string,
  role: 'business' | 'creator',
): string | null {
  const entry = stageProgress?.[stageKey];
  if (!entry) return null;
  return (role === 'business' ? entry.owner_signoff_at : entry.creator_signoff_at) || null;
}
