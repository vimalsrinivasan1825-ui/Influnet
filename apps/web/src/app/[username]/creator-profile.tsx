import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import type { Metadata } from 'next';
import CreatorProfileViewComponent from '@/components/public-profile/creator-profile-view';
import {
  buildCreatorProfileView,
  extractContact,
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
import { canSee, subscriptionsEnabled } from '@/lib/entitlements';
import { projectProfileForTier } from '@/lib/public-profile/tier-projection';

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

export async function creatorMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: 'Profile Not Found | Influnet' };

  const title = `${profile.name} (@${profile.username}) | Influnet`;

  /**
   * The description must NOT be the raw bio.
   *
   * Creators routinely put a booking email and phone number in their bio
   * ("For sponsorships: name@agency.com / 90253…"). Passing it straight through
   * printed those details into <meta name="description"> and og:description —
   * readable in view-source by anyone, gated or not, and served to every search
   * engine that crawls the page.
   *
   * That defeated the `contact` gate entirely, and it was the more serious half
   * of the problem: a paywall leak costs a subscription, publishing a creator's
   * personal phone number to Google costs them a lot more. `extractContact`
   * already knows how to find those details — `rest` is the same bio with them
   * removed, which is exactly what belongs in a public summary.
   */
  const bioWithoutContact = extractContact(profile.bio ?? '').rest;
  const description =
    (profile.headline || bioWithoutContact || '').replace(/\s+/g, ' ').trim() ||
    `Check out ${profile.name}'s creator profile on Influnet.`;

  return {
    title,
    description,
    openGraph: { title, description, images: profile.avatarUrl ? [profile.avatarUrl] : [] },
  };
}

export async function CreatorProfile({
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
  let ctaHref = `/signup?next=/${username}`;
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
  const [instagram, youtube, reviews, portfolio, visibility, collabStats] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getYouTubeSnapshot(profile.userId),
    getPublicReviews(profile.userId),
    getCreatorPortfolio(supabaseAnon, profile.userId),
    getProfileVisibility(supabaseAnon, profile.userId),
    // Migration 113 — counts only, no partner identities. Same independent-read
    // rule as the others above: an unapplied migration must not break the page.
    (supabaseAnon.rpc as any)('get_collaboration_stats', { p_user_id: profile.userId }),
  ]);
  const statsRow = Array.isArray(collabStats?.data) ? collabStats.data[0] : null;
  const collaborationStats = collabStats?.error || !statsRow ? null : {
    partners: statsRow.partners_total ?? 0,
    projectsTotal: statsRow.projects_total ?? 0,
    projectsActive: statsRow.projects_active ?? 0,
    projectsCompleted: statsRow.projects_completed ?? 0,
    firstCollabAt: statsRow.first_collab_at ?? null,
    lastCollabAt: statsRow.last_collab_at ?? null,
  };

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

  /**
   * Plan gate. This page is PUBLIC and anonymous, which makes it the one that
   * matters most: gating only /api/creators/[username] would have left signing
   * out as a one-click bypass of the entire paywall.
   *
   * So the rule is by capability, not by whether someone is signed in:
   *   • anonymous          → Free view (and it must stay that way — this page
   *                          is indexed, and serving richer HTML to a crawler
   *                          than to a human is cloaking)
   *   • signed-in Free     → Free view
   *   • signed-in Pro      → full view
   *   • the creator        → full view, always. Charging the supply side to
   *                          look at its own audience data is the one thing a
   *                          two-sided marketplace must not do.
   *
   * The projection REMOVES the fields rather than blanking them. `data` is a
   * prop on a client component, so Next serialises it into the RSC payload in
   * the HTML — a value left on the object is readable in view-source no matter
   * what the component chooses to render.
   */
  const canSeeAudience =
    isOwner || (!!user && (await canSee({ supabase: rsc as any, user }, 'profile.audience')).allowed);
  const viewForViewer = projectProfileForTier(view, canSeeAudience);

  /**
   * Is the CREATOR (not the viewer) a Pro subscriber? Gilds their verified seal.
   *
   * Read with the anon client on purpose: the gold seal is public, the same way
   * the verified tick is. A badge only logged-in people could see would be worth
   * a lot less to the person paying for it.
   *
   * `is_pro_public` returns one boolean and nothing else — no status, no renewal
   * date. `current_tier` itself is not callable by `authenticated`, so this
   * cannot be turned into a way to enumerate who is paying.
   */
  const { data: ownerIsPro } = subscriptionsEnabled()
    ? await (supabaseAnon.rpc as any)('is_pro_public', { p_user: profile.userId })
    : { data: false };

  return (
    <CreatorProfileViewComponent
      data={viewForViewer}
      isOwner={isOwner}
      isPro={Boolean(ownerIsPro)}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      collaborationStats={collaborationStats}
    />
  );
}
