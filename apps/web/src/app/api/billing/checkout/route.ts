import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { subscriptionsEnabled, resolveEntitlements } from '@/lib/entitlements';
import { isRazorpayConfigured } from '@/lib/payments/razorpay';
import { createProOrder } from '@/lib/payments/subscription';

/**
 * Opens a Pro purchase. Returns the Razorpay order the browser checkout needs.
 *
 * Note what this route does NOT accept: an amount, a currency, a plan id, or a
 * user id. Every one of those is decided on the server — the amount from
 * `billing_settings`, the user from the session. A checkout route that takes a
 * price from the client is a price list, not a checkout.
 *
 * This route also never grants anything. Creating an order is not paying for
 * one; the tier changes only when the signed webhook confirms a real capture.
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // 404 rather than 402 or 503: when paid plans are switched off they do not
    // exist in this deployment, and an endpoint that says "payment required"
    // would be advertising a product nobody can buy.
    if (!subscriptionsEnabled()) {
      return jsonError(404, 'Not found');
    }

    if (!isRazorpayConfigured()) {
      return jsonError(503, 'Payments are not available right now. Please try again later.');
    }

    // Order creation costs a Razorpay API call each time, so it is worth a
    // limit of its own even though nothing is charged here.
    const limited = await enforceRateLimit(req, {
      bucket: 'billing:checkout', limit: 10, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    // Already Pro: creating another order would take a second ₹999 for a
    // period they are still inside. Renewal near expiry is a separate flow.
    const ent = await resolveEntitlements(supabase, user.id);
    if (ent.tier === 'pro') {
      return NextResponse.json(
        { error: 'You are already on Pro.', tier: ent.tier, currentPeriodEnd: ent.currentPeriodEnd },
        { status: 409 },
      );
    }

    const order = await createProOrder(supabase, user.id);

    return NextResponse.json({
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      // Echoed so the checkout dialog can show who it is for without a second
      // round trip. Nothing here is secret — the key id is the publishable one.
      prefillEmail: user.email ?? null,
    });
  } catch (error: any) {
    return jsonError(500, 'Could not start the upgrade. Please try again.', error);
  }
}
