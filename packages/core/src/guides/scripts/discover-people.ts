import type { GuideScript } from '../types';

export const discoverPeople: GuideScript = {
  id: 'discover-people',
  title: 'Find creators & brands',
  blurb: 'Search, filter and open the right people to work with.',
  category: 'messaging',
  routes: ['/dashboard', '/dashboard/home', '/search', '/dashboard/connections', '/connections'],
  beats: [
    { ms: 2200, screen: 'inf-home', focus: 'home-search', tap: 'home-search', caption: 'Open search from the top bar' },
    { ms: 2600, screen: 'inf-discover', focus: 'discover-search', type: 'travel creators, Chennai', caption: 'Describe who you are looking for' },
    { ms: 2200, screen: 'inf-discover', focus: 'discover-filter', tap: 'discover-filter', caption: 'Narrow by audience, platform or location' },
    { ms: 2200, screen: 'inf-discover', focus: 'discover-card', tap: 'discover-card', caption: 'Open a profile to see their real numbers' },
    { ms: 2400, screen: 'inf-public-profile', focus: 'pp-message-btn', tap: 'pp-message-btn', caption: 'Reach out when it looks like a fit' },
  ],
};
