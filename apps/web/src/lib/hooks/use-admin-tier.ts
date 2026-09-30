'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
import type { AdminAccess } from '@/lib/admin-access';

/**
 * The signed-in admin's tier and team access (migrations 150 + 176).
 *
 * ── RENDERING ONLY ─────────────────────────────────────────────────────────
 * Decides which nav, which quick actions and which pages to draw. Every
 * /api/admin route enforces the same thing server-side in `withAdmin`.
 *
 * One request per account per page load, shared by the shell, admin home and
 * every gate: they all mount together. Keyed by user id because the account
 * switcher changes who is signed in without a reload — a single cached answer
 * would hand one admin's access to the next account.
 */
export interface AdminAccessView extends AdminAccess {
  creatableTiers: Array<'admin' | 'staff'>;
}

interface TierResponse {
  isSuperAdmin: boolean;
  access?: AdminAccessView;
}

const cache = new Map<string, Promise<AdminAccessView | null>>();

const PRE_TEAM_SUPER: AdminAccessView = {
  tier: 'super',
  permissions: {},
  hiddenFields: [],
  creatableTiers: ['admin', 'staff'],
};

function fetchAccess(userId: string): Promise<AdminAccessView | null> {
  let pending = cache.get(userId);
  if (!pending) {
    pending = apiFetch<TierResponse>('/api/admin/tier', { cache: 'no-store' })
      .then((res): AdminAccessView | null => {
        if (!res.ok || !res.data) return null;
        // An older server answers without `access`: it knows only the two
        // pre-team tiers, so render those.
        if (res.data.access) return res.data.access;
        return res.data.isSuperAdmin ? PRE_TEAM_SUPER : null;
      })
      .catch(() => null);
    cache.set(userId, pending);
    // A failed lookup is not remembered — it may have raced the token.
    pending.then((v) => {
      if (!v) cache.delete(userId);
    });
  }
  return pending;
}

/** Forget the cached access, e.g. after a super admin edits their own team. */
export function invalidateAdminAccess() {
  cache.clear();
}

export function useAdminAccess(enabled = true): { access: AdminAccessView | null; loading: boolean } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const active = enabled && !!userId;
  const [state, setState] = useState<{ key: string | null; access: AdminAccessView | null }>({
    key: null,
    access: null,
  });

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    fetchAccess(userId).then((access) => {
      if (!cancelled) setState({ key: userId, access });
    });
    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  // Never optimistic: null until the server has answered for THIS account.
  const settled = state.key === userId;
  return {
    access: active && settled ? state.access : null,
    loading: enabled && (!userId || !settled),
  };
}

export function useAdminTier(enabled = true): { isSuperAdmin: boolean; loading: boolean } {
  const { access, loading } = useAdminAccess(enabled);
  return { isSuperAdmin: access?.tier === 'super', loading };
}
