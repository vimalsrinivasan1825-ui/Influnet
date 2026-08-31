import type { GuideScript } from '../types';

export const respondRequest: GuideScript = {
  id: 'respond-request',
  title: 'Respond to a request',
  blurb: 'Review a brand’s brief and reply on your terms.',
  category: 'deals',
  roles: ['influencer'],
  routes: ['/dashboard/requests', '/requests'],
  beats: [
    { ms: 2200, screen: 'inf-request', focus: 'req-card', tap: 'req-card', caption: 'Open the incoming request' },
    { ms: 2400, screen: 'inf-request', focus: 'req-card', flag: true, caption: 'Check the brief, budget and who is asking' },
    { ms: 2400, screen: 'inf-chat', focus: 'chat-input', type: 'Happy to — here’s my rate card and timeline.', caption: 'Reply, counter or ask questions in chat' },
    { ms: 1800, screen: 'inf-chat', focus: 'chat-send', tap: 'chat-send', caption: 'Nothing is locked until you both agree' },
    { ms: 2000, screen: 'inf-chat', focus: 'chat-deal-bar', flag: true, caption: 'Accepting moves the deal forward, not money' },
  ],
};
