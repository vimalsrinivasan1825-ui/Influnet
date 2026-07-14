'use client';

import React, { useState } from 'react';
import { Info, ShieldCheck, Loader2, CreditCard } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

// Razorpay Checkout global (loaded on demand).
declare global {
  interface Window {
    Razorpay?: any;
  }
}

// Public key is inlined at build time; its presence == in-app payments enabled.
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
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
 * Payment gate for a project's advance/final payment stage.
 *
 * Two modes, chosen at build time by NEXT_PUBLIC_RAZORPAY_KEY_ID:
 *  - MANUAL (default): honest notice that money moves off-platform; the business
 *    marks the checklist item done above once paid. Influnet processes nothing.
 *  - RAZORPAY (configured): the business sees a real "Pay securely" button that
 *    opens Razorpay Checkout; the signed webhook records payment + opens the gate.
 */
export function PaymentGate({
  projectId,
  stageKey,
  amountRupees,
  userRole,
  isDone,
  onPaid,
}: {
  projectId: number | string;
  stageKey: 'advance_payment' | 'final_payment';
  amountRupees?: number | null;
  userRole: 'business' | 'creator' | null;
  isDone: boolean;
  onPaid?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(RAZORPAY_KEY_ID);
  const amountLabel =
    amountRupees != null && Number.isFinite(Number(amountRupees))
      ? `₹${Number(amountRupees).toLocaleString('en-IN')}`
      : 'the agreed amount';

  // ── Manual (off-platform) mode ──────────────────────────────────────────────
  if (!configured) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-[0.6875rem] leading-relaxed text-content-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-bold text-content">Payments are handled off-platform</strong> (UPI / bank transfer)
          for {amountLabel}. Influnet does not process or hold this money. Once the transfer is done, the client marks
          the step above as complete to open the gate.
        </span>
      </div>
    );
  }

  // ── Razorpay mode ───────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-[0.6875rem] font-semibold text-ok">
        <ShieldCheck size={13} className="shrink-0" /> Payment received via Razorpay.
      </div>
    );
  }

  if (userRole !== 'business') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-[0.6875rem] text-content-muted">
        <Info size={13} className="shrink-0" /> Waiting for the client to pay {amountLabel} securely via Razorpay.
      </div>
    );
  }

  const handlePay = async () => {
    setError(null);
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        setError('Could not load the secure checkout. Check your connection and try again.');
        return;
      }

      const res = await apiFetch<{ order_id: string; amount: number; currency: string; key_id: string }>(
        `/api/projects/${projectId}/payments`,
        { method: 'POST', body: JSON.stringify({ stage_key: stageKey }) },
      );
      if (!res.ok || !res.data) {
        setError(res.error || 'Could not start the payment.');
        return;
      }

      const rzp = new window.Razorpay({
        key: res.data.key_id || RAZORPAY_KEY_ID,
        order_id: res.data.order_id,
        amount: res.data.amount,
        currency: res.data.currency,
        name: 'Influnet',
        description: stageKey === 'advance_payment' ? 'Advance / deposit' : 'Final payment',
        handler: () => {
          // The webhook is the source of truth for marking the gate paid; this
          // just refreshes the view so the user sees it update shortly after.
          onPaid?.();
        },
        modal: { ondismiss: () => setBusy(false) },
        theme: { color: '#ee3e96' },
      });
      rzp.on('payment.failed', (resp: any) => {
        setError(resp?.error?.description || 'Payment failed. Please try again.');
      });
      rzp.open();
    } catch {
      setError('Something went wrong starting the payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <Button variant="brand" size="sm" disabled={busy} onClick={handlePay} className="w-full lg:w-auto">
        {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
        Pay {amountLabel} securely
      </Button>
      <span className="text-[0.625rem] text-content-muted">Secured by Razorpay · the gate opens automatically once payment is confirmed.</span>
      {error && <span className="text-[0.625rem] font-semibold text-warn">{error}</span>}
    </div>
  );
}
