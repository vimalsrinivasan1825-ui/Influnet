'use client';

import { create } from 'zustand';
import type { Conversation, Message, ConversationParticipant } from '@/types';

interface MessagingState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  typingUsers: Map<string, boolean>;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  updateConversationLastMessage: (conversationId: string, message: Message) => void;
  markConversationRead: (conversationId: string) => void;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  typingUsers: new Map(),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id, messages: [] }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) => {
    const { messages, conversations, activeConversationId } = get();
    const exists = messages.some((m) => m.id === message.id);
    if (exists) return;

    set({ messages: [...messages, message] });

    if (message.conversation_id === activeConversationId) {
      const updated = conversations.map((c) =>
        c.id === message.conversation_id
          ? { ...c, last_message: message, updated_at: message.created_at }
          : c
      );
      set({ conversations: updated });
    }
  },

  updateTyping: (conversationId, userId, isTyping) => {
    const { typingUsers } = get();
    const newMap = new Map(typingUsers);
    newMap.set(`${conversationId}:${userId}`, isTyping);
    set({ typingUsers: newMap });
  },

  updateConversationLastMessage: (conversationId, message) => {
    const { conversations } = get();
    const updated = conversations.map((c) =>
      c.id === conversationId
        ? { ...c, last_message: message, updated_at: message.created_at }
        : c
    );
    set({ conversations: updated });
  },

  markConversationRead: (conversationId) => {
    const { conversations } = get();
    const updated = conversations.map((c) =>
      c.id === conversationId ? { ...c, unread_count: 0 } : c
    );
    set({ conversations: updated });
  },
}));
