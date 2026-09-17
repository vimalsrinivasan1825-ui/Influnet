import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { emailsEnabled, emailConfigured, isValidEmail } from '@/lib/email/client';
import { getTemplate } from '@/lib/email/templates';
import { renderAndSend } from '@/lib/email/policy';
import { appEnv } from '@/lib/env';

/**
 * Test email endpoint — local and dev only.
 * Requires a secret key (EMAIL_TEST_SECRET) to prevent abuse.
 * Uses the delivery_test template with sample data.
 *
 * An allow-list, not "anything but production": staging serves real users
 * (decision of 2026-09-16), and a deny-list keyed on the word "production"
 * left this open there — a leaked secret would have let anyone send mail from
 * the verified domain to any address.
 */
const ALLOWED_ENVS = new Set(['local', 'dev']);

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const env = appEnv;

  if (!ALLOWED_ENVS.has(env)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Require secret key for authentication
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.EMAIL_TEST_SECRET;
  
  if (!expectedKey) {
    return NextResponse.json({ error: 'EMAIL_TEST_SECRET not configured on server' }, { status: 500 });
  }
  
  if (!sameSecret(key, expectedKey)) {
    return NextResponse.json({ error: 'Invalid or missing key parameter' }, { status: 401 });
  }

  const to = searchParams.get('to');
  
  if (!to) {
    return NextResponse.json({ error: 'Missing ?to= parameter' }, { status: 400 });
  }

  if (!isValidEmail(to)) {
    return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
  }

  if (!emailConfigured()) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  if (!emailsEnabled()) {
    return NextResponse.json({ error: 'NOTIFY_EMAILS_ENABLED is not true' }, { status: 500 });
  }

  const tpl = getTemplate('delivery_test');
  if (!tpl) {
    return NextResponse.json({ error: 'Template not found' }, { status: 500 });
  }

  const result = await renderAndSend(tpl, tpl.sample as Record<string, unknown>, to);
  
  return NextResponse.json({
    success: result.sent,
    message: result.sent ? `Test email sent to ${to}` : `Failed: ${result.reason}`,
    id: result.sent ? result.id : null,
    environment: env,
  });
}
