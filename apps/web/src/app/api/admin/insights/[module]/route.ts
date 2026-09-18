import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin, withSuperAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { isSuperAdmin } from '@/lib/api';
import {
  CSV_SENSITIVE,
  MODULES,
  csvResponse,
  parseRange,
} from '@/lib/admin-insights';

/**
 * GET /api/admin/insights/<module>?from=&to=|days=&…[&format=csv]
 *   → { module, data, range, generated_at }
 *   → text/csv when format=csv and the module defines a CSV shape
 *
 * One route for every read-only admin report. `module` is a key of MODULES
 * (lib/admin-insights.ts), never a table or function name from the client.
 *
 * The RPCs guard themselves with is_admin(), so they are called with the
 * CALLER's client — the service-role client `withAdmin` returns has no
 * auth.uid() and would fail that check (the trap documented on withAdmin).
 */
export async function GET(req: Request, ctx: { params: Promise<{ module: string }> }) {
  try {
    const { module } = await ctx.params;
    const mod = MODULES[module];
    if (!mod) return jsonError(404, 'Unknown report');

    const auth = mod.tier === 'super' ? await withSuperAdmin(req) : await withAdmin(req);
    if (!auth.ok) return auth.res;

    const url = new URL(req.url);
    const q = url.searchParams;
    const range = parseRange(q);

    const { data, error } = await callerClient(req).rpc(mod.rpc, mod.args(q, range) as any);
    if (error) {
      if (/does not exist|Could not find the function/i.test(error.message ?? '')) {
        return jsonError(503, 'This report needs a database migration that has not been applied here yet.', error);
      }
      if (/forbidden/i.test(error.message ?? '')) return jsonError(403, 'Admin access required', error);
      if (/range too large/i.test(error.message ?? '')) return jsonError(400, 'That date range is too wide.', error);
      return jsonError(500, 'Could not load this report', error);
    }

    if (q.get('format') === 'csv' && mod.csv) {
      const rows = mod.csv(data);
      // Exporting is a bulk read of personal data: audit it, and keep phone
      // numbers and provider ids out unless the caller is a super admin.
      const superAdmin = await isSuperAdmin(auth.supabase, auth.user.id);
      await auditAdmin({
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: 'report_exported',
        targetType: 'report',
        metadata: { module, rows: rows.length, from: range.from, to: range.to },
        req,
      });
      return csvResponse(`influnet-${module}-${range.from}-to-${range.to}.csv`, rows, superAdmin ? [] : CSV_SENSITIVE);
    }

    return NextResponse.json(
      { module, data, range, generated_at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(500, 'Could not load this report', error);
  }
}
