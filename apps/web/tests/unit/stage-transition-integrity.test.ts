/**
 * Stage advancement must follow ALLOWED_TRANSITIONS, never array order.
 *
 * STAGES is a display order. ALLOWED_TRANSITIONS is the state machine. For
 * eleven of the twelve stages those agree, which is exactly why three separate
 * code paths got away with `STAGES[currentIdx + 1]` for so long:
 *
 *   • PATCH advance (no stage_key) — the board's "Advance" button
 *   • PATCH signoff (both sides confirmed) — the guided flow
 *   • PATCH confirm_skip — skip by mutual consent
 *
 * The twelfth is `revisions`. It sits before `final_approval` in the array but
 * loops BACK to `sent_for_review`, because a reworked draft is supposed to be
 * re-reviewed. Advancing by index skipped that: the brand approved final content
 * having never seen the resubmitted draft, and the review stage became
 * single-use. The `advance` path with an explicit stage_key validated against
 * the map and would have rejected the very same move — so the API contradicted
 * itself depending on which button you pressed.
 *
 * These tests encode the rule the fix relies on, so a future stage that forks or
 * loops can't quietly reintroduce it.
 */
import { describe, it, expect } from 'vitest';
import {
  STAGES,
  ALLOWED_TRANSITIONS,
  NON_SIGNOFF_STAGES,
  NON_SKIPPABLE_STAGES,
  isMutualSignoffStage,
  isSkippableStage,
  type Stage,
} from '@influnet/core';

describe('stage transition integrity', () => {
  it('sends revisions back for re-review, not forward to final approval', () => {
    // The specific bug. `final_approval` is the next ARRAY element; the only
    // legal transition is back to `sent_for_review`.
    const arrayNext = STAGES[STAGES.indexOf('revisions') + 1];
    expect(arrayNext).toBe('final_approval');
    expect(ALLOWED_TRANSITIONS.revisions).toEqual(['sent_for_review']);
    expect(ALLOWED_TRANSITIONS.revisions).not.toContain(arrayNext);
  });

  it('gives every sign-off stage exactly one exit', () => {
    // The sign-off path resolves its target as ALLOWED_TRANSITIONS[stage][0].
    // That is only sound while each such stage has precisely one exit — a fork
    // would make the choice arbitrary, and a dead end would strand the project.
    for (const stage of STAGES) {
      if (!isMutualSignoffStage(stage)) continue;
      expect(
        ALLOWED_TRANSITIONS[stage],
        `${stage} advances by sign-off, so it needs exactly one legal transition`,
      ).toHaveLength(1);
    }
  });

  it('gives every skippable stage exactly one exit', () => {
    for (const stage of STAGES) {
      if (!isSkippableStage(stage)) continue;
      expect(
        ALLOWED_TRANSITIONS[stage],
        `${stage} can be skipped, so it needs exactly one legal transition`,
      ).toHaveLength(1);
    }
  });

  it('keeps every forking stage out of both consent flows', () => {
    // A stage with more than one exit cannot advance by sign-off or by skip —
    // neither carries a destination. It must be in both exclusion sets.
    const forking = STAGES.filter((s) => (ALLOWED_TRANSITIONS[s] || []).length > 1);
    expect(forking).toEqual(['sent_for_review']);

    for (const stage of forking) {
      expect(NON_SIGNOFF_STAGES.has(stage)).toBe(true);
      expect(NON_SKIPPABLE_STAGES.has(stage)).toBe(true);
    }
  });

  it('only lets terminal stages have no exit', () => {
    const dead = STAGES.filter((s) => (ALLOWED_TRANSITIONS[s] || []).length === 0);
    expect(dead).toEqual(['project_completed']);
  });

  it('never transitions to a stage that does not exist', () => {
    for (const stage of STAGES) {
      for (const target of ALLOWED_TRANSITIONS[stage] || []) {
        expect(STAGES, `${stage} -> ${target}`).toContain(target as Stage);
      }
    }
  });

  it('keeps every stage reachable from the start', () => {
    // A stage nothing transitions into is dead UI. Walks the graph rather than
    // assuming the array order connects it.
    const seen = new Set<string>(['collaboration_started']);
    const queue = ['collaboration_started'];
    while (queue.length) {
      for (const next of ALLOWED_TRANSITIONS[queue.shift() as Stage] || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...STAGES].filter((s) => !seen.has(s))).toEqual([]);
  });
});
