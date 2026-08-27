/**
 * In-app "pop card" queue for incoming notifications.
 *
 * The Realtime `notifications` channel (lib/realtime.ts) already fires the
 * instant a row is written for this user. Until now that only moved a badge
 * count — the actual message ("You're verified", "The brand paid the advance")
 * was invisible unless the app happened to be on the notifications screen.
 *
 * This holds the last few of those so <NotificationToastHost> can slide one in
 * at the top of the screen, the way the OS banner would for a push — except it
 * works even where push does not (Expo Go, a build with no FCM/APNs creds) and
 * without the 60s poll lag.
 *
 * Chat messages are deliberately NOT routed here — Stream, the OS banner and
 * the unread badge already cover those, and a card per message is the exact
 * noise we just took out of email. lib/realtime.ts drops `type === 'message'`
 * before it ever calls push().
 */
import { create } from 'zustand';

export interface ToastNotification {
  /** notifications.id — also the dedupe key. */
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Web dashboard path; run through toMobileHref() before navigating. */
  link: string | null;
  receivedAt: number;
}

interface ToastState {
  queue: ToastNotification[];
  push: (n: ToastNotification) => void;
  dismiss: (id: string) => void;
  /** Sign-out: drop everything and forget what was shown. */
  clear: () => void;
}

/** One card on screen at a time; a burst keeps the newest few and no more. */
const MAX_QUEUE = 3;

/**
 * Ids already queued this session, so a Realtime redelivery (or the same row
 * arriving on two channels during a resubscribe) can't show the card twice.
 * Cleared on sign-out; bounded so a long session can't grow it without limit.
 */
const seen = new Set<string>();

export const useNotificationToast = create<ToastState>((set) => ({
  queue: [],

  push: (n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    if (seen.size > 300) seen.clear();
    set((s) => ({ queue: [...s.queue, n].slice(-MAX_QUEUE) }));
  },

  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),

  clear: () => {
    seen.clear();
    set({ queue: [] });
  },
}));
