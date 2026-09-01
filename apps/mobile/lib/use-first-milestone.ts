/**
 * First-time moments: the one card that fires when a number leaves zero.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The empty states elsewhere in Home solve "there is nothing here yet". This
 * solves the moment immediately after, which is the more valuable one and the
 * easier one to miss entirely.
 *
 * A creator's first profile view currently arrives as a tile quietly changing
 * from "--" to "1" somewhere down the screen. Nobody notices that. But it is
 * the single most important event in the account's life — it is the first
 * evidence the product works at all, and it is the difference between "I signed
 * up for a thing" and "this is working". A number that changes silently teaches
 * nothing; a number announced once teaches that opening the app is worth it.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────
 *
 *  - ONE milestone at a time, the most significant unannounced one. Two
 *    congratulation cards stacked on one screen is a confetti cannon, and it
 *    devalues both.
 *  - ONCE, ever. Announced state is persisted per account, so a cold start
 *    does not re-congratulate someone on a view they saw last week.
 *  - Only the 0 → first transition. "You have 47 views" is a statistic and it
 *    already has a tile; "your first view" is news.
 *  - Nothing renders until storage answers. Rendering optimistically flashes a
 *    celebration at someone who has already dismissed it, which is worse than
 *    showing it a beat late.
 *
 * AsyncStorage rather than a column, for the same reason as
 * use-verification-nudge.ts: the server-side equivalent needs a migration, and
 * migrations reach the hosted databases well after the code does. The cost is
 * that a second device may re-announce, which is the acceptable direction for
 * something whose failure mode is a repeated congratulation.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Ordered by significance, most significant first — see `pick` below. */
export type MilestoneKey = 'first_payment' | 'first_project' | 'first_request' | 'first_view';

export interface Milestone {
  key: MilestoneKey;
  title: string;
  body: string;
  /** Where the card sends them. Always somewhere that shows more of the thing. */
  href: string;
  cta: string;
}

/**
 * The facts a milestone is decided from. All optional: a backend that cannot
 * report one of these must not be treated as reporting zero, or every account
 * on an older deploy gets congratulated on a first view it did not have.
 */
export interface MilestoneFacts {
  profileViews?: number | null;
  requestsReceived?: number | null;
  projects?: number | null;
  earned?: number | null;
  isCreator: boolean;
}

const STORAGE_PREFIX = 'influnet:milestones-seen:';

/**
 * Copy per milestone.
 *
 * Every body line does one job: say what just happened, then say what it means.
 * "You got your first profile view" is the event; "someone searched, found you
 * and stopped to look" is why it matters, and the second half is the part that
 * makes it feel like progress rather than a log line.
 */
function describe(key: MilestoneKey, isCreator: boolean): Milestone {
  switch (key) {
    case 'first_view':
      return {
        key,
        title: 'You got your first profile view',
        body: isCreator
          ? 'Someone searched, found you, and stopped to look. Keep your profile sharp — this is how collabs start.'
          : 'A creator looked you up. They check who is asking before they reply.',
        href: '/profile',
        cta: 'See your profile',
      };
    case 'first_request':
      return {
        key,
        title: isCreator ? 'Your first collab request' : 'Your first request went out',
        body: isCreator
          ? 'A brand wants to work with you. Read the terms and reply — the first one is the hardest to get.'
          : 'You have reached out to a creator. Replies usually come within a couple of days.',
        href: '/requests',
        cta: 'Open requests',
      };
    case 'first_project':
      return {
        key,
        title: 'Your first project is live',
        body: 'Twelve stages from here to paid, and the app walks you through every one. Nothing moves without both sides agreeing.',
        href: '/projects',
        cta: 'Open the project',
      };
    case 'first_payment':
      return {
        key,
        title: isCreator ? 'You got paid' : 'Your first payment cleared',
        body: isCreator
          ? 'Money has settled through Influnet for the first time. It shows in Earnings from now on.'
          : 'The payment cleared and the creator has been notified.',
        href: '/projects',
        cta: 'See the details',
      };
  }
}

/**
 * The most significant unannounced milestone, or null.
 *
 * Order is money → project → request → view, which is reverse chronological in
 * practice: someone who just got paid passed all three earlier gates, and
 * congratulating them on their first profile view at that moment would be
 * absurd. Picking the furthest-along one also means an account that installs
 * the app late, with history already behind it, gets one card rather than four.
 */
function pick(facts: MilestoneFacts, seen: Set<string>): Milestone | null {
  const reached: MilestoneKey[] = [];
  // `> 0` and not `!= null`: null means unreadable and must never count as a
  // milestone. Zero means it genuinely has not happened.
  if ((facts.earned ?? 0) > 0) reached.push('first_payment');
  if ((facts.projects ?? 0) > 0) reached.push('first_project');
  if ((facts.requestsReceived ?? 0) > 0) reached.push('first_request');
  if ((facts.profileViews ?? 0) > 0) reached.push('first_view');

  const next = reached.find((k) => !seen.has(k));
  return next ? describe(next, facts.isCreator) : null;
}

export function useFirstMilestone(
  userId: string | null | undefined,
  facts: MilestoneFacts,
): { milestone: Milestone | null; acknowledge: () => void } {
  // `null` while unread — see the note about flashing above.
  const [seen, setSeen] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setSeen(null);
      return;
    }
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_PREFIX + userId).catch(() => null);
      if (cancelled) return;
      setSeen(new Set(raw ? raw.split(',').filter(Boolean) : []));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const milestone = seen ? pick(facts, seen) : null;

  /**
   * Mark the current milestone announced.
   *
   * Everything BELOW it is marked too. Someone whose first visible event is a
   * payment has self-evidently had a first view and a first project, and
   * leaving those unmarked would queue up three stale congratulations to fire
   * on the next three launches.
   */
  const acknowledge = useCallback(() => {
    if (!milestone || !seen) return;
    const order: MilestoneKey[] = [
      'first_payment',
      'first_project',
      'first_request',
      'first_view',
    ];
    const from = order.indexOf(milestone.key);
    const next = new Set(seen);
    for (const k of order.slice(from)) next.add(k);

    setSeen(next);
    if (userId) {
      void AsyncStorage.setItem(STORAGE_PREFIX + userId, [...next].join(',')).catch(() => {});
    }
  }, [milestone, seen, userId]);

  return { milestone, acknowledge };
}
