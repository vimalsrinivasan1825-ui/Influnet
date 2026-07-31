import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import type { Metadata } from 'next';
import CreatorProfileViewComponent from '@/components/public-profile/creator-profile-view';
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

// Anon client for public profile reads.
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

async function getProfile(username: string): Promise<RawPublicProfile | null> {
  const { data, error } = await supabaseAnon.rpc('get_public_influencer', { p_slug: username });
  if (error || !data) return null;
  return data as RawPublicProfile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: 'Profile Not Found | Influnet' };

  const title = `${profile.name} (@${profile.username}) | Influnet`;
  const description =
    profile.headline || profile.bio || `Check out ${profile.name}'s creator profile on Influnet.`;
  return {
    title,
    description,
    openGraph: { title, description, images: profile.avatarUrl ? [profile.avatarUrl] : [] },
  };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ mock?: string }>;
}) {
  const [{ username }, sp] = await Promise.all([params, searchParams]);
  const profile = await getProfile(username);
  if (!profile) notFound();
  // profileId is guaranteed string from here — userId is marked optional in the type
  // but the RPC always populates it. Bail out defensively if somehow it is missing.
  if (!profile.userId) notFound();

  // Viewer (for owner detection + CTA).
  const rsc = await createRSCClient();
  const {
    data: { user },
  } = await rsc.auth.getUser();
  const viewerRes = user
    ? await rsc.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };
  const viewerRole = (viewerRes.data as { role: string } | null)?.role;
  const isOwner = !!user && user.id === profile.userId;

  // Record the view (fire-and-forget). The RPC is authenticated-only and
  // records the CALLER's own auth.uid(), so this must run on `rsc` (carries
  // the visitor's session) rather than the plain anon client, and only when
  // there's a real signed-in visitor who isn't the profile's owner — a
  // logged-out visit or the owner viewing their own page is never counted.
  if (user && !isOwner) {
    // rsc.rpc()'s Database generic doesn't resolve custom Functions entries
    // cleanly through @supabase/ssr's createServerClient (same friction as
    // the get_creator_collaborations call in dashboard/profile/page.tsx).
    (rsc.rpc as any)('record_profile_view', { p_influencer_user_id: profile.userId }).then(() => {}, () => {});
  }

  // Primary CTA. Anonymous visitors land on the entry screen (sign in OR sign
  // up) rather than straight into business signup — a returning brand may
  // already have an account and just needs to sign in.
  let ctaHref = `/signup?next=/c/${username}`;
  let ctaLabel = 'Work with me';
  if (isOwner) {
    ctaHref = '/dashboard/settings';
    ctaLabel = 'Edit profile';
  } else if (user && viewerRole === 'business_owner') {
    // Check if this business already has a pending request or active project with this creator.
    const [collabRes, projectRes] = await Promise.all([
      rsc
        .from('collab_requests')
        .select('id, status')
        .eq('from_user_id', user.id)
        .eq('to_user_id', profile.userId)
        .in('status', ['pending', 'accepted'])
        .maybeSingle(),
      rsc
        .from('campaign_projects')
        .select('id')
        .or(
          `and(owner_user_id.eq.${user.id},counterparty_user_id.eq.${profile.userId}),and(owner_user_id.eq.${profile.userId},counterparty_user_id.eq.${user.id})`
        )
        .maybeSingle(),
    ]);

    const existingProject = projectRes.data as { id: string } | null;
    const existingCollab  = collabRes.data  as { id: string; status: string } | null;

    if (existingProject) {
      // Already working together — take them straight to the project.
      ctaHref  = `/dashboard/projects/${existingProject.id}`;
      ctaLabel = 'View project';
    } else if (existingCollab?.status === 'pending') {
      // Request has been sent but not yet accepted.
      ctaHref  = '/dashboard/requests';
      ctaLabel = 'Request sent';
    } else {
      // No prior relationship — standard "Work with me" flow.
      ctaHref = `/dashboard/requests/new?to=${profile.userId}`;
    }
  } else if (user) {
    ctaHref = '/dashboard';
    ctaLabel = 'Back to dashboard';
  }

  // Canonical origin for the shareable profile URL — derived from the real
  // request host so it works across preview/prod domains, falling back to the
  // configured public app URL.
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : publicOrigin();

  // Brand names from real completed collaborations in-app — merged into the
  // profile's past-collaborations wall so they can't be faked.
  const { data: autoCollabs } = await supabaseAnon.rpc('get_creator_collaborations', {
    p_user_id: profile.userId,
  });
  const autoCollaborations = Array.isArray(autoCollabs) ? (autoCollabs as string[]) : [];

  // Instagram, YouTube and ratings are independent reads — one being empty (or
  // its migration unapplied) must never hold up or break the others.
  const [instagram, youtube, reviews, portfolio, visibility] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getYouTubeSnapshot(profile.userId),
    getPublicReviews(profile.userId),
    getCreatorPortfolio(supabaseAnon, profile.userId),
    getProfileVisibility(supabaseAnon, profile.userId),
  ]);

  const view = buildCreatorProfileView(profile, {
    useMock: resolveMockMode(sp.mock),
    instagram,
    youtube,
    reviews,
    origin,
    autoCollaborations,
    portfolio,
  });

  /**
   * Gated here, not inside buildCreatorProfileView. The owner's toggle hides
   * three CONTENT sections, not the numbers derived alongside them — follower
   * count, engagement rate and audience split come off the same Instagram/
   * YouTube snapshots and stay visible even with "Recent posts" switched off.
   * Stripping the arrays after the view is built keeps that distinction
   * without threading a visibility flag through every stat computation.
   */
  if (!isSectionVisible(visibility, 'instagram_posts')) view.featured = [];
  if (!isSectionVisible(visibility, 'youtube_videos')) view.videos = [];
  if (!isSectionVisible(visibility, 'portfolio')) view.portfolio = [];

  return <CreatorProfileViewComponent data={view} isOwner={isOwner} ctaHref={ctaHref} ctaLabel={ctaLabel} />;
}
