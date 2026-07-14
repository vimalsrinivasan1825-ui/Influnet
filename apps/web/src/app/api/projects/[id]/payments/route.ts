import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  isRazorpayConfigured,
  razorpayPublicKeyId,
  createRazorpayOrder,
  RazorpayError,
} from '@/lib/payments/razorpay';

// Razorpay's Orders API can take a couple of seconds.
export const maxDuration = 30;

const CreateOrderSchema = z.object({
  stage_key: z.enum(['advance_payment', 'final_payment']),
  // Amount in rupees (whole units). Optional — falls back to the project budget.
  amount_rupees: z.number().positive().max(10_000_000).optional(),
});

// GET: report whether in-app payments are available (drives the UI mode).
export async function GET(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  return NextResponse.json({
    configured: isRazorpayConfigured(),
    key_id: isRazorpayConfigured() ? razorpayPublicKeyId() : null,
  });
}

// POST: create a Razorpay order for a project's payment gate. Only the business
// (project owner / payer) may initiate. Returns the order + public key so the
// browser can open Razorpay Checkout. The webhook confirms capture.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    if (!isRazorpayConfigured()) {
      // Manual mode — the client should mark the gate item done instead.
      return jsonError(503, 'In-app payments are not enabled. Record the payment manually (off-platform).');
    }

    const limited = await enforceRateLimit(req, { bucket: 'payments:create', limit: 12, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const parsed = CreateOrderSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { stage_key, amount_rupees } = parsed.data;

    // Only the project owner (business) is the payer, and only for their project.
    const { data: project, error: projErr } = await supabase
      .from('campaign_projects')
      .select('id, owner_user_id, counterparty_user_id, budget')
      .eq('id', projectId)
      .single();
    if (projErr || !project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id) {
      return jsonError(403, 'Only the business account can initiate a payment');
    }

    // Resolve amount (paise). Prefer the explicit request, else the project budget.
    const rupees = amount_rupees ?? Number(project.budget);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      return jsonError(400, 'No payment amount set for this project — enter an amount.');
    }
    const amountPaise = Math.round(rupees * 100);

    let order;
    try {
      order = await createRazorpayOrder({
        amount: amountPaise,
        currency: 'INR',
        receipt: `proj_${projectId}_${stage_key}`,
        notes: { project_id: String(projectId), stage_key, payer_id: user.id },
      });
    } catch (e) {
      if (e instanceof RazorpayError) return jsonError(e.status >= 500 ? 502 : e.status, 'Could not start the payment. Please try again.', e);
      throw e;
    }

    // Ledger row (status 'created'); the webhook flips it to 'paid'.
    const { error: insErr } = await supabase.from('project_payments').insert({
      project_id: projectId,
      stage_key,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      payer_id: user.id,
      razorpay_order_id: order.id,
      notes: { receipt: order.receipt },
    });
    if (insErr) {
      // Degrade gracefully if the ledger table isn't migrated yet — the order
      // still exists in Razorpay and the webhook is idempotent.
      if (insErr.code !== 'PGRST205') {
        return jsonError(500, 'Could not record the payment order', insErr);
      }
    }

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpayPublicKeyId(),
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
