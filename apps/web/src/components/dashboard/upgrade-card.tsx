'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, Lock, Minus, Sparkles, TrendingUp } from 'lucide-react';
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
 * The comparison. Written as capabilities rather than features — "browse and
 * filter creators" tells someone what they can do, "advanced search" tells them
 * nothing. Free is listed honestly, including the things it does well, because
 * a comparison that makes Free look worthless reads as a sales pitch rather
 * than information.
 */
/**
 * Built from the SERVER's limits, never from constants.
 *
 * The numbers live in `billing_settings` precisely so they can be changed
 * without a deploy — which means a hardcoded "2 projects" here would start
 * lying the first time anybody tuned them, while the usage meters two hundred
 * pixels above kept telling the truth. Same reason packages/core carries no
 * numbers.
 */
function buildComparison(
  limits: Entitlements['limits'],
): { label: string; free: string | false; pro: string | true }[] {
  const n = (v: number | null, unit = '') => (v === null ? 'Unlimited' : `${v}${unit}`);
  return [
    { label: 'Run campaigns end to end', free: 'Unlimited', pro: true },
    { label: 'Messaging, sign-off and payments', free: 'Included', pro: true },
    { label: 'Active projects at once', free: n(limits.activeProjects), pro: 'Unlimited' },
    { label: 'Collaboration requests', free: n(limits.requestsPerMonth, ' / month'), pro: 'Unlimited' },
    { label: 'Look up a creator by handle', free: 'Included', pro: true },
    { label: 'Browse & filter by niche, location, reach', free: false, pro: true },
    { label: 'Audience demographics & engagement', free: false, pro: true },
    { label: 'Creator contact details & rates', free: false, pro: true },
    {
      label: 'Analytics history',
      free: limits.analyticsDays === null ? 'Full' : `${limits.analyticsDays} days`,
      pro: 'Full + export',
    },
    { label: 'Gold verified badge', free: false, pro: true },
  ];
}

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
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-[#E0C99B] bg-gradient-to-br from-[#FDF8EC] via-[#FBF3E4] to-[#F6E9CC] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {/* Ambient sheen. Decorative only, and behind the content. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-[radial-gradient(circle,rgba(240,200,110,0.55),transparent_65%)]"
          />
          <div className="relative">
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
        <PlanComparison highlight="pro" limits={entitlements.freeLimits} />
      </div>
    );
  }

  // ── Free ─────────────────────────────────────────────────────────────────
  const atAnyCap =
    (limits.activeProjects !== null && usage.activeProjects >= limits.activeProjects) ||
    (limits.requestsPerMonth !== null && usage.requestsThisMonth >= limits.requestsPerMonth);

  return (
    <div className="space-y-4">
      {/* Where you are now */}
      <div className="rounded-2xl border border-hairline bg-surface-card p-6">
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

        {(limits.activeProjects !== null || limits.requestsPerMonth !== null) && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {limits.activeProjects !== null && (
              <UsageMeter label="Active projects" used={usage.activeProjects} limit={limits.activeProjects} />
            )}
            {limits.requestsPerMonth !== null && (
              <UsageMeter label="Requests this month" used={usage.requestsThisMonth} limit={limits.requestsPerMonth} />
            )}
          </div>
        )}
      </div>

      {/* The offer */}
      <div className="overflow-hidden rounded-2xl border border-[#E0C99B] bg-surface-card">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#FDF8EC] to-[#F6E9CC] px-6 py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-[radial-gradient(circle,rgba(240,200,110,0.5),transparent_65%)]"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[#8A5A08]">
                <Sparkles className="size-3" /> Influnet Pro
              </span>
              <h3 className="mt-1.5 text-lg font-extrabold tracking-tight text-[#4A3405]">
                Find creators, not just look them up
              </h3>
            </div>
            <p className="text-[#6B4A05]">
              <span className="text-3xl font-extrabold tracking-tight text-[#4A3405]">
                {formatPrice(entitlements.price.paise, entitlements.price.currency)}
              </span>
              <span className="ml-1.5 text-sm">for 30 days</span>
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            onClick={startUpgrade}
            disabled={busy}
            className="w-full bg-gradient-to-r from-[#E0A526] to-[#C98C13] text-white shadow-[0_0_16px_-4px_rgba(224,165,38,0.9)] hover:from-[#EBB33A] hover:to-[#D69A1D]"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? 'Opening checkout…' : 'Upgrade to Pro'}
          </Button>
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-content-muted">
            <Lock className="size-3" aria-hidden />
            Secure payment by Razorpay · Cancel any time
          </p>
        </div>
      </div>

      <PlanComparison highlight="free" limits={entitlements.freeLimits} />
    </div>
  );
}

/** Free vs Pro, side by side. The thing that makes a price feel like a choice. */
function PlanComparison({
  highlight,
  limits,
}: {
  highlight: 'free' | 'pro';
  limits: Entitlements['limits'];
}) {
  const rows = buildComparison(limits);
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className="border-b border-hairline px-6 py-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-content-muted">
          What changes
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="px-6 py-3 text-left font-semibold text-content-soft">Capability</th>
              <th
                className={cn(
                  'w-28 px-3 py-3 text-center font-bold',
                  highlight === 'free' ? 'text-content' : 'text-content-muted',
                )}
              >
                Free
              </th>
              <th
                className={cn(
                  'w-32 px-3 py-3 text-center font-bold',
                  highlight === 'pro' ? 'text-[#8A5A08]' : 'text-[#8A5A08]',
                )}
              >
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-hairline last:border-0">
                <td className="px-6 py-3 text-content-soft">{row.label}</td>
                <td className="px-3 py-3 text-center">
                  {row.free === false ? (
                    <Minus className="mx-auto size-4 text-content-muted" aria-label="Not included" />
                  ) : (
                    <span className="font-medium text-content">{row.free}</span>
                  )}
                </td>
                <td className={cn('px-3 py-3 text-center', highlight === 'pro' && 'bg-[#FBF3E4]/60')}>
                  {row.pro === true ? (
                    <Check className="mx-auto size-4 text-ok" aria-label="Included" />
                  ) : (
                    <span className="font-semibold text-[#8A5A08]">{row.pro}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-hairline px-6 py-3 text-xs text-content-muted">
        Sign-off, payments, blocking and reporting are free on every plan, always.
      </p>
    </div>
  );
}
