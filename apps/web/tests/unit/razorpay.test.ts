import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  isRazorpayConfigured,
  razorpayPublicKeyId,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '@/lib/payments/razorpay';

const KEY_ID = 'rzp_test_abc';
const KEY_SECRET = 'secret_shhh';
const WEBHOOK_SECRET = 'wh_secret';

describe('razorpay config', () => {
  beforeEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  });
  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  });

  it('is not configured without both key id and secret', () => {
    expect(isRazorpayConfigured()).toBe(false);
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    expect(isRazorpayConfigured()).toBe(false); // secret still missing
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    expect(isRazorpayConfigured()).toBe(true);
  });

  it('exposes the public key id, preferring the NEXT_PUBLIC value', () => {
    expect(razorpayPublicKeyId()).toBeNull();
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    expect(razorpayPublicKeyId()).toBe(KEY_ID);
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_public';
    expect(razorpayPublicKeyId()).toBe('rzp_public');
  });
});

describe('verifyPaymentSignature', () => {
  beforeEach(() => { process.env.RAZORPAY_KEY_SECRET = KEY_SECRET; });
  afterEach(() => { delete process.env.RAZORPAY_KEY_SECRET; });

  it('accepts a correctly signed order|payment', () => {
    const orderId = 'order_1';
    const paymentId = 'pay_1';
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    expect(verifyPaymentSignature({ orderId, paymentId, signature })).toBe(true);
  });

  it('rejects a tampered signature', () => {
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'deadbeef' })).toBe(false);
  });

  it('rejects when inputs are missing', () => {
    expect(verifyPaymentSignature({ orderId: '', paymentId: 'pay_1', signature: 'x' })).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  beforeEach(() => { process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.RAZORPAY_WEBHOOK_SECRET; });

  it('accepts a body signed with the webhook secret', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a forged/absent signature', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(verifyWebhookSignature(body, 'nope')).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it('rejects when the webhook secret is unset', () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = '{}';
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(false);
  });
});
