import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyUser } from '@/lib/notify';
import { flag } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';

/**
 * Re-engagement nudge fan-out. Invoked by a scheduler (a GitHub Actions cron,
 * or Supabase pg_cron with net.http_post) once a day — see
 * docs/operations/REENGAGEMENT_NUDGES.md. NOT reachable by a normal user.
 *
 * Auth: a bearer secret in the `Authorization` header, compared to
 * `CRON_SECRET`. With no secret configured the route refuses — a re-engagement
 * endpoint open to the internet is a spam cannon.
 *
 * Decides nothing itself: nudge_candidates() (migration 142) returns who is
 * dormant and why, this maps each reason to copy and pushes it through
 * notifyUser (in-app card + Expo push, never email — the `nudge` type carries
 * no email option, deliberately).
 */
export const runtime = 'nodejs';

const COPY: Record<string, (d: any) => { title: string; body: string; link: string }> = {
  unread_messages: (d) => ({
    title: d.unread > 1 ? `You have ${d.unread} unread messages` : 'You have an unread message',
    body: 'A brand or creator is waiting to hear back from you.',
    link: '/dashboard/messages',
  }),
  your_turn: () => ({
    title: 'A project is waiting on you',
    body: 'Pick up where you left off — the next step is yours.',
    link: '/dashboard/projects',
  }),
  new_campaigns: (d) => ({
    title:
      d.newCampaigns > 1
        ? `${d.newCampaigns} new campaigns since you were here`
        : 'A new campaign since you were here',
    body: 'See what brands are looking for right now.',
    link: '/dashboard/campaigns',
  }),
  comeback: () => ({
    title: "It's been a while",
    body: 'Your collaborations, messages and payments are all where you left them.',
    link: '/dashboard',
  }),
};

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Reuses the notification-email master flag: staging/prod run it on, and it
  // is the switch that already gates outbound messaging in general.
  if (!flag('notify_emails')) {
    return NextResponse.json({ skipped: 'notifications disabled', sent: 0 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await (admin.rpc as any)('nudge_candidates', {});
  if (error) {
    logger.error('[cron/nudges] candidate query failed', { err: error });
    return NextResponse.json({ error: 'candidate query failed' }, { status: 500 });
  }

  const candidates = (data ?? []) as { user_id: string; reason: string; detail: any }[];
  let sent = 0;

  for (const c of candidates) {
    const build = COPY[c.reason];
    if (!build) continue;
    const { title, body, link } = build(c.detail ?? {});
    const ok = await notifyUser({ userId: c.user_id, type: 'nudge', title, body, link });
    if (ok) sent += 1;
  }

  logger.info('[cron/nudges] fan-out complete', { candidates: candidates.length, sent });
  return NextResponse.json({ candidates: candidates.length, sent });
}
