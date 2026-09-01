import type { GuideScript } from '../types';

/**
 * Port of the original Instagram ownership walkthrough
 * (apps/*_/components/verification/verify-guide-animation.tsx) onto the shared
 * beat model. Same story: copy your link → Instagram → Edit profile → paste into
 * Links → back to Influnet → Verify → verified.
 */
export const connectInstagram: GuideScript = {
  id: 'connect-instagram',
  title: 'Connect & verify Instagram',
  blurb: 'Prove the account is yours and get the verified tick.',
  category: 'get-started',
  roles: ['influencer'],
  // Auto-runs only on the dedicated verification route — the profile page
  // already has its own wired-up "Show me how" panel
  // (components/dashboard/instagram-ownership-panel.tsx). Still in the launcher.
  routes: ['/verification', '/verification-guide'],
  beats: [
    { ms: 2600, screen: 'inf-verify', focus: 'link-card', caption: 'Find your profile link' },
    { ms: 1900, screen: 'inf-verify', focus: 'copy-btn', tap: 'copy-btn', caption: 'Copy your profile link' },
    { ms: 2000, screen: 'phone-home', focus: 'ig-icon', tap: 'ig-icon', caption: 'Open Instagram' },
    { ms: 1900, screen: 'ig-profile', focus: 'ig-edit-btn', tap: 'ig-edit-btn', caption: 'Go to your profile, then Edit profile' },
    { ms: 1600, screen: 'ig-edit', focus: 'ig-links-row', tap: 'ig-links-row', caption: 'Open the Links field' },
    { ms: 2600, screen: 'ig-edit', focus: 'ig-links-row', type: 'influnet.in/c/priya', caption: 'Paste your link and save' },
    { ms: 1400, screen: 'ig-edit', focus: 'ig-done', tap: 'ig-done', caption: 'Tap Done' },
    { ms: 2000, screen: 'inf-verify', focus: 'verify-btn', tap: 'verify-btn', caption: 'Back on Influnet, tap Verify' },
    { ms: 1400, screen: 'inf-verify', focus: 'verify-btn', caption: 'Checking your profile…' },
    { ms: 3200, screen: 'inf-verify', focus: 'wide', celebrate: true, caption: 'Verified — leave the link in place' },
  ],
};
