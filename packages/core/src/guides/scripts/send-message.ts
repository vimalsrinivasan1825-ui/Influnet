import type { GuideScript } from '../types';

export const sendMessage: GuideScript = {
  id: 'send-message',
  title: 'Send a message',
  blurb: 'Start a conversation and keep every deal in one thread.',
  category: 'messaging',
  routes: ['/dashboard/messages', '/conversations', '/(tabs)/messages'],
  beats: [
    { ms: 2200, screen: 'inf-messages', focus: 'wide', caption: 'Messages holds every conversation' },
    { ms: 2000, screen: 'inf-messages', focus: 'msg-conversation', tap: 'msg-conversation', caption: 'Open a conversation' },
    { ms: 2600, screen: 'inf-chat', focus: 'chat-input', type: 'Hi! Loved your last reel — open to a collab?', caption: 'Type your message' },
    { ms: 1600, screen: 'inf-chat', focus: 'chat-send', tap: 'chat-send', caption: 'Send it' },
    { ms: 2200, screen: 'inf-chat', focus: 'chat-deal-bar', flag: true, caption: 'The deal bar tracks where this collab stands' },
  ],
};
