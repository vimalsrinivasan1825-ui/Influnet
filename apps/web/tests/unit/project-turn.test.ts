/**
 * projectTurn() — "whose move is it on this project?"
 *
 * Home (mobile) renders one row per active project and leads with this verdict,
 * so a wrong answer here is not a cosmetic bug: it either nags a user about work
 * they have already done, or — worse — tells BOTH sides they are waiting on the
 * other, which makes a live project look frozen with nothing prompting anyone to
 * open it. The deadlock sweep below is the test that matters most; it is what
 * caught exactly that case during development.
 */
import { describe, it, expect } from 'vitest';
import { STAGES, STAGE_ACTOR, isMutualSignoffStage, projectTurn, type Side } from '@influnet/core';

const SIDES: Side[] = ['business', 'creator'];
const signoffKey = (side: Side) =>
  side === 'business' ? 'owner_signoff_at' : 'creator_signoff_at';
const other = (side: Side): Side => (side === 'business' ? 'creator' : 'business');

describe('projectTurn — per-stage ownership', () => {
  it('hands the review fork to the brand and makes the creator wait', () => {
    expect(projectTurn({ stage: 'sent_for_review', side: 'business' }).turn).toBe('you');
    expect(projectTurn({ stage: 'sent_for_review', side: 'creator' }).turn).toBe('them');
  });

  it('puts the final payment on the payer', () => {
    expect(projectTurn({ stage: 'final_payment', side: 'business' }).turn).toBe('you');
    expect(projectTurn({ stage: 'final_payment', side: 'creator' }).turn).toBe('them');
  });

  it('treats a completed project as nobody’s move', () => {
    for (const side of SIDES) {
      expect(projectTurn({ stage: 'project_completed', side }).turn).toBe('none');
    }
  });

  it('keeps an unrecognised stage actionable rather than hiding it', () => {
    // A stage this build doesn't know about must never silently drop a live
    // project off Home — surfacing it as "open the project" is the safe failure.
    expect(projectTurn({ stage: 'stage_from_a_newer_build', side: 'creator' }).turn).toBe('you');
  });

  it('gives both sides real action text for every stage', () => {
    for (const stage of STAGES) {
      for (const side of SIDES) {
        expect(projectTurn({ stage, side }).action.length).toBeGreaterThan(8);
      }
    }
  });
});

describe('projectTurn — bilateral sign-off', () => {
  it('gives a fresh mutual stage to the side that does the work', () => {
    // Both sides *may* sign a bilateral stage, but calling it "your move" for
    // both is how Home ends up headlining "Your move — wait for the first
    // draft". STAGE_ACTOR names who actually does the work; the other side is
    // genuinely waiting until that work lands.
    for (const stage of STAGES.filter(isMutualSignoffStage)) {
      const primary = STAGE_ACTOR[stage];
      if (primary === 'either') continue;
      expect(projectTurn({ stage, side: primary }).turn).toBe('you');
      expect(projectTurn({ stage, side: other(primary) }).turn).toBe('them');
    }
  });

  it('hands the stage to you once the other side has confirmed', () => {
    for (const stage of STAGES.filter(isMutualSignoffStage)) {
      for (const side of SIDES) {
        const theirs = { [stage]: { [signoffKey(other(side))]: '2026-07-28T00:00:00Z' } };
        expect(projectTurn({ stage, side, stageProgress: theirs }).turn).toBe('you');
      }
    }
  });

  it('never headlines an actionable row with a passive instruction', () => {
    // "Your move — Wait for the review" is a contradiction on the card.
    const passive: string[] = [];
    for (const stage of STAGES) {
      for (const side of SIDES) {
        for (const stageProgress of [
          null,
          { [stage]: { [signoffKey(other(side))]: 'x' } },
        ]) {
          const { turn, action } = projectTurn({ stage, side, stageProgress });
          if (turn === 'you' && /^wait\b/i.test(action)) passive.push(`${stage}/${side}: ${action}`);
        }
      }
    }
    expect(passive).toEqual([]);
  });

  it('flips to "them" once you have signed, and stays there', () => {
    // STAGE_ACTOR alone cannot do this: it names the side that pushes a stage
    // forward, so it keeps saying "your turn" after you have already confirmed.
    for (const stage of STAGES.filter(isMutualSignoffStage)) {
      for (const side of SIDES) {
        const mine = { [stage]: { [signoffKey(side)]: '2026-07-28T00:00:00Z' } };
        expect(projectTurn({ stage, side, stageProgress: mine }).turn).toBe('them');
        // ...and the other side still sees it as theirs to move.
        expect(projectTurn({ stage, side: other(side), stageProgress: mine }).turn).toBe('you');
      }
    }
  });

  it('stays actionable when both sides signed but the stage never advanced', () => {
    /**
     * Through /api/projects/[id] the second sign-off advances the stage in the
     * same request, so this state is transient. But migration 081 deliberately
     * permits a participant to PATCH their OWN sign-off through PostgREST, and
     * that write runs no advance logic — leaving both sign-offs recorded on a
     * stage that never moved. Reading only your own sign-off reports "them" to
     * both parties, freezing the project on two Home screens.
     */
    const stage = 'content_planning';
    const both = {
      [stage]: {
        owner_signoff_at: '2026-07-28T00:00:00Z',
        creator_signoff_at: '2026-07-28T00:01:00Z',
      },
    };
    for (const side of SIDES) {
      expect(projectTurn({ stage, side, stageProgress: both }).turn).toBe('you');
    }
  });
});

describe('projectTurn — deadlock sweep', () => {
  it('never leaves both sides waiting, in any stage or sign-off combination', () => {
    const deadlocked: string[] = [];

    for (const stage of STAGES) {
      const combos: (Record<string, any> | null)[] = [
        null,
        { [stage]: { owner_signoff_at: 'x' } },
        { [stage]: { creator_signoff_at: 'x' } },
        { [stage]: { owner_signoff_at: 'x', creator_signoff_at: 'x' } },
      ];

      for (const stageProgress of combos) {
        const brand = projectTurn({ stage, side: 'business', stageProgress }).turn;
        const creator = projectTurn({ stage, side: 'creator', stageProgress }).turn;
        if (brand === 'them' && creator === 'them') {
          deadlocked.push(`${stage} ${JSON.stringify(stageProgress?.[stage] ?? null)}`);
        }
      }
    }

    expect(deadlocked).toEqual([]);
  });
});
