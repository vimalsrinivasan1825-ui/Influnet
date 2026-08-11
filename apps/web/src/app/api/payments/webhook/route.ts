import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { captureException } from '@/lib/observability';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { logActivity } from '@/lib/activity';
import { isSubscriptionEvent, handleSubscriptionEvent } from '@/lib/payments/subscription';
import { invalidateEntitlements } from '@/lib/entitlements';

// Razorpay posts server-to-server. We verify the HMAC signature over the RAW
// body — so we must read req.text(), never req.json(), before parsing.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Either not configured or a forged/replayed request — reject quietly.
    return jsonError(401, 'Invalid webhook signature');
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  // We only act on successful capture. Everything else is acknowledged (200) so
  // Razorpay doesn't retry.
  const type = event?.event as string | undefined;
  const entity = event?.payload?.payment?.entity ?? event?.payload?.order?.entity;
  const orderId = entity?.order_id ?? entity?.id;
  const paymentId = event?.payload?.payment?.entity?.id ?? null;

  // A failed payment is handled too, but only to inform the payer — it never
  // advances the pipeline. `failed` has been a legal status since migration 059
  // and nothing ever wrote it, so a card decline was silent: the ledger row sat
  // at 'created' and the business was told nothing at all.
  const isFailure = type === 'payment.failed';

  if (type !== 'payment.captured' && type !== 'order.paid' && !isFailure) {
    return NextResponse.json({ received: true, ignored: type ?? 'unknown' });
  }
  if (!orderId) return NextResponse.json({ received: true, ignored: 'no-order-id' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    // Can't record without service role; report and 200 so Razorpay stops retrying
    // (we have the signature-verified event; reconcile manually if this ever fires).
    captureException(new Error('Payment webhook: missing service-role config'), { tags: { orderId } });
    return NextResponse.json({ received: true, warning: 'not-recorded' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Pro subscription purchases ────────────────────────────────────────────
  // Both kinds of payment arrive HERE, on the one endpoint configured in the
  // Razorpay dashboard. Splitting them across two URLs would mean a deployment
  // that pointed at only one silently dropped the other — project payments
  // stranded mid-stage, or people paying ₹999 and never becoming Pro.
  //
  // They are told apart by `notes.purpose`, which we set ourselves when the
  // order is created, so this cannot be spoofed by a payer: the notes on a
  // signature-verified event are the ones Razorpay stored at order creation.
  if (isSubscriptionEvent(event)) {
    const result = await handleSubscriptionEvent(admin, event);
    if (result.userId) {
      // The tier is cached for 60s per instance; drop it so an upgrade is
      // visible on the next request rather than up to a minute later. This is
      // best-effort by nature — other instances keep their own copy and expire
      // on their own — which is exactly why the TTL is short.
      invalidateEntitlements(result.userId);
    }
    return NextResponse.json({ received: true, subscription: result.handled ? 'applied' : result.reason });
  }

  try {
    // Look up the ledger row created at checkout time.
    const { data: payment } = await admin
      .from('project_payments')
      .select('id, project_id, stage_key, status, amount, currency, payer_id')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();

    if (!payment) {
      // Unknown order (e.g. ledger table not migrated, or created out-of-band).
      captureException(new Error('Payment webhook: no ledger row for order'), { tags: { orderId } });
      return NextResponse.json({ received: true, warning: 'no-ledger-row' });
    }

    // Idempotent: if already paid, we're done. Checked before the failure
    // branch too — a late `payment.failed` for an order that was ultimately
    // captured on a retry must not tell the business their payment failed.
    if (payment.status === 'paid') {
      return NextResponse.json({ received: true, already: true });
    }

    if (isFailure) {
      await admin.from('project_payments').update({ status: 'failed' }).eq('id', payment.id);

      if (payment.payer_id) {
        const { data: proj } = await admin
          .from('campaign_projects')
          .select('title')
          .eq('id', payment.project_id)
          .single();

        const rupees = Math.round((payment.amount || 0) / 100);
        const names = await profileNames([payment.payer_id]);
        // Razorpay's own words for what went wrong ("insufficient funds",
        // "card declined") are more useful to the payer than anything we'd
        // invent, but the field is not guaranteed to be present.
        const reason =
          (entity?.error_description as string | undefined) ||
          (entity?.error_reason as string | undefined) ||
          'The payment could not be completed.';

        await notifyUser({
          userId: payment.payer_id,
          type: 'project_stage',
          title: 'Payment failed',
          body: `Your ₹${rupees.toLocaleString('en-IN')} payment did not go through. ${reason}`,
          link: `/dashboard/projects/${payment.project_id}`,
          email: {
            templateId: 'payment_failed',
            dedupeKey: `payment_failed:${paymentId ?? orderId}`,
            data: {
              recipientName: nameOf(names, payment.payer_id),
              projectName: (proj as { title?: string } | null)?.title || 'your project',
              amount: rupees,
              reason,
              dashboardUrl: `/dashboard/projects/${payment.project_id}`,
            },
          },
        });
      }

      return NextResponse.json({ received: true, recorded: 'failed' });
    }

    // Defense in depth: the order route now derives the amount from the
    // project's agreed terms rather than trusting the client, so this should
    // already match — but never open a payment gate on less than the ledger
    // row says was ordered, in case terms changed between order creation and
    // capture or the ledger row was created out of band.
    const capturedPaise = Number(entity?.amount);
    if (!Number.isFinite(capturedPaise) || capturedPaise < Number(payment.amount)) {
      captureException(new Error('Payment webhook: captured amount below ledger amount'), {
        tags: { orderId, expected: payment.amount, captured: capturedPaise },
      });
      return NextResponse.json({ received: true, warning: 'amount-mismatch' });
    }

    // An amount is meaningless without its unit. The ledger records the currency
    // the order was placed in, but nothing compared it to what actually came
    // back — so a capture denominated in a weaker currency would clear a gate
    // worth several times more. Compare when the event tells us; a missing
    // currency on the event is not treated as a mismatch.
    const capturedCurrency = (entity?.currency ?? '').toString().toUpperCase();
    const ledgerCurrency = (payment.currency ?? 'INR').toString().toUpperCase();
    if (capturedCurrency && capturedCurrency !== ledgerCurrency) {
      captureException(new Error('Payment webhook: captured currency differs from ledger'), {
        tags: { orderId, expected: ledgerCurrency, captured: capturedCurrency },
      });
      return NextResponse.json({ received: true, warning: 'currency-mismatch' });
    }

    await admin
      .from('project_payments')
      .update({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
      .eq('id', payment.id);

    // Auto-complete the payment gate item for that stage so the pipeline can advance.
    const { data: gateItem } = await admin
      .from('project_stage_items')
      .select('id')
      .eq('project_id', payment.project_id)
      .eq('stage_key', payment.stage_key)
      .eq('is_gate', true)
      .is('done_at', null)
      .limit(1)
      .maybeSingle();

    if (gateItem) {
      await admin
        .from('project_stage_items')
        .update({ done_at: new Date().toISOString() })
        .eq('id', gateItem.id);
    }

    // Tell the creator the money landed, and log it to the timeline. Best-effort:
    // a failure here must not make Razorpay retry a payment we already recorded.
    try {
      const rupees = Math.round((payment.amount || 0) / 100);
      const amountLabel = `₹${rupees.toLocaleString('en-IN')}`;
      const isAdvance = payment.stage_key === 'advance_payment';
      const label = isAdvance ? 'advance' : 'final payment';

      const { data: proj } = await admin
        .from('campaign_projects')
        .select('title, owner_user_id, counterparty_user_id')
        .eq('id', payment.project_id)
        .single();

      if (proj?.counterparty_user_id) {
        const projectLabel = proj.title ? `“${proj.title}”` : 'your project';
        const names = await profileNames([proj.counterparty_user_id]);
        await notifyUser({
          userId: proj.counterparty_user_id,
          type: 'project_stage',
          title: `${amountLabel} ${label} received`,
          body: `The brand paid the ${label} for ${projectLabel}.`,
          link: `/dashboard/projects/${payment.project_id}`,
          email: {
            templateId: 'payment_received',
            // Razorpay retries the same event until it gets a 2xx, and this
            // handler is reached again on every retry. The gateway payment id
            // is the one value that is stable across those retries.
            dedupeKey: `payment_received:${paymentId}`,
            data: {
              recipientName: nameOf(names, proj.counterparty_user_id),
              projectName: proj.title || 'your project',
              amount: rupees,
              // The template keys off 'advance' | 'final' | 'full' — `label` is
              // the prose form ('final payment') and would miss that lookup.
              paymentType: isAdvance ? 'advance' : 'final',
              paymentId,
              paidOn: new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
              dashboardUrl: `/dashboard/projects/${payment.project_id}`,
            },
          },
        });
      }

      await logActivity(admin, {
        projectId: payment.project_id,
        actorUserId: payment.payer_id ?? null,
        type: 'payment_paid',
        summary: `Paid the ${label}`,
        metadata: { amount_paise: payment.amount, currency: payment.currency, stage_key: payment.stage_key, amount_rupees: rupees },
      });
    } catch (notifyErr: any) {
      captureException(notifyErr, { tags: { orderId, route: 'payments/webhook', step: 'notify-log' } });
    }

    return NextResponse.json({ received: true, recorded: true });
  } catch (error: any) {
    captureException(error, { tags: { orderId, route: 'payments/webhook' } });
    // 200 to avoid infinite Razorpay retries; the event is safe to reconcile.
    return NextResponse.json({ received: true, error: 'processing-failed' });
  }
}
