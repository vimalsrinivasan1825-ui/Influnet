import { NextResponse } from 'next/server';
import { projectTurn, STAGE_PHASES, phaseOf } from '@influnet/core';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getInstagramSnapshot } from '@/lib/public-profile/get-instagram-snapshot';
import { getYouTubeSnapshot } from '@/lib/public-profile/get-youtube-snapshot';
import { getPublicReviews } from '@/lib/public-profile/get-reviews';
import { parseAudience } from '@/lib/public-profile/creator-profile';

/**
 * The Home screen: what needs you, and how the work is actually going.
 *
 * Home answers "what do I do now?" — whose move each project is on, what has
 * gone quiet, and the handful of figures that tell a creator or a brand whether
 * things are trending up. The exhaustive metric breakdown stays on Dashboard,
 * which has its own endpoint.
 */

/** Whole days between a timestamp and now. Negative clock skew reads as 0. */
function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    // Rate limit: home is a heavy endpoint with multiple queries and external
    // API calls (Instagram/YouTube snapshots).
    const limited = await enforceRateLimit(req, {
      bucket: 'home:view', limit: 30, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, location, verification_status, verified_badge')
      .eq('id', user.id)
      .maybeSingle();

    // Public identity differs by role: a creator's is their /c/ page and
    // audience numbers, a brand's is their /b/ page and company details.
    let publicProfile: Record<string, unknown> = {};
    let publicPath: string | null = null;
    // The captured Instagram snapshot powers the audience numbers and the post
    // thumbnails — the same source the public page renders from, so Home shows
    // what a brand actually sees rather than a parallel set of figures.
    let social: Awaited<ReturnType<typeof getInstagramSnapshot>> = null;
    let youtube: Awaited<ReturnType<typeof getYouTubeSnapshot>> = null;
    let reviews: Awaited<ReturnType<typeof getPublicReviews>> = null;
    let audience: ReturnType<typeof parseAudience> = null;
    let pastCollaborations: string[] = [];

    if (role === 'influencer') {
      const { data: infl } = await supabase
        .from('influencer_profiles')
        .select('username, bio, niche, instagram_handle, youtube_handle, instagram_followers, youtube_subscribers, audience_demographics')
        .eq('user_id', user.id)
        .maybeSingle();

      publicPath = infl?.username ? `/${infl.username}` : null;

      // Everything a brand sees on /c/[username], read from the same sources.
      // A creator's own dashboard showing a different set of numbers than their
      // public page is the fastest way to make both look untrustworthy.
      const [ig, yt, revs, collabs] = await Promise.all([
        getInstagramSnapshot(user.id),
        getYouTubeSnapshot(user.id),
        getPublicReviews(user.id),
        // Cast: the RPC (migration 067) is newer than the generated types.
        (supabase.rpc as any)('get_creator_collaborations', { p_user_id: user.id }),
      ]);
      social = ig;
      youtube = yt;
      reviews = revs;
      audience = parseAudience((infl as any)?.audience_demographics ?? null);
      pastCollaborations = Array.isArray(collabs?.data) ? (collabs.data as string[]) : [];

      publicProfile = {
        username: infl?.username ?? null,
        bio: infl?.bio ?? null,
        niche: infl?.niche ?? [],
        instagram_handle: infl?.instagram_handle ?? null,
        youtube_handle: infl?.youtube_handle ?? null,
        // Prefer the live snapshot; fall back to the self-reported figure.
        instagram_followers: social?.followerCount ?? infl?.instagram_followers ?? null,
        youtube_subscribers: youtube?.subscriberCount ?? infl?.youtube_subscribers ?? null,
        verified_badge: profile?.verified_badge ?? false,
        avatar_url: social?.profilePicUrl ?? null,
      };
    } else if (role === 'business_owner') {
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('username, company_name, industry, website, city, state, logo_url, approval_status')
        .eq('user_id', user.id)
        .maybeSingle();

      publicPath = biz?.username ? `/b/${biz.username}` : null;
      publicProfile = {
        username: biz?.username ?? null,
        company_name: biz?.company_name ?? null,
        industry: biz?.industry ?? null,
        website: biz?.website ?? null,
        logo_url: biz?.logo_url ?? null,
        approval_status: biz?.approval_status ?? null,
      };
    }

    // Work in flight. 'pending_acceptance' rows are un-agreed terms, never
    // live work — see lib/project-status.ts.
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select(`
        id, title, status, current_stage, budget, updated_at, stage_progress,
        owner_user_id, counterparty_user_id,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name)
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .neq('status', 'pending_acceptance')
      .order('updated_at', { ascending: false });

    const all = projects ?? [];
    const ongoing = all.filter((p: any) => p.status === 'active');
    const completed = all.filter((p: any) => p.status === 'completed');

    // Which side of the deal the caller is on decides whose move it is: the
    // owner is always the paying brand, the counterparty the creator.
    const ongoingRows = ongoing.map((p: any) => {
      const side = p.owner_user_id === user.id ? 'business' : 'creator';
      const { turn, action } = projectTurn({
        stage: p.current_stage,
        side,
        stageProgress: p.stage_progress,
      });

      return {
        id: p.id,
        title: p.title,
        status: p.status,
        current_stage: p.current_stage,
        budget: p.budget,
        updated_at: p.updated_at,
        partner: side === 'business' ? p.counterparty?.name ?? null : p.owner?.name ?? null,
        // "Whose move is it" — the one thing Home needs and never had. Computed
        // here rather than on the client because it reads stage_progress, which
        // is far too heavy to ship to a phone for every project.
        my_side: side,
        turn,
        next_action: action,
        // Days since anything happened on this project. The single most useful
        // number for "what should I chase today" — a stage nobody has touched
        // in a fortnight is the thing quietly killing a collaboration.
        idle_days: daysSince(p.updated_at),
      };
    });

    // ── Analytics ───────────────────────────────────────────────────
    // Everything below is derived from rows already fetched above. Home
    // deliberately does not run a second wave of aggregate queries: it is the
    // first screen after launch and its budget is one round trip.

    const monthWindow = (monthsAgo: number) => {
      const start = new Date();
      start.setMonth(start.getMonth() - monthsAgo, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      return { start, end };
    };

    /**
     * Value of work COMPLETED in a window. Completion is the honest revenue
     * event on both sides: a budget agreed in January and delivered in March is
     * March's money, and `updated_at` on a completed project is when it closed.
     */
    const completedValueIn = (start: Date, end: Date) =>
      completed
        .filter((p: any) => {
          const d = new Date(p.updated_at);
          return d >= start && d < end;
        })
        .reduce((sum: number, p: any) => sum + (Number(p.budget) || 0), 0);

    const thisMonth = monthWindow(0);
    const lastMonth = monthWindow(1);
    const monthCurrent = completedValueIn(thisMonth.start, thisMonth.end);
    const monthPrevious = completedValueIn(lastMonth.start, lastMonth.end);

    // Percentage change is meaningless against a zero baseline — "up ∞%" from
    // one completed project is not insight. Null tells the UI to show the
    // figure without a delta rather than invent one.
    const monthDeltaPct =
      monthPrevious > 0 ? Math.round(((monthCurrent - monthPrevious) / monthPrevious) * 100) : null;

    const valuedProjects = [...ongoing, ...completed].filter((p: any) => Number(p.budget) > 0);
    const avgDealSize = valuedProjects.length
      ? Math.round(
          valuedProjects.reduce((sum: number, p: any) => sum + Number(p.budget), 0) /
            valuedProjects.length,
        )
      : null;

    // Where live work is piling up, in the four phases rather than 12 stages.
    const phaseCounts = new Map<string, number>(STAGE_PHASES.map((p) => [p, 0]));
    for (const p of ongoing) {
      const phase = phaseOf(p.current_stage);
      if (phase) phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
    }

    /**
     * Stalled work, worst first. Seven days is the threshold because the
     * pipeline has stages that legitimately take a while (a shoot, an edit) but
     * none where a week of total silence is healthy.
     */
    const stalled = (ongoingRows as { id: string; title: string; partner: string | null; idle_days: number; turn: string }[])
      .filter((p) => p.idle_days >= 7)
      .sort((a, b) => b.idle_days - a.idle_days)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.title,
        partner: p.partner,
        idle_days: p.idle_days,
        turn: p.turn,
      }));

    // The funnel, counted over every request this user has ever received.
    const { data: allRequests } = await supabase
      .from('collab_requests')
      .select('id, status')
      .eq('to_user_id', user.id);

    const requestsReceived = (allRequests ?? []).length;
    const requestsAccepted = (allRequests ?? []).filter((r: any) => r.status === 'accepted').length;

    const rate = (num: number, denom: number) =>
      denom > 0 ? Math.round((num / denom) * 100) : null;

    const analytics = {
      month: {
        current: monthCurrent,
        previous: monthPrevious,
        delta_pct: monthDeltaPct,
        label: thisMonth.start.toLocaleDateString('en-IN', { month: 'long' }),
      },
      avg_deal_size: avgDealSize,
      phases: STAGE_PHASES.map((label) => ({ label, value: phaseCounts.get(label) ?? 0 })),
      stalled,
      funnel: {
        received: requestsReceived,
        accepted: requestsAccepted,
        completed: completed.length,
        // Of the requests that came in, how many turned into an agreed deal...
        accept_rate: rate(requestsAccepted, requestsReceived),
        // ...and of those, how many were actually delivered.
        completion_rate: rate(completed.length, requestsAccepted),
      },
    };

    // Terms waiting on somebody — the other half of "what needs me".
    const { data: proposals } = await supabase
      .from('project_proposals')
      .select('id, title, budget, proposed_by, conversation_id, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: pendingRequests } = await supabase
      .from('collab_requests')
      .select('id, message, budget, from_user_id, to_user_id, created_at')
      .eq('to_user_id', user.id)
      .eq('status', 'pending');

    return NextResponse.json({
      role,
      profile: {
        name: profile?.name ?? 'there',
        location: profile?.location ?? null,
        verified: !!profile?.verified_badge,
        verification_status: profile?.verification_status ?? 'unverified',
      },
      public_profile: publicProfile,
      public_path: publicPath,
      social: social
        ? {
            followers: social.followerCount,
            posts_count: social.postsCount,
            avg_views: social.avgViews,
            engagement_rate: social.engagementRate,
            fetched_at: social.fetchedAt,
            // MAX_THUMBS in lib/social-snapshot.ts caches thumbnails for the
            // first 6 posts only — sending more just yields un-renderable tiles.
            posts: social.posts.slice(0, 6),
          }
        : null,
      youtube: youtube
        ? {
            subscribers: youtube.subscriberCount,
            avg_views: youtube.avgViews,
            handle: youtube.handle,
            fetched_at: youtube.fetchedAt,
            videos: youtube.videos.slice(0, 6),
          }
        : null,
      // Self-reported demographics, parsed the same way the public page parses
      // them, so the two can never disagree about the split.
      audience,
      // Brands from real completed projects — the wall a visitor sees.
      past_collaborations: pastCollaborations,
      // Momentum, bottlenecks and the funnel. See the derivation above.
      analytics,
      reviews,
      ongoing: ongoingRows,
      // Finished work, for both roles. Completion used to be a number on a tile
      // and nothing else: neither side could see WHAT they had delivered or with
      // whom, which is the half of the record that has any value afterwards.
      completed: completed.slice(0, 8).map((p: any) => ({
        id: p.id,
        title: p.title,
        budget: p.budget,
        completed_at: p.updated_at,
        partner:
          p.owner_user_id === user.id ? p.counterparty?.name ?? null : p.owner?.name ?? null,
      })),
      counts: {
        ongoing: ongoing.length,
        completed: completed.length,
        // Active projects sitting on a move only this user can make.
        your_turn: ongoingRows.filter((p: { turn: string }) => p.turn === 'you').length,
        // Proposals RLS already limits these to the caller's collaborations.
        awaiting_me: (proposals ?? []).filter((p: any) => p.proposed_by !== user.id).length,
        awaiting_them: (proposals ?? []).filter((p: any) => p.proposed_by === user.id).length,
        pending_requests: (pendingRequests ?? []).length,
      },
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
