import { permanentRedirect } from 'next/navigation';

/**
 * Legacy business profile URL. The canonical location is now /<username>.
 *
 * Access control is unchanged and still lives on the business page itself —
 * this only rewrites the path. A visitor with no relationship to the business
 * gets the same 404 there that they would have got here.
 */
export default async function LegacyBusinessProfileRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  permanentRedirect(`/${username}`);
}
