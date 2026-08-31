import type { GuideScript } from '../types';

export const getPremium: GuideScript = {
  id: 'get-premium',
  title: 'Upgrade to Pro',
  blurb: 'What Pro unlocks and how to turn it on.',
  category: 'growth',
  routes: ['/dashboard/billing', '/billing'],
  beats: [
    { ms: 2400, screen: 'inf-billing', focus: 'bill-feature', flag: true, caption: 'Pro lifts the limits on projects and requests' },
    { ms: 2000, screen: 'inf-billing', focus: 'bill-pro-card', caption: 'One plan, monthly or yearly' },
    { ms: 2000, screen: 'inf-billing', focus: 'bill-upgrade-btn', tap: 'bill-upgrade-btn', caption: 'Tap Upgrade' },
    { ms: 2200, screen: 'inf-payment', focus: 'pay-confirm', tap: 'pay-confirm', caption: 'Pay securely — cancel anytime' },
    { ms: 2400, screen: 'inf-billing', focus: 'bill-pro-card', celebrate: true, caption: 'Pro is active straight away' },
  ],
};
