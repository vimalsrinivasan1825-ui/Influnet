/**
 * Pro subscription purchase — server-only.
 *
 * ── Why Orders and not the Subscriptions API (for now) ────────────────────
 * Razorpay's Subscriptions API is the right long-term rail for India: UPI
 * AutoPay and e-mandate handle RBI's pre-debit notification rules, and a
 * mandate charges up to ₹15,000 a cycle without re-authentication, which
 * covers ₹999 many times over. It also needs a Plan created in the dashboard
 * and a mandate registration flow, neither of which can be exercised from the
 * sandbox without that dashboard setup.
 *
 * So this ships on Orders: ₹999 buys a fixed period of Pro, paid again when it
 * runs out. It is testable end-to-end in test mode today, and the schema was
 * written to accept either — `razorpay_subscription_id` is nullable and
 * `current_period_end` means the same thing under both models. Moving to real
 * recurring billing later changes which events arrive, not what a tier is.
 *
 * ── The one rule ──────────────────────────────────────────────────────────
 * The amount is read from `billing_settings` on the SERVER. It is never taken
 * from the request, and the checkout route never accepts one. A client that
 * could name its own price is not a paywall — this is the same discipline the
 * project payment gates already use.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRazorpayOrder, razorpayPublicKeyId } from './razorpay';
import { logger } from '@/lib/logger';

/**
 * Marks an order as buying Pro rather than paying for a project. Both kinds of
 * payment arrive on the SAME webhook endpoint, and this is what tells them
 * apart — see handleSubscriptionEvent below.
 */
export const PRO_ORDER_PURPOSE = 'pro_subscription';

/** How long one ₹999 payment grants. Fixed days, not calendar months, so the
 *  expiry is arithmetic rather than a timezone argument about what "a month
 *  after the 31st" means. */
export const PRO_PERIOD_DAYS = 30;

/**
 * How long Pro survives after the period ends without a renewal.
 *
 * Mandate debits fail often in India — an expired card, a paused UPI mandate,
 * insufficient balance at 3am. Cutting a brand off from a campaign already in
 * flight the hour a retry fails costs us far more than a few days of unpaid
 * access costs. Applies on renewal failure, not on a deliberate cancellation.
 */
export const GRACE_DAYS = 5;

export interface ProPricing {
  paise: number;
  currency: string;
}

/** Reads the authoritative price. Never trust a client for this. */
export async function getProPricing(supabase: SupabaseClient): Promise<ProPricing> {
  const { data, error } = await supabase
    .from('billing_settings')
    .select('pro_price_paise, pro_currency')
    .maybeSingle();

  if (error || !data) {
    // No safe default exists: guessing low undercharges, guessing high
    // overcharges a real card. Refuse instead.
    throw new Error('Could not read subscription pricing');
  }
  return { paise: data.pro_price_paise as number, currency: data.pro_currency as string };
}

/**
 * Creates the Razorpay order that the browser checkout opens.
 *
 * `notes.user_id` is what lets the webhook map a payment back to a user. It is
 * set here, server-side, from the authenticated session — a client-supplied
 * user id would let anyone buy Pro for (or as) somebody else.
 */
export async function createProOrder(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ orderId: string; amount: number; currency: string; keyId: string | null }> {
  const price = await getProPricing(supabase);

  const order = await createRazorpayOrder({
    amount: price.paise,
    currency: price.currency,
    // Razorpay caps receipts at 40 characters.
    receipt: `pro_${userId.slice(0, 8)}_${Date.now().toString(36)}`,
    notes: {
      purpose: PRO_ORDER_PURPOSE,
      user_id: userId,
    },
  });

  logger.info('pro subscription order created', { userId, orderId: order.id, amount: order.amount });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: razorpayPublicKeyId(),
  };
}

// ── Webhook side ─────────────────────────────────────────────────────────────

interface RazorpayEventShape {
  id?: string;
  event?: string;
  created_at?: number;
  payload?: {
    payment?: { entity?: Record<string, any> };
    order?: { entity?: Record<string, any> };
    subscription?: { entity?: Record<string, any> };
  };
}

/** Does this signature-verified event concern a Pro purchase? */
export function isSubscriptionEvent(event: RazorpayEventShape): boolean {
  const notes =
    event?.payload?.payment?.entity?.notes ??
    event?.payload?.order?.entity?.notes ??
    event?.payload?.subscription?.entity?.notes;
  return notes?.purpose === PRO_ORDER_PURPOSE;
}

export interface SubscriptionEventResult {
  handled: boolean;
  reason?: string;
  userId?: string;
}

/**
 * Applies a Pro payment. Call ONLY with an event whose signature has already
 * been verified, and ONLY with a service-role client.
 *
 * Everything that makes this safe against replay, out-of-order delivery and a
 * forged amount lives in `apply_billing_event()` (migration 115) or here:
 *
 *   • replay        — the provider event id is the primary key of billing_events
 *   • out-of-order  — events older than the row's last_event_at are dropped
 *   • wrong amount  — the captured amount is compared to the server-side price
 *   • wrong user    — the user id comes from order notes we wrote ourselves
 */
export async function handleSubscriptionEvent(
  admin: SupabaseClient,
  event: RazorpayEventShape,
): Promise<SubscriptionEventResult> {
  const type = event.event ?? '';
  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const notes = payment?.notes ?? order?.notes ?? {};
  const userId: string | undefined = notes.user_id;

  // Razorpay sends `created_at` as unix seconds. A missing one is treated as
  // "now" rather than as epoch zero — epoch zero would make every event look
  // stale and silently stop applying anything.
  const eventAt = event.created_at
    ? new Date(event.created_at * 1000).toISOString()
    : new Date().toISOString();

  // The event id is the idempotency key. Without one there is nothing to
  // deduplicate on, and Razorpay retries until it gets a 2xx — so a missing id
  // would mean applying the same payment repeatedly.
  const eventId = event.id ?? `${type}:${payment?.id ?? order?.id ?? 'unknown'}`;

  const captured = type === 'payment.captured' || type === 'order.paid';
  const failed = type === 'payment.failed';

  if (!captured && !failed) {
    return { handled: false, reason: `ignored:${type}` };
  }

  if (!userId) {
    // Recorded for forensics but not applied — apply_billing_event stores the
    // payload with a null user so the payment is not simply lost.
    await callApply(admin, { eventId, userId: null, kind: type, payload: event, eventAt });
    return { handled: false, reason: 'no-user-in-notes' };
  }

  if (failed) {
    // A failed charge does not revoke access immediately. It moves the row to
    // `halted` with a grace window; only the window expiring drops the tier,
    // and current_tier() is what decides that.
    const graceUntil = new Date(Date.now() + GRACE_DAYS * 86_400_000).toISOString();
    await callApply(admin, {
      eventId, userId, kind: type, payload: event, eventAt,
      status: 'halted', tier: 'pro', graceUntil,
    });
    return { handled: true, userId };
  }

  // ── Amount check ──────────────────────────────────────────────────────────
  // The order was created server-side with the authoritative amount, so a
  // mismatch here means either the price changed between order and capture
  // (benign, and the customer paid what they were quoted) or something is
  // wrong. Log it either way; do not silently grant Pro for a smaller sum.
  const paid = Number(payment?.amount ?? order?.amount_paid ?? 0);
  const expected = await readExpectedPaise(admin);
  if (expected != null && paid > 0 && paid < expected) {
    logger.error('pro payment captured for less than the listed price — not granting', {
      userId, paid, expected, eventId,
    });
    await callApply(admin, { eventId, userId, kind: `${type}:underpaid`, payload: event, eventAt });
    return { handled: false, reason: 'underpaid', userId };
  }

  const periodEnd = new Date(Date.now() + PRO_PERIOD_DAYS * 86_400_000).toISOString();

  const applied = await callApply(admin, {
    eventId, userId, kind: type, payload: event, eventAt,
    status: 'active', tier: 'pro', periodEnd,
    subscriptionId: payment?.subscription_id ?? null,
    customerId: payment?.customer_id ?? null,
  });

  // Report what the DATABASE decided, not what we asked it to do. The guards
  // that matter (duplicate event, stale event) live in apply_billing_event, so
  // returning `applied` unconditionally does not grant anything twice — but it
  // does make the webhook response and the logs claim a grant happened when it
  // did not, which is exactly the signal you need when reconciling a payment
  // someone says they made.
  if (!applied.ok) {
    return { handled: false, reason: applied.reason, userId };
  }

  logger.info('pro subscription activated', { userId, until: periodEnd });
  return { handled: true, userId };
}

async function readExpectedPaise(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin.from('billing_settings').select('pro_price_paise').maybeSingle();
  return (data?.pro_price_paise as number | undefined) ?? null;
}

async function callApply(
  admin: SupabaseClient,
  a: {
    eventId: string;
    userId: string | null;
    kind: string;
    payload: unknown;
    eventAt: string;
    status?: string;
    tier?: 'free' | 'pro';
    periodEnd?: string | null;
    graceUntil?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
  },
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await (admin.rpc as any)('apply_billing_event', {
    p_event_id: a.eventId,
    p_user_id: a.userId,
    p_kind: a.kind,
    p_payload: a.payload,
    p_status: a.status ?? 'recorded',
    p_tier: a.tier ?? 'free',
    p_period_end: a.periodEnd ?? null,
    p_grace_until: a.graceUntil ?? null,
    p_cancel_at_period_end: false,
    p_subscription_id: a.subscriptionId ?? null,
    p_customer_id: a.customerId ?? null,
    p_event_at: a.eventAt,
  });
  if (error) {
    // Surfaced rather than thrown: the webhook must still return 200 so
    // Razorpay stops retrying an event we have already signature-verified and
    // can reconcile from billing_events by hand.
    logger.error('apply_billing_event failed', { eventId: a.eventId, userId: a.userId, err: error });
    return { ok: false, reason: 'apply_failed' };
  }

  // `applied: false` is a normal, expected outcome — a redelivered event or one
  // that arrived out of order. Not an error, but not a grant either.
  const ok = data?.applied === true;
  if (!ok) {
    logger.info('billing event not applied', {
      eventId: a.eventId, userId: a.userId, reason: data?.reason ?? 'unknown',
    });
  }
  return { ok, reason: data?.reason ?? 'not_applied' };
}
