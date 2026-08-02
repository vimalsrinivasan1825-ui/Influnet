import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';
import { theme } from '@/lib/email/theme';
import type { EmailCategory } from '@/lib/email/templates';

/**
 * One-click unsubscribe. No session required — the HMAC in the token is the
 * authority (see lib/email/unsubscribe.ts for why).
 *
 * GET  — a human clicked the footer link. Applies the change, renders a page.
 * POST — Gmail/Yahoo's native unsubscribe button (List-Unsubscribe-Post).
 *        Must apply the change and return 200 without any interaction.
 */

const CATEGORY_LABEL: Record<string, string> = {
  collab: 'collaboration requests',
  project: 'project updates',
  payment: 'payment notifications',
  message: 'message notifications',
  marketing: 'product updates',
  all: 'all optional emails',
};

function service() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function applyOptOut(userId: string, category: EmailCategory | 'all'): Promise<boolean> {
  const sb = service();
  if (!sb) return false;

  // Turning off "all" means every optional category — account/security mail is
  // not in this table and stays on, which is correct: you cannot opt out of a
  // password reset.
  const patch =
    category === 'all'
      ? { collab: false, project: false, payment: false, message: false, marketing: false }
      : { [category]: false };

  const { error } = await sb
    .from('email_preferences')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) {
    console.error('[unsubscribe] failed to save preference:', error.message);
    return false;
  }
  return true;
}

function page(title: string, message: string, ok: boolean): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} · Influnet</title></head>
<body style="margin:0;background:${theme.page};font-family:${theme.font};display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
  <div style="max-width:460px;width:100%;background:${theme.surface};border:1px solid ${theme.border};border-radius:16px;padding:36px;text-align:center;">
    <div style="width:48px;height:48px;margin:0 auto 20px;border-radius:24px;background:${ok ? theme.successSoft : theme.dangerSoft};color:${ok ? theme.success : theme.danger};font-size:24px;line-height:48px;">${ok ? '✓' : '!'}</div>
    <h1 style="margin:0 0 10px;font-size:21px;color:${theme.ink};">${title}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${theme.body};">${message}</p>
    <a href="/dashboard/settings" style="display:inline-block;padding:12px 24px;border-radius:10px;background:${theme.brand};color:#fff;text-decoration:none;font-weight:600;font-size:14px;">Manage all email settings</a>
  </div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  const claim = token ? verifyUnsubscribeToken(token) : null;

  if (!claim) {
    return page(
      'This link is not valid',
      'The unsubscribe link was incomplete or has been altered. Open your email settings to change what we send you.',
      false,
    );
  }

  const ok = await applyOptOut(claim.userId, claim.category);
  const label = CATEGORY_LABEL[claim.category] || 'these emails';

  return ok
    ? page('You are unsubscribed', `You will no longer receive ${label} from Influnet. Account and security emails still come through — those cannot be turned off.`, true)
    : page('We could not save that', 'Something went wrong on our side. Please try again, or change it directly in your email settings.', false);
}

/** Gmail/Yahoo one-click. No body, no redirect, just 200. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get('t');
  const claim = token ? verifyUnsubscribeToken(token) : null;
  if (!claim) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

  const ok = await applyOptOut(claim.userId, claim.category);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
