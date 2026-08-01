import { permanentRedirect } from 'next/navigation';

/** Legacy media-kit URL. Canonical location is now /<username>/media-kit. */
export default async function LegacyMediaKitRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  permanentRedirect(`/${username}/media-kit`);
}
