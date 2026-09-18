import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * GET /api/admin/dashboard → { stats: AdminHomeData }
 *
 * Every number is a `count: 'exact', head: true` query, so Postgres does the
 * counting and no rows come back. This used to select whole tables and count
 * them in JS — PostgREST caps a response at the project's Max Rows (1000 by
 * default), so past that size every tile silently froze at the cap.
 *
 * A failed count is a 500, not a 0: a tile reading "0 pending approvals" when
 * the query actually failed tells the admin there is nothing to review.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const count = (table: string) =>
      supabase.from(table).select('*', { count: 'exact', head: true });

    const queries = {
      total_users: count('profiles'),
      total_businesses: count('profiles').eq('role', 'business_owner'),
      total_influencers: count('profiles').eq('role', 'influencer'),
      pending_approvals: count('business_profiles').eq('approval_status', 'pending_review'),
      total_collabs: count('collab_requests'),
      active_collabs: count('collab_requests').eq('status', 'accepted'),
      pending_collabs: count('collab_requests').eq('status', 'pending'),
      active_projects: count('campaign_projects').eq('status', 'active'),
      completed_projects: count('campaign_projects').eq('status', 'completed'),
    };

    const keys = Object.keys(queries) as (keyof typeof queries)[];
    const results = await Promise.all(keys.map((k) => queries[k]));

    const failed = results.find((r: any) => r.error || r.count == null);
    if (failed) {
      return jsonError(500, 'Could not load the admin dashboard', (failed as any).error);
    }

    const stats = Object.fromEntries(
      keys.map((k, i) => [k, (results[i] as any).count as number])
    ) as Record<keyof typeof queries, number>;

    return NextResponse.json({ stats });
  } catch (error) {
    return jsonError(500, 'Could not load the admin dashboard', error);
  }
}
