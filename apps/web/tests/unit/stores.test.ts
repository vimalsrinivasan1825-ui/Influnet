import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth-store';
import { useMessagingStore } from '@/store/messaging-store';
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

  it('should store token in localStorage', () => {
    useAuthStore.getState().setToken('test-token');
    expect(localStorage.getItem('influnet_token')).toBe('test-token');
    expect(useAuthStore.getState().token).toBe('test-token');
  });

  it('should clear token from localStorage on null', () => {
    localStorage.setItem('influnet_token', 'existing-token');
    useAuthStore.getState().setToken(null);
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

// Messaging Store Tests
describe('MessagingStore', () => {
  beforeEach(() => {
    useMessagingStore.setState({
      conversations: [],
      activeConversationId: null,
      messages: [],
      typingUsers: new Map(),
    });
  });

  it('should initialize with empty state', () => {
    const state = useMessagingStore.getState();
    expect(state.conversations).toEqual([]);
    expect(state.activeConversationId).toBeNull();
    expect(state.messages).toEqual([]);
  });

  it('should set conversations', () => {
    const mockConvs = [{ id: '1', created_at: '', updated_at: '', other_user: undefined, last_message: undefined, unread_count: 0 }];
    useMessagingStore.getState().setConversations(mockConvs);
    expect(useMessagingStore.getState().conversations).toEqual(mockConvs);
  });

  it('should set active conversation and clear messages', () => {
    useMessagingStore.getState().setMessages([{ id: '1', conversation_id: '1', sender_user_id: 'u1', body: 'hi', deleted: false, created_at: '', updated_at: '' }]);
    useMessagingStore.getState().setActiveConversation('conv-123');
    expect(useMessagingStore.getState().activeConversationId).toBe('conv-123');
    expect(useMessagingStore.getState().messages).toEqual([]);
  });

  it('should add message without duplicates', () => {
    const msg = { id: 'm1', conversation_id: 'c1', sender_user_id: 'u1', body: 'Hello', deleted: false, created_at: '2024-01-01', updated_at: '2024-01-01' };
    useMessagingStore.getState().addMessage(msg);
    expect(useMessagingStore.getState().messages).toHaveLength(1);
    useMessagingStore.getState().addMessage(msg);
    expect(useMessagingStore.getState().messages).toHaveLength(1);
  });

  it('should update conversation last message for active conversation', () => {
    useMessagingStore.getState().setActiveConversation('c1');
    const msg = { id: 'm1', conversation_id: 'c1', sender_user_id: 'u1', body: 'New msg', deleted: false, created_at: '2024-01-01', updated_at: '2024-01-01' };
    useMessagingStore.getState().setConversations([{ id: 'c1', created_at: '', updated_at: '', last_message: undefined, unread_count: 1 }]);
    useMessagingStore.getState().addMessage(msg);
    const conv = useMessagingStore.getState().conversations.find(c => c.id === 'c1');
    expect(conv?.last_message?.body).toBe('New msg');
  });

  it('should track typing users', () => {
    useMessagingStore.getState().updateTyping('c1', 'u1', true);
    expect(useMessagingStore.getState().typingUsers.get('c1:u1')).toBe(true);
    useMessagingStore.getState().updateTyping('c1', 'u1', false);
    expect(useMessagingStore.getState().typingUsers.get('c1:u1')).toBe(false);
  });

  it('should mark conversation as read', () => {
    useMessagingStore.getState().setConversations([{ id: 'c1', created_at: '', updated_at: '', last_message: undefined, unread_count: 5 }]);
    useMessagingStore.getState().markConversationRead('c1');
    expect(useMessagingStore.getState().conversations[0].unread_count).toBe(0);
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
