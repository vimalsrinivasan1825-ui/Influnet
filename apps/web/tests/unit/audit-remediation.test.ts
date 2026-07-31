import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  GstNumberSchema,
  WebsiteSchema,
  isValidGstin,
  isValidWebsite,
  normalizeWebsite,
  CollabRequestSchema,
  RegisterProfileSchema,
} from '@/lib/validators';
import { isPlaceholderWebhookSecret, verifyWebhookSignature } from '@/lib/payments/razorpay';
import { requireProjectParticipant } from '@/lib/project-access';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('GST number validation', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGstin('22AAAAA0000A1Z5')).toBe(true);
  });

  it('accepts lowercase input and upper-cases it', () => {
    const parsed = GstNumberSchema.safeParse('22aaaaa0000a1z5');
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe('22AAAAA0000A1Z5');
  });

  it('rejects the shapes the audit found were accepted unchecked', () => {
    for (const bad of ['not-a-gst', '123', '22AAAAA0000A1Z', '22AAAAA0000A1Z55', 'AAAAAAAAAAAAAAA']) {
      expect(isValidGstin(bad)).toBe(false);
      expect(GstNumberSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('allows blank, because GST is optional', () => {
    expect(GstNumberSchema.safeParse('').success).toBe(true);
  });
});

describe('website validation', () => {
  it('accepts a bare host and normalises it to https', () => {
    expect(isValidWebsite('yourcompany.com')).toBe(true);
    expect(normalizeWebsite('yourcompany.com')).toBe('https://yourcompany.com');
  });

  it('leaves an explicit scheme alone', () => {
    expect(normalizeWebsite('http://a.co')).toBe('http://a.co');
  });

  it('rejects values with no dotted hostname', () => {
    for (const bad of ['not a website', 'http://', 'foo', 'foo.']) {
      expect(isValidWebsite(bad)).toBe(false);
    }
  });

  it('rejects non-http schemes', () => {
    expect(isValidWebsite('javascript:alert(1)')).toBe(false);
  });

  it('allows blank, because website is optional', () => {
    expect(WebsiteSchema.safeParse('').success).toBe(true);
  });

  it('gates the signup payload on both fields', () => {
    const base = { role: 'business_owner' as const, name: 'Acme' };
    expect(RegisterProfileSchema.safeParse({ ...base, website: 'acme.com' }).success).toBe(true);
    expect(RegisterProfileSchema.safeParse({ ...base, website: 'not a website' }).success).toBe(false);
    expect(RegisterProfileSchema.safeParse({ ...base, gstNumber: 'nope' }).success).toBe(false);
  });
});

describe('collab request budget', () => {
  it('accepts an explicit null for the optional budget', () => {
    const parsed = CollabRequestSchema.safeParse({
      to_user_id: UUID,
      project_title: 'Test',
      budget: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects a non-positive budget', () => {
    for (const budget of [0, -500]) {
      expect(CollabRequestSchema.safeParse({ to_user_id: UUID, budget }).success).toBe(false);
    }
  });
});

describe('razorpay webhook secret', () => {
  const RAW = JSON.stringify({ event: 'payment.captured' });
  const sign = (secret: string) => crypto.createHmac('sha256', secret).update(RAW).digest('hex');

  beforeEach(() => { delete process.env.RAZORPAY_WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.RAZORPAY_WEBHOOK_SECRET; });

  it('flags the committed placeholder values', () => {
    expect(isPlaceholderWebhookSecret('your_test_webhook_secret_here')).toBe(true);
    expect(isPlaceholderWebhookSecret('changeme')).toBe(true);
    expect(isPlaceholderWebhookSecret('a_real_generated_secret')).toBe(false);
    expect(isPlaceholderWebhookSecret(undefined)).toBe(false);
  });

  it('still verifies a correctly signed body with a real secret', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'a_real_generated_secret';
    expect(verifyWebhookSignature(RAW, sign('a_real_generated_secret'))).toBe(true);
    expect(verifyWebhookSignature(RAW, sign('wrong_secret'))).toBe(false);
  });

  it('tolerates the placeholder on local/dev so the E2E suite can sign captures', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'your_test_webhook_secret_here';
    expect(verifyWebhookSignature(RAW, sign('your_test_webhook_secret_here'))).toBe(true);
  });
});

describe('requireProjectParticipant', () => {
  const project = { id: 7, owner_user_id: 'biz', counterparty_user_id: 'creator' };
  const client = (data: any, error: any = null) => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data, error }) }) }),
    }),
  });

  it('admits both sides of the project', async () => {
    for (const uid of ['biz', 'creator']) {
      const res = await requireProjectParticipant(client(project), '7', uid);
      expect(res.ok).toBe(true);
    }
  });

  it('denies an unrelated logged-in user — this was the reviews/cards IDOR', async () => {
    const res = await requireProjectParticipant(client(project), '7', 'stranger');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.res.status).toBe(404);
  });

  it('does not distinguish "denied" from "missing"', async () => {
    const missing = await requireProjectParticipant(client(null, { message: 'no rows' }), '7', 'stranger');
    const denied = await requireProjectParticipant(client(project), '7', 'stranger');
    expect(missing.ok).toBe(false);
    expect(denied.ok).toBe(false);
    if (!missing.ok && !denied.ok) expect(missing.res.status).toBe(denied.res.status);
  });

  it('rejects a non-numeric project id', async () => {
    const res = await requireProjectParticipant(client(project), 'abc', 'biz');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.res.status).toBe(400);
  });
});
