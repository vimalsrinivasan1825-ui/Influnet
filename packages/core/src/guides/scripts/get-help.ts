import type { GuideScript } from '../types';

export const getHelp: GuideScript = {
  id: 'get-help',
  title: 'Get help & give feedback',
  blurb: 'Reach a human and tell us what to fix.',
  category: 'account',
  routes: ['/dashboard/support', '/support', '/feedback'],
  beats: [
    { ms: 2200, screen: 'inf-support', focus: 'sup-new-ticket', tap: 'sup-new-ticket', caption: 'Open a support conversation' },
    { ms: 2600, screen: 'inf-support', focus: 'sup-message', type: 'A payment shows pending but my bank charged me.', caption: 'Describe the problem with any detail you have' },
    { ms: 1800, screen: 'inf-support', focus: 'sup-send', tap: 'sup-send', caption: 'Send — replies come back here and by email' },
    { ms: 2200, screen: 'inf-support', focus: 'sup-feedback-btn', tap: 'sup-feedback-btn', caption: 'Feedback is for ideas and rough edges, not urgent issues' },
  ],
};
