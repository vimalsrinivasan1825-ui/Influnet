/**
 * GET /api/stats/funnel → { funnel }
 *
 * Envelope: `funnel`.
 *
 * S4 — the networking funnel. get_collaboration_stats() (migration 113) was
 * built to power a profile's public counters and already returns everything
 * a self-facing funnel needs, including requests_sent since migration 130.
 * This route is the missing self-scoped read: the RPC takes any user id and
 * is grant to anon/authenticated for the public-profile case, so this simply
 * calls it with the CALLER's own id, same as the public route does for
 * someone else's.
 */
import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data, error } = await supabase.rpc('get_collaboration_stats', { p_user_id: user.id });
    if (error) return jsonError(500, 'Failed to load your stats', error);

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      funnel: {
        requests_sent: row?.requests_sent ?? 0,
        requests_accepted: row?.requests_accepted ?? 0,
        projects_total: row?.projects_total ?? 0,
        projects_active: row?.projects_active ?? 0,
        projects_completed: row?.projects_completed ?? 0,
        projects_cancelled: row?.projects_cancelled ?? 0,
        partners_total: row?.partners_total ?? 0,
        first_collab_at: row?.first_collab_at ?? null,
        last_collab_at: row?.last_collab_at ?? null,
      },
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
