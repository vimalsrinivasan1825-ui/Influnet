import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-auth';
import { runBroadcastCycle } from '@/lib/broadcasts';
import { serviceRoleClient } from '@/lib/supabase/service';
import { jsonError } from '@/lib/api';

/**
 * POST /api/cron/broadcasts → CycleResult
 *
 * One broadcast cycle: enqueue due one-off / recurring runs, send queued push,
 * in-app and email deliveries, poll push receipts, refresh run stats. Invoked
 * every 5 minutes by .github/workflows/admin-broadcasts.yml (or pg_cron).
 * Safe to overlap — see lib/broadcasts.ts.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const admin = serviceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  try {
    const result = await runBroadcastCycle(admin);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(500, 'Broadcast cycle failed', error);
  }
}
