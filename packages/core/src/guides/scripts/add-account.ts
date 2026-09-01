import type { GuideScript } from '../types';

export const addAccount: GuideScript = {
  id: 'add-account',
  title: 'Add another account',
  blurb: 'Run a creator and a brand account from one app.',
  category: 'account',
  routes: ['/dashboard/settings', '/settings', '/(tabs)/profile'],
  beats: [
    { ms: 2200, screen: 'inf-account-menu', focus: 'am-current', tap: 'am-current', caption: 'Open the account menu' },
    { ms: 2000, screen: 'inf-account-menu', focus: 'am-add-account', tap: 'am-add-account', caption: 'Tap Add another account' },
    { ms: 2600, screen: 'inf-account-menu', focus: 'am-add-account', type: 'you@brand.com', caption: 'Sign in to the other account' },
    { ms: 2200, screen: 'inf-account-menu', focus: 'am-other-account', flag: true, caption: 'Both accounts now live in this menu' },
    { ms: 2000, screen: 'inf-home', focus: 'wide', caption: 'Your current session stays exactly where it was' },
  ],
};
