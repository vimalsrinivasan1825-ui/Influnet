// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth-store';

import { useNotificationStore } from '@/store/notification-store';
import type { Profile, UserRole } from '@/types';

function makeMockUser(role: UserRole, overrides?: Partial<Profile>): Profile {
  return {
    id: '123',
    role,
    email: 'test@test.com',
    name: 'Test',
    phone: null,
    location: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

// Auth Store Tests
describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null, isLoading: true });
  });

  it('should initialize with null user and token', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('should set user', () => {
    const mockUser = makeMockUser('admin');
    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('should store token in memory only (not localStorage)', () => {
    useAuthStore.getState().setToken('test-token');
    // Token is kept in memory only — localStorage must NOT be written
    expect(localStorage.getItem('influnet_token')).toBeNull();
    expect(useAuthStore.getState().token).toBe('test-token');
  });

  it('should clear in-memory token on setToken(null)', () => {
    useAuthStore.getState().setToken('existing-token');
    useAuthStore.getState().setToken(null);
    // No localStorage side-effect expected — only in-memory state cleared
    expect(localStorage.getItem('influnet_token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('should clear all on logout', () => {
    localStorage.setItem('influnet_token', 'token');
    localStorage.setItem('influnet_refresh_token', 'refresh');
    localStorage.setItem('influnet_user', JSON.stringify({ id: '123' }));
    useAuthStore.getState().setUser(makeMockUser('influencer'));
    useAuthStore.getState().setToken('token');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('influnet_token')).toBeNull();
    expect(localStorage.getItem('influnet_refresh_token')).toBeNull();
    expect(localStorage.getItem('influnet_user')).toBeNull();
  });

  it('should return role via getRole', () => {
    expect(useAuthStore.getState().getRole()).toBeNull();
    useAuthStore.getState().setUser(makeMockUser('admin'));
    expect(useAuthStore.getState().getRole()).toBe('admin');
  });
});


// Notification Store Tests
describe('NotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      summary: { unread_messages_count: 0, pending_requests_count: 0 },
      isLoading: false,
    });
  });

  it('should initialize with zero counts', () => {
    const state = useNotificationStore.getState();
    expect(state.summary.unread_messages_count).toBe(0);
    expect(state.summary.pending_requests_count).toBe(0);
  });

  it('should set summary', () => {
    useNotificationStore.getState().setSummary({ unread_messages_count: 3, pending_requests_count: 2 });
    expect(useNotificationStore.getState().summary.unread_messages_count).toBe(3);
    expect(useNotificationStore.getState().summary.pending_requests_count).toBe(2);
  });

  it('should decrement unread messages', () => {
    useNotificationStore.getState().setSummary({ unread_messages_count: 5, pending_requests_count: 0 });
    useNotificationStore.getState().decrementUnreadMessages();
    expect(useNotificationStore.getState().summary.unread_messages_count).toBe(4);
  });

  it('should not decrement below zero', () => {
    useNotificationStore.getState().decrementUnreadMessages();
    expect(useNotificationStore.getState().summary.unread_messages_count).toBe(0);
  });

  it('should decrement pending requests', () => {
    useNotificationStore.getState().setSummary({ unread_messages_count: 0, pending_requests_count: 3 });
    useNotificationStore.getState().decrementPendingRequests();
    expect(useNotificationStore.getState().summary.pending_requests_count).toBe(2);
  });
});
