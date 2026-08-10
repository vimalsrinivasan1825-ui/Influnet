'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';
import { useEntitlements } from '@/lib/hooks/use-entitlements';
import { formatPrice } from '@influnet/core';
import { cn } from '@/lib/utils';

/**
 * The "you're near a limit" prompt.
 *
 * ── Why this is frequency-capped ──────────────────────────────────────────
 * An upsell that appears every time someone opens a page stops being
 * information and becomes noise — people learn to dismiss it without reading,
 * which costs you the one moment it would actually have converted. So:
 *
 *   • It only appears once usage crosses 75% of a real limit. Below that there
 *     is nothing to warn about and the message would just be an advert.
 *   • Dismissing it silences that specific prompt for days, not for the page
 *     load. The window is stored per reason, so clearing the "projects" nudge
 *     does not also hide a later "requests" one.
 *   • Only ONE shows at a time, the most urgent.
 *
 * ── Why "at your limit" is treated differently ────────────────────────────
 * Being AT a cap is not an advert, it is the explanation for why the button
 * they just pressed did nothing. That earns a shorter silence (1 day) than the
 * softer heads-up (7 days), because suppressing it for a week would leave
 * someone stuck with no visible reason.
 */

const STORAGE_KEY = 'influnet:plan-nudge';
const NEAR_LIMIT_RATIO = 0.75;
const SNOOZE_NEAR_DAYS = 7;
const SNOOZE_AT_CAP_DAYS = 1;

/**
 * Dismissing ANY nudge also silences ALL of them for a day.
 *
 * Without this, closing the "projects" prompt immediately drops the "requests"
 * prompt into the same spot — which is precisely the whack-a-mole that teaches
 * people to dismiss without reading. One "not now" should mean not now, not
 * "show me the next one".
 */
const QUIET_ALL_KEY = '__any';
const QUIET_ALL_DAYS = 1;

type Reason = 'projects' | 'requests';

function readSnooze(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // Corrupt or unavailable storage (private mode, quota) must never break the
    // page — the worst case is the nudge shows when it could have stayed quiet.
    return {};
  }
}

function writeSnooze(reason: Reason, days: number): void {
  if (typeof window === 'undefined') return;
  try {
    const all = readSnooze();
    all[reason] = Date.now() + days * 86_400_000;
    // Never shorten an existing quiet period — a second dismissal today should
    // not reset tomorrow's silence to a fresh (and therefore later) one.
    all[QUIET_ALL_KEY] = Math.max(
      all[QUIET_ALL_KEY] ?? 0,
      Date.now() + QUIET_ALL_DAYS * 86_400_000,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — dismissal lasts for this page view only */
  }
}

/** Which prompts are currently silenced, resolved ONCE against the clock. */
interface QuietState {
  quietAll: boolean;
  quietReasons: Reason[];
}

export function PlanNudge({ className }: { className?: string }) {
  const { entitlements, loading } = useEntitlements();
  // Resolved in an effect, never during render, for two reasons: localStorage
  // does not exist on the server (reading it while rendering would make the
  // markup differ between server and client and trip a hydration error), and
  // `Date.now()` during render is impure — the same component could decide
  // differently on two renders with identical props.
  const [quiet, setQuiet] = useState<QuietState | null>(null);
  const [dismissed, setDismissed] = useState<Reason[]>([]);

  useEffect(() => {
    const snoozed = readSnooze();
    const now = Date.now();
    setQuiet({
      quietAll: (snoozed[QUIET_ALL_KEY] ?? 0) > now,
      quietReasons: (['projects', 'requests'] as Reason[]).filter(
        (r) => (snoozed[r] ?? 0) > now,
      ),
    });
  }, []);

  if (loading || quiet === null || !entitlements) return null;
  if (!entitlements.subscriptionsEnabled) return null;
  if (entitlements.tier === 'pro') return null;
  // A recent "not now" silences every prompt, not just the one that was closed.
  if (quiet.quietAll) return null;
  if (dismissed.length > 0) return null;

  const { limits, usage } = entitlements;

  const candidates: {
    reason: Reason;
    used: number;
    limit: number;
    atCap: boolean;
    title: string;
    body: string;
  }[] = [];

  if (limits.activeProjects !== null) {
    const atCap = usage.activeProjects >= limits.activeProjects;
    if (usage.activeProjects >= limits.activeProjects * NEAR_LIMIT_RATIO) {
      candidates.push({
        reason: 'projects',
        used: usage.activeProjects,
        limit: limits.activeProjects,
        atCap,
        title: atCap
          ? `You're using all ${limits.activeProjects} of your active projects`
          : `${usage.activeProjects} of ${limits.activeProjects} active projects used`,
        body: atCap
          ? 'Finish or archive a project to start another — or go Pro for unlimited campaigns running at once.'
          : 'Free accounts can run two campaigns at a time. Pro removes the limit.',
      });
    }
  }

  if (limits.requestsPerMonth !== null) {
    const atCap = usage.requestsThisMonth >= limits.requestsPerMonth;
    if (usage.requestsThisMonth >= limits.requestsPerMonth * NEAR_LIMIT_RATIO) {
      candidates.push({
        reason: 'requests',
        used: usage.requestsThisMonth,
        limit: limits.requestsPerMonth,
        atCap,
        title: atCap
          ? "You've used every request this month"
          : `${usage.requestsThisMonth} of ${limits.requestsPerMonth} requests used this month`,
        body: atCap
          ? 'Your allowance resets next month. Pro lets you keep reaching out now.'
          : 'Pro removes the monthly cap on reaching out to creators.',
      });
    }
  }

  // Most urgent first: at a cap beats approaching one.
  const pick = candidates
    .filter((c) => !dismissed.includes(c.reason))
    .filter((c) => !quiet.quietReasons.includes(c.reason))
    .sort((a, b) => Number(b.atCap) - Number(a.atCap))[0];

  if (!pick) return null;

  function dismiss(reason: Reason, atCap: boolean) {
    writeSnooze(reason, atCap ? SNOOZE_AT_CAP_DAYS : SNOOZE_NEAR_DAYS);
    setDismissed((d) => [...d, reason]);
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border px-4 py-3.5',
        pick.atCap
          ? 'border-[#E0C99B] bg-gradient-to-r from-[#FDF8EC] to-[#FBF3E4]'
          : 'border-hairline bg-surface-card',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
            pick.atCap ? 'bg-[#F3D890] text-[#6B4A05]' : 'bg-surface-muted text-content-soft',
          )}
        >
          <Sparkles className="size-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-bold', pick.atCap ? 'text-[#4A3405]' : 'text-content')}>
            {pick.title}
          </p>
          <p className={cn('mt-0.5 text-sm', pick.atCap ? 'text-[#6B4A05]' : 'text-content-soft')}>
            {pick.body}
          </p>
          <Link
            href="/dashboard/billing"
            className={cn(
              'mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              pick.atCap
                ? 'bg-gradient-to-r from-[#E0A526] to-[#C98C13] text-white hover:from-[#EBB33A] hover:to-[#D69A1D]'
                : 'bg-surface-muted text-content hover:bg-hairline',
            )}
          >
            <Sparkles className="size-3" />
            See Pro — {formatPrice(entitlements.price.paise, entitlements.price.currency)}/month
          </Link>
        </div>

        <button
          type="button"
          onClick={() => dismiss(pick.reason, pick.atCap)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
