/**
 * The multi-account book.
 *
 * The app can hold more than one signed-in Influnet account on a device and
 * switch between them without re-entering a password. Adding a second account
 * is a Pro feature (checked at the "Add account" tap); switching is free once
 * you have them.
 *
 * ── What's stored ────────────────────────────────────────────────────────
 *   influnet:acct-index   — a small list of {userId, email, name, role,
 *                           avatarUrl} plus which one is active. Fits
 *                           SecureStore.
 *   influnet:acct:<id>    — that account's full Supabase Session (carries a
 *                           refresh token), through the same spill-to-
 *                           AsyncStorage adapter the live session uses.
 *
 * The ACTIVE account's session is also held by supabase-js at AUTH_STORAGE_KEY
 * as normal — the book is the *other* accounts plus the metadata to render the
 * switcher. `syncActive()` keeps the active entry's stored session current
 * after a token refresh.
 *
 * ── Sign out ────────────────────────────────────────────────────────────
 * Per the product decision (2026-08-31): signing out REMOVES the account from
 * the device entirely — it is not left as a tap-to-log-back-in entry. If other
 * accounts remain, the app switches to one; otherwise it goes to Welcome.
 */
import type { Session } from '@supabase/supabase-js';
import { secureAdapter } from './supabase';
import { logger } from './logger';

const INDEX_KEY = 'influnet:acct-index';
const SESSION_KEY = (userId: string) => `influnet:acct:${userId}`;

export interface AccountSummary {
  userId: string;
  email: string;
  name: string | null;
  role: string | null;
  avatarUrl: string | null;
}

interface AccountIndex {
  accounts: AccountSummary[];
  activeUserId: string | null;
}

async function readIndex(): Promise<AccountIndex> {
  try {
    const raw = await secureAdapter.getItem(INDEX_KEY);
    if (!raw) return { accounts: [], activeUserId: null };
    const parsed = JSON.parse(raw) as AccountIndex;
    if (!Array.isArray(parsed.accounts)) return { accounts: [], activeUserId: null };
    return parsed;
  } catch {
    return { accounts: [], activeUserId: null };
  }
}

async function writeIndex(idx: AccountIndex): Promise<void> {
  await secureAdapter.setItem(INDEX_KEY, JSON.stringify(idx)).catch((err) => {
    logger.warn('[accounts] failed to persist index', { err });
  });
}

/** The signed-in accounts on this device, active first. */
export async function listAccounts(): Promise<{ accounts: AccountSummary[]; activeUserId: string | null }> {
  const idx = await readIndex();
  const active = idx.accounts.find((a) => a.userId === idx.activeUserId);
  const rest = idx.accounts.filter((a) => a.userId !== idx.activeUserId);
  return { accounts: active ? [active, ...rest] : rest, activeUserId: idx.activeUserId };
}

export async function accountCount(): Promise<number> {
  return (await readIndex()).accounts.length;
}

/**
 * Record (or refresh) an account and make it active. Called after any
 * successful sign-in / sign-up and after a switch.
 */
export async function recordSignIn(
  session: Session,
  summary: Omit<AccountSummary, 'userId'>,
): Promise<void> {
  const userId = session.user.id;
  const idx = await readIndex();
  const entry: AccountSummary = { userId, ...summary };
  const accounts = [...idx.accounts.filter((a) => a.userId !== userId), entry];
  await secureAdapter.setItem(SESSION_KEY(userId), JSON.stringify(session)).catch((err) => {
    logger.warn('[accounts] failed to persist session', { err });
  });
  await writeIndex({ accounts, activeUserId: userId });
}

/** Keep the ACTIVE account's stored session current after a token refresh. */
export async function syncActive(session: Session): Promise<void> {
  const idx = await readIndex();
  if (idx.activeUserId !== session.user.id) return; // not the active one — ignore
  await secureAdapter.setItem(SESSION_KEY(session.user.id), JSON.stringify(session)).catch(() => {});
}

/** The stored session for an account we want to switch into. */
export async function getStoredSession(userId: string): Promise<Session | null> {
  try {
    const raw = await secureAdapter.getItem(SESSION_KEY(userId));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Remove the active account from the device. Returns the account to switch to
 * next, or null when none remain (the caller then goes to Welcome).
 */
export async function removeActive(): Promise<AccountSummary | null> {
  const idx = await readIndex();
  const removedId = idx.activeUserId;
  if (removedId) await secureAdapter.removeItem(SESSION_KEY(removedId)).catch(() => {});
  const remaining = idx.accounts.filter((a) => a.userId !== removedId);
  const next = remaining[remaining.length - 1] ?? null;
  await writeIndex({ accounts: remaining, activeUserId: next?.userId ?? null });
  return next;
}

/** Nuke everything — used by a "sign out of all" and as a safety net. */
export async function clearAllAccounts(): Promise<void> {
  const idx = await readIndex();
  for (const a of idx.accounts) {
    await secureAdapter.removeItem(SESSION_KEY(a.userId)).catch(() => {});
  }
  await secureAdapter.removeItem(INDEX_KEY).catch(() => {});
}
