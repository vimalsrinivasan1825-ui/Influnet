/**
 * What a signed-in creator should be told about their verification, if
 * anything.
 *
 * This exists because the apps were deciding it from one bit — the Verified
 * badge — and one bit cannot express the situation most new creators are
 * actually in. Signup asks for the Instagram bio-link proof; the badge is
 * granted later by a scoring pipeline that also weighs follower count, posting
 * recency and the platform's own badge. So the common state on first launch is
 * "ownership proven, badge not granted", and reading only the badge renders
 * that as *not verified* — sending someone back to a task they finished
 * minutes ago and quietly implying we lost their proof.
 *
 * Four outcomes, because four different things are true and each deserves
 * different words. Kept here rather than in the app so it can be tested and so
 * web and mobile cannot drift on it.
 */

export type VerificationPipelineStatus =
  | 'unverified'
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'needs_more_info'
  | 'rejected';

export interface VerificationNudgeInput {
  status: VerificationPipelineStatus;
  /** The Verified badge itself — the pipeline's decision. */
  badge: boolean;
  /**
   * The bio-link handshake, read from the ownership CLAIM rather than from the
   * last check's stored signals. This is the field that separates "there is a
   * task for you" from "we are still scoring you".
   */
  ownership_verified: boolean;
  /** 0–1 confidence from the latest check, or null when none has run. */
  score: number | null;
}

export type VerificationNudge =
  /** Badge granted and not yet marked on this device — a moment worth showing. */
  | 'celebrate'
  /** No ownership proof on file. A real, short task. */
  | 'action'
  /** Proof is in, scoring continues. Progress and a checklist, no urgency. */
  | 'progress'
  /** Nothing to say. */
  | 'none';

export function decideVerificationNudge(
  input: VerificationNudgeInput | null | undefined,
  opts: { celebrated: boolean } = { celebrated: false },
): VerificationNudge {
  if (!input) return 'none';

  // The badge outranks everything, including a stale `status` — the two are
  // written by the same RPC but read from different rows, and a client holding
  // one fresh and one cached must not congratulate and nag at the same time.
  if (input.badge || input.status === 'verified') {
    return opts.celebrated ? 'none' : 'celebrate';
  }

  // Deliberately NOT keyed on `status`. `in_review` covers both "we never got
  // your proof" and "your proof is in, your numbers are thin", and collapsing
  // those is the whole bug: it is what told a creator who had just completed
  // the bio-link step at signup to go and verify their Instagram.
  return input.ownership_verified ? 'progress' : 'action';
}

/**
 * A fingerprint of the state a dismissal applies to.
 *
 * The progress card can be put away, but only until something changes —
 * permanently hiding it would bury the one place a creator can find out what is
 * still outstanding, and re-showing it every launch would make it wallpaper.
 * Score is bucketed to whole percent so a re-run that moves nothing meaningful
 * does not resurrect a card the user just dismissed.
 */
export function verificationStateKey(input: VerificationNudgeInput): string {
  const score = input.score == null ? 'x' : String(Math.round(input.score * 100));
  return `${input.status}:${input.ownership_verified ? 'own' : 'noown'}:${score}`;
}
