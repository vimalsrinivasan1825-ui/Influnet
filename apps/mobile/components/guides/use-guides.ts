/**
 * Guide UI state for mobile: which guide the modal shows, and the per-device
 * "seen" set (AsyncStorage) that makes a section's walkthrough auto-play once
 * and then stay quiet. Mirrors apps/web/src/components/guides/use-guides.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const SEEN_KEY = 'influnet_guide_seen';

export type GuideSource = 'launcher' | 'autorun';

interface GuidesState {
  seen: string[];
  loaded: boolean;
  openId: string | null;
  source: GuideSource | null;
  hydrate: () => void;
  hasSeen: (id: string) => boolean;
  markSeen: (id: string) => void;
  resetSeen: () => void;
  open: (id: string, source: GuideSource) => void;
  close: () => void;
}

export const useGuides = create<GuidesState>((set, get) => ({
  seen: [],
  loaded: false,
  openId: null,
  source: null,
  hydrate: () => {
    if (get().loaded) return;
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        let seen: string[] = [];
        try {
          const arr = raw ? JSON.parse(raw) : [];
          if (Array.isArray(arr)) seen = arr.filter((x) => typeof x === 'string');
        } catch {
          /* ignore corrupt value */
        }
        set({ seen, loaded: true });
      })
      .catch(() => set({ loaded: true }));
  },
  hasSeen: (id) => get().seen.includes(id),
  markSeen: (id) => {
    if (get().seen.includes(id)) return;
    const seen = [...get().seen, id];
    set({ seen });
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen)).catch(() => {});
  },
  resetSeen: () => {
    set({ seen: [] });
    AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
  },
  open: (id, source) => set({ openId: id, source }),
  close: () => set({ openId: null, source: null }),
}));
