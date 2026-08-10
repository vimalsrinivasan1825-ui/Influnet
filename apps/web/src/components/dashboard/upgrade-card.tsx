'use client';

import React, { useState } from 'react';
import { Check, Loader2, Lock, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const PRO_FEATURES = [
  'Unlimited active projects',
  'Browse and filter creators by niche, location and reach',
  'Audience demographics and engagement data',
  'Creator contact details and published rates',
  'Full analytics history and CSV export',
  'A gold verified badge on your profile',
];

/**
 * The upgrade card. Renders the current plan, real usage against real limits,
 * and the purchase button.
 *
 * Every number shown here comes from the server (`/api/billing/entitlements`),
 * including the price — nothing about the plan is hardcoded in the bundle,
 * because a price baked into JavaScript is a price that needs a redeploy to
 * change and disagrees with the amount actually charged the moment it does.
 */
export function UpgradeCard({
  entitlements,
  onUpgraded,
}: {
  entitlements: Entitlements;
  onUpgraded?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paid plans switched off in this environment: render nothing at all. A
  // "coming soon" placeholder would be advertising a product that does not
  // exist, and the API would 404 anyone who clicked it.
  if (!entitlements.subscriptionsEnabled) return null;

  const isPro = entitlements.tier === 'pro';

  async function startUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        orderId: string;
        amount: number;
        currency: string;
        keyId: string | null;
        prefillEmail: string | null;
      }>('/api/billing/checkout', { method: 'POST' });

      if (!res.ok || !res.data) {
        setError(res.error ?? 'Could not start the upgrade.');
        return;
      }
      if (!res.data.keyId) {
        setError('Payments are not configured right now.');
        return;
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
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
        theme: { color: '#E8BE5C' },
        handler: () => {
          // NOTHING is granted here. This callback only means the browser was
          // told the payment succeeded, and a browser is not a source of truth
          // about money. The tier changes when the signed webhook confirms the
          // capture server-side, so all this does is re-read the entitlement —
          // which will show Pro once the webhook has landed.
          onUpgraded?.();
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });

      rz.on('payment.failed', (resp: any) => {
        setError(resp?.error?.description ?? 'That payment did not go through. Nothing was charged.');
        setBusy(false);
      });

      rz.open();
    } catch {
      setError('Something went wrong starting the upgrade. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (isPro) {
    const until = entitlements.currentPeriodEnd
      ? new Date(entitlements.currentPeriodEnd).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

    return (
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex items-center gap-2">
          <Badge variant="pro" size="md">
            <Sparkles /> Influnet Pro
          </Badge>
        </div>
        <p className="mt-3 text-sm text-content-soft">
          {until
            ? `Your Pro access runs until ${until}.`
            : 'Your Pro access is active.'}
          {entitlements.cancelAtPeriodEnd && ' It will not renew after that.'}
        </p>
      </div>
    );
  }

  const { limits, usage } = entitlements;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Influnet Pro</h3>
        <p className="text-sm text-content-soft">
          <span className="text-xl font-semibold text-content">
            {formatPrice(entitlements.price.paise, entitlements.price.currency)}
          </span>{' '}
          for 30 days
        </p>
      </div>

      {/* Usage against real ceilings. Shown before the feature list because
          "you are at 2 of 2 projects" is the reason someone upgrades, and a
          feature list is only persuasive once they know they are stuck. */}
      <dl className="mt-4 grid gap-2 text-sm">
        {limits.activeProjects !== null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-content-soft">Active projects</dt>
            <dd className="tabular-nums font-medium">
              {usage.activeProjects} of {limits.activeProjects}
            </dd>
          </div>
        )}
        {limits.requestsPerMonth !== null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-content-soft">Requests this month</dt>
            <dd className="tabular-nums font-medium">
              {usage.requestsThisMonth} of {limits.requestsPerMonth}
            </dd>
          </div>
        )}
      </dl>

      <ul className="mt-4 grid gap-1.5 text-sm text-content-soft">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Button onClick={startUpgrade} disabled={busy} className="mt-4 w-full">
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? 'Opening checkout…' : 'Upgrade to Pro'}
      </Button>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-content-muted">
        <Lock className="size-3" aria-hidden />
        Payment handled by Razorpay. Cancel any time.
      </p>
    </div>
  );
}
