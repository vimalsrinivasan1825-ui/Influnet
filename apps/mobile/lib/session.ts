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
  setSession: (session: Session | null) => void;
  loadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  init: () => () => void;
}

/** Shared across concurrent signOut() callers so the teardown runs once. */
let signOutInFlight: Promise<void> | null = null;

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

  setSession: (session) => set({ session }),

  loadProfile: async () => {
    if (!get().session) {
      set({ profile: null });
      return;
    }
    set({ loadingProfile: true });
    // /api/profile wraps the merged profile as { profile: {...} }. Storing the
    // envelope instead of its contents leaves every field undefined, which
    // reads as "signed in but nobody home" on every screen that uses the store.
    const res = await endpoints.getProfile<{ profile: MeProfile }>();
    set({ profile: res.ok ? (res.data?.profile ?? null) : null, loadingProfile: false });
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
        signOutInFlight = null;
      }
    })();

    return signOutInFlight;
  },

  /**
   * Subscribe to auth changes. onAuthStateChange fires once with the restored
   * session on startup, which is also what flips `ready` — so there's no
   * separate getSession() race to manage.
   */
  init: () => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const had = get().session?.user.id;
      set({ session, ready: true });
      if (session && session.user.id !== had) void get().loadProfile();
      if (!session) set({ profile: null });
    });

    // If there is no stored session, onAuthStateChange still fires (with null),
    // but guard against a cold start that somehow doesn't.
    void supabase.auth.getSession().then(({ data: d }) => {
      if (!get().ready) set({ session: d.session, ready: true });
    });

    return () => data.subscription.unsubscribe();
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
