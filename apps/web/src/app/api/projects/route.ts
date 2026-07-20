import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

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

    // Retrieve projects where caller is owner or counterparty
    const { data: projects, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      // 'pending_acceptance' rows (migration 069) are un-agreed TERMS, not
      // projects. They belong in the conversation until someone accepts them —
      // listing them here made unstarted work look like a live project.
      .neq('status', 'pending_acceptance')
      .order('updated_at', { ascending: false });

    if (error) return jsonError(500, 'Database query error', error);

    return NextResponse.json({ projects });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
