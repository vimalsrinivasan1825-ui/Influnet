import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import type { Metadata } from 'next';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import MediaKitViewComponent from '@/components/public-profile/media-kit-view';
import { buildMediaKitView, type MediaKitReview } from '@/lib/public-profile/media-kit';
import type { RawPublicProfile } from '@/lib/public-profile/creator-profile';
import { getInstagramSnapshot } from '@/lib/public-profile/get-instagram-snapshot';
import { publicOrigin } from '@/lib/site';

// Anon client for public reads (profile RPC + public reviews).
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

async function getProfile(username: string): Promise<RawPublicProfile | null> {
  const { data, error } = await supabaseAnon.rpc('get_public_influencer', { p_slug: username });
  if (error || !data) return null;
  return data as RawPublicProfile;
}

async function getReviews(userId: string): Promise<MediaKitReview[]> {
  const { data } = await supabaseAnon
    .from('reviews')
    .select('rating, comment')
    .eq('to_user_id', userId)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);
  return (data ?? [])
    .filter((r) => typeof r.comment === 'string' && r.comment.trim())
    .map((r) => ({ rating: r.rating, comment: r.comment!.trim() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: 'Media Kit Not Found | Influnet' };
  const title = `${profile.name} — Media Kit | Influnet`;
  const description = `Reach, engagement, featured content, and collaboration packages for ${profile.name} (@${profile.username}).`;
  return {
    title,
    description,
    openGraph: { title, description, images: profile.avatarUrl ? [profile.avatarUrl] : [] },
  };
}

export default async function MediaKitPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile?.userId) notFound();

  const [instagram, reviews] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getReviews(profile.userId),
  ]);

  // Viewer → CTA (same basics as the profile page; the media kit is brand-facing).
  const rsc = await createRSCClient();
  const {
    data: { user },
  } = await rsc.auth.getUser();
  const viewerRes = user
    ? await rsc.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };
  const viewerRole = (viewerRes.data as { role: string } | null)?.role;
  const isOwner = !!user && user.id === profile.userId;

  let ctaHref = `/signup?next=/${username}/media-kit`;
  let ctaLabel = 'Work with me';
  if (isOwner) {
    ctaHref = '/dashboard/settings';
    ctaLabel = 'Edit profile';
  } else if (user && viewerRole === 'business_owner') {
    ctaHref = `/dashboard/requests/new?to=${profile.userId}`;
  } else if (user) {
    ctaHref = '/dashboard';
    ctaLabel = 'Back to dashboard';
  }

  // Canonical origin from the real request host (works across preview/prod
  // domains), so the shareable URL + QR always point at the right place.
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : publicOrigin();

  const view = buildMediaKitView(profile, instagram, reviews, { origin });

  // Real scannable QR of the public profile URL (SVG, transparent background —
  // the box behind it is white).
  const qrSvg = await QRCode.toString(view.profileUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#16182Aff', light: '#ffffff00' },
  });

  return (
    <MediaKitViewComponent data={view} qrSvg={qrSvg} isOwner={isOwner} ctaHref={ctaHref} ctaLabel={ctaLabel} />
  );
}
