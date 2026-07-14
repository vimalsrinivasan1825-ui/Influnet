import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { captureException } from '@/lib/observability';

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

  if (type !== 'payment.captured' && type !== 'order.paid') {
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

  try {
    // Look up the ledger row created at checkout time.
    const { data: payment } = await admin
      .from('project_payments')
      .select('id, project_id, stage_key, status')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();

    if (!payment) {
      // Unknown order (e.g. ledger table not migrated, or created out-of-band).
      captureException(new Error('Payment webhook: no ledger row for order'), { tags: { orderId } });
      return NextResponse.json({ received: true, warning: 'no-ledger-row' });
    }

    // Idempotent: if already paid, we're done.
    if (payment.status === 'paid') {
      return NextResponse.json({ received: true, already: true });
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

    return NextResponse.json({ received: true, recorded: true });
  } catch (error: any) {
    captureException(error, { tags: { orderId, route: 'payments/webhook' } });
    // 200 to avoid infinite Razorpay retries; the event is safe to reconcile.
    return NextResponse.json({ received: true, error: 'processing-failed' });
  }
}
