import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadObservability } from '@/lib/observability-dashboard';

/**
 * GET /api/admin/errors[?refresh=1] → { configured, ok, reason, issues, counts }
 *
 * A business-safe view of Sentry's unresolved issues for the ordinary admin:
 * what is breaking, how often, how many people it hit. Deliberately WITHOUT
 * culprits, permalinks or stack detail — those describe the code and stay on
 * the developer's /dashboard/admin/observability page.
 *
 * Sentry stays the source of truth; this does not copy errors into our database.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    if (refresh) {
      const limited = await enforceRateLimit(req, {
        bucket: 'admin:errors-refresh', limit: 6, windowMs: 60_000, key: auth.user.id,
      });
      if (limited) return limited;
    }

    const snapshot = await loadObservability({ refresh });
    const sentry = snapshot.sentry;
    const issues = (sentry.issues ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      level: i.level,
      count: i.count,
      userCount: i.userCount,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      isNew: i.isNew,
    }));

    return NextResponse.json(
      {
        configured: sentry.configured,
        ok: sentry.ok,
        reason: sentry.reason ?? null,
        generatedAt: snapshot.generatedAt,
        counts: {
          issues: issues.length,
          newIssues: issues.filter((i) => i.isNew).length,
          events: issues.reduce((sum, i) => sum + i.count, 0),
          usersAffected: issues.reduce((sum, i) => sum + i.userCount, 0),
        },
        issues,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(500, 'Could not load errors', error);
  }
}
