// Shared Apify runner for the platform handlers.
//
// Instagram already talks to Apify (lib/apify-instagram.ts, kept as-is so the
// verification path it feeds doesn't move); Facebook and X reuse the same
// account and token through this helper rather than each re-implementing the
// run-sync/timeout/status-code dance.
//
// SERVER-ONLY: APIFY_TOKEN must never reach the client.

import { logger } from '../logger';
import { SocialProviderError, type SocialPlatform } from './types';

const APIFY_BASE = 'https://api.apify.com/v2';

/**
 * Actor runs are cold-start bound (~15–50s observed on Instagram). The route's
 * own maxDuration is the outer bound; this is the inner one so a hung actor
 * surfaces as a provider error rather than a platform 504.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Actor ids are env-overridable because Apify actors get renamed, deprecated and
 * replaced by their authors on a schedule we don't control — swapping one
 * should be an env change, not a deploy.
 */
export const ACTORS = {
  facebook: () => process.env.APIFY_FACEBOOK_ACTOR?.trim() || 'apify~facebook-pages-scraper',
  // Verified live 2026-08-05: the pages actor returns page METADATA ONLY —
  // title, followers, likes, intro, profile picture — and no posts under any
  // key. Content needs its companion actor, which is a second billed run, so
  // it is called only from the in-app capture path and never from the signup
  // preview (where all we owe the creator is "we can see this account").
  facebookPosts: () => process.env.APIFY_FACEBOOK_POSTS_ACTOR?.trim() || 'apify~facebook-posts-scraper',
  twitter: () => process.env.APIFY_TWITTER_ACTOR?.trim() || 'apidojo~twitter-user-scraper',
} as const;

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

/**
 * Run an Apify actor synchronously and return its dataset items.
 *
 * Throws SocialProviderError for every failure mode, so a caller can tell
 * "this handle doesn't exist" (empty result) from "we couldn't look it up"
 * (throw) — the two must never be shown to a user as the same thing.
 */
export async function runActor(
  platform: SocialPlatform,
  actor: string,
  input: Record<string, unknown>,
): Promise<any[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new SocialProviderError(platform, 'unauthorized', 'APIFY_TOKEN is not configured');
  }

  const url = `${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err: any) {
    throw new SocialProviderError(
      platform,
      'network',
      err?.name === 'AbortError' ? 'Apify run timed out' : `Apify network error: ${err?.message ?? err}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    throw new SocialProviderError(platform, 'unauthorized', 'Apify rejected the token (401)', 401);
  }
  // Apify signals an exhausted plan/credit with 402/403.
  if (res.status === 402 || res.status === 403) {
    throw new SocialProviderError(
      platform,
      'insufficient_funds',
      'Apify credit/limit exhausted — top up at https://console.apify.com/billing',
      res.status,
    );
  }
  if (res.status === 429) {
    throw new SocialProviderError(platform, 'rate_limited', 'Apify rate limit hit (429)', 429);
  }
  if (res.status === 404) {
    // Almost always a renamed/removed actor rather than a missing profile —
    // say so, because the fix is an env change and not the user's handle.
    throw new SocialProviderError(
      platform,
      'unknown',
      `Apify actor "${actor}" not found — check the APIFY_*_ACTOR env override`,
      404,
    );
  }
  if (res.status === 408) {
    throw new SocialProviderError(platform, 'network', 'Apify run timed out (408)', 408);
  }
  if (!res.ok) {
    throw new SocialProviderError(platform, 'unknown', `Apify returned ${res.status}`, res.status);
  }

  try {
    const items = await res.json();
    return Array.isArray(items) ? items : [];
  } catch (err: any) {
    throw new SocialProviderError(platform, 'unknown', `Apify returned a non-JSON body: ${err?.message ?? err}`);
  }
}

/** An actor result that carries an error field is a miss, not data. */
export function isActorError(item: any): boolean {
  if (!item || typeof item !== 'object') return true;
  if (item.error || item.errorDescription) {
    logger.debug('apify: actor reported an error item', {
      error: String(item.error ?? item.errorDescription).slice(0, 200),
    });
    return true;
  }
  return false;
}

/**
 * Detect a run that produced placeholder output instead of data.
 *
 * Third-party ("rental") actors on Apify don't run for real on the FREE plan —
 * they succeed with HTTP 200 and emit stub items instead. Measured live
 * 2026-08-05 against the account's own token: apidojo/twitter-user-scraper
 * returned ten `{demo: true}` items for @nasa, and apidojo/tweet-scraper ten
 * `{noResults: true}`.
 *
 * This has to be caught explicitly, because the failure is silent and
 * indistinguishable from a real miss: without this check, every X lookup
 * resolves to "no such account", and a creator whose handle is perfectly
 * correct is told their account doesn't exist. Surfacing it as a provider
 * error instead means the UI says "couldn't reach X" — true, and not the
 * creator's problem to fix.
 */
export function isDemoOutput(items: any[]): boolean {
  if (items.length === 0) return false;
  return items.every(
    (i) => i && typeof i === 'object' && (i.demo === true || i.noResults === true) && Object.keys(i).length <= 2,
  );
}
