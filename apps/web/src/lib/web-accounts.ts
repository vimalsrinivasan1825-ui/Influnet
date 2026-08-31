/**
 * Multi-account on the web — the browser twin of apps/mobile/lib/accounts.ts.
 *
 * More than one Influnet account signed in, switchable without re-entering a
 * password. Adding a second account is a Pro feature (checked at the "Add
 * account" tap, same as mobile); switching is free once you have them.
 *
 * ── Storage ─────────────────────────────────────────────────────────────
 * localStorage, keyed per user. The live account's session is a cookie
 * (`@supabase/ssr` keeps it there for SSR); the book holds the OTHER accounts'
 * refresh tokens plus the metadata to render the switcher. Switching calls
 * `supabase.auth.setSession()` on the browser client — which rewrites the
 * cookie — then reloads so the server picks up the new session.
 *
 * ── Sign out ────────────────────────────────────────────────────────────
 * Removes the account from this browser (product decision 2026-08-31). If
 * another remains, the app switches into it; otherwise it goes to /login.
 */
import type { Session } from '@supabase/supabase-js';

const INDEX_KEY = 'influnet:web-accounts';
const SESSION_KEY = (userId: string) => `influnet:web-acct:${userId}`;

export interface WebAccountSummary {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface AccountIndex {
  accounts: WebAccountSummary[];
  activeUserId: string | null;
}

const EMPTY: AccountIndex = { accounts: [], activeUserId: null };

function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readIndex(): AccountIndex {
  const store = ls();
  if (!store) return EMPTY;
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as AccountIndex;
    if (!Array.isArray(parsed.accounts)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

function writeIndex(idx: AccountIndex): void {
  ls()?.setItem(INDEX_KEY, JSON.stringify(idx));
}

/** Accounts on this browser, active first. */
export function listWebAccounts(): { accounts: WebAccountSummary[]; activeUserId: string | null } {
  const idx = readIndex();
  const active = idx.accounts.find((a) => a.userId === idx.activeUserId);
  const rest = idx.accounts.filter((a) => a.userId !== idx.activeUserId);
  return { accounts: active ? [active, ...rest] : rest, activeUserId: idx.activeUserId };
}

export function webAccountCount(): number {
  return readIndex().accounts.length;
}

/** Record (or refresh) an account and make it active. */
export function recordWebSignIn(session: Session, summary: Omit<WebAccountSummary, 'userId'>): void {
  const store = ls();
  if (!store) return;
  const userId = session.user.id;
  const idx = readIndex();
  const accounts = [
    ...idx.accounts.filter((a) => a.userId !== userId),
    { userId, ...summary },
  ];
  try {
    store.setItem(SESSION_KEY(userId), JSON.stringify(session));
  } catch {
    /* quota — the account just won't be switch-back-able without re-login */
  }
  writeIndex({ accounts, activeUserId: userId });
}

/** Keep the active account's stored session current after a token refresh. */
export function syncWebActive(session: Session): void {
  const idx = readIndex();
  if (idx.activeUserId !== session.user.id) return;
  try {
    ls()?.setItem(SESSION_KEY(session.user.id), JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function getStoredWebSession(userId: string): Session | null {
  try {
    const raw = ls()?.getItem(SESSION_KEY(userId));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Remove the active account from this browser. Returns the account to switch to
 * next, or null when none remain.
 */
export function removeWebActive(): WebAccountSummary | null {
  const idx = readIndex();
  const removedId = idx.activeUserId;
  if (removedId) ls()?.removeItem(SESSION_KEY(removedId));
  const remaining = idx.accounts.filter((a) => a.userId !== removedId);
  const next = remaining[remaining.length - 1] ?? null;
  writeIndex({ accounts: remaining, activeUserId: next?.userId ?? null });
  return next;
}

export function clearAllWebAccounts(): void {
  const idx = readIndex();
  const store = ls();
  if (!store) return;
  for (const a of idx.accounts) store.removeItem(SESSION_KEY(a.userId));
  store.removeItem(INDEX_KEY);
}
