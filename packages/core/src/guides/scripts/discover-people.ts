import type { GuideScript } from '../types';

export const discoverPeople: GuideScript = {
  id: 'discover-people',
  title: 'Find a creator',
  blurb: 'Reach a creator from their username or profile link.',
  category: 'messaging',
  // Businesses only: a creator has nobody to look up, and there is no roster
  // to browse — so this guide would teach a creator a screen they never see.
  roles: ['business_owner'],
  routes: [
    '/dashboard',
    '/dashboard/home',
    '/dashboard/find-creator',
    '/search',
    '/dashboard/connections',
    '/connections',
  ],
  beats: [
    { ms: 2200, screen: 'inf-home', focus: 'home-search', tap: 'home-search', caption: 'Open Find creator from the top bar' },
    { ms: 2600, screen: 'inf-discover', focus: 'discover-search', type: '@priyatravels', caption: 'Enter their username, or paste their profile link' },
    { ms: 2200, screen: 'inf-discover', focus: 'discover-card', tap: 'discover-card', caption: 'One exact match — open it to see their real numbers' },
    { ms: 2400, screen: 'inf-public-profile', focus: 'pp-message-btn', tap: 'pp-message-btn', caption: 'Reach out when it looks like a fit' },
  ],
};
