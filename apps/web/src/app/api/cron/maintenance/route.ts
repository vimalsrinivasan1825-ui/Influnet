import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cronAuthorized } from '@/lib/cron-auth';
import { serviceRoleClient } from '@/lib/supabase/service';
import { notifyUser } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { jsonError } from '@/lib/api';
import { renewalCopy } from '@/lib/renewal-reminders';
import { getTemplate } from '@/lib/email/templates';
import { renderAndSend } from '@/lib/email/policy';
import { loadObservability } from '@/lib/observability-dashboard';

/**
 * POST /api/cron/maintenance → { otpPurge, renewalReminders, digest }
 *
 * Daily housekeeping for the admin CRM:
 *   • purge OTP sessions/audit rows older than 90 days (migration 154 — phone
 *     numbers are personal data and have no use after that);
 *   • Pro renewal reminders at 7 / 3 / 1 days before expiry and once just after
 *     (migration 155's renewal_reminder_candidates, deduped per 20 h);
 *   • G17: a daily ops digest emailed to every super admin.
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

    const digest = await sendAdminDigest(admin);

    const result = {
      otpPurge: purgeErr ? null : otpPurge,
      renewalReminders: { candidates: (candidates ?? []).length, sent },
      digest,
    };
    logger.info('[cron/maintenance] complete', result);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(500, 'Maintenance run failed', error);
  }
}

/**
 * G17: "is anyone about to be surprised by something that happened overnight"
 * emailed to every super admin — new signups, GMV, tickets nobody has
 * answered in a day, pending approvals/verifications, and new Sentry issues.
 * Reuses admin_period_kpis (158) directly: it carries no admin_has_permission
 * check of its own (only REVOKEd from PUBLIC/anon/authenticated, which a
 * service-role call isn't subject to), same as the two RPCs above it. A
 * failure here must not fail the rest of the cron run.
 */
async function sendAdminDigest(admin: SupabaseClient): Promise<{ recipients: number; sent: number }> {
  try {
    const tpl = getTemplate('admin_digest');
    if (!tpl) return { recipients: 0, sent: 0 };

    const now = new Date();
    const istDateStr = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startIst = new Date(`${istDateStr}T00:00:00+05:30`);
    const endIst = new Date(startIst.getTime() + 24 * 60 * 60 * 1000);

    const [kpisRes, approvalsRes, verificationsRes, ticketsRes, founders, observability] = await Promise.all([
      (admin.rpc as any)('admin_period_kpis', { v_from: startIst.toISOString(), v_to: endIst.toISOString() }),
      admin.from('business_profiles').select('user_id', { count: 'exact', head: true }).eq('approval_status', 'pending_review'),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'in_review'),
      admin
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(resolved,closed)')
        .eq('awaiting_admin', true)
        .lt('last_message_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
      admin.from('profiles').select('id').eq('role', 'admin').eq('is_super_admin', true),
      loadObservability({}),
    ]);

    if (kpisRes.error) logger.error('[cron/maintenance] digest KPIs failed', { err: kpisRes.error });
    const kpis = kpisRes.data ?? {};

    const data = {
      dateLabel: startIst.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      newSignups: kpis.signups ?? 0,
      newCreators: kpis.signups_creators ?? 0,
      newBusinesses: kpis.signups_businesses ?? 0,
      gmvRupees: `₹${Math.round((kpis.gmv_paise ?? 0) / 100).toLocaleString('en-IN')}`,
      openTicketsOver24h: ticketsRes.count ?? 0,
      pendingApprovals: approvalsRes.count ?? 0,
      pendingVerifications: verificationsRes.count ?? 0,
      sentryNewIssues: observability.sentry.totals.newIn24h,
      sentryConfigured: observability.sentry.configured,
      dashboardUrl: '/dashboard/admin/founder',
    };

    const founderIds = (founders.data ?? []) as { id: string }[];
    let sentCount = 0;
    for (const f of founderIds) {
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(f.id);
      const to = authUser?.user?.email;
      if (authErr || !to) continue;
      const result = await renderAndSend(tpl, data, to, {
        idempotencyKey: `admin-digest:${istDateStr}:${f.id}`,
      });
      if (result.sent) sentCount += 1;
      else logger.warn('[cron/maintenance] digest send failed', { founderId: f.id, reason: result.reason });
    }

    return { recipients: founderIds.length, sent: sentCount };
  } catch (error) {
    logger.error('[cron/maintenance] digest failed', { err: error });
    return { recipients: 0, sent: 0 };
  }
}
