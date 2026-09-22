/**
 * The creator's chosen profile layout, for the public profile.
 *
 * Reads get_profile_layout (migration 173) — a public definer read, same
 * pattern as get-visibility.ts, because influencer_profiles has no anonymous
 * SELECT policy. The stored blob is creator-written, so it always goes through
 * resolveProfileLayout: unknown designs fall back to the default and bad links
 * are dropped.
 */
import { resolveProfileLayout, type ResolvedProfileLayout } from '@influnet/core';
import { logger as log } from '../logger';

/** A database without 173 renders the defaults rather than a 500. */
export async function getProfileLayout(supabase: any, userId: string): Promise<ResolvedProfileLayout> {
  try {
    const { data, error } = await supabase.rpc('get_profile_layout', { p_user_id: userId });
    if (error) log.warn('profile layout rpc unavailable', { err: error.message });
    return resolveProfileLayout(error ? {} : data);
  } catch (err: any) {
    log.warn('profile layout lookup failed', { err: err?.message });
    return resolveProfileLayout({});
  }
}
