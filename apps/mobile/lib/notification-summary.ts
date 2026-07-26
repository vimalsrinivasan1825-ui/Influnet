/**
 * Unread counts shared by every surface that shows a badge.
 *
 * This used to be local state inside the tabs layout, which meant the tab bar
 * was the only thing that could ever see it — the notification bell in
 * AppHeader takes an `unread` prop that literally no screen passed, so it never
 * rendered its dot no matter how many notifications were waiting.
 *
 * A store rather than a hook-with-its-own-fetch so the poll runs once for the
 * whole app instead of once per mounted screen, and so marking notifications
 * read can push the count down immediately (see refresh() from the
 * notifications screen) rather than leaving a stale dot for up to a minute.
 */
import { create } from 'zustand';
import type { NotificationSummary } from '@influnet/types';
import { endpoints } from './api';

const POLL_MS = 60_000;

interface SummaryState {
  summary: NotificationSummary | null;
  refresh: () => Promise<void>;
  /** Starts polling. Returns the stop function; safe to call from several screens. */
  start: () => () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

export const useNotificationSummary = create<SummaryState>((set) => ({
  summary: null,

  refresh: async () => {
    const res = await endpoints.notificationSummary<NotificationSummary>();
    if (res.ok && res.data) set({ summary: res.data });
  },

  start: () => {
    subscribers += 1;
    void useNotificationSummary.getState().refresh();
    if (!timer) {
      timer = setInterval(() => void useNotificationSummary.getState().refresh(), POLL_MS);
    }
    return () => {
      subscribers -= 1;
      // Only the last screen to unmount tears the poll down, otherwise
      // navigating away from one tab would stop the badges updating everywhere.
      if (subscribers <= 0 && timer) {
        clearInterval(timer);
        timer = null;
        subscribers = 0;
      }
    };
  },
}));

/** Clears counts on sign-out so the next account doesn't inherit stale badges. */
export function clearNotificationSummary(): void {
  useNotificationSummary.setState({ summary: null });
}
