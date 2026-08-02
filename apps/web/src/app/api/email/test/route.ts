import { NextResponse } from 'next/server';
import { emailsEnabled, emailConfigured } from '@/lib/email/client';
import { getTemplate } from '@/lib/email/templates';
import { renderAndSend } from '@/lib/email/policy';

/**
 * Test email endpoint — only works in dev/staging environments.
 * Uses the delivery_test template with sample data.
 */
export async function GET(req: Request) {
  const env = process.env.APP_ENV || process.env.NODE_ENV || 'local';
  
  // Only allow in non-production environments
  if (env === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to');
  
  if (!to) {
    return NextResponse.json({ error: 'Missing ?to= parameter' }, { status: 400 });
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
