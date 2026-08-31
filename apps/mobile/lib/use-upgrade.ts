/**
 * The Pro upgrade flow for mobile.
 *
 * There is no React Native Razorpay SDK in this app (same reason project
 * payments deep-link out — see projects/[id]/stage/[stage].tsx). So the flow
 * is: mint the order with an authenticated call, hand its non-secret fields to
 * the web `/checkout/pro` host page, open that in an in-app browser session,
 * and let the deep-link redirect at the end return control here.
 *
 * Nothing is granted client-side. A `paid` return only means the Razorpay
 * sheet reported success; the tier flips when the signed webhook confirms the
 * capture. So on a `paid` return we poll `refresh()` a few times to catch the
 * webhook, and tell the caller it may take a moment either way.
 */
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { endpoints } from './api';
import { API_BASE_URL } from './supabase';
import { logger } from './logger';
import { useEntitlementsStore } from './use-entitlements';

interface CheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  prefillEmail: string | null;
}

export type UpgradeOutcome =
  | { status: 'paid' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'already_pro' };

async function pollForPro(attempts = 6, delayMs = 2500): Promise<void> {
  const { load } = useEntitlementsStore.getState();
  for (let i = 0; i < attempts; i++) {
    await load({ force: true });
    if (useEntitlementsStore.getState().entitlements?.tier === 'pro') return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

export function useUpgrade() {
  const [busy, setBusy] = useState(false);

  const upgrade = useCallback(async (): Promise<UpgradeOutcome> => {
    if (busy) return { status: 'cancelled' };
    setBusy(true);
    try {
      const res = await endpoints.startProCheckout<CheckoutOrder>();

      if (res.status === 409) return { status: 'already_pro' };
      if (res.status === 404) {
        return { status: 'unavailable', message: 'Pro is not available in this app yet.' };
      }
      if (!res.ok || !res.data) {
        return {
          status: 'unavailable',
          message: res.error ?? 'Could not start the upgrade. Please try again.',
        };
      }
      if (!res.data.keyId) {
        return { status: 'unavailable', message: 'Payments are not configured right now.' };
      }

      const returnUrl = Linking.createURL('billing-return');
      const q = new URLSearchParams({
        order: res.data.orderId,
        amount: String(res.data.amount),
        currency: res.data.currency,
        key: res.data.keyId,
        return: returnUrl,
      });
      const url = `${API_BASE_URL}/checkout/pro?${q.toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

      if (result.type !== 'success' || !result.url) {
        // dismissed / cancel / os-close — all "user backed out"
        return { status: 'cancelled' };
      }

      const parsed = Linking.parse(result.url);
      const status = String(parsed.queryParams?.status ?? '');

      if (status === 'paid') {
        await pollForPro();
        return { status: 'paid' };
      }
      if (status === 'failed') {
        return {
          status: 'failed',
          message: String(parsed.queryParams?.reason ?? 'That payment did not go through.'),
        };
      }
      return { status: 'cancelled' };
    } catch (err) {
      logger.warn('[upgrade] flow threw', { err });
      return { status: 'unavailable', message: 'Something went wrong. Please try again.' };
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { upgrade, busy };
}
