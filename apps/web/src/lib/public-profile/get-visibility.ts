/**
 * What a creator has chosen to show, for the public profile.
 *
 * Reads get_profile_visibility (migration 088) — a public definer read, same
 * pattern as get-reviews.ts and get-portfolio.ts, because influencer_profiles
 * itself has no anonymous SELECT policy.
 */
import { logger as log } from '../logger';
import type { ProfileSectionVisibility } from '@influnet/core';

/**
 * A database behind on 088 must render every section rather than 500 on a
 * public profile — the pre-088 behavior (show everything) is the correct
 * fallback, not an error state.
 */
export async function getProfileVisibility(
  supabase: any,
  userId: string,
): Promise<ProfileSectionVisibility> {
  try {
    const { data, error } = await supabase.rpc('get_profile_visibility', { p_user_id: userId });
    if (error || data == null || typeof data !== 'object') {
      if (error) log.warn('profile visibility rpc unavailable', { err: error.message });
      return {};
    }
    return data as ProfileSectionVisibility;
  } catch (err: any) {
    log.warn('profile visibility lookup failed', { err: err?.message });
    return {};
  }
}
