/**
 * The multi-account book.
 *
 * The app can hold more than one signed-in Influnet account on a device and
 * switch between them without re-entering a password. Adding a second account
 * is a Pro feature (checked at the "Add account" tap); switching is free once
 * you have them.
 *
 * ── Storage: AsyncStorage, NOT SecureStore ──────────────────────────────
 * Deliberately plain AsyncStorage. The live session already spills there when
 * its JWT is large (see the adapter in supabase.ts), so the security posture
 * is unchanged — but AsyncStorage has none of SecureStore's fragility: no 2 KB
 * per-item ceiling, no keychain-contention risk with the session read that
 * gates app launch, and it IS cleared on reinstall (iOS keychain is not).
 * Every read/write here is also wrapped in a short timeout and can NEVER block
 * a caller — the book is a convenience, never a dependency of signing in.
 *
 * ── Sign out ────────────────────────────────────────────────────────────
 * Per the product decision (2026-08-31): signing out REMOVES the account from
 * the device entirely. If other accounts remain, the app switches to one;
 * otherwise it goes to Welcome.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { logger } from './logger';

const INDEX_KEY = 'influnet:acct-index';
const SESSION_KEY = (userId: string) => `influnet:acct:${userId}`;
const IO_TIMEOUT_MS = 2500;

/** Never let a storage op hang a caller — returns `fallback` if it doesn't settle. */
function bounded<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), IO_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

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

const EMPTY: AccountIndex = { accounts: [], activeUserId: null };

async function readIndex(): Promise<AccountIndex> {
  const raw = await bounded(AsyncStorage.getItem(INDEX_KEY), null);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as AccountIndex;
    if (!Array.isArray(parsed.accounts)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

async function writeIndex(idx: AccountIndex): Promise<void> {
  await bounded(
    AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx)).catch((err) => {
      logger.warn('[accounts] failed to persist index', { err });
    }),
    undefined,
  );
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
 * successful sign-in / sign-up and after a switch. Fire-and-forget safe.
 */
export async function recordSignIn(
  session: Session,
  summary: Omit<AccountSummary, 'userId'>,
): Promise<void> {
  try {
    const userId = session.user.id;
    const idx = await readIndex();
    const entry: AccountSummary = { userId, ...summary };
    const accounts = [...idx.accounts.filter((a) => a.userId !== userId), entry];
    await bounded(
      AsyncStorage.setItem(SESSION_KEY(userId), JSON.stringify(session)).catch(() => {}),
      undefined,
    );
    await writeIndex({ accounts, activeUserId: userId });
  } catch (err) {
    logger.warn('[accounts] recordSignIn failed', { err });
  }
}

/** Keep the ACTIVE account's stored session current after a token refresh. */
export async function syncActive(session: Session): Promise<void> {
  try {
    const idx = await readIndex();
    if (idx.activeUserId !== session.user.id) return;
    await bounded(
      AsyncStorage.setItem(SESSION_KEY(session.user.id), JSON.stringify(session)).catch(() => {}),
      undefined,
    );
  } catch {
    /* best-effort */
  }
}

/** The stored session for an account we want to switch into. */
export async function getStoredSession(userId: string): Promise<Session | null> {
  const raw = await bounded(AsyncStorage.getItem(SESSION_KEY(userId)), null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/**
 * Remove the active account from the device. Returns the account to switch to
 * next, or null when none remain (the caller then goes to Welcome). Never
 * throws.
 */
export async function removeActive(): Promise<AccountSummary | null> {
  try {
    const idx = await readIndex();
    const removedId = idx.activeUserId;
    if (removedId) {
      await bounded(AsyncStorage.removeItem(SESSION_KEY(removedId)).catch(() => {}), undefined);
    }
    const remaining = idx.accounts.filter((a) => a.userId !== removedId);
    const next = remaining[remaining.length - 1] ?? null;
    await writeIndex({ accounts: remaining, activeUserId: next?.userId ?? null });
    return next;
  } catch (err) {
    logger.warn('[accounts] removeActive failed', { err });
    return null;
  }
}

/** Nuke everything — "sign out of all" and as a safety net. Never throws. */
export async function clearAllAccounts(): Promise<void> {
  try {
    const idx = await readIndex();
    await Promise.all(
      idx.accounts.map((a) => AsyncStorage.removeItem(SESSION_KEY(a.userId)).catch(() => {})),
    );
    await AsyncStorage.removeItem(INDEX_KEY).catch(() => {});
  } catch {
    /* best-effort */
  }
}
