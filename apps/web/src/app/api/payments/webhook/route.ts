import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { captureException } from '@/lib/observability';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { isSubscriptionEvent, handleSubscriptionEvent } from '@/lib/payments/subscription';
import { settleCapturedProjectPayment, LEDGER_COLUMNS, type LedgerPayment } from '@/lib/payments/project-payment';
import { invalidateEntitlements } from '@/lib/entitlements';
import { captureServer } from '@/lib/analytics-server';

// Razorpay posts server-to-server. We verify the HMAC signature over the RAW
// body — so we must read req.text(), never req.json(), before parsing.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Either not configured or a forged/replayed request. jsonError only
    // reports to Sentry at >=500 (this is a 401), so a real forged-signature
    // attempt would otherwise never surface outside a warn-level log line.
    captureException(new Error('Razorpay webhook: signature verification failed'), {
      tags: { route: 'payments/webhook', hasSignature: String(!!signature) },
    });
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
      .select(LEDGER_COLUMNS)
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
      // Razorpay's own words for the failure, kept for the admin payments ledger (155).
      const failureReason =
        ((entity?.error_description as string | undefined) ||
          (entity?.error_reason as string | undefined) ||
          null)?.slice(0, 300) ?? null;
      await admin
        .from('project_payments')
        .update({ status: 'failed', failure_reason: failureReason })
        .eq('id', payment.id);

      // No `req` here: this request is Razorpay's server, so its platform says
      // nothing about the payer. The payer is the person, from the ledger row.
      captureServer('payment_failed', payment.payer_id, {
        project_id: payment.project_id, stage_key: payment.stage_key, amount_paise: payment.amount,
        reason: (entity?.error_reason as string | undefined) ?? null,
      });

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

    // Amount/currency checks, the paid flip, the gate and the creator's
    // notification live in settleCapturedProjectPayment, shared with the
    // reconcile path so the two can never apply different rules.
    const result = await settleCapturedProjectPayment(admin, payment as LedgerPayment, {
      orderId,
      paymentId,
      amountPaise: Number(entity?.amount),
      currency: entity?.currency ?? null,
      source: 'webhook',
    });
    if (result === 'amount-mismatch' || result === 'currency-mismatch') {
      return NextResponse.json({ received: true, warning: result });
    }
    if (result === 'already') return NextResponse.json({ received: true, already: true });

    return NextResponse.json({ received: true, recorded: true });
  } catch (error: any) {
    captureException(error, { tags: { orderId, route: 'payments/webhook' } });
    // 200 to avoid infinite Razorpay retries; the event is safe to reconcile.
    return NextResponse.json({ received: true, error: 'processing-failed' });
  }
}
