import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-auth';
import { serviceRoleClient } from '@/lib/supabase/service';
import { notifyUser } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { jsonError } from '@/lib/api';
import { renewalCopy } from '@/lib/renewal-reminders';

/**
 * POST /api/cron/maintenance → { otpPurge, renewalReminders }
 *
 * Daily housekeeping for the admin CRM:
 *   • purge OTP sessions/audit rows older than 90 days (migration 154 — phone
 *     numbers are personal data and have no use after that);
 *   • Pro renewal reminders at 7 / 3 / 1 days before expiry and once just after
 *     (migration 155's renewal_reminder_candidates, deduped per 20 h).
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const admin = serviceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  try {
    const { data: otpPurge, error: purgeErr } = await (admin.rpc as any)('purge_old_otp_logs', { p_days: 90 });
    if (purgeErr) logger.error('[cron/maintenance] OTP purge failed', { err: purgeErr });

    const { data: candidates, error: candErr } = await (admin.rpc as any)('renewal_reminder_candidates');
    if (candErr) logger.error('[cron/maintenance] renewal candidates failed', { err: candErr });

    let sent = 0;
    for (const c of (candidates ?? []) as { user_id: string; stage: number; period_end: string }[]) {
      const { title, body } = renewalCopy(c.stage, c.period_end);
      const ok = await notifyUser({
        userId: c.user_id,
        type: 'reminder',
        title,
        body,
        link: '/dashboard/billing',
        email: {
          templateId: 'generic',
          category: 'payment',
          dedupeKey: `renewal:${c.user_id}:${c.stage}:${c.period_end.slice(0, 10)}`,
          data: { title, body, link: '/dashboard/billing', ctaLabel: 'Renew Pro' },
        },
      });
      if (ok) sent += 1;
    }

    const result = {
      otpPurge: purgeErr ? null : otpPurge,
      renewalReminders: { candidates: (candidates ?? []).length, sent },
    };
    logger.info('[cron/maintenance] complete', result);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(500, 'Maintenance run failed', error);
  }
}
