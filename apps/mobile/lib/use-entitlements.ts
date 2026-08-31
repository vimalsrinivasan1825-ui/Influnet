/**
 * The caller's own plan, fetched at runtime — the mobile twin of
 * apps/web/src/lib/hooks/use-entitlements.ts.
 *
 * It has to be fetched, never read from a constant: whether paid plans exist
 * at all (`subscriptionsEnabled`) is a server decision with no build-time
 * value in the bundle. GET /api/billing/entitlements is the only source.
 *
 * ── RENDERING ONLY ────────────────────────────────────────────────────────
 * Everything here decides what a button looks like, never what happens when
 * it is pressed. The server answers the same question independently before
 * doing anything, and a client that lies gets a 402 from the API rather than
 * the data.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 * A tiny zustand store rather than a per-component fetch: a dozen screens read
 * the plan (project list, portfolio, chat, profile, billing), and each
 * re-fetching on mount would hammer the route. One shared copy, refreshed on
 * demand — after a successful upgrade, or on a pull-to-refresh that cares.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  hasFeature,
  isOverLimit,
  type Entitlements,
  type GatedFeature,
} from '@influnet/core';
import { endpoints } from './api';
import { logger } from './logger';

interface EntitlementsState {
  entitlements: Entitlements | null;
  /** True until the first fetch settles (either way). */
  loading: boolean;
  /** Guards against overlapping fetches. */
  inflight: boolean;
  load: (opts?: { force?: boolean }) => Promise<void>;
}

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: null,
  loading: true,
  inflight: false,

  load: async ({ force = false } = {}) => {
    const { inflight, entitlements } = get();
    if (inflight) return;
    if (entitlements && !force) return;

    set({ inflight: true });
    try {
      const res = await endpoints.getEntitlements<Entitlements>();
      // On failure we keep whatever we had (or null), which reads as
      // "not Pro" and "cannot do the gated thing" everywhere below. Showing
      // the free view when unsure is the harmless direction — the API still
      // lets an entitled user through.
      if (res.ok && res.data) {
        set({ entitlements: res.data });
      } else if (!entitlements) {
        logger.warn('[entitlements] lookup failed', { status: res.status, error: res.error });
      }
    } catch (err) {
      logger.warn('[entitlements] lookup threw', { err });
    } finally {
      set({ inflight: false, loading: false });
    }
  },
}));

/** Called on sign-out so the next account does not inherit this one's plan. */
export function resetEntitlements(): void {
  useEntitlementsStore.setState({ entitlements: null, loading: true, inflight: false });
}

export interface UseEntitlements {
  entitlements: Entitlements | null;
  loading: boolean;
  /** True once loaded and the tier is 'pro'. False while loading — never optimistic. */
  isPro: boolean;
  /** Whether paid plans exist in this deployment at all. */
  enabled: boolean;
  can: (feature: GatedFeature) => boolean;
  /** Force a re-fetch — call after a successful upgrade. */
  refresh: () => void;
}

export function useEntitlements(): UseEntitlements {
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const loading = useEntitlementsStore((s) => s.loading);
  const load = useEntitlementsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    entitlements,
    loading,
    isPro: entitlements?.tier === 'pro' && !!entitlements.subscriptionsEnabled,
    enabled: entitlements?.subscriptionsEnabled ?? false,
    can: (feature: GatedFeature) =>
      entitlements ? hasFeature(entitlements.tier, feature) : false,
    refresh: () => void load({ force: true }),
  };
}

export { isOverLimit };
