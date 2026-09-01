/**
 * The guide catalogue + lookup helpers. Pure data — no React, no platform APIs.
 */

import type { GuideScript, GuideRole, GuideCategory } from './types';
import { CATEGORY_ORDER } from './types';

import { connectInstagram } from './scripts/connect-instagram';
import { connectSocials } from './scripts/connect-socials';
import { discoverPeople } from './scripts/discover-people';
import { editProfile } from './scripts/edit-profile';
import { verifiedBadge } from './scripts/verified-badge';
import { sendMessage } from './scripts/send-message';
import { sendRequest } from './scripts/send-request';
import { respondRequest } from './scripts/respond-request';
import { proposeProject } from './scripts/propose-project';
import { runProject } from './scripts/run-project';
import { signOffStage } from './scripts/sign-off-stage';
import { payments } from './scripts/payments';
import { addAccount } from './scripts/add-account';
import { switchAccount } from './scripts/switch-account';
import { getPremium } from './scripts/get-premium';
import { reportBlock } from './scripts/report-block';
import { notifications } from './scripts/notifications';
import { getHelp } from './scripts/get-help';

/** Registration order = fallback order within a category. */
export const GUIDES: GuideScript[] = [
  connectInstagram,
  connectSocials,
  discoverPeople,
  editProfile,
  verifiedBadge,
  sendMessage,
  sendRequest,
  respondRequest,
  proposeProject,
  runProject,
  signOffStage,
  payments,
  addAccount,
  switchAccount,
  getPremium,
  reportBlock,
  notifications,
  getHelp,
];

export function guideById(id: string): GuideScript | undefined {
  return GUIDES.find((g) => g.id === id);
}

/** Guides visible to a role, grouped and ordered by category for the menu. */
export function guidesForMenu(
  role: GuideRole | null | undefined,
): { category: GuideCategory; guides: GuideScript[] }[] {
  const visible = GUIDES.filter((g) => !g.roles || (role != null && g.roles.includes(role)));
  return CATEGORY_ORDER.map((category) => ({
    category,
    guides: visible.filter((g) => g.category === category),
  })).filter((s) => s.guides.length > 0);
}

/**
 * Guides whose `routes` prefix-match `path`, most-specific route first, filtered
 * by role. Used by the auto-run host: the first result is the one that surfaces.
 *
 * `path` is the raw location pathname (web) or expo-router pathname (mobile);
 * a trailing `?query` / `#hash` is ignored by the caller.
 */
export function guidesForRoute(
  path: string,
  role: GuideRole | null | undefined,
): GuideScript[] {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const scored: { g: GuideScript; len: number }[] = [];
  for (const g of GUIDES) {
    if (g.roles && !(role != null && g.roles.includes(role))) continue;
    let best = -1;
    for (const r of g.routes) {
      const route = r.replace(/\/+$/, '');
      if (clean === route || clean.startsWith(route + '/')) best = Math.max(best, route.length);
    }
    if (best >= 0) scored.push({ g, len: best });
  }
  return scored.sort((a, b) => b.len - a.len).map((s) => s.g);
}
