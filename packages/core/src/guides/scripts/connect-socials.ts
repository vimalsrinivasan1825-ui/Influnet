import type { GuideScript } from '../types';

export const connectSocials: GuideScript = {
  id: 'connect-socials',
  title: 'Add your other platforms',
  blurb: 'Link YouTube and more so brands see your full reach.',
  category: 'get-started',
  roles: ['influencer'],
  routes: ['/dashboard/profile', '/edit-profile'],
  beats: [
    { ms: 2400, screen: 'inf-profile-editor', focus: 'wide', caption: 'Open your profile editor' },
    { ms: 2200, screen: 'inf-profile-editor', focus: 'pe-connect-yt', tap: 'pe-connect-yt', caption: 'Tap Connect on YouTube' },
    { ms: 2600, screen: 'inf-profile-editor', focus: 'pe-connect-yt', type: '@priyacreates', caption: 'Enter your channel handle' },
    { ms: 2000, screen: 'inf-profile-editor', focus: 'pe-connect-yt', flag: true, caption: 'We pull your subscribers and views' },
    { ms: 2000, screen: 'inf-profile-editor', focus: 'pe-save', tap: 'pe-save', caption: 'Save — your reach now adds up across platforms' },
    { ms: 2600, screen: 'inf-public-profile', focus: 'wide', caption: 'Brands see every platform on your public profile' },
  ],
};
