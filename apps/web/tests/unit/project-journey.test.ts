/**
 * Walk a project from first contact to completion, one stage at a time, and
 * assert somebody can always move it.
 *
 * Every bug this suite exists for was a *reachability* bug, not a logic bug:
 * the code for each stage was fine in isolation, and the project still got
 * stuck because no actor was offered a control. Unit-testing the stages one by
 * one never caught that — the failure only shows up when you try to walk the
 * whole thing.
 *
 * So this simulates the walk. At every stage it asks the three questions the
 * clients ask — is there a control, who owns it, where does it lead — and fails
 * if the answer is "nobody" or "nowhere". Two real dead ends would have been
 * caught here on the first run:
 *
 *   sent_for_review — no mobile control at all, project stopped at 8 of 12
 *   revisions       — advanced by array index, skipping the re-review entirely
 *
 * It is deliberately written against the SHARED helpers both clients use, so it
 * tests what web and mobile actually branch on rather than a copy of it.
 */
import { describe, it, expect } from 'vitest';
import {
  STAGES,
  STAGE_ACTOR,
  ALLOWED_TRANSITIONS,
  isMutualSignoffStage,
  isSkippableStage,
  projectTurn,
  type Stage,
  type Side,
} from '@influnet/core';

const SIDES: Side[] = ['business', 'creator'];

/**
 * The control a client renders for a stage, derived exactly as the footer /
 * action-zone branches derive it. 'signoff' is the mutual path; the rest are
 * the dedicated controls.
 */
function controlFor(stage: Stage): 'signoff' | 'review_fork' | 'resubmit' | 'completion' | 'terminal' {
  if (stage === 'project_completed') return 'terminal';
  if (stage === 'sent_for_review') return 'review_fork';
  if (stage === 'revisions') return 'resubmit';
  if (stage === 'final_payment') return 'completion';
  if (isMutualSignoffStage(stage)) return 'signoff';
  // Anything reaching here has no branch on either client — the exact shape of
  // the sent_for_review bug.
  throw new Error(`stage "${stage}" has no control on either client`);
}

describe('the full project journey', () => {
  it('offers a control at every stage', () => {
    for (const stage of STAGES) {
      expect(() => controlFor(stage), stage).not.toThrow();
    }
  });

  it('never freezes a project by telling both sides to wait', () => {
    // Both sides told "them" is the real failure: a live project sitting on two
    // Home screens with nobody prompted to open it.
    //
    // Both told "you" is NOT a failure — the 'either' stages (kickoff,
    // discussion) are genuinely open to whoever gets there first, and that is
    // what STAGE_ACTOR 'either' means. Only a single-actor stage has to name one
    // side, which the next assertion covers.
    for (const stage of STAGES) {
      const verdicts = SIDES.map((side) => projectTurn({ stage, side }).turn);
      if (stage === 'project_completed') {
        expect(verdicts, stage).toEqual(['none', 'none']);
        continue;
      }
      expect(verdicts.includes('you'), `${stage}: ${verdicts.join('/')}`).toBe(true);
    }
  });

  it('names exactly one side on every single-actor stage', () => {
    for (const stage of STAGES) {
      if (stage === 'project_completed' || STAGE_ACTOR[stage] === 'either') continue;
      const verdicts = SIDES.map((side) => projectTurn({ stage, side }).turn);
      expect(verdicts.filter((v) => v === 'you').length, `${stage}: ${verdicts.join('/')}`).toBe(1);
      expect(verdicts.filter((v) => v === 'them').length, stage).toBe(1);
    }
  });

  it('reaches project_completed by only ever taking legal transitions', () => {
    // The happy path: no revisions requested. Follows ALLOWED_TRANSITIONS the
    // way the server now resolves it, taking the LAST option at a fork (approve
    // rather than send back) so the walk terminates.
    const path: Stage[] = [];
    let stage: Stage = 'collaboration_started';

    for (let guard = 0; guard < STAGES.length * 3; guard++) {
      path.push(stage);
      const next = ALLOWED_TRANSITIONS[stage];
      if (!next?.length) break;
      stage = next[next.length - 1] as Stage;
    }

    expect(path[path.length - 1]).toBe('project_completed');
    // Every stage except the revision loop is on the happy path.
    expect(path).not.toContain('revisions');
    expect(path).toContain('sent_for_review');
    expect(path).toContain('final_approval');
  });

  it('returns to review after a revision, and can still finish', () => {
    // The loop that was broken: request changes, rework, resubmit, re-review.
    // Before the fix `revisions` jumped straight to final_approval and the
    // draft was never looked at again.
    expect(ALLOWED_TRANSITIONS.sent_for_review).toContain('revisions');
    expect(ALLOWED_TRANSITIONS.revisions).toEqual(['sent_for_review']);

    let stage: Stage = 'sent_for_review';
    stage = 'revisions';                                   // brand asks for changes
    stage = ALLOWED_TRANSITIONS[stage][0] as Stage;         // creator resubmits
    expect(stage).toBe('sent_for_review');                  // back for re-review

    // And from there the approve branch still finishes the project.
    stage = 'final_approval';
    const rest: Stage[] = [];
    for (let guard = 0; guard < STAGES.length; guard++) {
      rest.push(stage);
      const next = ALLOWED_TRANSITIONS[stage];
      if (!next?.length) break;
      stage = next[next.length - 1] as Stage;
    }
    expect(rest[rest.length - 1]).toBe('project_completed');
  });

  it('never leaves a dedicated-control stage without an owner', () => {
    // A one-sided control belongs to exactly one role. 'either' would render the
    // button to both parties — for the review fork that means the creator could
    // approve their own draft.
    for (const stage of STAGES) {
      const control = controlFor(stage);
      if (control === 'review_fork' || control === 'resubmit') {
        expect(STAGE_ACTOR[stage], stage).not.toBe('either');
      }
    }
  });

  it('puts the two halves of the review loop on opposite sides', () => {
    // Whoever asks for changes must not also be the one who resubmits them.
    expect(STAGE_ACTOR.sent_for_review).toBe('business');
    expect(STAGE_ACTOR.revisions).toBe('creator');
    expect(STAGE_ACTOR.sent_for_review).not.toBe(STAGE_ACTOR.revisions);
  });

  it('keeps money and final sign-off out of the skip path', () => {
    // A stage that can be skipped by consent must not be one where skipping
    // means "we agreed you don't have to pay" without saying so.
    for (const stage of ['advance_payment', 'final_payment', 'final_approval'] as Stage[]) {
      expect(isSkippableStage(stage), stage).toBe(false);
    }
  });
});
