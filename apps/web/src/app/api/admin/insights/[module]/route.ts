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
import { collectPagedRows } from '@/lib/paginate';

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
      // An export is the WHOLE list, not the page the button happened to ask for.
      // The Customers and Payments buttons send limit=500, so a CSV of a longer
      // list silently stopped at 500 rows. When the report is paged (`rows` +
      // a `total` counted in SQL) walk every page here, server-side.
      let exportData: any = data;
      let truncated = false;
      const first = data as { rows?: unknown[]; total?: number } | null;
      if (Array.isArray(first?.rows) && typeof first?.total === 'number' && first.total > first.rows.length) {
        const client = callerClient(req);
        const all = await collectPagedRows(async (offset, limit) => {
          const p = new URLSearchParams(q);
          p.set('limit', String(limit));
          p.set('offset', String(offset));
          const { data: pg, error: pageErr } = await client.rpc(mod.rpc, mod.args(p, range) as any);
          if (pageErr) throw new Error(pageErr.message);
          const page = pg as { rows?: unknown[]; total?: number } | null;
          return { rows: page?.rows ?? [], total: page?.total ?? 0 };
        });
        exportData = { ...(data as object), rows: all.rows };
        truncated = all.truncated;
      }
      const rows = mod.csv(exportData);
      // Exporting is a bulk read of personal data: audit it, and keep phone
      // numbers and provider ids out unless the caller is a super admin.
      const superAdmin = await isSuperAdmin(auth.supabase, auth.user.id);
      await auditAdmin({
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: 'report_exported',
        targetType: 'report',
        metadata: { module, rows: rows.length, from: range.from, to: range.to, ...(truncated ? { truncated: true } : {}) },
        req,
      });
      const csv = csvResponse(`influnet-${module}-${range.from}-to-${range.to}.csv`, rows, superAdmin ? [] : CSV_SENSITIVE);
      // Never pretend: a runaway export (over 50,000 rows) is cut and says so.
      if (truncated) csv.headers.set('X-Export-Truncated', 'true');
      return csv;
    }

    return NextResponse.json(
      { module, data, range, generated_at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(500, 'Could not load this report', error);
  }
}
