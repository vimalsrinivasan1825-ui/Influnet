/**
 * Auth + profile state for the app.
 *
 * /api/profile returns the base profile and the role-specific profile merged
 * into one flat object, so this store keeps it flat too rather than inventing
 * a shape the server doesn't speak.
 */
import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import type { UserRole, ApprovalStatus } from '@influnet/types';
import { supabase, clearPersistedAuth } from './supabase';
import { endpoints } from './api';
import { clearFetchCache } from './use-fetch';
import { logger } from './logger';
import { disconnectStream } from './stream';
import { clearPushToken } from './push';
import { stopNotificationSummary } from './notification-summary';
import { resetEntitlements } from './use-entitlements';
import { stopRealtime } from './realtime';
import {
  recordSignIn,
  syncActive,
  getStoredSession,
  removeActive,
} from './accounts';

export interface MeProfile {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  nudges_opt_out?: boolean;
  verification_status?: string;
  verified_badge?: boolean;
  // creator
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  headline?: string | null;
  niche?: string[];
  languages?: string[];
  collab_types?: string[];
  price_range?: string | null;
  instagram_handle?: string | null;
  instagram_followers?: number | null;
  engagement_rate?: number | null;
  is_verified?: boolean;
  is_profile_complete?: boolean;
  city?: string | null;
  state?: string | null;
  // business
  company_name?: string | null;
  industry?: string | null;
  business_type?: string | null;
  website?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  approval_status?: ApprovalStatus;
}

interface SessionState {
  session: Session | null;
  profile: MeProfile | null;
  /** False until the stored session has been read once — gates the splash. */
  ready: boolean;
  loadingProfile: boolean;
  /** True while switchAccount() is mid-flight — the session briefly goes null
   *  to force the tab tree to remount, and this stops that being read as a
   *  sign-out (which would flash the Welcome screen). */
  switching: boolean;
  setSession: (session: Session | null) => void;
  loadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Make a freshly-authenticated session the active one and load its profile.
   * `replacingLive` — true when another account was signed in a moment ago
   * (the "add account" flow): tears that account's background work + screen
   * caches down and forces the tab tree to remount, so the app shows the NEW
   * account rather than the previous one's cached data.
   */
  activateSession: (session: Session, replacingLive: boolean) => Promise<void>;
  /** Switch the app to another signed-in account (multi-account book). */
  switchAccount: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  init: () => () => void;
}

/** Shared across concurrent signOut() callers so the teardown runs once. */
let signOutInFlight: Promise<void> | null = null;

/**
 * Bumped on every loadProfile() call. A slow fetch that resolves after a newer
 * one started must NOT write its (possibly stale, possibly 401'd) result over
 * the fresh one — that stale clobber is what leaves `profile` null right after
 * a sign-in and drops the entry gate into its recovery loop. The add-account
 * flow makes this race routine: the auth listener and the login screen both
 * call loadProfile() for the new session at once.
 */
let profileLoadGen = 0;

/** See the call sites in signOut(): long enough for a real network, short enough not to strand the user. */
const TEARDOWN_TIMEOUT_MS = 3000;

/**
 * Resolve when `p` settles or the timeout elapses, whichever is first — and
 * never reject. Used for best-effort cleanup during sign-out, where neither a
 * failure nor a hang may be allowed to block the teardown.
 *
 * Resolves `true` only when `p` settled in time, so a caller can tell "done"
 * from "gave up" and take a fallback path. Note that nothing is cancelled: `p`
 * keeps running, it just stops being awaited.
 */
function withTimeout(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void p
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve(true);
      });
  });
}

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  profile: null,
  ready: false,
  loadingProfile: false,
  switching: false,

  setSession: (session) => set({ session }),

  loadProfile: async () => {
    const uid = get().session?.user.id;
    const gen = ++profileLoadGen;
    if (!uid) {
      if (gen === profileLoadGen) set({ profile: null, loadingProfile: false });
      return;
    }
    set({ loadingProfile: true });

    // /api/profile wraps the merged profile as { profile: {...} }. Storing the
    // envelope instead of its contents leaves every field undefined, which
    // reads as "signed in but nobody home" on every screen that uses the store.
    //
    // Bounded at 12s: the API client has no timeout, and a hung /api/profile
    // otherwise pins `loadingProfile: true` — which is the splash's "not ready"
    // signal, i.e. a permanent "Getting things ready…".
    let profile: MeProfile | null = null;
    try {
      const TIMED_OUT = Symbol('timeout');
      const race = await Promise.race([
        endpoints.getProfile<{ profile: MeProfile }>(),
        new Promise<typeof TIMED_OUT>((r) => setTimeout(() => r(TIMED_OUT), 12000)),
      ]);
      if (race !== TIMED_OUT) {
        profile = race.ok ? (race.data?.profile ?? null) : null;
      }
    } catch {
      profile = null;
    }

    // A newer loadProfile() has taken over — it owns the outcome, including
    // loadingProfile. Do nothing.
    if (gen !== profileLoadGen) return;

    // We ARE the latest call, so we must always clear loadingProfile. If the
    // account changed under us mid-fetch, this profile is for the wrong user —
    // keep whatever is there, but never leave the flag stuck.
    const stillSameUser = get().session?.user.id === uid;
    set({ loadingProfile: false, ...(stillSameUser ? { profile } : {}) });

    // Record this account in the multi-account book so the switcher can list
    // it. Best-effort, non-blocking — a failure here never affects the app.
    const session = get().session;
    if (stillSameUser && session && profile) {
      void recordSignIn(session, {
        email: profile.email,
        name: profile.name ?? null,
        role: profile.role ?? null,
        avatarUrl: profile.avatar_url ?? profile.logo_url ?? null,
      });
    }
  },

  signOut: async () => {
    // Sign-out is triggered from several places at once in practice (the button
    // the user pressed, plus anything reacting to the session going away). One
    // shared promise means the teardown runs exactly once and every caller
    // still gets to await the real completion.
    if (signOutInFlight) return signOutInFlight;

    signOutInFlight = (async () => {
      try {
        // Stop background work FIRST, while the token is still valid. Anything
        // still polling once the token is gone issues unauthenticated requests,
        // and those are what used to bounce the user around the sign-in screen.
        stopNotificationSummary();

        // Same reason, same moment: a Supabase Realtime channel left open
        // outlives the session and keeps reconnecting with a token that is
        // about to be revoked. It belongs in this block, not after signOut().
        stopRealtime();

        // Both of these must finish before the token is revoked:
        //   - clearPushToken() is an authenticated call to our own API. Skip it
        //     and a shared or reset device keeps receiving the outgoing
        //     account's pushes after the next person signs in.
        //   - disconnectStream() drops the per-user chat connection.
        //
        // Run together, not one after the other. They touch different services
        // and neither depends on the other's result, so serialising them made a
        // degraded network cost 3s + 3s before auth.signOut() was even
        // attempted. In parallel the whole pair is bounded by one 3s window.
        //
        // Bounded at all because the API client has no timeout of its own: on a
        // black-holed network (captive-portal wifi is the everyday case) the
        // fetch hangs for the platform default — around a minute — and because
        // every caller shares signOutInFlight, the user taps Sign out, nothing
        // happens, and tapping again just joins the same stuck promise. Three
        // seconds is long enough for a working network and short enough that a
        // dead one doesn't strand the user. Losing the push-token cleanup is the
        // acceptable trade: the next sign-in on this device re-registers and
        // overwrites it anyway.
        await Promise.all([
          withTimeout(clearPushToken(), TEARDOWN_TIMEOUT_MS),
          withTimeout(disconnectStream(), TEARDOWN_TIMEOUT_MS),
        ]);

        // ...and this one needs bounding just as much, which is the part that
        // was missed. auth-js's _signOut() awaits a POST to /logout and only
        // calls its internal removeCurrentSession() afterwards, with no timeout
        // of its own — and `{ scope: 'local' }` is no escape, it POSTs too. So
        // on the same dead network the teardown still hung for ~60s, `finally`
        // never ran, and the caller's router.replace() never fired: exactly the
        // freeze the timeouts above were added to prevent.
        const signedOut = await withTimeout(supabase.auth.signOut(), TEARDOWN_TIMEOUT_MS);

        // Giving up on the request must NOT mean giving up on the session. The
        // request is still in flight (withTimeout cancels nothing) and will
        // clear auth-js's own copy whenever it settles, but until then the
        // session is still on disk — so killing the app inside that window would
        // cold-start straight back into the account the user just left. Clearing
        // the persisted copy ourselves makes sign-out durable regardless of the
        // network. Server-side revocation is what we forfeit; the local session
        // is not.
        if (!signedOut) await clearPersistedAuth();
      } finally {
        // In `finally`, not at the end of `try`: if anything above throws or
        // times out, the store must still end up empty. Leaving it reporting a
        // live session with a dead token is what re-opens the original loop —
        // screens stay mounted, keep fetching, and every 401 tries to sign out
        // again.
        //
        // The screen cache is keyed by screen, not by user, so leaving it
        // populated would paint the previous account's data to the next one.
        clearFetchCache();
        resetEntitlements();
        set({ session: null, profile: null });

        // Multi-account: signing out REMOVES this account from the device
        // (product decision 2026-08-31 — it is not left as a re-login entry).
        // If another account remains, switch straight into it rather than
        // dropping the user on Welcome.
        try {
          const next = await removeActive();
          if (next) await get().switchAccount(next.userId);
        } catch (err) {
          logger.warn('[session] post-signout account switch failed', { err });
        }

        signOutInFlight = null;
      }
    })();

    return signOutInFlight;
  },

  /**
   * Switch the app to another signed-in account.
   *
   * Tears the current account's background work down (WITHOUT revoking its
   * session — it may still be in the book), installs the target's stored
   * session, and re-initialises. `/` (app/index.tsx) re-routes on the new
   * session, same as any other sign-in.
   */
  activateSession: async (session: Session, replacingLive: boolean) => {
    if (replacingLive) {
      // Another account was active a moment ago. Stop its background work (no
      // revoke — it stays in the book), drop its cached screens and
      // entitlements, and null the session so the tab tree unmounts. `switching`
      // keeps the route mapper from reading that null as a sign-out.
      set({ switching: true });
      stopNotificationSummary();
      stopRealtime();
      await withTimeout(disconnectStream(), TEARDOWN_TIMEOUT_MS);
      clearFetchCache();
      resetEntitlements();
      set({ session: null, profile: null });
    }
    try {
      set({ session });
      await get().loadProfile();
    } finally {
      if (replacingLive) set({ switching: false });
    }
  },

  switchAccount: async (userId: string) => {
    const stored = await getStoredSession(userId);
    if (!stored?.access_token || !stored?.refresh_token) {
      return { ok: false, error: 'That account is no longer available. Sign in again.' };
    }

    set({ switching: true });
    try {
      // Stop the outgoing account's background work — mirrors signOut() minus
      // the auth.signOut() revoke (the account stays in the book).
      stopNotificationSummary();
      stopRealtime();
      await withTimeout(disconnectStream(), TEARDOWN_TIMEOUT_MS);
      clearFetchCache();
      resetEntitlements();

      // Null the session first so the tab tree unmounts — `switching` keeps the
      // route mapper from treating that as a sign-out. It remounts fresh on the
      // new session below.
      set({ session: null, profile: null });

      // setSession has NO timeout of its own and will refresh over the network
      // if the stored access token is stale — on a dead connection that hangs,
      // and because `switching` gates the whole app on a spinner, a hang here
      // is a brick. Bound it. On timeout we fall through to the error return,
      // `finally` clears `switching`, and the app lands on Welcome.
      const TIMEOUT = Symbol('timeout');
      const result = await Promise.race([
        supabase.auth.setSession({
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
        }),
        new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), 8000)),
      ]);

      if (result === TIMEOUT || result.error || !result.data.session) {
        return {
          ok: false,
          error:
            result === TIMEOUT
              ? 'Switching timed out. Check your connection and try again.'
              : (result.error?.message ?? 'Could not switch to that account.'),
        };
      }

      set({ session: result.data.session, profile: null });
      await get().loadProfile(); // also re-records the account as active in the book
      return { ok: true };
    } catch (err) {
      logger.error('[session] switchAccount threw', { err });
      return { ok: false, error: 'Could not switch to that account.' };
    } finally {
      set({ switching: false });
    }
  },

  /**
   * Subscribe to auth changes. onAuthStateChange fires once with the restored
   * session on startup, which is also what flips `ready` — so there's no
   * separate getSession() race to manage.
   */
  init: () => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const had = get().session?.user.id;
      // Mid-switch the session briefly goes null on purpose — don't let the
      // library's own SIGNED_OUT for that flip `ready`-gated screens.
      if (get().switching && !session) return;
      set({ session, ready: true });
      if (session && session.user.id !== had) void get().loadProfile();
      if (!session) set({ profile: null });
      // supabase-js rotates the refresh token on every refresh; keep the
      // active account's stored copy current so a later switch back still works.
      if (event === 'TOKEN_REFRESHED' && session) void syncActive(session).catch(() => {});
    });

    // Read the stored session directly too. onAuthStateChange USUALLY fires on
    // startup, but a corrupt auth-storage value (a half-written session from a
    // failed add-account) makes getSession() reject and the listener silent —
    // and then `ready` never flips and the app hangs on the splash. So: catch
    // the rejection, wipe the poisoned storage, and proceed signed-out.
    void supabase.auth
      .getSession()
      .then(({ data: d }) => {
        if (!get().ready) set({ session: d.session, ready: true });
      })
      .catch(async (err) => {
        logger.error('[session] getSession() failed on init — clearing auth storage', { err });
        await clearPersistedAuth().catch(() => {});
        if (!get().ready) set({ session: null, ready: true });
      });

    // Last-resort watchdog: whatever happened above, the splash must not sit
    // forever. If nothing has flipped `ready` within 8s, force it — index.tsx
    // then routes on whatever session state we have (usually null → Welcome).
    const watchdog = setTimeout(() => {
      if (!get().ready) {
        logger.warn('[session] init watchdog fired — forcing ready');
        set({ ready: true });
      }
    }, 8000);

    return () => {
      clearTimeout(watchdog);
      data.subscription.unsubscribe();
    };
  },
}));

/**
 * Sign out and leave, from a button.
 *
 * One hook instead of the same block copy-pasted into every screen with a Sign
 * out button, because all three parts of it are easy to get subtly wrong:
 *
 *  - `catch`, not just `finally`. A try/finally with no catch re-throws, so the
 *    earlier version left the unhandled rejection it claimed to have fixed. The
 *    error has to be swallowed *and* logged: navigation must happen either way,
 *    and a failure nobody can see is a failure nobody will fix.
 *  - '/' as the destination, never '/welcome'. app/index.tsx is the single place
 *    that maps an auth state to a screen; a second hard-coded destination is
 *    what made '/welcome' and '/login' fight each other.
 *  - `signingOut`, wired to the button's `loading`. The teardown is bounded but
 *    not instant — up to ~6s on a dead network — and a button that looks idle
 *    for that long gets tapped again.
 *
 * Deliberately never resets `signingOut` to false: the screen is being replaced,
 * so the button should stay busy until it goes away rather than flicker back to
 * a tappable state.
 */
export function useSignOutAction(): { signOut: () => void; signingOut: boolean } {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const run = useCallback(() => {
    if (signingOut) return;
    setSigningOut(true);
    void (async () => {
      try {
        await useSession.getState().signOut();
      } catch (err) {
        logger.error('sign out teardown failed', { err });
      } finally {
        router.replace('/');
      }
    })();
  }, [router, signingOut]);

  return { signOut: run, signingOut };
}

/** Convenience selectors. */
export const useRole = () => useSession((s) => s.profile?.role ?? null);
export const useIsCreator = () => useSession((s) => s.profile?.role === 'influencer');
