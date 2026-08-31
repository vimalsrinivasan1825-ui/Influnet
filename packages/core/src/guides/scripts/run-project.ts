import type { GuideScript } from '../types';

export const runProject: GuideScript = {
  id: 'run-project',
  title: 'Run a project, stage by stage',
  blurb: 'The pipeline that carries a collab from brief to paid.',
  category: 'deals',
  routes: ['/dashboard/projects', '/projects'],
  beats: [
    { ms: 2400, screen: 'inf-projects', focus: 'wide', caption: 'Every live collab is a project with stages' },
    { ms: 2000, screen: 'inf-projects', focus: 'proj-card', tap: 'proj-card', caption: 'Open a project' },
    { ms: 2400, screen: 'inf-stage', focus: 'stage-checklist-item', flag: true, caption: 'Each stage has a short checklist for both sides' },
    { ms: 2200, screen: 'inf-stage', focus: 'stage-upload', tap: 'stage-upload', caption: 'Share drafts and updates in the stage' },
    { ms: 2200, screen: 'inf-stage', focus: 'stage-signoff-btn', tap: 'stage-signoff-btn', caption: 'Both sign off to move to the next stage' },
    { ms: 2200, screen: 'inf-projects', focus: 'proj-stage-pill', flag: true, caption: 'The pill always shows whose move it is' },
  ],
};
