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
import { snapshotUser, writeSnapshot } from './boot-cache';

/**
 * Last good payload per screen. Module-level so it survives unmount — that is
 * the entire point — but in-memory only: it is a paint-fast cache, never a
 * source of truth, and it must not outlive the process or the session.
 */
const cache = new Map<string, unknown>();

/** When each entry last came off the network. 0 = seeded from a snapshot. */
const fetchedAt = new Map<string, number>();

/**
 * Requests started before their screen mounted (prefetchFetch). A screen that
 * mounts while one is in flight joins it instead of firing a duplicate.
 */
const inflight = new Map<string, Promise<ApiResult<unknown>>>();

/**
 * Bumped by clearFetchCache. A prefetch that started for the previous account
 * and lands after a sign-out or switch must not write that account's data into
 * the next one's cache.
 */
let epoch = 0;

/**
 * Keys whose last good payload is also kept on disk (lib/boot-cache.ts), so the
 * next cold start paints them before the network answers. Only Home today —
 * it is the screen every launch opens on.
 */
const PERSISTED = new Set(['home']);

/** A payload that came back within this window is not refetched on mount. */
const FRESH_MS = 15_000;

function store(key: string, data: unknown) {
  cache.set(key, data);
  fetchedAt.set(key, Date.now());
  const uid = snapshotUser();
  if (uid && PERSISTED.has(key)) writeSnapshot(uid, key, data);
}

/** Drop everything. Called on sign-out so the next account starts clean. */
export function clearFetchCache() {
  epoch += 1;
  cache.clear();
  fetchedAt.clear();
  inflight.clear();
}

/** Drop one entry, for when a mutation elsewhere invalidates a screen. */
export function invalidateFetchCache(cacheKey: string) {
  cache.delete(cacheKey);
  fetchedAt.delete(cacheKey);
}

export function hasFetchCache(cacheKey: string) {
  return cache.has(cacheKey);
}

/**
 * Paint-fast seed from a last-launch snapshot. Never overwrites anything — a
 * live response that already landed is always newer — and marked stale so the
 * screen still revalidates the moment it mounts.
 */
export function seedFetchCache(cacheKey: string, data: unknown) {
  if (cache.has(cacheKey) || data == null) return;
  cache.set(cacheKey, data);
  fetchedAt.set(cacheKey, 0);
}

/**
 * Start a screen's request before the screen exists — the launch screen uses
 * this to load Home while the logo is still up. Resolves `true` once the cache
 * holds a good payload. Shares one request with any caller already waiting.
 */
export function prefetchFetch<T>(cacheKey: string, fetcher: () => Promise<ApiResult<T>>): Promise<boolean> {
  let p = inflight.get(cacheKey) as Promise<ApiResult<T>> | undefined;
  if (!p) {
    const myEpoch = epoch;
    const started: Promise<ApiResult<T>> = fetcher()
      .catch(
        (err): ApiResult<T> => ({ ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'Request failed' }),
      )
      .then((res) => {
        if (myEpoch === epoch && res.ok && res.data !== null) store(cacheKey, res.data);
        return res;
      })
      .finally(() => {
        if (inflight.get(cacheKey) === started) inflight.delete(cacheKey);
      });
    p = started;
    inflight.set(cacheKey, p as Promise<ApiResult<unknown>>);
  }
  return p.then((res) => res.ok);
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

    // A prefetch for this screen already in flight is the same request — join
    // it. A pull-to-refresh is the user asking for a NEW one, so never joins.
    const pending = mode !== 'pull' && keyRef.current ? inflight.get(keyRef.current) : undefined;
    const res = pending ? ((await pending) as ApiResult<T>) : await fetcherRef.current();
    if (!mounted.current || myGen !== generation.current) return;

    if (res.ok) {
      setData(res.data);
      setError(null);
      if (keyRef.current && res.data !== null) store(keyRef.current, res.data);
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
    // Just loaded (a launch prefetch that finished a moment ago): nothing to
    // revalidate yet. A snapshot seed is stamped 0, so it always revalidates.
    if (cached !== undefined && cacheKey && Date.now() - (fetchedAt.get(cacheKey) ?? 0) < FRESH_MS) {
      setLoading(false);
      return;
    }
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
        if (keyRef.current && next !== null) store(keyRef.current, next);
        return next;
      });
    },
  };
}
