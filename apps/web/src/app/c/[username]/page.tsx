import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import type { Metadata } from 'next';
import CreatorProfileViewComponent from '@/components/public-profile/creator-profile-view';
import {
  buildCreatorProfileView,
  resolveMockMode,
  type RawPublicProfile,
} from '@/lib/public-profile/creator-profile';

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

  // Record the view (fire-and-forget).
  supabaseAnon
    .rpc('record_profile_view', { p_influencer_user_id: profile.userId, p_viewer_user_id: user?.id || null })
    .then(() => {}, () => {});

  // Primary CTA.
  let ctaHref = `/signup/business?next=/c/${username}`;
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

  const view = buildCreatorProfileView(profile, { useMock: resolveMockMode(sp.mock) });

  return <CreatorProfileViewComponent data={view} isOwner={isOwner} ctaHref={ctaHref} ctaLabel={ctaLabel} />;
}
