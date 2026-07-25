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
      supabase.from('profiles').select('name, location, welcome_seen_at').eq('id', user.id).single(),
      supabase.from('influencer_profiles').select('*').eq('user_id', user.id).single()
    ]);

    // A silent error here previously meant `welcome_seen` was ALWAYS undefined
    // for every user, forever — column-level grants on `profiles` fail the
    // WHOLE select if a requested column isn't in the granted set (migration
    // 078 fixes the actual grant), and this route never surfaced that. Log it
    // so a future version of this same mistake (a new profiles column used in
    // a direct select without updating the 048 grant list) shows up instead
    // of quietly breaking a feature with no error anywhere.
    if (profileRes.error) {
      console.error('[influencer/dashboard] profiles select failed:', profileRes.error);
    }

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
    const active_discussions = acceptedCollabs.length;

    // 3. Fetch projects
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select('id, status, budget, created_by_user_id')
      .eq('counterparty_user_id', user.id);

    const active_projects = projects?.filter(p => p.status === 'active').length || 0;
    const completed_projects = projects?.filter(p => p.status === 'completed').length || 0;

    // Terms proposed by the brand and awaiting THIS creator's response — the
    // one thing genuinely blocked on the creator, previously invisible here.
    const proposals_awaiting_you = (projects || []).filter(
      p => p.status === 'pending_acceptance' && p.created_by_user_id !== user.id,
    ).length;

    // Pipeline value: budget of projects BOTH sides have actually agreed to
    // (status='active'), not the brand's opening ask on every conversation
    // that was ever accepted (accepting a collab request only opens the
    // conversation — see migration 069 — so it may represent nothing more
    // than a polite reply).
    const pipeline_value = (projects || [])
      .filter(p => p.status === 'active')
      .reduce((sum, p) => sum + (Number(p.budget) || 0), 0);

    // Earnings: money that has actually been paid, not requests exchanged.
    const projectIds = (projects || []).map(p => p.id);
    let paidPayments: { amount: number; paid_at: string | null }[] = [];
    if (projectIds.length > 0) {
      const { data: payments } = await supabase
        .from('project_payments')
        .select('amount, paid_at')
        .in('project_id', projectIds)
        .eq('status', 'paid');
      paidPayments = payments || [];
    }

    // 3a. Active roster — the brands this creator is currently working with.
    // Real data only: this used to be a hardcoded "L'Oréal / Nike" placeholder
    // that every creator saw regardless of their actual account.
    const { data: activeRosterData } = await supabase
      .from('campaign_projects')
      .select('id, title, status, owner:profiles!campaign_projects_owner_user_id_fkey(id, name)')
      .eq('counterparty_user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(4);

    const active_roster = (activeRosterData || []).map((p: any) => ({
      id: p.id,
      brand_name: p.owner?.name || 'Brand',
      project_title: p.title || 'Collaboration',
    }));

    // 4. Weekly earnings trend (last 6 weeks) — actual payments received, in
    // rupees (project_payments.amount is paise), bucketed by when they landed.
    const earningsTrend: { week: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekLabel = weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      const weekAmount = paidPayments
        .filter(p => {
          if (!p.paid_at) return false;
          const d = new Date(p.paid_at);
          return d >= weekStart && d < new Date(weekStart.getTime() + 7 * 86400000);
        })
        .reduce((sum, p) => sum + Math.round((p.amount || 0) / 100), 0);

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
        // No name-derived fallback: a slug guessed from the display name
        // routinely doesn't match the real /c/[username] row, so the welcome
        // modal would hand out a link that 404s. Null tells the UI to prompt
        // the creator to pick a username instead of showing a broken one.
        username: inflData?.username || null,
        niche: inflData?.niche || [],
        is_verified: inflData?.is_verified ?? false,
        headline: inflData?.bio ? inflData.bio.substring(0, 50) + '...' : null,
        avatar_url: inflData?.avatar_url || null,
        bio: inflData?.bio || null,
        location: profileData?.location || null,
        // Undefined (rather than false) when migration 074 has not been applied,
        // so the modal falls back to its localStorage behaviour instead of
        // greeting every existing user as brand new.
        welcome_seen: profileData ? profileData.welcome_seen_at != null : undefined,
      },
      stats: {
        collab_requests: pending,
        active_discussions,
        active_projects,
        completed_projects,
        pipeline_value,
        proposals_awaiting_you,
      },
      earnings_trend: earningsTrend,
      request_breakdown: requestBreakdown,
      recent_collabs: recent_collabs.length > 0 ? recent_collabs : null,
      active_roster: active_roster.length > 0 ? active_roster : null,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
