'use client';

import { create } from 'zustand';
import type { Profile, UserRole } from '@/types';

interface AuthState {
  user: Profile | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: Profile | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  getRole: () => UserRole | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  // Token lives in memory only; the Supabase session (cookie-backed) is the
  // source of truth. Never persist tokens to localStorage.
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    // Clear legacy cached keys from older builds
    localStorage.removeItem('influnet_token');
    localStorage.removeItem('influnet_refresh_token');
    localStorage.removeItem('influnet_user');
    set({ user: null, token: null });
  },
  getRole: () => get().user?.role ?? null,
}));
