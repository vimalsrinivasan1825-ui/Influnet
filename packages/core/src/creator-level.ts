/**
 * Creator level tiers derived from audience size.
 *
 * Tiers are computed from verified follower data where available. Mark the
 * tier clearly as self-reported where figures are not verified — a public
 * badge is an incentive to inflate, and this codebase has already had to
 * lock down a self-awarded verified badge once (migration 083).
 *
 * Lives in packages/core so web and mobile cannot disagree about where a
 * boundary sits.
 */

export interface CreatorLevel {
  tier: string;
  label: string;
  minFollowers: number;
  maxFollowers: number | null;
  /** Whether the tier badge should show a "self-reported" indicator. */
  isSelfReported: boolean;
}

const LEVELS: CreatorLevel[] = [
  { tier: 'nano', label: 'Nano', minFollowers: 0, maxFollowers: 9_999, isSelfReported: false },
  { tier: 'micro', label: 'Micro', minFollowers: 10_000, maxFollowers: 99_999, isSelfReported: false },
  { tier: 'mid', label: 'Mid-tier', minFollowers: 100_000, maxFollowers: 499_999, isSelfReported: false },
  { tier: 'macro', label: 'Macro', minFollowers: 500_000, maxFollowers: 999_999, isSelfReported: false },
  { tier: 'mega', label: 'Mega', minFollowers: 1_000_000, maxFollowers: null, isSelfReported: false },
];

/**
 * Derive the creator level from a follower count.
 *
 * @param followers  Total follower count (use verified figures where available)
 * @param isVerified Whether the follower data comes from a verified source
 */
export function creatorLevel(followers: number, isVerified = true): CreatorLevel {
  const level = [...LEVELS].reverse().find((l) => followers >= l.minFollowers) ?? LEVELS[0];
  return { ...level, isSelfReported: !isVerified };
}

/**
 * Progress to the next tier as a 0–1 fraction.
 * Returns 1 when already at the highest tier.
 */
export function creatorLevelProgress(followers: number, isVerified = true): number {
  const level = creatorLevel(followers, isVerified);
  const currentIdx = LEVELS.findIndex((l) => l.tier === level.tier);
  if (currentIdx >= LEVELS.length - 1) return 1;

  const next = LEVELS[currentIdx + 1];
  const range = next.minFollowers - level.minFollowers;
  if (range <= 0) return 1;

  return Math.min(1, (followers - level.minFollowers) / range);
}
