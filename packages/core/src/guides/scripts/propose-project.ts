import type { GuideScript } from '../types';

export const proposeProject: GuideScript = {
  id: 'propose-project',
  title: 'Turn a chat into a project',
  blurb: 'Agree the terms, then both sides confirm to start.',
  category: 'deals',
  routes: ['/dashboard/messages', '/conversations', '/dashboard/projects', '/projects'],
  beats: [
    { ms: 2200, screen: 'inf-chat', focus: 'chat-deal-bar', caption: 'Once you’ve agreed in chat…' },
    { ms: 2000, screen: 'inf-chat', focus: 'chat-propose-btn', tap: 'chat-propose-btn', caption: 'Propose a project' },
    { ms: 2600, screen: 'inf-request', focus: 'req-message', type: 'Deliverables, dates, ₹40,000', caption: 'Fill in deliverables, timeline and price' },
    { ms: 2000, screen: 'inf-request', focus: 'req-send', tap: 'req-send', caption: 'Send it to the other side' },
    { ms: 2200, screen: 'inf-projects', focus: 'proj-card', flag: true, caption: 'They confirm, and the project opens for both of you' },
  ],
};
