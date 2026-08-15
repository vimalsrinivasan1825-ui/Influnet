/**
 * Turning a pasted post link into a portfolio card.
 *
 * A creator adds past work by pasting the URL of the actual Instagram post or
 * YouTube video. This module is what makes that one field enough: it validates
 * the link, works out which platform it is, and resolves a thumbnail so the
 * profile renders a grid of real content instead of a list of blue links.
 *
 * ── SSRF ──────────────────────────────────────────────────────────────
 * The input is a URL supplied by a user and this code runs on the server, which
 * is the classic setup for server-side request forgery: paste
 * http://169.254.169.254/... or http://localhost:5432 and a naive fetcher will
 * happily dial the cloud metadata endpoint or an internal service and hand back
 * the response.
 *
 * The defence here is not a blocklist of bad hosts (always incomplete — DNS
 * rebinding, redirects, IPv6 literals, decimal-encoded IPs) but the inverse:
 * WE construct every outbound URL. User input is parsed down to an opaque ID
 * matched against a strict character class, and that ID is interpolated into a
 * fixed, hard-coded host. No fetch ever targets a URL the user supplied, so
 * there is nothing for them to point at anything.
 */
import { logger as log } from './logger';

export type PortfolioPlatform = 'instagram' | 'youtube' | 'other';

export interface ResolvedLink {
  platform: PortfolioPlatform;
  /** Normalised, canonical URL — what we store, not necessarily what was pasted. */
  url: string;
  /** Cached at write time. Null when the platform gives us nothing usable. */
  thumbnailUrl: string | null;
  /** Suggested title, when the platform tells us one. The creator can override. */
  title: string | null;
  /**
   * The platform's own id for the post — a YouTube video id or an Instagram
   * shortcode, already matched against the strict character class above. Null
   * for a plain link.
   *
   * Exported so a caller can look the post up elsewhere (see
   * lib/portfolio-thumbnail.ts) WITHOUT re-parsing the URL. Re-parsing is how
   * two validators drift apart, and the one that drifts looser is the hole.
   */
  postId: string | null;
}

/** YouTube IDs are exactly 11 chars of URL-safe base64. Anything else is not one. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Instagram shortcodes: alphanumeric plus - and _, comfortably under 32. */
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,32}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be',
]);
const INSTAGRAM_HOSTS = new Set([
  'instagram.com', 'www.instagram.com', 'm.instagram.com',
]);

/**
 * Pull the video ID out of any of YouTube's URL shapes:
 *   youtu.be/<id> · /watch?v=<id> · /shorts/<id> · /embed/<id> · /live/<id>
 */
function youtubeId(u: URL): string | null {
  if (u.hostname === 'youtu.be' || u.hostname === 'www.youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  const v = u.searchParams.get('v');
  if (v && YOUTUBE_ID.test(v)) return v;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
    return YOUTUBE_ID.test(parts[1]) ? parts[1] : null;
  }
  return null;
}

/** /p/<code>, /reel/<code>, /reels/<code>, /tv/<code>. */
function instagramCode(u: URL): string | null {
  const parts = u.pathname.split('/').filter(Boolean);
  const i = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
  if (i === -1 || !parts[i + 1]) return null;
  const code = parts[i + 1];
  return INSTAGRAM_CODE.test(code) ? code : null;
}

/**
 * YouTube's oEmbed endpoint is public and unauthenticated, and is the only way
 * to get a real title. Best-effort: a failure costs the title placeholder, not
 * the portfolio entry, so every error path returns null rather than throwing.
 *
 * Note the URL passed to oEmbed is one we rebuilt from the validated ID, not
 * the pasted string.
 */
async function youtubeTitle(id: string): Promise<string | null> {
  try {
    const target =
      'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);

    const res = await fetch(target, {
      signal: AbortSignal.timeout(4000),
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { title?: unknown };
    return typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : null;
  } catch (err) {
    log.warn('youtube oembed lookup failed', { err: (err as Error).message });
    return null;
  }
}

/**
 * Resolve a pasted link into everything a portfolio card needs.
 *
 * Throws on a URL we cannot accept — the caller turns that into a 400 with the
 * message shown to the creator, so the copy lives here next to the rules.
 */
export async function resolvePortfolioLink(input: string): Promise<ResolvedLink> {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Paste a link to the post or video.');

  /**
   * The scheme has to be judged BEFORE anything is prepended. Prefixing
   * "https://" onto input that already carries a scheme silently rewrites it —
   * "file:///etc/passwd" becomes "https://file///etc/passwd", which parses
   * cleanly with hostname "file" and sails past a protocol check placed after
   * the fact. The dangerous schemes are then stored and rendered as a tappable
   * link. So: detect a scheme first, allow only http(s), and prepend only when
   * there was genuinely no scheme at all.
   */
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new Error('Only web links are supported.');
  }

  let u: URL;
  try {
    // Protocol-less input is prefixed: "instagram.com/p/x" would otherwise
    // parse as a relative path and defeat the host checks below.
    u = new URL(scheme ? raw : `https://${raw}`);
  } catch {
    throw new Error("That doesn't look like a link. Copy the post's URL and paste it here.");
  }

  // http:// is upgraded rather than rejected — people paste what they copy.
  u.protocol = 'https:';

  const host = u.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(u);
    if (!id) throw new Error('That YouTube link has no video in it. Open the video and copy its URL.');
    return {
      platform: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      // Derived, not fetched: YouTube serves a thumbnail for every video at a
      // predictable path, so this costs no network call and cannot fail.
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      title: await youtubeTitle(id),
      postId: id,
    };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    const code = instagramCode(u);
    if (!code) {
      throw new Error('Link to a specific post or reel — a profile link has no single piece of work in it.');
    }
    /**
     * No thumbnail FROM HERE. Instagram's oEmbed has required a Facebook app
     * token since 2020, so there is nothing this pure resolver can derive the
     * way it derives YouTube's — and it deliberately makes no outbound request
     * of its own, which is what keeps the SSRF argument at the top of this file
     * a one-liner.
     *
     * A thumbnail is still resolved for Instagram, one layer up: the POST route
     * hands `postId` to lib/portfolio-thumbnail.ts, which first looks for the
     * image the snapshot pipeline has ALREADY downloaded for this creator's own
     * recent posts, and only then tries the public embed page. That lookup
     * needs a database and a user id, neither of which belongs in here.
     */
    return {
      platform: 'instagram',
      url: `https://www.instagram.com/p/${code}/`,
      thumbnailUrl: null,
      title: null,
      postId: code,
    };
  }

  // Everything else is accepted as a plain link — a blog post, a press piece, a
  // TikTok. Stored, never fetched.
  return {
    platform: 'other',
    url: u.toString().slice(0, 2048),
    thumbnailUrl: null,
    title: null,
    postId: null,
  };
}
