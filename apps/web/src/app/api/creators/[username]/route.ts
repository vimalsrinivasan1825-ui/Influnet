import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { withAuth, jsonError } from '@/lib/api';
import {
  buildCreatorProfileView,
  resolveMockMode,
  type RawPublicProfile,
} from '@/lib/public-profile/creator-profile';
import { getInstagramSnapshot } from '@/lib/public-profile/get-instagram-snapshot';
import { getYouTubeSnapshot } from '@/lib/public-profile/get-youtube-snapshot';
import { getPublicReviews } from '@/lib/public-profile/get-reviews';
import { getCreatorPortfolio } from '@/lib/public-profile/get-portfolio';
import { getProfileVisibility } from '@/lib/public-profile/get-visibility';
import { isSectionVisible } from '@influnet/core';
import { publicOrigin } from '@/lib/site';

// Same view model as /c/[username] (see that page for the canonical, full-page
// version), reshaped as JSON so the topbar search can render a creator's public
// profile in an in-app overlay without navigating away from the dashboard.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user, role } = auth;

  const { username } = await params;

  const { data: profileData, error } = await supabase.rpc('get_public_influencer', { p_slug: username });
  if (error || !profileData) return jsonError(404, 'Creator not found');
  const profile = profileData as RawPublicProfile;
  if (!profile.userId) return jsonError(404, 'Creator not found');

  const isOwner = user.id === profile.userId;

  // Fire-and-forget, same as the full profile page — only counts real visits
  // from someone other than the creator themselves.
  if (!isOwner) {
    (supabase.rpc as any)('record_profile_view', { p_influencer_user_id: profile.userId }).then(
      () => {},
      () => {},
    );
  }

  // ctaHref is a web path, used by the web overlay's <Link>. ctaAction is the
  // same decision expressed platform-agnostically, so the mobile app (which has
  // its own routes) can drive the identical restriction without parsing a URL.
  let ctaHref = `/${username}`;
  let ctaLabel = 'View full profile';
  let ctaAction: 'edit' | 'work_with_me' | 'request_sent' | 'view_project' | 'view_only' = 'view_only';
  let ctaProjectId: string | null = null;
  if (isOwner) {
    ctaHref = '/dashboard/settings';
    ctaLabel = 'Edit profile';
    ctaAction = 'edit';
  } else if (role === 'business_owner') {
    const [collabRes, projectRes] = await Promise.all([
      supabase
        .from('collab_requests')
        .select('id, status')
        .eq('from_user_id', user.id)
        .eq('to_user_id', profile.userId)
        .in('status', ['pending', 'accepted'])
        .maybeSingle(),
      supabase
        .from('campaign_projects')
        .select('id')
        .or(
          `and(owner_user_id.eq.${user.id},counterparty_user_id.eq.${profile.userId}),and(owner_user_id.eq.${profile.userId},counterparty_user_id.eq.${user.id})`,
        )
        .maybeSingle(),
    ]);

    const existingProject = projectRes.data as { id: string } | null;
    const existingCollab = collabRes.data as { id: string; status: string } | null;

    if (existingProject) {
      ctaHref = `/dashboard/projects/${existingProject.id}`;
      ctaLabel = 'View project';
      ctaAction = 'view_project';
      ctaProjectId = existingProject.id;
    } else if (existingCollab?.status === 'pending') {
      ctaHref = '/dashboard/requests';
      ctaLabel = 'Request sent';
      ctaAction = 'request_sent';
    } else {
      ctaHref = `/dashboard/requests/new?to=${profile.userId}`;
      ctaLabel = 'Work with me';
      ctaAction = 'work_with_me';
    }
  }

  const { data: autoCollabs } = await supabase.rpc('get_creator_collaborations', {
    p_user_id: profile.userId,
  });
  const autoCollaborations = Array.isArray(autoCollabs) ? (autoCollabs as string[]) : [];

  const [instagram, youtube, reviews, portfolio, visibility, collabStats] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getYouTubeSnapshot(profile.userId),
    getPublicReviews(profile.userId),
    getCreatorPortfolio(supabase, profile.userId),
    getProfileVisibility(supabase, profile.userId),
    // Migration 113. Counts only — how many brands this creator has actually
    // worked with, and how many of those finished. Follower count says how many
    // people watch; this says whether anyone has hired them, which is the thing
    // a brand is really trying to judge.
    (supabase.rpc as any)('get_collaboration_stats', { p_user_id: profile.userId }),
  ]);

  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : publicOrigin();

  const data = buildCreatorProfileView(profile, {
    useMock: resolveMockMode(undefined),
    instagram,
    youtube,
    reviews,
    origin,
    autoCollaborations,
    portfolio,
  });

  // Same gating as /c/[username] (the canonical page) — this route feeds the
  // mobile app's native profile screen and the web search overlay, and both
  // must respect the creator's choice exactly like the full page does.
  if (!isSectionVisible(visibility, 'instagram_posts')) data.featured = [];
  if (!isSectionVisible(visibility, 'youtube_videos')) data.videos = [];
  if (!isSectionVisible(visibility, 'portfolio')) data.portfolio = [];

  // RETURNS TABLE gives one row; `null` on a database that hasn't applied 113
  // yet, so the clients treat these counters as optional rather than breaking.
  const statsRow = Array.isArray(collabStats?.data) ? collabStats.data[0] : null;

  return NextResponse.json({
    data,
    isOwner,
    ctaHref,
    ctaLabel,
    ctaAction,
    ctaProjectId,
    userId: profile.userId,
    availabilityStatus: (profile as { availabilityStatus?: string | null }).availabilityStatus ?? null,
    collaborationStats: collabStats?.error || !statsRow ? null : {
      partners: statsRow.partners_total ?? 0,
      projectsTotal: statsRow.projects_total ?? 0,
      projectsActive: statsRow.projects_active ?? 0,
      projectsCompleted: statsRow.projects_completed ?? 0,
      firstCollabAt: statsRow.first_collab_at ?? null,
      lastCollabAt: statsRow.last_collab_at ?? null,
    },
  });
}
