"use client";

/**
 * Guide UI state: which guide is open in the modal, and the per-device "seen"
 * set that makes auto-run fire once per section and then stay quiet.
 */

import { create } from "zustand";

const SEEN_KEY = "influnet_guide_seen";

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / quota — the guide just auto-runs again next time */
  }
}

export type GuideSource = "launcher" | "autorun";

interface GuidesState {
  seen: string[];
  openId: string | null;
  source: GuideSource | null;
  hasSeen: (id: string) => boolean;
  markSeen: (id: string) => void;
  resetSeen: () => void;
  open: (id: string, source: GuideSource) => void;
  close: () => void;
}

export const useGuides = create<GuidesState>((set, get) => ({
  seen: readSeen(),
  openId: null,
  source: null,
  hasSeen: (id) => get().seen.includes(id),
  markSeen: (id) =>
    set((s) => {
      if (s.seen.includes(id)) return s;
      const seen = [...s.seen, id];
      writeSeen(seen);
      return { seen };
    }),
  resetSeen: () => {
    writeSeen([]);
    set({ seen: [] });
  },
  open: (id, source) => set({ openId: id, source }),
  close: () => set({ openId: null, source: null }),
}));
