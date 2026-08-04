import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

// GET all campaign projects for the authenticated user.
//
// Projects are only ever created by accepting a proposal — see
// POST/PATCH /api/conversations/[id]/deal. There is deliberately no POST here:
// a project must never exist before both sides have agreed the terms.
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Rate limit: project listing is a core authenticated resource.
    const limited = await enforceRateLimit(req, {
      bucket: 'projects:list', limit: 30, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    // ?deleted=true switches to the Deleted Projects view (migration 103):
    // rows either participant manually deleted, kept indefinitely — the
    // opposite filter from the default list below.
    const showDeleted = new URL(req.url).searchParams.get('deleted') === 'true';

    // Retrieve projects where caller is owner or counterparty.
    // Excludes both pending_acceptance terms (migration 069) and stale
    // cancelled rows past their 15-day retention window (migration 092).
    let query = supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .neq('status', 'pending_acceptance');

    query = showDeleted
      ? query.not('manually_deleted_at', 'is', null)
      : query
          .is('manually_deleted_at', null)
          // Cancelled projects stay visible for 15 days (migration 092), then
          // they are hidden — deleted_at is set to now() + 15 days by the
          // cancel_project() RPC, so the filter reads "not past its expiry."
          .or('deleted_at.is.null,deleted_at.gt.now()');

    const { data: projects, error } = await query.order('updated_at', { ascending: false });

    if (error) return jsonError(500, 'Database query error', error);

    return NextResponse.json({ projects });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
