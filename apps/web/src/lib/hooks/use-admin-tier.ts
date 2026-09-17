'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

/**
 * Whether the signed-in admin is a Developer / Super Admin.
 *
 * ── RENDERING ONLY ─────────────────────────────────────────────────────────
 * Decides which nav and which quick actions to draw. The technical API routes
 * enforce the same thing server-side with `withSuperAdmin`.
 *
 * One request per account per page load, shared by the shell, admin home and
 * every <DeveloperGate>: they all mount together. Keyed by user id because the
 * account switcher changes who is signed in without a reload — a single cached
 * answer would hand one admin's tier to the next account.
 */
const cache = new Map<string, Promise<boolean>>();

function fetchTier(userId: string): Promise<boolean> {
  let pending = cache.get(userId);
  if (!pending) {
    pending = apiFetch<{ isSuperAdmin: boolean }>('/api/admin/tier', { cache: 'no-store' })
      .then((res) => res.ok && res.data?.isSuperAdmin === true)
      .catch(() => false);
    cache.set(userId, pending);
    // A failed or negative lookup is not remembered — it may have raced the token.
    pending.then((v) => {
      if (!v) cache.delete(userId);
    });
  }
  return pending;
}

export function useAdminTier(enabled = true): { isSuperAdmin: boolean; loading: boolean } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const active = enabled && !!userId;
  const [state, setState] = useState<{ key: string | null; isSuperAdmin: boolean }>({
    key: null,
    isSuperAdmin: false,
  });

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    fetchTier(userId).then((isSuperAdmin) => {
      if (!cancelled) setState({ key: userId, isSuperAdmin });
    });
    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  // Never optimistic: false until the server has answered for THIS account.
  const settled = state.key === userId;
  return {
    isSuperAdmin: active && settled && state.isSuperAdmin,
    loading: enabled && (!userId || !settled),
  };
}
