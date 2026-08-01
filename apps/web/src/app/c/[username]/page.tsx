import { permanentRedirect } from 'next/navigation';

/**
 * Legacy creator profile URL. The canonical location is now /<username>.
 *
 * This must keep working indefinitely, not just for a deprecation window:
 * ownership verification asks creators to put their profile link in their
 * Instagram bio, so /c/<username> is sitting in real bios right now and is
 * re-scraped on every re-verification. See the marker matching in
 * api/verification/ownership/route.ts, which accepts both shapes for the
 * same reason.
 */
export default async function LegacyCreatorProfileRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  permanentRedirect(`/${username}`);
}
