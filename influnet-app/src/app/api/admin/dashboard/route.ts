import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch aggregated stats
    const [profilesRes, businessesRes, influencersRes, collabsRes, projectsRes] = await Promise.all([
      supabase.from('profiles').select('role'),
      supabase.from('business_profiles').select('approval_status'),
      supabase.from('influencer_profiles').select('user_id'),
      supabase.from('collab_requests').select('status'),
      supabase.from('campaign_projects').select('status'),
    ]);

    const allProfiles = profilesRes.data || [];
    const businesses = businessesRes.data || [];
    const influencers = influencersRes.data || [];
    const collabs = collabsRes.data || [];
    const projects = projectsRes.data || [];

    const totalUsers = allProfiles.length;
    const totalBusinesses = allProfiles.filter((p: any) => p.role === 'business_owner').length;
    const totalInfluencers = allProfiles.filter((p: any) => p.role === 'influencer').length;
    const pendingApprovals = businesses.filter((b: any) => b.approval_status === 'pending_review').length;
    const totalCollabs = collabs.length;
    const activeCollabs = collabs.filter((c: any) => c.status === 'accepted').length;
    const pendingCollabs = collabs.filter((c: any) => c.status === 'pending').length;
    const activeProjects = projects.filter((p: any) => p.status === 'active').length;
    const completedProjects = projects.filter((p: any) => p.status === 'completed').length;

    return NextResponse.json({
      stats: {
        total_users: totalUsers,
        total_businesses: totalBusinesses,
        total_influencers: totalInfluencers,
        pending_approvals: pendingApprovals,
        total_collabs: totalCollabs,
        active_collabs: activeCollabs,
        pending_collabs: pendingCollabs,
        active_projects: activeProjects,
        completed_projects: completedProjects,
      }
    });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/dashboard] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
