'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, Lock, Sparkles, TrendingUp } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPrice, type Entitlements } from '@influnet/core';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * What each plan includes, written as bullet lists rather than a table row by
 * row — the two cards ARE the comparison now, so a capability only needs to
 * appear once, on the side it belongs to.
 *
 * Built from the SERVER's limits, never from constants. The numbers live in
 * `billing_settings` precisely so they can be changed without a deploy — a
 * hardcoded "2 projects" here would start lying the first time anybody tuned
 * them, while the usage meters above kept telling the truth. Same reason
 * packages/core carries no numbers.
 */
function freeFeatures(limits: Entitlements['limits']): string[] {
  const n = (v: number | null) => (v === null ? 'Unlimited' : v);
  return [
    'Run campaigns end to end',
    // Requests are unlimited on every plan (migration 117) — what's capped
    // is turning one into a project, not sending it.
    'Unlimited collaboration requests',
    'Messaging, sign-off and payments',
    `${n(limits.activeProjects)} active project${limits.activeProjects === 1 ? '' : 's'} at once`,
    limits.projectConversions === null
      ? 'Unlimited project conversions'
      : `${limits.projectConversions} project${limits.projectConversions === 1 ? '' : 's'} converted from a request, ever`,
    'Look up a creator by handle',
    limits.analyticsDays === null ? 'Full analytics history' : `${limits.analyticsDays}-day analytics history`,
  ];
}

const PRO_FEATURES = [
  'Unlimited active projects',
  'Unlimited project conversions',
  'Browse & filter creators by niche, location, reach',
  'Audience demographics & engagement data',
  'Creator contact details & rates',
  'Full analytics history, with export',
  'Gold verified badge',
];

/** A usage bar. Turns amber at 75% and red once the ceiling is reached. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const atCap = used >= limit;
  const near = !atCap && pct >= 75;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-content-soft">{label}</span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            atCap ? 'text-danger' : near ? 'text-warn' : 'text-content',
          )}
        >
          {used} <span className="text-content-muted">of {limit}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            atCap ? 'bg-danger' : near ? 'bg-warn' : 'bg-brand',
          )}
          style={{ width: `${Math.max(pct, used > 0 ? 6 : 0)}%` }}
        />
      </div>
      {atCap && (
        <p className="mt-1.5 text-xs text-danger">
          You have reached this limit. Upgrade to keep going.
        </p>
      )}
    </div>
  );
}

export function UpgradeCard({
  entitlements,
  onUpgraded,
}: {
  entitlements: Entitlements;
  onUpgraded?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clock-derived values are resolved after mount, never during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  if (!entitlements.subscriptionsEnabled) return null;

  const isPro = entitlements.tier === 'pro';
  const { limits, usage } = entitlements;

  async function startUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        orderId: string; amount: number; currency: string;
        keyId: string | null; prefillEmail: string | null;
      }>('/api/billing/checkout', { method: 'POST' });

      if (!res.ok || !res.data) { setError(res.error ?? 'Could not start the upgrade.'); return; }
      if (!res.data.keyId) { setError('Payments are not configured right now.'); return; }

      if (!(await loadRazorpayScript())) {
        setError('Could not reach the payment provider. Check your connection and try again.');
        return;
      }

      const rz = new window.Razorpay({
        key: res.data.keyId,
        order_id: res.data.orderId,
        amount: res.data.amount,
        currency: res.data.currency,
        name: 'Influnet Pro',
        description: 'Influnet Pro — 30 days',
        prefill: res.data.prefillEmail ? { email: res.data.prefillEmail } : undefined,
        theme: { color: '#E0A526' },
        // Nothing is granted here. This only means the browser was told the
        // payment succeeded, and a browser is not a source of truth about
        // money — the tier changes when the signed webhook confirms the capture.
        handler: () => onUpgraded?.(),
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on('payment.failed', (r: any) =>
        setError(r?.error?.description ?? 'That payment did not go through. Nothing was charged.'));
      rz.open();
    } catch {
      setError('Something went wrong starting the upgrade. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Pro ──────────────────────────────────────────────────────────────────
  if (isPro) {
    const until = entitlements.currentPeriodEnd
      ? new Date(entitlements.currentPeriodEnd).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null;
    // `Date.now()` during render is impure — two renders with identical props
    // could disagree. Resolved once after mount instead, which also avoids a
    // server/client mismatch on a value derived from the clock.
    const daysLeft = now === null || !entitlements.currentPeriodEnd
      ? null
      : Math.max(0, Math.ceil((new Date(entitlements.currentPeriodEnd).getTime() - now) / 86_400_000));

    return (
      <div className="pro-shine relative overflow-hidden rounded-2xl border border-[#E0C99B] bg-gradient-to-br from-[#FDF8EC] via-[#FBF3E4] to-[#F6E9CC] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
        {/* Ambient glow. Decorative only, and behind the content and the shine sweep. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-[radial-gradient(circle,rgba(240,200,110,0.55),transparent_65%)]"
        />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0C99B] bg-white/70 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[#8A5A08] shadow-[0_0_10px_-2px_rgba(224,165,38,0.7)]">
              <Sparkles className="size-3" /> Influnet Pro
            </span>
            <h3 className="mt-3 text-xl font-extrabold tracking-tight text-[#4A3405]">
              Everything is unlocked
            </h3>
            <p className="mt-1 text-sm text-[#6B4A05]">
              {until ? `Your access runs until ${until}.` : 'Your access is active.'}
              {entitlements.cancelAtPeriodEnd && ' It will not renew after that.'}
            </p>
            {daysLeft !== null && daysLeft <= 7 && !entitlements.cancelAtPeriodEnd && (
              <p className="mt-2 text-sm font-semibold text-[#8A5A08]">
                {daysLeft === 0 ? 'Expires today.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`}
              </p>
            )}
          </div>
        </div>

        <ul className="relative z-10 mt-6 grid gap-x-6 gap-y-2.5 border-t border-[#E0C99B]/60 pt-6 sm:grid-cols-2">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#5B3E05]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-[#8A5A08]" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── Free ─────────────────────────────────────────────────────────────────
  const atAnyCap =
    (limits.activeProjects !== null && usage.activeProjects >= limits.activeProjects) ||
    (limits.projectConversions !== null && usage.projectConversions >= limits.projectConversions);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* Free — small, plain, current plan */}
      <div className="flex flex-col rounded-2xl border border-hairline bg-surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
              Current plan
            </span>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-content">Free</h3>
          </div>
          {atAnyCap && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-danger">
              <TrendingUp className="size-3" /> At your limit
            </span>
          )}
        </div>

        {(limits.activeProjects !== null || limits.projectConversions !== null) && (
          <div className="mt-5 space-y-4">
            {limits.activeProjects !== null && (
              <UsageMeter label="Active projects" used={usage.activeProjects} limit={limits.activeProjects} />
            )}
            {limits.projectConversions !== null && (
              <UsageMeter
                label="Projects converted, ever"
                used={usage.projectConversions}
                limit={limits.projectConversions}
              />
            )}
            {/* Both meters count what YOU own as a business. A creator
                account never owns a project — see get_entitlements() — so
                these stay at 0 for that role, on every plan. That is the
                mechanism working, not stale data. Requests themselves are
                never limited (migration 117); it's only converting one into
                a running project that's capped. */}
            <p className="text-xs leading-relaxed text-content-muted">
              Active projects counts campaigns you're running right now.
              Projects converted is a lifetime count and never resets —
              sending requests is always unlimited.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-hairline pt-5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
            What&apos;s included
          </p>
          <ul className="mt-3 space-y-2.5">
            {freeFeatures(limits).map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-content-soft">
                <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pro — large, golden, animated */}
      <div className="pro-shine relative flex flex-col overflow-hidden rounded-2xl border border-[#E0C99B] bg-gradient-to-br from-[#FDF8EC] via-[#FBF3E4] to-[#F6E9CC] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[radial-gradient(circle,rgba(240,200,110,0.5),transparent_65%)]"
        />

        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0C99B] bg-white/70 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[#8A5A08] shadow-[0_0_10px_-2px_rgba(224,165,38,0.7)]">
              <Sparkles className="size-3" /> Influnet Pro
            </span>
            <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-[#4A3405] sm:text-3xl">
              Find creators, not just look them up
            </h3>
          </div>
          <p className="shrink-0 text-[#6B4A05] sm:text-right">
            <span className="text-5xl font-extrabold tracking-tight text-[#4A3405] sm:text-6xl">
              {formatPrice(entitlements.price.paise, entitlements.price.currency)}
            </span>
            <span className="ml-1.5 block text-sm sm:mt-1 sm:inline-block">for 30 days</span>
          </p>
        </div>

        <ul className="relative z-10 mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-base font-medium text-[#5B3E05]">
              <Check className="mt-0.5 size-4 shrink-0 text-[#8A5A08]" aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <div className="relative z-10 mt-10 border-t border-[#E0C99B]/60 pt-6">
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            onClick={startUpgrade}
            disabled={busy}
            size="xl"
            className="h-14 w-full gap-2.5 rounded-xl bg-gradient-to-r from-[#E0A526] to-[#C98C13] px-8 text-base font-bold text-white shadow-[0_8px_24px_-6px_rgba(224,165,38,0.9)] hover:from-[#EBB33A] hover:to-[#D69A1D] sm:w-auto [&_svg]:size-5"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? 'Opening checkout…' : 'Upgrade to Pro'}
          </Button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-content-muted">
            <Lock className="size-3" aria-hidden />
            Secure payment by Razorpay · Cancel any time
          </p>
        </div>
      </div>
    </div>
  );
}
