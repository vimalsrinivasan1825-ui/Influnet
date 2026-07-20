/**
 * Minimal data-fetching hook.
 *
 * Deliberately not React Query: the app's screens are all "load on focus, pull
 * to refresh", and one small hook that every screen uses the same way is easier
 * to reason about than a cache layer nobody has tuned. Revisit if offline-first
 * becomes a requirement.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ApiResult } from '@influnet/api';

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  /** Replace local data without a round trip, e.g. after a mutation. */
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

export function useFetch<T>(
  fetcher: () => Promise<ApiResult<T>>,
  { refetchOnFocus = true }: { refetchOnFocus?: boolean } = {}
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the latest fetcher without making it a dependency — screens define it
  // inline, so a dependency would re-run this every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    const res = await fetcherRef.current();
    if (!mounted.current) return;

    if (res.ok) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void run(false);
  }, [run]);

  // Coming back from a detail screen should show the result of what you did
  // there. Skip the very first focus — the mount effect already covers it.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (refetchOnFocus) void run(true);
    }, [run, refetchOnFocus])
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => void run(true),
    setData: (updater) =>
      setData((prev) =>
        typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater
      ),
  };
}
