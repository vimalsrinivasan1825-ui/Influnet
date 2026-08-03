import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin } from '@/lib/api';

/**
 * Platform-wide activity — "who signed up, and what is happening right now".
 *
 * Both RPCs guard themselves with `is_admin()`, so they must be called with
 * the CALLER's client: the service-role client from `withAdmin` has no
 * `auth.uid()` and would fail the guard. `withAdmin` still runs first, so an
 * unauthenticated or non-admin caller is rejected before any query.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const url = new URL(req.url);
    const num = (name: string, fallback: number) => {
      const raw = Number(url.searchParams.get(name));
      return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
    };

    const hours = Math.min(num('hours', 168), 2160);
    const limit = Math.min(num('limit', 100), 300);
    const offset = Math.max(num('offset', 0), 0);

    const scoped = callerClient(req);

    const [activity, pulse] = await Promise.all([
      scoped.rpc('get_platform_activity', {
        p_limit: limit,
        p_offset: offset,
        p_hours: hours,
      }),
      // The pulse window is intentionally shorter than the feed window: the
      // feed is "what happened this week", the counters are "how is today".
      scoped.rpc('get_platform_pulse', { p_hours: Math.min(hours, 24) }),
    ]);

    // Migration 099 not applied yet is an expected state on an environment
    // that is behind, so say so precisely instead of returning a bare 500 that
    // sends someone digging through logs.
    const missing = [activity.error, pulse.error].find((e) =>
      e?.message?.includes('does not exist'),
    );
    if (missing) {
      return jsonError(
        503,
        'The activity feed functions are not installed on this database yet. Apply migration 099 and retry.',
        missing,
      );
    }

    if (activity.error) return jsonError(500, 'Could not load platform activity', activity.error);

    return NextResponse.json({
      events: activity.data ?? [],
      pulse: pulse.data ?? null,
      hours,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(500, 'Could not load platform activity', error);
  }
}
