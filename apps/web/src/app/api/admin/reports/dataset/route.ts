import { NextResponse } from 'next/server';
import { callerClient, isSuperAdmin, jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { CSV_SENSITIVE, DATASETS, csvResponse, intParam, parseRange } from '@/lib/admin-insights';

/**
 * GET /api/admin/reports/dataset?dataset=&from=&to=&limit=&offset=[&format=csv]
 *   → { data } | text/csv
 *
 * The report builder's data source. `dataset` is one of the names
 * admin_report_dataset() (migration 160) knows — there is deliberately no
 * free-form SQL, no column list and no order-by from the client.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const q = new URL(req.url).searchParams;
    const dataset = (q.get('dataset') ?? '').trim();
    if (!(DATASETS as readonly string[]).includes(dataset)) {
      return jsonError(400, `Unknown dataset. Pick one of: ${DATASETS.join(', ')}`);
    }
    const range = parseRange(q);
    const isCsv = q.get('format') === 'csv';

    const { data, error } = await callerClient(req).rpc('admin_report_dataset', {
      p_dataset: dataset,
      p_from: range.from,
      p_to: range.to,
      p_limit: intParam(q, 'limit', isCsv ? 5000 : 200, 1, 5000),
      p_offset: intParam(q, 'offset', 0, 0, 100_000),
    });
    if (error) return jsonError(500, 'Could not build this report', error);

    if (isCsv) {
      const rows = ((data as any)?.rows ?? []) as Record<string, unknown>[];
      const superAdmin = await isSuperAdmin(auth.supabase, auth.user.id);
      await auditAdmin({
        actorId: auth.user.id, actorEmail: auth.user.email ?? null, action: 'report_exported',
        targetType: 'report', metadata: { dataset, rows: rows.length, ...range }, req,
      });
      return csvResponse(`influnet-${dataset}-${range.from}-to-${range.to}.csv`, rows, superAdmin ? [] : CSV_SENSITIVE);
    }

    return NextResponse.json({ data, range });
  } catch (error) {
    return jsonError(500, 'Could not build this report', error);
  }
}
