import type { GuideScript } from '../types';

export const payments: GuideScript = {
  id: 'payments',
  title: 'How payments work',
  blurb: 'Advance to start, balance on delivery — both held safely.',
  category: 'deals',
  routes: ['/projects', '/dashboard/projects', '/billing', '/dashboard/billing'],
  beats: [
    { ms: 2400, screen: 'inf-stage', focus: 'stage-checklist-item', flag: true, caption: 'Payment stages unlock only when it’s time to pay' },
    { ms: 2000, screen: 'inf-payment', focus: 'pay-amount', flag: true, caption: 'The amount comes from your agreed terms' },
    { ms: 2200, screen: 'inf-payment', focus: 'pay-method', tap: 'pay-method', caption: 'Pay by card, UPI or net banking' },
    { ms: 2000, screen: 'inf-payment', focus: 'pay-confirm', tap: 'pay-confirm', caption: 'Confirm the payment' },
    { ms: 2400, screen: 'inf-stage', focus: 'stage-signoff-btn', celebrate: true, caption: 'The gate opens automatically once payment clears' },
  ],
};
