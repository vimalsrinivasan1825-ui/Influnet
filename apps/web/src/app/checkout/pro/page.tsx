'use client';

/**
 * Standalone Pro checkout host — exists to serve the MOBILE app.
 *
 * The mobile app has no React Native Razorpay SDK, so it opens this page in an
 * in-app browser session (`WebBrowser.openAuthSessionAsync`), lets the user pay
 * in the real Razorpay sheet, and is handed back control by the deep-link
 * redirect at the end. The web dashboard has its own in-page checkout
 * (components/dashboard/upgrade-card.tsx) and never routes here.
 *
 * ── What is safe to pass in the URL ──────────────────────────────────────
 * `order` is an opaque Razorpay id already bound to the buyer server-side
 * (`notes.user_id`, set from the authenticated session in createProOrder), so
 * it cannot be pointed at another account. `amount`/`currency`/`key` are not
 * secret — the key id is the publishable one and Razorpay validates the amount
 * against the order regardless. No email or token goes in the URL.
 *
 * ── This page grants NOTHING ─────────────────────────────────────────────
 * Payment success here only means the browser was told the capture succeeded.
 * The tier changes when the signed webhook confirms it (see
 * lib/payments/subscription.ts). The app re-checks entitlements on return.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const DEFAULT_RETURN = 'influnet://billing-return';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Only ever bounce back into the app itself. `influnet://` is the production
 * scheme; `exp://` and `*.exp.direct` are Expo's dev-client / tunnel forms, so
 * a developer testing the flow lands back in the running app rather than
 * nowhere. Anything else (http(s), other schemes) is refused — this redirect
 * only navigates the browser, but an open redirect is still not worth leaving.
 */
function safeReturn(raw: string | null): string {
  if (!raw) return DEFAULT_RETURN;
  if (raw.startsWith('influnet://') || raw.startsWith('exp://')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && u.hostname.endsWith('.exp.direct')) return raw;
  } catch {
    /* not a URL — fall through */
  }
  return DEFAULT_RETURN;
}

function ProCheckoutInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const orderId = params.get('order');
  const amount = Number(params.get('amount'));
  const currency = params.get('currency') || 'INR';
  const keyId = params.get('key');
  const returnUrl = safeReturn(params.get('return'));

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    function bounce(query: string) {
      window.location.href = `${returnUrl}?${query}`;
    }

    (async () => {
      if (!orderId || !keyId || !Number.isFinite(amount) || amount <= 0) {
        setStatus('error');
        setMessage('This checkout link is missing information. Go back and try again.');
        return;
      }

      if (!(await loadRazorpay())) {
        setStatus('error');
        setMessage('Could not reach the payment provider. Check your connection and try again.');
        return;
      }

      setStatus('ready');

      const rz = new window.Razorpay({
        key: keyId,
        order_id: orderId,
        amount,
        currency,
        name: 'Influnet Pro',
        description: 'Influnet Pro — 30 days',
        theme: { color: '#E0A526' },
        handler: (resp: any) => {
          bounce(
            `status=paid&payment_id=${encodeURIComponent(resp?.razorpay_payment_id ?? '')}`,
          );
        },
        modal: {
          ondismiss: () => bounce('status=cancelled'),
        },
      });
      rz.on('payment.failed', (r: any) => {
        const desc = r?.error?.description ?? 'That payment did not go through. Nothing was charged.';
        bounce(`status=failed&reason=${encodeURIComponent(desc)}`);
      });
      rz.open();
    })();
  }, [orderId, keyId, amount, currency, returnUrl]);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {status === 'error' ? (
        <>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Checkout unavailable</h1>
          <p style={{ color: '#555', maxWidth: 320 }}>{message}</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Opening secure checkout…</h1>
          <p style={{ color: '#555' }}>Powered by Razorpay</p>
        </>
      )}
    </main>
  );
}

export default function ProCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <ProCheckoutInner />
    </Suspense>
  );
}
