import type { GuideScript } from '../types';

export const sendRequest: GuideScript = {
  id: 'send-request',
  title: 'Send a collab request',
  blurb: 'Reach a creator with the brief and budget up front.',
  category: 'deals',
  roles: ['business_owner'],
  routes: ['/dashboard/requests', '/requests', '/requests/new'],
  beats: [
    { ms: 2200, screen: 'inf-public-profile', focus: 'pp-message-btn', tap: 'pp-message-btn', caption: 'Open a creator you want to work with' },
    { ms: 2600, screen: 'inf-request', focus: 'req-message', type: 'One reel + 3 stories for our March launch.', caption: 'Describe the collaboration' },
    { ms: 2200, screen: 'inf-request', focus: 'req-budget', type: '₹40,000', caption: 'Add your budget so replies are serious' },
    { ms: 1800, screen: 'inf-request', focus: 'req-send', tap: 'req-send', caption: 'Send the request' },
    { ms: 2200, screen: 'inf-messages', focus: 'msg-conversation', caption: 'It lands as a conversation you can track' },
  ],
};
