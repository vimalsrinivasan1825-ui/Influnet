import { NextResponse } from 'next/server';
import { emailsEnabled, emailConfigured, isValidEmail } from '@/lib/email/client';
import { getTemplate } from '@/lib/email/templates';
import { renderAndSend } from '@/lib/email/policy';

/**
 * Test email endpoint — only works in dev/staging environments.
 * Requires a secret key (EMAIL_TEST_SECRET) to prevent abuse.
 * Uses the delivery_test template with sample data.
 */
export async function GET(req: Request) {
  const env = process.env.APP_ENV || process.env.NODE_ENV || 'local';
  
  // Only allow in non-production environments
  if (env === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  // Require secret key for authentication
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.EMAIL_TEST_SECRET;
  
  if (!expectedKey) {
    return NextResponse.json({ error: 'EMAIL_TEST_SECRET not configured on server' }, { status: 500 });
  }
  
  if (key !== expectedKey) {
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
