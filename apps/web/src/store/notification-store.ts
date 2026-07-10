'use client';

import { create } from 'zustand';
import type { NotificationSummary } from '@/types';

interface NotificationState {
  summary: NotificationSummary;
  isLoading: boolean;
  setSummary: (summary: NotificationSummary) => void;
  setLoading: (loading: boolean) => void;
  decrementUnreadMessages: () => void;
  decrementPendingRequests: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  summary: { unread_messages_count: 0, pending_requests_count: 0 },
  isLoading: false,

  setSummary: (summary) => set({ summary }),
  setLoading: (isLoading) => set({ isLoading }),

  decrementUnreadMessages: () => {
    const { summary } = get();
    set({
      summary: {
        ...summary,
        unread_messages_count: Math.max(0, summary.unread_messages_count - 1),
      },
    });
  },

  decrementPendingRequests: () => {
    const { summary } = get();
    set({
      summary: {
        ...summary,
        pending_requests_count: Math.max(0, summary.pending_requests_count - 1),
      },
    });
  },
}));
