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
/**
 * Set by stopNotificationSummary() on sign-out. Without it a poll that was
 * already in flight when the session went away could land afterwards and write
 * the outgoing account's counts back into a store we just cleared.
 */
let stopped = false;

function clearTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const useNotificationSummary = create<SummaryState>((set) => ({
  summary: null,

  refresh: async () => {
    if (stopped) return;
    const res = await endpoints.notificationSummary<NotificationSummary>();
    if (stopped) return;
    if (res.ok && res.data) set({ summary: res.data });
  },

  start: () => {
    // A sign-in after a sign-out re-arms the store.
    stopped = false;
    subscribers += 1;
    void useNotificationSummary.getState().refresh();
    if (!timer) {
      timer = setInterval(() => void useNotificationSummary.getState().refresh(), POLL_MS);
    }
    return () => {
      subscribers -= 1;
      // Only the last screen to unmount tears the poll down, otherwise
      // navigating away from one tab would stop the badges updating everywhere.
      if (subscribers <= 0) {
        clearTimer();
        subscribers = 0;
      }
    };
  },
}));

/**
 * Stops the poll and clears counts on sign-out.
 *
 * The timer teardown is the important half. This used to only null the data,
 * so the 60s interval kept firing against an account that no longer had a
 * token — one unauthenticated request per minute, each of which the 401 handler
 * turned into another sign-out and another navigation. That was the visible
 * "sign-in screen glitching again and again".
 *
 * `subscribers` is reset too: the tab layout's cleanup runs *after* sign-out has
 * navigated away, and without a reset it would leave the counter negative, so
 * the next session's start() would never own the timer it created.
 */
export function stopNotificationSummary(): void {
  stopped = true;
  clearTimer();
  subscribers = 0;
  useNotificationSummary.setState({ summary: null });
}
