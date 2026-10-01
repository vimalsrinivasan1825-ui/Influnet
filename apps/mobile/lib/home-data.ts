/**
 * Home's data, loadable from outside the screen.
 *
 * Lives here rather than inside app/(tabs)/home.tsx so the launch screen can
 * start it while the logo is still up (lib/use-boot-progress.ts) and Home
 * mounts onto a payload that is already in the cache — instead of mounting,
 * showing a skeleton, and only THEN starting two round trips in a row.
 *
 * The shapes are typed by the screen that reads them; this module only needs
 * `role` to pick the follow-up endpoints.
 */
import type { ApiResult } from '@influnet/api';
import { endpoints } from './api';
import { prefetchFetch, seedFetchCache, hasFetchCache } from './use-fetch';
import { readSnapshot } from './boot-cache';

export const HOME_CACHE_KEY = 'home';

/**
 * Home first, then the dashboard its `role` selects. Sequential rather than
 * parallel on purpose: the session store may not have loaded a role yet on a
 * cold start, and picking the endpoint off the response is always right where
 * picking it off local state is a race.
 */
export async function loadHomeData<T>(): Promise<ApiResult<T>> {
  const home = await endpoints.home<{ role?: string }>();
  if (!home.ok || !home.data) {
    return { ok: false, status: home.status, error: home.error, data: null };
  }

  const creator = home.data.role === 'influencer';

  /**
   * Both follow-ups in parallel — they depend on `role`, not on each other.
   *
   * The campaign query differs by side and that is the whole point of it: a
   * creator wants the open board (work they can apply for), while a brand
   * wants THEIR campaigns (work they are running). Showing a brand other
   * brands' listings on their own home screen is a competitor feed, not a
   * feature.
   */
  const [dashboard, campaigns] = await Promise.all([
    creator ? endpoints.influencerDashboard('month') : endpoints.businessDashboard('month'),
    endpoints.campaigns<{ campaigns: unknown[] }>(creator ? undefined : { mine: true }),
  ]);

  // A failed dashboard costs the charts; a failed campaign list costs the
  // rail. Neither costs the screen.
  return {
    ok: true,
    status: home.status,
    error: null,
    data: {
      home: home.data,
      dashboard: dashboard.ok ? dashboard.data : null,
      // `{campaigns}` — this route's own envelope, not a shared one. See the
      // envelope note in AGENTS.md.
      campaigns: campaigns.ok ? (campaigns.data?.campaigns ?? []) : null,
    } as T,
  };
}

/**
 * Get Home ready to paint, for the launch screen to wait on.
 *
 * Starts the live request immediately, then looks for last launch's snapshot:
 * if there is one, Home can open on it now (the live copy replaces it a moment
 * later); if not, this waits for the live copy. Resolves either way — a failed
 * load is Home's own error state to show, not a reason to hold the splash.
 */
export async function warmHome(userId: string): Promise<void> {
  const live = prefetchFetch(HOME_CACHE_KEY, loadHomeData);
  if (!hasFetchCache(HOME_CACHE_KEY)) {
    const snap = await readSnapshot(userId, HOME_CACHE_KEY);
    if (snap) seedFetchCache(HOME_CACHE_KEY, snap);
  }
  if (hasFetchCache(HOME_CACHE_KEY)) return;
  await live;
}
