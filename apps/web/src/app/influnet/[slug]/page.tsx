import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Anon client — public route, no auth needed
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * /influnet/[slug]  — link-in-bio route
 *
 * Creators share this URL in their Instagram/Twitter/YouTube bios.
 * e.g. influnet.com/influnet/vimal2123
 *
 * Looks up the creator by slug and permanently redirects to their
 * canonical public profile at /c/[username].
 * Returns 404 if the slug doesn't match any active creator.
 */
export default async function InflunetSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data, error } = await supabaseAnon.rpc('get_public_influencer', {
    p_slug: slug,
  });

  if (error || !data || !data.username) {
    notFound();
  }

  // Permanent redirect to the canonical creator profile URL
  redirect(`/${data.username}`);
}
