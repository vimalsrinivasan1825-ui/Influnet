import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch business profile & user profile
    const [profileRes, businessProfileRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', user.id).single(),
      supabase.from('business_profiles').select('company_name, industry').eq('user_id', user.id).single()
    ]);

    const userProfile = profileRes.data;
    const bizProfile = businessProfileRes.data;

    // 2. Fetch collab requests (source of truth for budget & trends)
    const { data: collabs } = await supabase
      .from('collab_requests')
      .select('id, status, budget, created_at')
      .eq('from_user_id', user.id);

    const pending = collabs?.filter(c => c.status === 'pending').length || 0;
    const acceptedCollabs = collabs?.filter(c => c.status === 'accepted') || [];
    const accepted = acceptedCollabs.length;

    // Budget from accepted collab requests only (source of truth)
    const pipeline_value = acceptedCollabs.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);

    // 3. Fetch campaign projects for completion tracking
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select('status')
      .eq('owner_user_id', user.id);

    const active_projects = projects?.filter(p => p.status === 'active').length || 0;
    const completed_projects = projects?.filter(p => p.status === 'completed').length || 0;

    // active_collabs_count = unique active engagements
    const active_collabs_count = Math.max(active_projects, accepted);

    // 4. Weekly spend trend (last 6 weeks)
    const weeklySpend: { week: string; spend: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekLabel = weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      const weekSpend = acceptedCollabs
        .filter(c => {
          const d = new Date(c.created_at);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((sum, c) => sum + (Number(c.budget) || 0), 0);

      weeklySpend.push({ week: weekLabel, spend: weekSpend });
    }

    // 5. Pipeline breakdown for bar chart
    const pipelineData = [
      { name: 'Proposals', value: pending, fill: '#f59e0b' },
      { name: 'Active', value: active_collabs_count, fill: '#2563eb' },
      { name: 'Completed', value: completed_projects, fill: '#16a34a' },
    ];

    // 6. Fetch recent collabs with influencer data
    const { data: recentCollabData } = await supabase
      .from('collab_requests')
      .select(`
        id, budget, status, created_at,
        influencer:profiles!collab_requests_to_user_id_fkey(id, name)
      `)
      .eq('from_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const recent_collabs = [];
    if (recentCollabData) {
      for (const c of recentCollabData) {
        const collab = c as any;
        const { data: inflProf } = await supabase
          .from('influencer_profiles')
          .select('instagram_followers, youtube_subscribers, instagram_handle')
          .eq('user_id', collab.influencer?.id)
          .maybeSingle();

        const reachVal = inflProf
          ? Math.max(inflProf.instagram_followers || 0, inflProf.youtube_subscribers || 0)
          : 0;

        recent_collabs.push({
          id: collab.id,
          name: collab.influencer?.name || 'Creator',
          amount: collab.budget ? `₹${Number(collab.budget).toLocaleString()}` : 'TBD',
          // An accepted request means the two sides are TALKING — the project
          // only exists once they agree terms, so this can't say "In Progress".
          status: collab.status === 'pending' ? 'Awaiting reply'
                : collab.status === 'accepted' ? 'In discussion'
                : 'Closed',
          platform: inflProf?.instagram_handle ? 'Instagram' : 'Creator',
          reach: reachVal > 0 ? reachVal.toLocaleString() : '—',
        });
      }
    }

    return NextResponse.json({
      profile: {
        name: userProfile?.name || 'User',
        company_name: bizProfile?.company_name || 'Your Company',
        industry: bizProfile?.industry || 'Unknown',
      },
      stats: {
        active_collabs_count,
        completed_collabs_count: completed_projects,
        pending_collabs_count: pending,
        pipeline_value,
      },
      weekly_spend: weeklySpend,
      pipeline_data: pipelineData,
      recent_collabs: recent_collabs.length > 0 ? recent_collabs : null,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
