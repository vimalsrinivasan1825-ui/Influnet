/**
 * Settling a project payment: the one place a captured Razorpay payment turns
 * into a paid ledger row and an opened payment gate.
 *
 * Two callers, one rule set:
 *   - the signed webhook (api/payments/webhook), the normal path;
 *   - reconcileProjectPayments() below, which asks Razorpay directly when a
 *     project still has an unpaid order. Added 2026-10-15 after the first real
 *     staging payment: Razorpay captured it, but the webhook was registered on
 *     a test account nobody could find, so the gate never opened and the
 *     business was asked to pay again. A missing or misrouted webhook must
 *     never strand a paid project.
 *
 * Neither path trusts the client. The webhook is HMAC-signed; the reconcile
 * reads Razorpay's API with the key secret. Amount and currency are checked
 * against the ledger row either way, and the ledger amount was derived from
 * the agreed terms when the order was created.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureException } from '@/lib/observability';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { logActivity } from '@/lib/activity';
import { captureServer } from '@/lib/analytics-server';
import { fetchOrderPayments, isRazorpayConfigured } from '@/lib/payments/razorpay';

export interface LedgerPayment {
  id: string;
  project_id: number;
  stage_key: string;
  status: string;
  amount: number; // paise
  currency: string | null;
  payer_id: string | null;
}

export const LEDGER_COLUMNS = 'id, project_id, stage_key, status, amount, currency, payer_id';

export type SettleResult = 'recorded' | 'already' | 'amount-mismatch' | 'currency-mismatch';

export async function settleCapturedProjectPayment(
  admin: SupabaseClient,
  payment: LedgerPayment,
  capture: {
    orderId: string;
    paymentId: string | null;
    amountPaise: number;
    currency?: string | null;
    source: 'webhook' | 'reconcile';
  },
): Promise<SettleResult> {
  const { orderId, paymentId } = capture;

  // Never open a payment gate on less than the ledger row says was ordered, in
  // case terms changed between order creation and capture or the ledger row was
  // created out of band.
  if (!Number.isFinite(capture.amountPaise) || capture.amountPaise < Number(payment.amount)) {
    captureException(new Error('Project payment: captured amount below ledger amount'), {
      tags: { orderId, expected: payment.amount, captured: capture.amountPaise, source: capture.source },
    });
    return 'amount-mismatch';
  }

  // An amount is meaningless without its unit: a capture in a weaker currency
  // must not clear a gate worth several times more. A missing currency on the
  // capture is not treated as a mismatch.
  const capturedCurrency = (capture.currency ?? '').toString().toUpperCase();
  const ledgerCurrency = (payment.currency ?? 'INR').toString().toUpperCase();
  if (capturedCurrency && capturedCurrency !== ledgerCurrency) {
    captureException(new Error('Project payment: captured currency differs from ledger'), {
      tags: { orderId, expected: ledgerCurrency, captured: capturedCurrency, source: capture.source },
    });
    return 'currency-mismatch';
  }

  // Conditional on not already being paid, so the webhook and a reconcile
  // landing together (or a webhook retry) settle once: only the caller whose
  // update matched a row goes on to open the gate and notify.
  const { data: flipped } = await admin
    .from('project_payments')
    .update({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('id', payment.id)
    .neq('status', 'paid')
    .select('id');
  if (!flipped || flipped.length === 0) return 'already';

  captureServer('payment_succeeded', payment.payer_id, {
    project_id: payment.project_id, stage_key: payment.stage_key, amount_paise: payment.amount,
    source: capture.source,
  });

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
  // a failure here must not undo or retry a payment already recorded.
  try {
    const rupees = Math.round((payment.amount || 0) / 100);
    const amountLabel = `₹${rupees.toLocaleString('en-IN')}`;
    const label = payment.stage_key === 'advance_payment' ? 'advance'
      : payment.stage_key === 'quick_payment' ? 'payment'
      : 'final payment';

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
          // Stable across webhook retries and a reconcile of the same capture.
          dedupeKey: `payment_received:${paymentId ?? orderId}`,
          data: {
            recipientName: nameOf(names, proj.counterparty_user_id),
            projectName: proj.title || 'your project',
            amount: rupees,
            // The template keys off 'advance' | 'final' | 'full' — `label` is
            // the prose form ('final payment') and would miss that lookup.
            paymentType: payment.stage_key === 'advance_payment' ? 'advance' : payment.stage_key === 'quick_payment' ? 'full' : 'final',
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
  } catch (notifyErr) {
    captureException(notifyErr, { tags: { orderId, step: 'notify-log', source: capture.source } });
  }

  return 'recorded';
}

/** Orders older than this are not chased: an abandoned checkout is not a payment. */
const RECONCILE_WINDOW_DAYS = 30;
/** A project only ever has a handful of open orders; bound the Razorpay calls anyway. */
const RECONCILE_MAX_ORDERS = 5;

/**
 * Ask Razorpay about every unpaid order on a project and settle the captured
 * ones. Returns how many were settled, so a caller can refresh. Never throws:
 * a Razorpay outage must not break the page that called this.
 *
 * Callers must have checked the requester is a participant of the project.
 */
export async function reconcileProjectPayments(admin: SupabaseClient, projectId: number): Promise<number> {
  if (!isRazorpayConfigured()) return 0;

  const since = new Date(Date.now() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: open, error } = await admin
    .from('project_payments')
    .select(`${LEDGER_COLUMNS}, razorpay_order_id`)
    .eq('project_id', projectId)
    .eq('status', 'created')
    .not('razorpay_order_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(RECONCILE_MAX_ORDERS);
  if (error || !open || open.length === 0) return 0;

  let settled = 0;
  for (const row of open as Array<LedgerPayment & { razorpay_order_id: string }>) {
    try {
      const payments = await fetchOrderPayments(row.razorpay_order_id);
      const captured = payments.find((p) => p.status === 'captured');
      if (!captured) continue;
      const result = await settleCapturedProjectPayment(admin, row, {
        orderId: row.razorpay_order_id,
        paymentId: captured.id,
        amountPaise: Number(captured.amount),
        currency: captured.currency,
        source: 'reconcile',
      });
      if (result === 'recorded') settled++;
    } catch (e) {
      captureException(e, { tags: { orderId: row.razorpay_order_id, step: 'reconcile' } });
    }
  }
  return settled;
}
