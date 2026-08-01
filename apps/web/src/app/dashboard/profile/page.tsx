import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ExternalLink, UserRound } from 'lucide-react';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import CreatorProfileViewComponent from '@/components/public-profile/creator-profile-view';
import { buildCreatorProfileView, type RawPublicProfile } from '@/lib/public-profile/creator-profile';
import { getInstagramSnapshot } from '@/lib/public-profile/get-instagram-snapshot';
import { getYouTubeSnapshot } from '@/lib/public-profile/get-youtube-snapshot';
import { getPublicReviews } from '@/lib/public-profile/get-reviews';

export const metadata = { title: 'Your public profile | Influnet' };

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Your public profile, rendered inside the dashboard.
 *
 * This goes through the SAME RPC and view builder as the real /c/<username>
 * page, so what you see here is what a brand sees — a hand-built "preview"
 * would drift from the real page the first time either changed.
 */
export default async function MyPublicProfilePage() {
  const rsc = await createRSCClient();
  const {
    data: { user },
  } = await rsc.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await rsc.from('profiles').select('role, name').eq('id', user.id).single();
  const role = (me as { role?: string } | null)?.role;

  // Brands have a private, relationship-gated profile rather than a public
  // page, so they get a pointer to it instead of the creator view.
  if (role !== 'influencer') {
    const { data: biz } = await rsc
      .from('business_profiles')
      .select('username, company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    const slug = (biz as { username?: string } | null)?.username;

    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-3xl border border-hairline bg-surface-card p-8 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <UserRound className="size-6" />
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-content">
            Your brand profile is private
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-content-soft">
            Unlike a creator page, a brand profile is not public. Only creators you have an active
            request or project with can open it — everyone else gets a 404.
          </p>
          {slug ? (
            <Link
              href={`/b/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              View it as a creator sees it <ExternalLink className="size-4" />
            </Link>
          ) : (
            <Link
              href="/dashboard/settings"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              Set a username to get a profile link
            </Link>
          )}
        </div>
      </div>
    );
  }

  const { data: infl } = await rsc
    .from('influencer_profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle();
  const username = (infl as { username?: string } | null)?.username;

  if (!username) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-3xl border border-hairline bg-surface-card p-8 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-content">
            You don’t have a public link yet
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-content-soft">
            Pick a username in Settings and your profile becomes shareable at /c/your-username.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Choose a username
          </Link>
        </div>
      </div>
    );
  }

  const { data: raw } = await supabaseAnon.rpc('get_public_influencer', { p_slug: username });
  const profile = raw as RawPublicProfile | null;

  if (!profile?.userId) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-3xl border border-hairline bg-surface-card p-8 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-content">
            Your profile isn’t published yet
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-content-soft">
            Finish your profile in Settings and it will appear here exactly as brands will see it.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Complete your profile
          </Link>
        </div>
      </div>
    );
  }

  // Every source the real public page reads, read the same way. This screen
  // claims to be "how brands see you", so any divergence here is a lie: it
  // previously called get_creator_collaborations with `p_creator_user_id` and
  // mapped the result as `{brand_name}` objects, but the RPC (migration 067)
  // takes `p_user_id` and returns a flat array of brand-name strings — so the
  // call errored, the array came back empty, and this page showed no past
  // collaborations while /c/[username] showed them all.
  const [instagram, youtube, reviews, collabsRes] = await Promise.all([
    getInstagramSnapshot(profile.userId),
    getYouTubeSnapshot(profile.userId),
    getPublicReviews(profile.userId),
    (rsc.rpc as any)('get_creator_collaborations', { p_user_id: profile.userId }),
  ]);

  const autoCollaborations = Array.isArray(collabsRes?.data)
    ? (collabsRes.data as string[])
    : [];

  const view = buildCreatorProfileView(profile, {
    useMock: false,
    instagram,
    youtube,
    reviews,
    autoCollaborations,
  });

  return (
    <div className="flex flex-col">
      {/* Say plainly that this is the outward-facing view — it is otherwise
          easy to mistake for an editable dashboard screen. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface-card px-4 py-3 sm:px-6">
        <div>
          <p className="text-sm font-bold text-content">This is how brands see you</p>
          <p className="text-xs text-content-soft">
            Live view of your public page at /c/{username}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/settings"
            className="rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-sm font-semibold text-content-soft transition-colors hover:text-content"
          >
            Edit profile
          </Link>
          <Link
            href={`/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Open live page <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <CreatorProfileViewComponent
        data={view}
        isOwner
        ctaHref="/dashboard/settings"
        ctaLabel="Edit profile"
      />
    </div>
  );
}
