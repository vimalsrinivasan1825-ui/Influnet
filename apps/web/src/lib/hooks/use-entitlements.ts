'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Entitlements, GatedFeature } from '@influnet/core';
import { hasFeature } from '@influnet/core';
import { apiFetch } from '@/lib/api-client';

/**
 * The caller's own plan, fetched at runtime.
 *
 * It has to be fetched rather than read from a constant: `SUBSCRIPTIONS_ENABLED`
 * is a server variable with no NEXT_PUBLIC_ prefix, so it is not in the bundle
 * at all. That is deliberate — a NEXT_PUBLIC_ value is frozen at build time,
 * and a plan flag that needs a redeploy to change is not a flag.
 *
 * ── This is for RENDERING ONLY ────────────────────────────────────────────
 * Everything here can be edited in a browser console. It decides what a button
 * looks like, never what happens when it is pressed. The server answers the
 * same question independently before doing anything, and a client that lies
 * gets a 402 from the API rather than the data.
 */
export interface UseEntitlements {
  entitlements: Entitlements | null;
  loading: boolean;
  /** True once loaded and the tier is 'pro'. False while loading — never optimistic. */
  isPro: boolean;
  /** Whether paid plans exist in this deployment at all. */
  enabled: boolean;
  can: (feature: GatedFeature) => boolean;
  refresh: () => void;
}

export function useEntitlements(): UseEntitlements {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      // `no-store` belt to the route's braces. `refresh()` is called the moment
      // a payment succeeds, and it has to reach the server — a cached response
      // at that instant shows the user the Free plan they just paid to leave.
      const res = await apiFetch<Entitlements>('/api/billing/entitlements', {
        cache: 'no-store',
      });
      if (cancelled) return;
      // On failure we leave entitlements null, which reads as "not Pro" and
      // "cannot do the gated thing" everywhere below. Rendering the free view
      // when we are unsure is the harmless direction: the worst case is a user
      // sees an upgrade prompt they do not need, and the API still lets them
      // through if they are entitled.
      setEntitlements(res.ok ? res.data : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const can = useCallback(
    (feature: GatedFeature) => (entitlements ? hasFeature(entitlements.tier, feature) : false),
    [entitlements],
  );

  return {
    entitlements,
    loading,
    isPro: entitlements?.tier === 'pro' && entitlements.subscriptionsEnabled,
    enabled: entitlements?.subscriptionsEnabled ?? false,
    can,
    refresh,
  };
}
