/**
 * Auth + profile state for the app.
 *
 * /api/profile returns the base profile and the role-specific profile merged
 * into one flat object, so this store keeps it flat too rather than inventing
 * a shape the server doesn't speak.
 */
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { UserRole, ApprovalStatus } from '@influnet/types';
import { supabase } from './supabase';
import { endpoints } from './api';
import { clearFetchCache } from './use-fetch';
import { disconnectStream } from './stream';
import { clearPushToken } from './push';
import { clearNotificationSummary } from './notification-summary';

export interface MeProfile {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
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
    // Before signOut() drops the token this request authenticates with —
    // otherwise a shared or reset device would keep receiving the outgoing
    // account's pushes after the next person signs in.
    clearPushToken();
    await supabase.auth.signOut();
    // The screen cache is keyed by screen, not by user — leaving it populated
    // would paint the previous account's data to the next one. The Stream
    // connection is per-user for the same reason.
    clearFetchCache();
    clearNotificationSummary();
    await disconnectStream();
    set({ session: null, profile: null });
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

/** Convenience selectors. */
export const useRole = () => useSession((s) => s.profile?.role ?? null);
export const useIsCreator = () => useSession((s) => s.profile?.role === 'influencer');
