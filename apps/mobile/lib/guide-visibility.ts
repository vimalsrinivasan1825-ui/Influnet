/**
 * Guides a store build must not show.
 *
 * `get-premium` walks through "Tap Upgrade — ₹499/mo". Store builds can't sell
 * Pro (HIDE_PRO_PURCHASE — Apple 3.1.1, Google Payments policy), and a tutorial
 * for a purchase the app doesn't offer reads to a reviewer as steering users to
 * buy elsewhere. It also auto-runs on /billing, so hiding the CTA alone wasn't
 * enough. Every mobile guide list goes through this.
 */
import type { GuideScript } from '@influnet/core';
import { HIDE_PRO_PURCHASE } from '@/lib/use-upgrade';

const HIDDEN: ReadonlySet<string> = new Set(HIDE_PRO_PURCHASE ? ['get-premium'] : []);

export const isGuideVisible = (g: Pick<GuideScript, 'id'>): boolean => !HIDDEN.has(g.id);
