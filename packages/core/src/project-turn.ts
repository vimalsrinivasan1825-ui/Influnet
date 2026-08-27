/**
 * Whose move is it?
 *
 * Every piece of information needed to answer that question already existed —
 * STAGE_ACTOR says which side moves a stage forward, and the bilateral stages
 * record each side's sign-off in `stage_progress` — but nothing ever combined
 * them, so both apps could tell a user WHICH stage a project sat in and never
 * whether they were the one holding it up.
 *
 * Pure: takes the stage, which side you are, and the project's stage_progress
 * JSONB. No DB, no platform APIs, so Home (mobile), the API layer, and the web
 * dashboard can all reach the same verdict rather than each inventing one.
 */
import { STAGES, STAGE_ACTOR, STAGE_FLOWS, type Stage, type StageFlow, type FlowKey } from './project-lifecycle';
import { isMutualSignoffStage, stageSignoffAt } from './project-stage-guide';

export type Side = 'business' | 'creator';

/**
 * 'you'   — this side can act right now.
 * 'them'  — the other side is holding it; nothing to do but wait (or nudge).
 * 'none'  — nobody: the project is finished.
 */
export type Turn = 'you' | 'them' | 'none';

export interface ProjectTurn {
  turn: Turn;
  /**
   * Imperative, short enough for a list row. When `turn` is 'them' this
   * describes what the OTHER side owes, phrased for the reader.
   */
  action: string;
}

/**
 * Short imperatives, per stage and per side. STAGE_GUIDE's arrays are the long
 * form shown inside a stage; these are the one-line version a list row needs.
 */
const TURN_ACTION: Record<Stage, Record<Side, string>> = {
  collaboration_started: {
    business: 'Introduce your brand and the campaign',
    creator: 'Say hello and confirm the fit',
  },
  project_discussion: {
    business: 'Agree deliverables, timeline and budget',
    creator: 'Send your quote and confirm the deliverables',
  },
  advance_payment: {
    business: 'Pay the advance to start the work',
    creator: 'Confirm your payment details',
  },
  content_planning: {
    business: 'Share references and must-say points',
    creator: 'Share the concept or script',
  },
  content_confirmation: {
    business: 'Approve the concept, or request changes',
    creator: 'Answer questions on the concept',
  },
  shooting_in_progress: {
    business: 'Confirm the shoot is on track',
    creator: 'Shoot the content',
  },
  editing_in_progress: {
    business: 'Confirm the draft once it arrives',
    creator: 'Finish the edit and submit the draft',
  },
  sent_for_review: {
    business: 'Review the draft: approve or request revisions',
    creator: 'Wait for the review',
  },
  revisions: {
    business: 'Confirm the reworked draft',
    creator: 'Apply the notes and resubmit',
  },
  final_approval: {
    business: 'Give the final green light',
    creator: 'Confirm the final version',
  },
  final_payment: {
    business: 'Release the final payment',
    creator: 'Confirm the payment once it lands',
  },
  project_completed: {
    business: 'Leave a review for the creator',
    creator: 'Leave a review for the brand',
  },
};

/**
 * The two ways a stage advances, and both are handled here:
 *
 *   1. Bilateral sign-off stages — it is your turn until YOU have signed off,
 *      then theirs. This is stronger than STAGE_ACTOR alone, which only names
 *      the side that pushes the stage on and would keep saying "your turn"
 *      after you had already confirmed.
 *   2. The special stages (review fork, final payment, completed) — STAGE_ACTOR
 *      is the authority, because they keep their own dedicated controls.
 */
export function projectTurn(args: {
  stage: string;
  side: Side;
  stageProgress?: Record<string, any> | null;
  flow?: StageFlow;
}): ProjectTurn {
  const { stage, side, stageProgress } = args;
  const flow = args.flow ?? STAGE_FLOWS.full;

  const known = flow.stages.includes(stage);
  if (!known) return { turn: 'you', action: 'Open the project' };

  const s = stage;
  const other: Side = side === 'business' ? 'creator' : 'business';
  const action = (who: Side) => (TURN_ACTION as Record<string, Record<Side, string>>)[s]?.[who] ?? 'Continue';

  if (s === 'project_completed') return { turn: 'none', action: action(side) };

  if (isMutualSignoffStage(s, flow)) {
    const mine = stageSignoffAt(stageProgress, s, side);
    const theirs = stageSignoffAt(stageProgress, s, other);

    /**
     * Both signed but the project is still sitting here. Through the API this
     * is transient — the second sign-off advances the stage in the same request
     * — but migration 081 deliberately lets a participant PATCH their OWN
     * sign-off straight through PostgREST, and that write runs no advance logic.
     *
     * Reporting 'them' to both sides (which is what reading only your own
     * sign-off does) freezes the project on two Home screens with nobody
     * prompted to touch it. Calling it actionable is both honest and
     * self-healing: opening the project and confirming re-enters the API path,
     * which sees both sign-offs and moves the stage on.
     */
    if (mine && theirs) return { turn: 'you', action: 'Open the project to continue' };

    // You have confirmed; the stage is theirs to match.
    if (mine) return { turn: 'them', action: action(other) };

    // They have confirmed and are now waiting on you — yours regardless of who
    // does the substantive work in this stage.
    if (theirs) return { turn: 'you', action: action(side) };

    /**
     * Neither side has signed. Both *may* sign, but saying "your move" to both
     * is how a screen ends up headlining "Your move — wait for the first draft".
     * STAGE_ACTOR knows who actually does the work in this stage; the other side
     * is genuinely waiting, and Home should say so.
     */
    const primary = flow.actor[s];
    return primary === 'either' || primary === side
      ? { turn: 'you', action: action(side) }
      : { turn: 'them', action: action(other) };
  }

  const actor = flow.actor[s];
  if (actor === 'either' || actor === side) return { turn: 'you', action: action(side) };
  return { turn: 'them', action: action(other) };
}
