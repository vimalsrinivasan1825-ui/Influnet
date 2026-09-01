import type { GuideScript } from '../types';

export const switchAccount: GuideScript = {
  id: 'switch-account',
  title: 'Switch between accounts',
  blurb: 'Jump from your creator profile to your brand in a tap.',
  category: 'account',
  routes: ['/dashboard/settings', '/settings', '/(tabs)/profile'],
  beats: [
    { ms: 2000, screen: 'inf-account-menu', focus: 'am-current', tap: 'am-current', caption: 'Open the account menu' },
    { ms: 2200, screen: 'inf-account-menu', focus: 'am-other-account', tap: 'am-other-account', caption: 'Pick the other account' },
    { ms: 1800, screen: 'inf-account-menu', focus: 'am-other-account', flag: true, caption: 'No password — the session is already saved' },
    { ms: 2400, screen: 'inf-home', focus: 'wide', caption: 'The whole app re-tints to that account’s role' },
  ],
};
