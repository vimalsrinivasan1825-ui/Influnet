/**
 * Runtime feature flags (migration 137).
 *
 * Four switches — the phone-OTP signup gate, the notification-email master
 * switch, the Free/Pro paid tier, and the creator ownership gate. Each used to
 * be a deploy-time env var; now the authoritative value is a row in
 * `public.feature_flags`, and the env var is only the fallback for a key with
 * no row.
 *
 * ── Resolution order ──────────────────────────────────────────────────────
 *   1. the `feature_flags` row, if one exists
 *   2. the environment variable (unchanged from before this file existed)
 *   3. the code default — `false` for every one of these, because turning a
 *      restriction on must always be deliberate
 *
 * ── Why a background snapshot, not an async read ──────────────────────────
 * `phoneOtpEnabled()`, `subscriptionsEnabled()` and friends are called
 * synchronously from ~15 route handlers and two libs. Making them async would
 * ripple through all of them. Instead this keeps a process-wide snapshot,
 * refreshed lazily on a 45s TTL: `flag()` returns the last known value
 * immediately and kicks a refresh if it is stale. The cost is that for the
 * first few seconds after a cold boot — before the first load lands — `flag()`
 * returns the env fallback rather than the row. That is the safe direction
 * (the env vars are the pre-migration behaviour) and it self-corrects within
 * one request.
 *
 * A missing table (migration not yet applied) or an unreadable one is not an
 * error here: the snapshot stays empty and every key resolves to its env
 * fallback, exactly as it did before.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

export type FlagKey = 'phone_otp' | 'notify_emails' | 'subscriptions' | 'ownership_gate';

export const FLAG_KEYS: readonly FlagKey[] = [
  'phone_otp',
  'notify_emails',
  'subscriptions',
  'ownership_gate',
] as const;

/**
 * The env var each key falls back to. `phone_otp` accepts either name during
 * the transition off the build-time `NEXT_PUBLIC_` flag — the runtime
 * `PHONE_OTP_ENABLED` wins where both are set.
 *
 * `notify_emails` mirrors lib/email/client.ts's tolerance for a stray leading
 * space in `.env.local` (see the note there).
 */
const ENV_FALLBACK: Record<FlagKey, () => boolean> = {
  phone_otp: () =>
    process.env.PHONE_OTP_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true',
  notify_emails: () => (process.env.NOTIFY_EMAILS_ENABLED || '').trim().split(/\s+/)[0] === 'true',
  subscriptions: () => process.env.SUBSCRIPTIONS_ENABLED === 'true',
  ownership_gate: () => process.env.OWNERSHIP_GATE_ENABLED === 'true',
};

interface Row {
  key: string;
  enabled: boolean;
}

const TTL_MS = 45_000;

let snapshot: Partial<Record<FlagKey, boolean>> = {};
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The table is world-readable (RLS `USING (true)` + grant to anon), so the
  // anon key is enough and is present in every context. Service role only as a
  // last resort.
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isMissingTable(err: { code?: string; message?: string }): boolean {
  return err.code === '42P01' || /relation .*feature_flags.* does not exist/i.test(err.message ?? '');
}

async function load(): Promise<void> {
  const sb = client();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('feature_flags').select('key, enabled');
    if (error) {
      if (!isMissingTable(error)) {
        logger.error('[feature-flags] load failed — using env fallback', { err: error.message });
      }
      return;
    }
    const next: Partial<Record<FlagKey, boolean>> = {};
    for (const row of (data ?? []) as Row[]) {
      if ((FLAG_KEYS as readonly string[]).includes(row.key)) {
        next[row.key as FlagKey] = row.enabled === true;
      }
    }
    snapshot = next;
    fetchedAt = Date.now();
  } catch (err) {
    logger.error('[feature-flags] load threw — using env fallback', { err });
  }
}

function maybeRefresh(): void {
  if (Date.now() - fetchedAt < TTL_MS) return;
  if (inflight) return;
  inflight = load().finally(() => {
    inflight = null;
  });
}

/**
 * Synchronous flag read. Returns the DB value when known, otherwise the env
 * fallback. Kicks a background refresh when the snapshot is stale; never blocks,
 * never throws.
 */
export function flag(key: FlagKey): boolean {
  maybeRefresh();
  return snapshot[key] ?? ENV_FALLBACK[key]();
}

/**
 * Async flag read for callers that can await — forces a synchronous load first
 * when the snapshot is stale, so the answer reflects a dashboard change made
 * seconds ago. Use from unauthenticated config endpoints; `flag()` is fine
 * everywhere else.
 */
export async function flagFresh(key: FlagKey): Promise<boolean> {
  if (Date.now() - fetchedAt >= TTL_MS) await load();
  return snapshot[key] ?? ENV_FALLBACK[key]();
}

/** Every flag's resolved value — for the boot banner and the config endpoint. */
export function allFlags(): Record<FlagKey, boolean> {
  return {
    phone_otp: flag('phone_otp'),
    notify_emails: flag('notify_emails'),
    subscriptions: flag('subscriptions'),
    ownership_gate: flag('ownership_gate'),
  };
}

/** Where each resolved value came from — `'db' | 'env' | 'default'`. */
export function flagSources(): Record<FlagKey, 'db' | 'env' | 'default'> {
  maybeRefresh();
  const out = {} as Record<FlagKey, 'db' | 'env' | 'default'>;
  for (const key of FLAG_KEYS) {
    out[key] = snapshot[key] !== undefined ? 'db' : ENV_FALLBACK[key]() ? 'env' : 'default';
  }
  return out;
}

/**
 * Keys whose `feature_flags` row is explicitly `false`. Used by the staging
 * boot guard: staging is meant to run every flag on, so a deliberate `false`
 * row there is a misconfiguration the server should refuse to start with — but
 * a missing row or an unreadable table is NOT (that just means "fall back to
 * env", which is fine). Forces a fresh load so a boot check is never decided by
 * a stale snapshot.
 */
export async function explicitlyDisabled(): Promise<FlagKey[]> {
  await load();
  return FLAG_KEYS.filter((k) => snapshot[k] === false);
}
