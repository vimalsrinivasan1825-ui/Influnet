import { jsonError, withAuth } from '@/lib/api';
import { NextResponse } from 'next/server';
import { bucketByCounterparty, bucketWindows, parseEarningsRange } from '@/lib/earnings-buckets';

export async function GET(req: Request) {
  try {
    // Was hand-rolled auth: it read the Authorization header, built its own
    // Supabase client and checked only that a user existed — never the ROLE.
    // A creator calling this got a 200 full of placeholder values
    // ("Your Company", industry "Unknown") instead of a 403. Nothing leaked
    // (every query below is scoped to the caller's own id), but this was one of
    // only two routes in the API sitting outside withAuth, which is where every
    // other route's guarantees live — so a future change to withAuth would
    // silently have failed to protect it.
    const auth = await withAuth(req, { role: 'business_owner' });
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

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

    const pending = collabs?.filter((c: any) => c.status === 'pending').length || 0;
    const acceptedCollabs = collabs?.filter((c: any) => c.status === 'accepted') || [];
    const accepted = acceptedCollabs.length;

    // Budget from accepted collab requests only (source of truth)
    const pipeline_value = acceptedCollabs.reduce((sum: any, c: any) => sum + (Number(c.budget) || 0), 0);

    // 3. Fetch campaign projects for completion tracking
    // counterparty:name joined in here so the per-creator spend chart below
    // has a display name for every project without a second round trip.
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select(
        'id, status, budget, counterparty_user_id, created_at, updated_at, counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name)',
      )
      .eq('owner_user_id', user.id);

    const active_projects = projects?.filter((p: any) => p.status === 'active').length || 0;
    const completed_projects = projects?.filter((p: any) => p.status === 'completed').length || 0;

    const completed_value = (projects || [])
      .filter((p: any) => p.status === 'completed')
      .reduce((sum: any, p: any) => sum + (Number(p.budget) || 0), 0);

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
        .filter((c: any) => {
          const d = new Date(c.created_at);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((sum: any, c: any) => sum + (Number(c.budget) || 0), 0);

      weeklySpend.push({ week: weekLabel, spend: weekSpend });
    }

    // 4a. The same spend, broken down per creator, for the chart's range
    // toggle. Prefers real settled payments the same way the influencer side
    // does; falls back to agreed project budgets when nothing has been paid
    // through the platform yet, attributed to whichever creator the project is
    // with — that fallback is the honest reading of "spend" before real money
    // has moved, not a second definition of the word.
    const projectIds = (projects || []).map((p: any) => p.id);
    let paidPayments: { project_id: number; amount: number; paid_at: string | null }[] = [];
    if (projectIds.length > 0) {
      const { data: payments } = await supabase
        .from('project_payments')
        .select('project_id, amount, paid_at')
        .in('project_id', projectIds)
        .eq('status', 'paid');
      paidPayments = payments || [];
    }
    const useProjectBudgets = paidPayments.length === 0 && (projects || []).length > 0;

    const range = parseEarningsRange(new URL(req.url).searchParams.get('range'));
    const windows = bucketWindows(range, now);
    const creatorNameByProject = new Map(
      (projects || []).map((p: any) => [p.id, p.counterparty?.name || 'Creator']),
    );
    const creatorRows = useProjectBudgets
      ? (projects || [])
          .filter((p: any) => p.status === 'active' || p.status === 'completed')
          .map((p: any) => ({
            date: new Date(p.updated_at || p.created_at || now),
            amount: Number(p.budget) || 0,
            counterparty: p.counterparty?.name || 'Creator',
          }))
      : paidPayments
          .filter((p: any) => p.paid_at)
          .map((p: any) => ({
            date: new Date(p.paid_at!),
            amount: Math.round((p.amount || 0) / 100),
            counterparty: creatorNameByProject.get(p.project_id) || 'Creator',
          }));
    const { data: spendByCreator, series: spendSeries } = bucketByCounterparty(windows, creatorRows);

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

        const matchingProj = (projects || []).find((p: any) => p.counterparty_user_id === collab.influencer?.id);
        let displayStatus = collab.status === 'pending' ? 'Awaiting reply'
                          : collab.status === 'accepted' ? 'In discussion'
                          : 'Closed';

        if (matchingProj) {
          if (matchingProj.status === 'completed') displayStatus = 'Completed';
          else if (matchingProj.status === 'active') displayStatus = 'In Progress';
          else if (matchingProj.status === 'pending_acceptance') displayStatus = 'Terms Proposed';
        }

        recent_collabs.push({
          id: collab.id,
          name: collab.influencer?.name || 'Creator',
          amount: collab.budget ? `₹${Number(collab.budget).toLocaleString()}` : 'TBD',
          status: displayStatus,
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
        completed_value,
      },
      weekly_spend: weeklySpend,
      // Per-creator series for the toggleable chart. Mirrors the influencer
      // route's earnings_by_brand/earnings_series/earnings_range field-for-field
      // so the two dashboard views can share one chart-shaping component.
      earnings_by_brand: spendByCreator,
      earnings_series: spendSeries,
      earnings_range: range,
      pipeline_data: pipelineData,
      recent_collabs: recent_collabs.length > 0 ? recent_collabs : null,
    });

  } catch (error) {
    return jsonError(500, 'Could not load your dashboard', error);
  }
}
