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

    // 1. Fetch profiles
    const [profileRes, inflProfileRes] = await Promise.all([
      supabase.from('profiles').select('name, location').eq('id', user.id).single(),
      supabase.from('influencer_profiles').select('*').eq('user_id', user.id).single()
    ]);

    const profileData = profileRes.data;
    const inflData = inflProfileRes.data;

    // 2. Fetch all collab requests (for stats + trends)
    const { data: collabs } = await supabase
      .from('collab_requests')
      .select('id, status, budget, created_at')
      .eq('to_user_id', user.id);

    const pending = collabs?.filter(c => c.status === 'pending').length || 0;
    const acceptedCollabs = collabs?.filter(c => c.status === 'accepted') || [];
    const declinedCollabs = collabs?.filter(c => c.status === 'declined') || [];
    const completedCollabs = collabs?.filter(c => c.status === 'completed') || [];
    const active_discussions = acceptedCollabs.length;

    // Total earnings from accepted collab budgets
    const total_earnings = acceptedCollabs.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);

    // 3. Fetch projects
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select('status')
      .eq('counterparty_user_id', user.id);

    const active_projects = projects?.filter(p => p.status === 'active').length || 0;
    const completed_projects = projects?.filter(p => p.status === 'completed').length || 0;

    // 4. Weekly earnings trend (last 6 weeks)
    const earningsTrend: { week: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekLabel = weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      const weekAmount = acceptedCollabs
        .filter(c => {
          const d = new Date(c.created_at);
          return d >= weekStart && d < new Date(weekStart.getTime() + 7 * 86400000);
        })
        .reduce((sum, c) => sum + (Number(c.budget) || 0), 0);

      earningsTrend.push({ week: weekLabel, amount: weekAmount });
    }

    // 5. Request breakdown for bar chart
    const requestBreakdown = [
      { name: 'Pending', value: pending, fill: '#f59e0b' },
      { name: 'Active', value: active_projects, fill: '#2563eb' },
      { name: 'Completed', value: completed_projects, fill: '#16a34a' },
      { name: 'Declined', value: declinedCollabs.length, fill: '#dc2626' },
    ];

    // 6. Fetch recent collabs with sender info
    const { data: recentCollabData } = await supabase
      .from('collab_requests')
      .select(`
        id, budget, status, created_at,
        sender:profiles!collab_requests_from_user_id_fkey(id, name)
      `)
      .eq('to_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const recent_collabs = (recentCollabData || []).map((c: any) => ({
      id: c.id,
      name: c.sender?.name || 'Brand',
      amount: c.budget ? `₹${Number(c.budget).toLocaleString()}` : 'TBD',
      status: c.status === 'pending' ? 'Negotiation'
            : c.status === 'accepted' ? 'In Progress'
            : c.status === 'declined' ? 'Declined'
            : 'Completed',
      sender_id: c.sender?.id,
    }));

    return NextResponse.json({
      profile: {
        name: profileData?.name || 'Creator',
        username: inflData?.username || (profileData?.name || 'creator').toLowerCase().replace(/[^a-z0-9]/g, ''),
        niche: inflData?.niche || [],
        is_verified: false,
        headline: inflData?.bio ? inflData.bio.substring(0, 50) + '...' : null,
        avatar_url: null,
        bio: inflData?.bio || null,
        location: profileData?.location || null,
      },
      stats: {
        collab_requests: pending,
        active_discussions,
        active_projects,
        completed_projects,
        total_earnings,
      },
      earnings_trend: earningsTrend,
      request_breakdown: requestBreakdown,
      recent_collabs: recent_collabs.length > 0 ? recent_collabs : null,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
