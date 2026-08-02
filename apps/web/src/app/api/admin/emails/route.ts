import { NextResponse } from 'next/server';
import { withAdmin, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getTemplate, listTemplates } from '@/lib/email/templates';
import { emailsEnabled, emailConfigured, fromAddress, isValidEmail } from '@/lib/email/client';
import { renderAndSend } from '@/lib/email/policy';
import { unsubscribeUrl } from '@/lib/email/unsubscribe';
import { supportEmail } from '@/lib/email/theme';

/**
 * Admin email console.
 *
 * GET  — every template plus the current delivery configuration and the last
 *        few sends, so "why did nothing arrive?" is answerable from one screen.
 * POST — `preview` renders a template to HTML (nothing leaves the server);
 *        `send` mails it to any address you type.
 *
 * The test send goes through renderAndSend(), NOT deliverEmail(): the point of
 * a test is to see the mail, so it deliberately skips opt-outs, the daily cap
 * and the dedupe ledger. It still respects NOTIFY_EMAILS_ENABLED and
 * EMAIL_ALLOWLIST, because those are environment safety rails rather than
 * recipient preferences.
 */

export async function GET(req: Request) {
  const auth = await withAdmin(req);
  if (!auth.ok) return auth.res;

  const { supabase } = auth;
  const { data: recent } = await supabase
    .from('email_deliveries')
    .select('id, to_email, template, category, status, resend_id, error, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    templates: listTemplates(),
    config: {
      enabled: emailsEnabled(),
      apiKeyPresent: emailConfigured(),
      from: fromAddress(),
      replyTo: supportEmail(),
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      allowlist: process.env.EMAIL_ALLOWLIST || null,
      requireVerified: (process.env.EMAIL_REQUIRE_VERIFIED || 'true').trim() !== 'false',
      dailyCap: Number(process.env.EMAIL_DAILY_CAP || 6),
      webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
      environment: process.env.APP_ENV || process.env.NODE_ENV || 'local',
    },
    // Null rather than [] tells the UI to say "migration 098 not applied yet"
    // instead of pretending nothing has ever been sent.
    recent: recent ?? null,
  });
}

export async function POST(req: Request) {
  const auth = await withAdmin(req);
  if (!auth.ok) return auth.res;

  let payload: { action?: string; templateId?: string; data?: Record<string, unknown>; to?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const tpl = getTemplate(payload.templateId || '');
  if (!tpl) return jsonError(400, `Unknown template: ${payload.templateId}`);

  // Sample data fills every field the caller left out, so a half-filled form
  // still renders instead of printing "undefined" into the email.
  const data = { ...(tpl.sample as Record<string, unknown>), ...(payload.data || {}) };

  if (payload.action === 'preview') {
    return NextResponse.json({
      subject: tpl.subject(data),
      html: tpl.render(data, {
        unsubscribeUrl: tpl.tier === 'account' ? undefined : `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/email/unsubscribe?t=preview`,
      }),
      tier: tpl.tier,
      category: tpl.category,
    });
  }

  if (payload.action === 'send') {
    const to = (payload.to || '').trim();
    if (!isValidEmail(to)) return jsonError(400, 'Enter a valid email address to send to.');

    // Keyed on the admin, not the IP: this endpoint can spend real Resend quota
    // and burn domain reputation, so a shared office IP shouldn't pool the budget.
    const limited = await enforceRateLimit(req, {
      bucket: 'admin-email-test',
      limit: 20,
      windowMs: 60 * 60 * 1000,
      key: auth.user.id,
    });
    if (limited) return limited;

    if (!emailsEnabled()) {
      return jsonError(
        409,
        'Email sending is switched off. Set NOTIFY_EMAILS_ENABLED=true in this environment and restart, then try again.',
      );
    }

    const result = await renderAndSend(tpl, data, to, {
      // A real unsubscribe link for the signed-in admin, so the footer and the
      // Gmail one-click button can be tested for real rather than faked.
      unsubscribeUrl: tpl.tier === 'account' ? undefined : unsubscribeUrl(auth.user.id, tpl.category),
      // Console-only: a half-filled form should still render something.
      fillFromSample: true,
    });

    if (!result.sent) {
      const explain: Record<string, string> = {
        disabled: 'NOTIFY_EMAILS_ENABLED is not "true" in this environment.',
        no_key: 'RESEND_API_KEY is not set in this environment.',
        not_allowlisted: `${to} is blocked by EMAIL_ALLOWLIST in this environment.`,
        invalid_address: 'That address is not valid.',
        error: result.error || 'Resend rejected the send.',
      };
      return jsonError(502, explain[result.reason] || 'Send failed.');
    }

    return NextResponse.json({ ok: true, id: result.id, to, subject: tpl.subject(data) });
  }

  return jsonError(400, 'action must be "preview" or "send"');
}
