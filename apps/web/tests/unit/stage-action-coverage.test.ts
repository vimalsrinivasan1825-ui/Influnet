/**
 * Every stage must offer SOME way forward on every client.
 *
 * The mobile stage screen picks its footer by asking three questions in order:
 * is this the completion stage, is it the review fork, does it use mutual
 * sign-off? If a stage answers "no" to all three, the footer renders `null` —
 * no buttons, no explanation, nothing. The project is stuck and the UI does not
 * say why.
 *
 * That is not hypothetical. It shipped twice:
 *   • `final_payment` — fixed by adding the completion branch.
 *   • `sent_for_review` — fixed by adding the review-fork branch. A project run
 *     from the phone reached stage 8 of 12 and dead-ended there.
 *
 * Both stages are in NON_SIGNOFF_STAGES, which is precisely the set that falls
 * through the sign-off branch. So the invariant worth guarding is: every member
 * of NON_SIGNOFF_STAGES is either terminal or has its own dedicated control.
 *
 * If someone adds a stage to NON_SIGNOFF_STAGES without giving it a control,
 * this test fails instead of a user discovering it mid-project.
 */
import { describe, it, expect } from 'vitest';
import {
  STAGES,
  STAGE_ACTOR,
  ALLOWED_TRANSITIONS,
  NON_SIGNOFF_STAGES,
  isMutualSignoffStage,
  type Stage,
} from '@influnet/core';

/**
 * The stages both clients handle with bespoke controls rather than sign-off.
 * Keep this list in step with the footer branches in
 * apps/mobile/app/projects/[id]/stage/[stage].tsx and the action zone in
 * apps/web/src/app/dashboard/projects/[id]/page.tsx.
 */
const DEDICATED_CONTROL_STAGES: Stage[] = ['sent_for_review', 'final_payment'];
const TERMINAL_STAGES: Stage[] = ['project_completed'];

describe('stage action coverage', () => {
  it('gives every stage a way forward — sign-off, a dedicated control, or terminal', () => {
    const stranded = STAGES.filter(
      (stage) =>
        !isMutualSignoffStage(stage) &&
        !DEDICATED_CONTROL_STAGES.includes(stage) &&
        !TERMINAL_STAGES.includes(stage),
    );

    expect(stranded).toEqual([]);
  });

  it('accounts for every non-sign-off stage explicitly', () => {
    // NON_SIGNOFF_STAGES is the fall-through set. Nothing may be in it that
    // isn't either terminal or explicitly given controls.
    const unaccounted = [...NON_SIGNOFF_STAGES].filter(
      (stage) =>
        !DEDICATED_CONTROL_STAGES.includes(stage as Stage) &&
        !TERMINAL_STAGES.includes(stage as Stage),
    );

    expect(unaccounted).toEqual([]);
  });

  it('keeps the review fork a two-exit decision owned by the brand', () => {
    // The mobile footer sends `advance` with an explicit stage_key precisely
    // because this stage has two forward exits. If either fact changes, the
    // two buttons are wrong.
    expect(ALLOWED_TRANSITIONS.sent_for_review).toEqual(['revisions', 'final_approval']);
    expect(STAGE_ACTOR.sent_for_review).toBe('business');
  });

  it('leaves the review fork out of the sign-off flow on both clients', () => {
    // If this ever became a sign-off stage, the mobile footer would show BOTH
    // the fork buttons and the confirm button, and the two would disagree about
    // where the project goes next.
    expect(isMutualSignoffStage('sent_for_review')).toBe(false);
  });

  it('only lets the review fork target stages the server will accept', () => {
    // The mobile buttons hard-code these two targets. The server validates
    // against ALLOWED_TRANSITIONS, so a drift here is a 400 at the tap.
    const mobileTargets = ['revisions', 'final_approval'];
    for (const target of mobileTargets) {
      expect(ALLOWED_TRANSITIONS.sent_for_review).toContain(target);
    }
  });
});
