/**
 * Razorpay integration — server-only.
 *
 * Fully env-gated: with no keys set, `isRazorpayConfigured()` is false and the
 * product falls back to "record manual (off-platform)" payment stages. Set the
 * keys (see .env.example → Payments) to enable real in-app checkout.
 *
 * This module is intentionally dependency-free (uses fetch + node:crypto) so it
 * adds nothing to the bundle and needs no SDK. All amounts are in the smallest
 * currency unit (paise for INR), per Razorpay's API.
 */
import crypto from 'node:crypto';
import { appEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  receipt?: string;
  status: string;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** Public key id for the browser checkout (safe to expose). */
export function razorpayPublicKeyId(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || null;
}

function basicAuth(): string {
  const id = process.env.RAZORPAY_KEY_ID!;
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export class RazorpayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'RazorpayError';
  }
}

/**
 * Create a Razorpay order. `amount` is in paise (e.g. ₹5,000 → 500000).
 * Throws RazorpayError if not configured or the API rejects the request.
 */
export async function createRazorpayOrder(params: {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError(503, 'Payments are not configured');
  }
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new RazorpayError(400, 'Amount must be a positive integer in paise');
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency ?? 'INR',
      receipt: params.receipt,
      notes: params.notes,
      payment_capture: 1, // auto-capture on success
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new RazorpayError(res.status, `Razorpay order failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/**
 * Verify a checkout callback signature: HMAC_SHA256(key_secret, `${orderId}|${paymentId}`).
 * Constant-time compare. Returns false on any malformed input.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !params.orderId || !params.paymentId || !params.signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, params.signature);
}

// Values shipped in .env.example / committed env templates. A signature is only
// as trustworthy as the secret behind it, so a secret anyone can read from the
// repo is equivalent to no secret at all.
const PLACEHOLDER_WEBHOOK_SECRETS = new Set([
  'your_test_webhook_secret_here',
  'your_webhook_secret_here',
  'changeme',
]);

export function isPlaceholderWebhookSecret(secret: string | undefined): boolean {
  return !!secret && PLACEHOLDER_WEBHOOK_SECRETS.has(secret.trim().toLowerCase());
}

/**
 * Verify a webhook body signature against the X-Razorpay-Signature header:
 * HMAC_SHA256(webhook_secret, rawBody). MUST be given the RAW request body.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  // A placeholder secret is public knowledge, so any caller could forge a valid
  // signature and mark payments captured. Tolerated on local/dev (the E2E suite
  // signs its own simulated captures), never beyond it.
  if (isPlaceholderWebhookSecret(secret)) {
    if (appEnv === 'staging' || appEnv === 'production') {
      logger.error(
        'RAZORPAY_WEBHOOK_SECRET is still the placeholder value — rejecting webhook. Generate a real secret in the Razorpay dashboard and set it in this environment.',
        { appEnv },
      );
      return false;
    }
    logger.warn('RAZORPAY_WEBHOOK_SECRET is a placeholder — signatures are forgeable. Fine locally, must be replaced before staging/production.', { appEnv });
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
