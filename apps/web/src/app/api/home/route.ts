import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { getInstagramSnapshot } from '@/lib/public-profile/get-instagram-snapshot';
import { getYouTubeSnapshot } from '@/lib/public-profile/get-youtube-snapshot';
import { getPublicReviews } from '@/lib/public-profile/get-reviews';
import { parseAudience } from '@/lib/public-profile/creator-profile';

/**
 * The Home screen: who you are publicly, and what is currently in flight.
 *
 * Deliberately narrow — Home answers "how do I look, and what needs me?".
 * The full metric breakdown stays on Dashboard, which has its own endpoint.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

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
        .select('username, bio, niche, instagram_handle, youtube_handle, instagram_followers, youtube_subscribers, is_verified, audience_demographics')
        .eq('user_id', user.id)
        .maybeSingle();

      publicPath = infl?.username ? `/c/${infl.username}` : null;

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
        is_verified: profileData?.verified_badge ?? infl?.is_verified ?? false,
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
        id, title, status, current_stage, budget, updated_at,
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
      reviews,
      ongoing: ongoing.map((p: any) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        current_stage: p.current_stage,
        budget: p.budget,
        updated_at: p.updated_at,
        partner:
          p.owner_user_id === user.id ? p.counterparty?.name ?? null : p.owner?.name ?? null,
      })),
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
