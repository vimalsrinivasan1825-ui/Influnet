'use client';

import { create } from 'zustand';
import type { NotificationSummary } from '@/types';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationState {
  summary: NotificationSummary;
  notifications: NotificationItem[];
  unread_notifications_count: number;
  isLoading: boolean;
  
  setSummary: (summary: NotificationSummary) => void;
  setNotifications: (notifications: NotificationItem[]) => void;
  addNotification: (notification: NotificationItem) => void;
  markAsRead: (ids: string[]) => void;
  markAllAsRead: () => void;
  
  setLoading: (loading: boolean) => void;
  setUnreadMessages: (count: number) => void;
  decrementUnreadMessages: () => void;
  decrementPendingRequests: () => void;
  incrementUnreadMessages: () => void;
  incrementPendingRequests: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  summary: { unread_notifications_count: 0, unread_messages_count: 0, pending_requests_count: 0 },
  notifications: [],
  unread_notifications_count: 0,
  isLoading: false,

  setSummary: (summary) => set({ summary }),
  
  setNotifications: (notifications) => {
    const unreadCount = notifications.filter(n => !n.read_at).length;
    set({ notifications, unread_notifications_count: unreadCount });
  },
  
  addNotification: (notification) => {
    const { notifications, unread_notifications_count } = get();
    // avoid duplicates
    if (!notifications.find(n => n.id === notification.id)) {
      set({ 
        notifications: [notification, ...notifications],
        unread_notifications_count: unread_notifications_count + 1
      });
    }
  },
  
  markAsRead: (ids) => {
    const { notifications, unread_notifications_count } = get();
    const updated = notifications.map(n => 
      ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
    );
    const markedCount = notifications.filter(n => ids.includes(n.id) && !n.read_at).length;
    set({ 
      notifications: updated,
      unread_notifications_count: Math.max(0, unread_notifications_count - markedCount)
    });
  },
  
  markAllAsRead: () => {
    const { notifications } = get();
    const updated = notifications.map(n => ({ ...n, read_at: new Date().toISOString() }));
    set({ 
      notifications: updated,
      unread_notifications_count: 0
    });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setUnreadMessages: (count) => {
    const { summary } = get();
    set({
      summary: { ...summary, unread_messages_count: Math.max(0, count) },
    });
  },

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

  incrementUnreadMessages: () => {
    const { summary } = get();
    set({
      summary: {
        ...summary,
        unread_messages_count: summary.unread_messages_count + 1,
      },
    });
  },

  incrementPendingRequests: () => {
    const { summary } = get();
    set({
      summary: {
        ...summary,
        pending_requests_count: summary.pending_requests_count + 1,
      },
    });
  },
}));
