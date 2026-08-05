import { NextResponse } from 'next/server';
import { jsonError, withAdmin, callerClient } from '@/lib/api';

/**
 * Admin user detail — profile, connections, and activity for a single user.
 *
 * Deliberately excludes message/chat content: connections show who the user
 * is linked to and through what (a pending request or a project, with its
 * stage/budget), never what was said. Same boundary get_user_activity (073)
 * already respects for the self-service version.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, email, name, phone, location, created_at, updated_at, verification_status, verified_at, verified_badge')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return jsonError(404, 'User not found');
    }

    const enriched: any = { ...profile };
    let lastSignInAt: string | null = null;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(id);
      lastSignInAt = authUser?.user?.last_sign_in_at ?? null;
    } catch {
      // Non-fatal — same graceful degradation as the users list route.
    }
    enriched.last_sign_in_at = lastSignInAt;

    if (profile.role === 'business_owner') {
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('company_name, industry, approval_status, website')
        .eq('user_id', id)
        .single();
      if (biz) Object.assign(enriched, { company_name: biz.company_name, business_industry: biz.industry, approval_status: biz.approval_status, website: biz.website });
    } else if (profile.role === 'influencer') {
      const { data: inf } = await supabase
        .from('influencer_profiles')
        .select('username, niche')
        .eq('user_id', id)
        .single();
      if (inf) Object.assign(enriched, { username: inf.username, niche: inf.niche });
    }

    const [{ data: projects }, { data: requests }, activityRes] = await Promise.all([
      supabase
        .from('campaign_projects')
        .select(`
          id, title, status, current_stage, budget, created_at,
          owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
          counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
        `)
        .or(`owner_user_id.eq.${id},counterparty_user_id.eq.${id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('collab_requests')
        .select(`
          id, status, budget, created_at, updated_at,
          from_user:profiles!collab_requests_from_user_id_fkey(id, name, role),
          to_user:profiles!collab_requests_to_user_id_fkey(id, name, role)
        `)
        .or(`from_user_id.eq.${id},to_user_id.eq.${id}`)
        .order('created_at', { ascending: false }),
      callerClient(req).rpc('admin_get_user_activity', { p_user_id: id, p_limit: 100, p_offset: 0 }),
    ]);

    if (activityRes.error) {
      // Read-only enrichment — a broken RPC call shouldn't blank the whole page.
      console.error('[admin/users/[id]] activity RPC failed:', activityRes.error.message);
    }

    return NextResponse.json({
      user: enriched,
      projects: projects || [],
      requests: requests || [],
      activity: activityRes.data || [],
    });
  } catch (error) {
    return jsonError(500, 'Could not load this user', error);
  }
}
