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
  let ctaHref = `/c/${username}`;
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

  const [instagram, youtube, reviews] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getYouTubeSnapshot(profile.userId),
    getPublicReviews(profile.userId),
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
  });

  return NextResponse.json({
    data,
    isOwner,
    ctaHref,
    ctaLabel,
    ctaAction,
    ctaProjectId,
    userId: profile.userId,
    availabilityStatus: (profile as { availabilityStatus?: string | null }).availabilityStatus ?? null,
  });
}
