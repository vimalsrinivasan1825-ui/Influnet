import { NextResponse } from 'next/server';
import { jsonError, withSuperAdmin } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadObservability } from '@/lib/observability-dashboard';

/**
 * GET /api/admin/observability[?refresh=1]
 *   → { sentry, posthog, generatedAt, cached }
 *
 * Sentry's unresolved issues and PostHog's usage/funnel/web-vitals, in one
 * response for the developer dashboard. Super admins only: issue titles and
 * culprits describe the code, and the funnel is commercially sensitive.
 *
 * Never 5xx for a vendor problem — each panel carries its own `ok` and
 * `reason`. `refresh=1` skips the 60s cache and is rate limited, because each
 * refresh spends PostHog query budget.
 */
export async function GET(req: Request) {
  try {
    const auth = await withSuperAdmin(req);
    if (!auth.ok) return auth.res;

    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    if (refresh) {
      const limited = await enforceRateLimit(req, {
        bucket: 'admin:observability-refresh', limit: 6, windowMs: 60_000, key: auth.user.id,
      });
      if (limited) return limited;
    }

    const snapshot = await loadObservability({ refresh });
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(500, 'Could not load observability data', error);
  }
}
