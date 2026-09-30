/**
 * Turning whatever someone pasted into the search box into something the
 * creator-lookup RPC can actually match on.
 *
 * Lives here rather than inside the /api/discover route so it can be unit
 * tested directly — and because both the web command palette and the mobile
 * search screen funnel through that one route, this is the single place the
 * behaviour has to be right for every client.
 */
import { UsernameSchema } from '@influnet/core';
import { isTrustedHost } from '@/lib/site';

/**
 * The username out of a pasted Influnet profile link, or null if this isn't
 * one of ours.
 *
 * `/c/` and `/b/` are legacy and permanently redirect, but they are NOT a
 * closed deprecation window — those links are sitting in real Instagram
 * profiles right now (see app/c/[username]/page.tsx), so a creator pasting one
 * has to work. A trailing `/media-kit` (or anything else under the username)
 * is ignored: it is still that creator's page.
 *
 * Two existing things carry the safety here rather than a hand-rolled path
 * regex: `isTrustedHost` (the same host list the ownership marker trusts, so a
 * link copied from staging or a preview deploy resolves too), and
 * `UsernameSchema`, which owns the charset, the length bounds AND the
 * reserved-name list. Validating through the schema keeps this in step with
 * registration automatically — `/vf/<code>`, `/dashboard/...` and
 * `/influnet/<slug>` all fail it, which is exactly right: mis-stripping is
 * worse than not stripping at all, because it sends someone searching for a
 * creator that cannot exist.
 */
export function usernameFromProfileUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null; // not URL-shaped — a bare handle or free text
  }
  if (!isTrustedHost(url.host)) return null;

  const [first, second] = url.pathname.split('/').filter(Boolean);
  const candidate = (first === 'c' || first === 'b' ? second : first)?.toLowerCase();
  if (!candidate) return null;

  return UsernameSchema.safeParse(candidate).success ? candidate : null;
}

/**
 * The username a Find-creator box was pointed at, or null if it was not
 * pointed at one.
 *
 * This is a LOOKUP resolver, not a search parser, and the difference is the
 * point: it accepts an Influnet username, an `@username`, or a pasted Influnet
 * profile link, and refuses everything else — a person's name, a topic, a
 * half-typed word. Returning null for those is the feature. A brand has to
 * already know who it wants; the platform does not offer a roster to browse.
 *
 * Deliberately NOT built on `extractSearchHandle` below. That one falls back
 * to passing unrecognised text through so it can be matched loosely, and it
 * maps an instagram.com URL to the Instagram handle — which is a different
 * namespace from ours and would resolve to whoever happens to hold the same
 * string here.
 */
export function resolveLookupUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // A pasted link wins: /c/ and /b/ legacy paths and a trailing /media-kit are
  // all handled there, and a link to something that is not a profile fails the
  // schema rather than resolving to a plausible-looking wrong account.
  const fromUrl = usernameFromProfileUrl(trimmed);
  if (fromUrl) return fromUrl;

  // Anything still URL-shaped was a link we do not own — refuse rather than
  // strip it down to a bare word and look that up.
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) return null;

  const candidate = trimmed.replace(/^@/, '').toLowerCase();
  return UsernameSchema.safeParse(candidate).success ? candidate : null;
}

/**
 * Reduce whatever the user pasted to the handle the RPC can match on: an
 * `instagram.com/<handle>` URL, an Influnet profile URL, or a bare `@handle`.
 * Anything unrecognised is passed through untouched, so a plain name search
 * behaves exactly as it always did.
 */
export function extractSearchHandle(q: string): string {
  const trimmed = q.trim();

  const igMatch = trimmed.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (igMatch) return igMatch[1];

  return usernameFromProfileUrl(trimmed) ?? trimmed.replace(/^@/, '');
}
