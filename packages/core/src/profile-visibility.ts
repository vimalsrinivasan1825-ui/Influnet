/**
 * What a creator's public profile is allowed to show.
 *
 * Opt-OUT by design: `profile_section_visibility` is a JSONB blob on
 * influencer_profiles (migration 088) where a MISSING key means "on". That
 * makes an untouched profile ('{}') behave exactly as it always did, and lets
 * a fourth section be added later without a migration or a backfill — the
 * default for any key nobody has heard of yet is still "show it".
 *
 * Shared so web and mobile can never disagree about what a toggle means.
 */
export const PROFILE_SECTIONS = ['instagram_posts', 'youtube_videos', 'portfolio'] as const;
export type ProfileSectionKey = typeof PROFILE_SECTIONS[number];

export type ProfileSectionVisibility = Partial<Record<ProfileSectionKey, boolean>>;

/** A section is visible unless explicitly set to false. */
export function isSectionVisible(
  visibility: ProfileSectionVisibility | null | undefined,
  key: ProfileSectionKey,
): boolean {
  return visibility?.[key] !== false;
}

export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  instagram_posts: 'Recent Instagram posts',
  youtube_videos: 'Recent YouTube videos',
  portfolio: 'Portfolio',
};
