import type { GuideScript } from '../types';

export const editProfile: GuideScript = {
  id: 'edit-profile',
  title: 'Build your public profile',
  blurb: 'The page brands land on — make it work for you.',
  category: 'growth',
  routes: ['/dashboard/profile', '/edit-profile', '/portfolio/add'],
  beats: [
    { ms: 2200, screen: 'inf-profile-editor', focus: 'pe-avatar', tap: 'pe-avatar', caption: 'Add a clear profile photo' },
    { ms: 2600, screen: 'inf-profile-editor', focus: 'pe-bio', type: 'Food & travel creator. Chennai.', caption: 'Write a short, specific bio' },
    { ms: 2200, screen: 'inf-profile-editor', focus: 'pe-add-portfolio', tap: 'pe-add-portfolio', caption: 'Add past work as proof' },
    { ms: 2000, screen: 'inf-profile-editor', focus: 'pe-save', tap: 'pe-save', caption: 'Save your changes' },
    { ms: 2600, screen: 'inf-public-profile', focus: 'wide', caption: 'This is exactly what a brand sees' },
  ],
};
