import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StatRow {
  bucket: string;
  identity: string;
  window_start: string;
  request_count: number;
  limited_count: number;
  limit_value: number | null;
}

/**
 * Aggregated rate-limit visibility (observe only — no enforcement here).
 *
 * rate_limit_stats (109) is one row per (bucket, caller, hour), written
 * best-effort from rate-limit.ts. This groups those rows into a per-bucket
 * summary plus a top-callers breakdown, resolving UUID-shaped identities to
 * the profile they belong to so "which user" doesn't require a manual lookup.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 24, 1), 24 * 30);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from('rate_limit_stats')
      .select('bucket, identity, window_start, request_count, limited_count, limit_value')
      .gte('window_start', since)
      .order('window_start', { ascending: false });

    if (error) throw error;

    const stats = (rows || []) as StatRow[];

    const userIds = Array.from(new Set(stats.map((r) => r.identity).filter((id) => UUID_RE.test(id))));
    const profileById = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
      for (const p of profiles || []) profileById.set(p.id, { name: p.name, email: p.email });
    }

    const byBucket = new Map<
      string,
      {
        bucket: string;
        requestCount: number;
        limitedCount: number;
        limitValue: number | null;
        callers: Map<string, { identity: string; requestCount: number; limitedCount: number }>;
      }
    >();

    for (const row of stats) {
      let bucketEntry = byBucket.get(row.bucket);
      if (!bucketEntry) {
        bucketEntry = { bucket: row.bucket, requestCount: 0, limitedCount: 0, limitValue: row.limit_value, callers: new Map() };
        byBucket.set(row.bucket, bucketEntry);
      }
      bucketEntry.requestCount += row.request_count;
      bucketEntry.limitedCount += row.limited_count;
      if (row.limit_value != null) bucketEntry.limitValue = row.limit_value;

      let caller = bucketEntry.callers.get(row.identity);
      if (!caller) {
        caller = { identity: row.identity, requestCount: 0, limitedCount: 0 };
        bucketEntry.callers.set(row.identity, caller);
      }
      caller.requestCount += row.request_count;
      caller.limitedCount += row.limited_count;
    }

    const buckets = Array.from(byBucket.values())
      .map((b) => ({
        bucket: b.bucket,
        requestCount: b.requestCount,
        limitedCount: b.limitedCount,
        limitValue: b.limitValue,
        distinctCallers: b.callers.size,
        topCallers: Array.from(b.callers.values())
          .sort((a, c) => c.requestCount - a.requestCount)
          .slice(0, 10)
          .map((c) => {
            const isUser = UUID_RE.test(c.identity);
            const profile = isUser ? profileById.get(c.identity) : undefined;
            return {
              identity: c.identity,
              kind: isUser ? ('user' as const) : ('ip' as const),
              label: profile?.name || profile?.email || (isUser ? c.identity : c.identity),
              requestCount: c.requestCount,
              limitedCount: c.limitedCount,
            };
          }),
      }))
      .sort((a, b) => b.requestCount - a.requestCount);

    return NextResponse.json({ hours, buckets });
  } catch (error) {
    return jsonError(500, 'Could not load rate-limit stats', error);
  }
}
