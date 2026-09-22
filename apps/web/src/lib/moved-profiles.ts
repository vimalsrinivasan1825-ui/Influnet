/**
 * Forward the public profiles of accounts that were moved to another
 * environment.
 *
 * Why this exists: creators prove they own their Instagram by putting their
 * Influnet profile link in it, so a creator who signed up on dev has
 * `dev.influnet.io/<username>` in their bio. When such an account is moved to
 * staging, that link would keep showing visitors the stale dev copy — and any
 * brand request sent from it would land in the dev database. Instead, dev
 * answers those paths with a permanent redirect to the same path on staging,
 * until the creator updates their link.
 *
 * Configured at RUNTIME, on the deployment that should do the forwarding
 * (dev), so moving another person is an env change, not a code change:
 *   MOVED_PROFILE_REDIRECTS=giresh,someone_else
 *   MOVED_PROFILE_TARGET=https://staging.influnet.io   (optional, this is the default)
 * Unset or empty means the feature is off. Not NEXT_PUBLIC_: the proxy reads it
 * per request on the server, so it is never inlined into a build.
 */

const USERNAME = /^[a-z0-9_]{3,30}$/;
export const DEFAULT_MOVED_PROFILE_TARGET = 'https://staging.influnet.io';

export function parseMovedUsernames(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[\s,]+/)
      .map((u) => u.trim().toLowerCase().replace(/^@/, ''))
      .filter((u) => USERNAME.test(u)),
  );
}

/**
 * The URL to forward this request to, or null to handle it normally.
 *
 * Matches the profile and anything under it (`/giresh`, `/giresh/media-kit`)
 * and the legacy `/c/<username>` form still pasted in older bios. The query
 * string is kept. Never forwards to the host it is already on, so a target
 * misconfigured to point at itself cannot become a redirect loop.
 */
export function movedProfileRedirect(
  url: URL,
  env: { usernames?: string | null; target?: string | null },
  /**
   * The host the visitor actually asked for (x-forwarded-host / host). Behind
   * Railway or Azure the request URL carries the platform's internal host, so
   * without this the self-redirect guard below could not see that, say, a
   * staging deployment was pointed at staging.
   */
  publicHost?: string | null,
): URL | null {
  const moved = parseMovedUsernames(env.usernames);
  if (moved.size === 0) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const username = (segments[0] === 'c' ? segments[1] : segments[0])?.toLowerCase();
  if (!username || !moved.has(username)) return null;

  let target: URL;
  try {
    target = new URL(env.target?.trim() || DEFAULT_MOVED_PROFILE_TARGET);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' && target.hostname !== 'localhost') return null;
  if (target.host === url.host || target.host === publicHost?.trim().toLowerCase()) return null;

  // Always land on the canonical /<username> path on the new host.
  const rest = segments[0] === 'c' ? segments.slice(2) : segments.slice(1);
  target.pathname = `/${[username, ...rest].join('/')}`;
  target.search = url.search;
  return target;
}
