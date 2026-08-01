import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CreatorProfile, creatorMetadata } from './creator-profile';
import { BusinessProfile } from './business-profile';

/**
 * The single public profile route: /<username>.
 *
 * Creators and businesses used to live at /c/<username> and /b/<username>. The
 * prefix carried no information a visitor needed — usernames are already unique
 * across BOTH tables (migration 021's is_username_globally_taken enforces one
 * shared namespace), so the type can simply be looked up. /c and /b now
 * permanently redirect here so links already in the wild — including the
 * profile links creators have pasted into their Instagram bios for ownership
 * verification — keep resolving.
 *
 * Collisions with real routes are not a concern: /login, /signup, /dashboard
 * and friends are static segments, and Next.js matches those before a dynamic
 * one. RESERVED_USERNAMES in packages/core blocks the rest, and the username
 * rules (3-30 chars, ^[a-z0-9_]+$) already make every hyphenated route name
 * (reset-password, ui-preview) and every short one (b, c, vf) unregisterable.
 */

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Is this username a creator?
 *
 * get_public_influencer is SECURITY DEFINER, so it answers for anonymous
 * visitors — which is what makes it usable as the discriminator here. A miss
 * falls through to the business page, which does its own eligibility check and
 * 404s for a visitor who may not see it (business profiles are private).
 */
async function isCreator(username: string): Promise<boolean> {
  const { data, error } = await supabaseAnon.rpc('get_public_influencer', { p_slug: username });
  return !error && !!data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  if (await isCreator(username)) return creatorMetadata({ params });
  // Business profiles are private, so they get no descriptive metadata: the
  // title must not confirm to an unauthorised visitor that the account exists.
  return { title: 'Profile | Influnet' };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ mock?: string }>;
}) {
  const { username } = await params;
  if (await isCreator(username)) {
    return <CreatorProfile params={params} searchParams={searchParams} />;
  }
  return <BusinessProfile params={params} />;
}
