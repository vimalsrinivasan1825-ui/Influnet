import type { GuideScript } from '../types';

export const signOffStage: GuideScript = {
  id: 'sign-off-stage',
  title: 'Approve a stage',
  blurb: 'How the two-sided sign-off keeps a project honest.',
  category: 'deals',
  routes: ['/projects', '/dashboard/projects'],
  beats: [
    { ms: 2400, screen: 'inf-stage', focus: 'stage-checklist-item', tap: 'stage-checklist-item', caption: 'Work through the checklist for this stage' },
    { ms: 2200, screen: 'inf-stage', focus: 'stage-note', type: 'Draft looks good — approved from my side.', caption: 'Leave a note so the other side has context' },
    { ms: 2000, screen: 'inf-stage', focus: 'stage-signoff-btn', tap: 'stage-signoff-btn', caption: 'Tap Sign off' },
    { ms: 2200, screen: 'inf-stage', focus: 'stage-signoff-btn', flag: true, caption: 'The stage waits until the other side signs off too' },
    { ms: 2200, screen: 'inf-projects', focus: 'proj-stage-pill', celebrate: true, caption: 'Second sign-off advances the project' },
  ],
};
