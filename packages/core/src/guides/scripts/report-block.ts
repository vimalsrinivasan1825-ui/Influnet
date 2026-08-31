import type { GuideScript } from '../types';

export const reportBlock: GuideScript = {
  id: 'report-block',
  title: 'Report or block someone',
  blurb: 'Keep your inbox clean and flag bad actors to us.',
  category: 'account',
  routes: ['/creator', '/business', '/dashboard/connections', '/connections', '/blocked-accounts'],
  beats: [
    { ms: 2200, screen: 'inf-public-profile', focus: 'pp-overflow', tap: 'pp-overflow', caption: 'Open the menu on their profile' },
    { ms: 2000, screen: 'inf-public-profile', focus: 'pp-report', tap: 'pp-report', caption: 'Report sends the details to our team' },
    { ms: 2400, screen: 'inf-support', focus: 'sup-message', type: 'Asked to move payment off-platform.', caption: 'Tell us what happened' },
    { ms: 2000, screen: 'inf-public-profile', focus: 'pp-block', tap: 'pp-block', caption: 'Block stops all contact immediately' },
    { ms: 2000, screen: 'inf-account-menu', focus: 'am-settings', flag: true, caption: 'Manage blocked accounts any time in settings' },
  ],
};
