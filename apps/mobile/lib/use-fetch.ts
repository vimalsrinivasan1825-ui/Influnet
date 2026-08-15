/**
 * Minimal data-fetching hook, stale-while-revalidate.
 *
 * Deliberately not React Query: the app's screens are all "load on focus, pull
 * to refresh", and one small hook that every screen uses the same way is easier
 * to reason about than a cache layer nobody has tuned.
 *
 * The three states are kept strictly separate, because collapsing them is what
 * made the app feel slow:
 *
 *   loading    — there is nothing to render yet. Shows a skeleton.
 *   refreshing — the user pulled to refresh. Shows the spinner they asked for.
 *   (silent)   — a background revalidate. Shows nothing at all.
 *
 * Screens that pass a `cacheKey` keep their last payload in a module-level map,
 * so returning to one paints instantly from cache and refetches behind the
 * already-visible content. Without that, every push and pop re-mounted the
 * screen with `loading: true` and flashed a skeleton over data we already had.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ApiResult } from '@influnet/api';

/**
 * Last good payload per screen. Module-level so it survives unmount — that is
 * the entire point — but in-memory only: it is a paint-fast cache, never a
 * source of truth, and it must not outlive the process or the session.
 */
const cache = new Map<string, unknown>();

/** Drop everything. Called on sign-out so the next account starts clean. */
export function clearFetchCache() {
  cache.clear();
}

/** Drop one entry, for when a mutation elsewhere invalidates a screen. */
export function invalidateFetchCache(cacheKey: string) {
  cache.delete(cacheKey);
}

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  /**
   * Refetch with no visible state change — no skeleton, no pull-to-refresh
   * spinner. For updates the user did not ask for (a realtime event, an app
   * resume): showing them a spinner for something they didn't trigger reads as
   * the app being busy rather than as their data being current.
   */
  revalidate: () => void;
  /** Replace local data without a round trip, e.g. after a mutation. */
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

export function useFetch<T>(
  fetcher: () => Promise<ApiResult<T>>,
  {
    refetchOnFocus = true,
    cacheKey,
  }: { refetchOnFocus?: boolean; cacheKey?: string } = {}
): FetchState<T> {
  const cached = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined;

  const [data, setData] = useState<T | null>(cached ?? null);
  const [error, setError] = useState<string | null>(null);
  // Something to show already means we are not loading, whatever the network
  // is doing.
  const [loading, setLoading] = useState(cached === undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the latest fetcher without making it a dependency — screens define it
  // inline, so a dependency would re-run this every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Generation counter — bumped by every fetch AND every manual `setData`.
   *
   * Without this, a background refetch and an optimistic local write can race:
   * a silent revalidate starts on focus, a screen calls `setData` to flip a
   * switch instantly before that request returns, and then the OLDER request
   * resolves with the pre-toggle server value and overwrites the optimistic
   * one unconditionally. Visually that is a toggle that flips, silently snaps
   * back, and only settles to the right value once a later fetch happens to
   * land — which is exactly the "glitch, corrects itself a second later" bug
   * this was written to fix (see togglePortfolioItemVisible in profile.tsx).
   *
   * Each `run` captures the generation BEFORE it awaits and only applies its
   * result if nothing newer — another `run` or a manual `setData` — has
   * happened since. A fetch that loses the race is discarded, not applied.
   */
  const generation = useRef(0);

  const run = useCallback(async (mode: 'initial' | 'pull' | 'silent') => {
    if (mode === 'pull') setRefreshing(true);
    const myGen = ++generation.current;

    const res = await fetcherRef.current();
    if (!mounted.current || myGen !== generation.current) return;

    if (res.ok) {
      setData(res.data);
      setError(null);
      if (keyRef.current && res.data !== null) cache.set(keyRef.current, res.data);
    } else {
      // A failed background revalidate keeps the stale content on screen — the
      // user is reading something that was true a moment ago, which beats
      // replacing it with an error they didn't ask for.
      if (mode !== 'silent') setError(res.error);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void run(cached === undefined ? 'initial' : 'silent');
    // Intentionally once per mount: `cached` is only read to choose the first
    // mode, and re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Coming back from a detail screen should show the result of what you did
  // there. Skip the very first focus — the mount effect already covers it — and
  // revalidate silently, since the screen already has content.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (refetchOnFocus) void run('silent');
    }, [run, refetchOnFocus])
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => void run('pull'),
    revalidate: () => void run('silent'),
    setData: (updater) => {
      // Bump the generation FIRST: any fetch already in flight is now stale
      // and must lose the race to this write when it resolves — see the note
      // on `generation` above.
      generation.current += 1;
      setData((prev) => {
        const next =
          typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater;
        if (keyRef.current && next !== null) cache.set(keyRef.current, next);
        return next;
      });
    },
  };
}
