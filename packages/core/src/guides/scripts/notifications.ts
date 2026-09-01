import type { GuideScript } from '../types';

export const notifications: GuideScript = {
  id: 'notifications',
  title: 'Stay on top of your deals',
  blurb: 'Where updates land and how to never miss a turn.',
  category: 'account',
  routes: ['/dashboard/activity', '/activity', '/notifications'],
  beats: [
    { ms: 2200, screen: 'inf-home', focus: 'act-bell', tap: 'act-bell', caption: 'The bell shows anything that needs you' },
    { ms: 2400, screen: 'inf-activity', focus: 'act-item', tap: 'act-item', caption: 'Tap an update to jump straight to it' },
    { ms: 2000, screen: 'inf-activity', focus: 'act-filter', tap: 'act-filter', caption: 'Filter by requests, projects or payments' },
    { ms: 2200, screen: 'inf-home', focus: 'home-turn-card', flag: true, caption: 'Home always leads with whose move it is' },
  ],
};
