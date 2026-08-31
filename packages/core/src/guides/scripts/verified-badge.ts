import type { GuideScript } from '../types';

export const verifiedBadge: GuideScript = {
  id: 'verified-badge',
  title: 'What the verified tick does',
  blurb: 'How trust is earned and why it matters.',
  category: 'growth',
  routes: ['/dashboard/profile', '/verification'],
  beats: [
    { ms: 2400, screen: 'inf-public-profile', focus: 'pp-verified-badge', flag: true, caption: 'The tick means we confirmed the account is real' },
    { ms: 2400, screen: 'inf-verify', focus: 'link-card', caption: 'Creators verify by linking their profile' },
    { ms: 2200, screen: 'inf-profile-editor', focus: 'pe-connect-ig', tap: 'pe-connect-ig', caption: 'Businesses verify their company details' },
    { ms: 2600, screen: 'inf-discover', focus: 'discover-card', flag: true, caption: 'Verified profiles rank higher in search' },
    { ms: 2400, screen: 'inf-public-profile', focus: 'wide', celebrate: true, caption: 'One check, more trust on every deal' },
  ],
};
