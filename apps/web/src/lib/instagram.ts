// Instagram verification provider selector.
//
// Two interchangeable backends implement the same interface:
//   - apify-instagram.ts  (Apify actor; has free credit, recency inline)  [default]
//   - hikerapi.ts         (HikerAPI direct REST)
//
// Choose with VERIFICATION_PROVIDER = 'apify' | 'hikerapi'. When unset we pick
// whichever is configured, preferring Apify. If neither is configured the caller
// (verification-live.ts) falls back to structural-only signals.

import * as apify from './apify-instagram';
import * as hiker from './hikerapi';

// Shared shape + error, re-exported so consumers depend on this module, not a
// specific provider.
export { HikerApiError as InstagramProviderError, normalizeHandle } from './hikerapi';
export type { HikerInstagramUser as InstagramProfile } from './hikerapi';

export type ProviderName = 'apify' | 'hikerapi' | 'none';

/** Which provider will actually be used for the next call. */
export function activeProvider(): ProviderName {
  const pref = process.env.VERIFICATION_PROVIDER?.trim().toLowerCase();
  if (pref === 'hikerapi' && hiker.isHikerConfigured()) return 'hikerapi';
  if (pref === 'apify' && apify.isApifyConfigured()) return 'apify';
  // Auto: prefer Apify (has free credit), fall back to HikerAPI.
  if (apify.isApifyConfigured()) return 'apify';
  if (hiker.isHikerConfigured()) return 'hikerapi';
  return 'none';
}

export function isInstagramProviderConfigured(): boolean {
  return activeProvider() !== 'none';
}

/**
 * Fetch a public Instagram profile via the active provider. Returns the profile,
 * `null` if the handle doesn't resolve, or throws InstagramProviderError on a
 * provider failure. Recency (`lastPostDaysAgo`) is filled inline when the
 * provider supports it (Apify); otherwise a follow-up recency call is made.
 */
export async function fetchInstagramProfile(username: string) {
  const provider = activeProvider();
  if (provider === 'none') return null;

  const impl = provider === 'apify' ? apify : hiker;
  const user = await impl.getInstagramUser(username);
  if (!user) return null;

  if (user.lastPostDaysAgo == null && user.pk) {
    // Provider didn't include recency inline (HikerAPI) — best-effort follow-up.
    user.lastPostDaysAgo = await impl.getLastPostDaysAgo(user.pk);
  }
  return user;
}
