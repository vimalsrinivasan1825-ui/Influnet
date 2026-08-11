/**
 * The Free-tier projection of a creator's public profile.
 *
 * ── Why this is an allow-list ─────────────────────────────────────────────
 * The obvious implementation is a deny-list: build the full view, then delete
 * the premium keys. Do not do that. It fails in exactly the way paywalls
 * actually fail in the wild:
 *
 *   • someone adds a field to CreatorProfileView and never thinks about tiers,
 *     so it ships to Free by default;
 *   • a premium number is nested inside a structure that survives the strip
 *     (engagement rate lives inside platformCards, not beside it);
 *   • a refactor reorders the delete past a serialisation step.
 *
 * Building a NEW object from a fixed list of permitted fields inverts every one
 * of those. A field nobody has classified is absent from the Free response
 * until a human adds it here, which is the safe direction. The TypeScript
 * `Pick` below is what makes that a compile-time guarantee rather than a habit.
 *
 * ── What this does NOT claim ──────────────────────────────────────────────
 * The raw `get_public_influencer` RPC still returns the underlying columns to
 * the SERVER. That is fine — the server is trusted. What matters is that the
 * premium values never reach the HTTP response, and after this projection they
 * do not. Pushing the split into the RPC itself would save a few bytes of
 * server-side work; it would not close anything this leaves open.
 */
import type { CreatorProfileView } from './creator-profile';

/**
 * Fields a Free viewer sees on someone ELSE's profile.
 *
 * The dividing line is BREADTH vs DEPTH. Free answers "who is this creator and
 * is she credible?" — identity, reach, proof of past work, ratings. Pro answers
 * "should I pay this creator, how much, and how do I reach her?" — the analysis
 * a brand is actually buying.
 */
const FREE_FIELDS = [
  // Identity
  'name',
  'username',
  'avatarUrl',
  'subtitleLead',
  'subtitleAccent',
  'tagline',
  'location',
  'languages',
  'niches',
  'instagramHandle',
  'youtubeHandle',
  'profileUrl',

  // Trust signals. Never gated — a verification badge that only paying viewers
  // can see is not a trust signal, and hiding ratings would make the platform
  // less safe rather than more valuable.
  'isVerified',
  'ownershipVerified',
  'reviews',

  // Reach. Follower counts are the headline number and stay free: they are
  // visible on the social platforms themselves, so charging for them would be
  // charging for something the brand can read in ten seconds elsewhere.
  'heroStats',
  'platformCards',
  'stats',

  // Proof of work
  'featured',
  'videos',
  'portfolio',
  'pastCollaborations',
  'collabTypes',

  // Housekeeping the UI needs to render at all
  'usingMock',
  'snapshotAge',
  'packages',
] as const satisfies readonly (keyof CreatorProfileView)[];

export type FreeCreatorProfileView = Pick<
  CreatorProfileView,
  (typeof FREE_FIELDS)[number]
> & {
  /**
   * Tells the client that a Pro view of this profile exists, WITHOUT telling it
   * anything the Pro view contains. This is the upsell hook: the UI renders a
   * locked panel where the audience breakdown would be.
   *
   * It carries no values on purpose — a "locked" payload that still ships the
   * numbers so the client can blur them is the single most common way a paywall
   * leaks, and blurring is a CSS property.
   */
  lockedSections: LockedSection[];
};

export type LockedSection = 'audience' | 'contact' | 'rate';

/**
 * Premium fields, listed here only so the intent is documented in one place.
 * Nothing reads this array — the allow-list above is what does the work, and
 * that is deliberate: a second list that had to stay in sync would be a bug
 * waiting to happen.
 *
 *   audience    — locations, ages, genders, interest affinities
 *   contact     — the email/phone lifted out of the creator's bio. Gating this
 *                 is not only monetisation: a brand that can read the address
 *                 has no reason to run the deal (or the payment, or the
 *                 sign-off) on the platform at all.
 *   priceLabel  — the creator's published rate
 *   postPreview — the sample-work card that accompanies the rate
 */
const PRO_ONLY_FIELDS = ['audience', 'contact', 'priceLabel', 'postPreview'] as const;
void PRO_ONLY_FIELDS;

/**
 * Projects a full view down to what a Free viewer may receive.
 *
 * `lockedSections` lists only the sections that would actually have content for
 * THIS creator — there is no point advertising an audience breakdown behind a
 * paywall when the creator never filled one in, and doing so would make Pro
 * look emptier than it is the first time somebody paid to check.
 */
export function toFreeProfileView(view: CreatorProfileView): FreeCreatorProfileView {
  const out = {} as Record<string, unknown>;
  for (const key of FREE_FIELDS) out[key] = view[key];

  const locked: LockedSection[] = [];
  const a = view.audience;
  const hasAudience =
    !!a &&
    (a.locations.length > 0 || a.ages.length > 0 || a.genders.length > 0 || a.interests.length > 0);
  if (hasAudience) locked.push('audience');
  if (view.contact.length > 0) locked.push('contact');
  if (view.priceLabel) locked.push('rate');

  (out as FreeCreatorProfileView).lockedSections = locked;
  return out as FreeCreatorProfileView;
}

/**
 * The one call sites should use: returns the full view for Pro, the projection
 * for Free. Keeping the branch here rather than at each call site means a new
 * consumer of the profile cannot accidentally get the ungated version by
 * forgetting an `if`.
 */
export function projectProfileForTier(
  view: CreatorProfileView,
  canSeeAudience: boolean,
): CreatorProfileView | FreeCreatorProfileView {
  return canSeeAudience ? view : toFreeProfileView(view);
}

/**
 * What a RENDERER may assume it has been given.
 *
 * The free fields are guaranteed; the premium ones are optional. Both
 * `CreatorProfileView` and `FreeCreatorProfileView` satisfy it, so the profile
 * component can take either without a cast and without a runtime check for
 * every field.
 *
 * This matters more than it looks on a server-rendered page. `data` is a prop
 * passed to a CLIENT component, which means Next serialises it into the RSC
 * payload embedded in the HTML — so a premium field left on the object is
 * readable in view-source whether or not anything renders it. "The component
 * doesn't display it" is not a paywall.
 */
export type RenderableProfileView = Pick<CreatorProfileView, (typeof FREE_FIELDS)[number]> &
  Partial<Pick<CreatorProfileView, 'audience' | 'contact' | 'priceLabel' | 'postPreview'>> & {
    lockedSections?: LockedSection[];
  };
