// Apify Instagram provider — an alternative to hikerapi.ts behind the same
// interface (see lib/instagram.ts for the selector). Uses Apify's maintained
// `apify/instagram-profile-scraper` actor, which returns a full public profile
// PLUS recent posts (so post-recency comes inline, no second request).
//
// Tested live 2026-07-14: ~$0.0026/profile, ~12–15s/call (actor cold start).
// SERVER-ONLY: APIFY_TOKEN must never reach the client.
//
// Reuses HikerInstagramUser + HikerApiError as the shared provider shape/error
// so verification-live.ts can consume either provider without branching.

import { logger } from './logger';
import {
  HikerApiError,
  normalizeHandle,
  type HikerInstagramUser,
  type InstagramRecentPost,
} from './hikerapi';

const ACTOR = 'apify~instagram-profile-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';
// Actor runs take ~15s; allow generous headroom for cold starts.
const REQUEST_TIMEOUT_MS = 90_000;

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86_400_000;
  return days >= 0 ? Math.round(days) : null;
}

/**
 * Fetch a public Instagram profile via Apify. Returns the normalised profile, or
 * `null` when the handle does not resolve. Throws HikerApiError (the shared
 * provider error) for auth/credit/timeout/network failures so verification
 * degrades to human review rather than crashing.
 */
export async function getInstagramUser(username: string): Promise<HikerInstagramUser | null> {
  const handle = normalizeHandle(username);
  if (!handle) return null;

  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new HikerApiError('unauthorized', 'APIFY_TOKEN is not configured');

  const url = `${APIFY_BASE}/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // resultsLimit:1 keeps recent-post fetching (and cost) minimal.
      body: JSON.stringify({ usernames: [handle], resultsLimit: 1 }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err: any) {
    throw new HikerApiError('network', err?.name === 'AbortError' ? 'Apify run timed out' : `Apify network error: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new HikerApiError('unauthorized', 'Apify rejected the token (401)', 401);
  // Apify signals an exhausted plan/credit with 402/403.
  if (res.status === 402 || res.status === 403) throw new HikerApiError('insufficient_funds', 'Apify credit/limit exhausted — top up at https://console.apify.com/billing', res.status);
  if (res.status === 429) throw new HikerApiError('rate_limited', 'Apify rate limit hit (429)', 429);
  if (res.status === 408) throw new HikerApiError('network', 'Apify run timed out (408)', 408);
  if (!res.ok) throw new HikerApiError('unknown', `Apify returned ${res.status}`, res.status);

  let items: any[];
  try {
    items = (await res.json()) as any[];
  } catch (err: any) {
    throw new HikerApiError('unknown', `Apify returned a non-JSON body: ${err?.message ?? err}`);
  }

  const u = Array.isArray(items) ? items[0] : null;
  // No item, or the actor flagged the handle as non-existent.
  if (!u || u.error || (u.username == null && u.id == null)) {
    if (u?.error) logger.debug('Apify profile not found', { handle, error: u.error });
    return null;
  }

  const latest = Array.isArray(u.latestPosts) ? u.latestPosts.find((p: any) => p?.timestamp) : null;

  return {
    pk: String(u.id ?? ''),
    username: u.username ?? null,
    fullName: u.fullName ?? null,
    followerCount: toNum(u.followersCount),
    followingCount: toNum(u.followsCount),
    mediaCount: toNum(u.postsCount),
    isVerified: Boolean(u.verified),
    isPrivate: Boolean(u.private),
    isBusiness: Boolean(u.isBusinessAccount),
    biography: u.biography ?? null,
    externalUrl: u.externalUrl ?? null,
    publicEmail: u.public_email ?? null, // not provided by this actor; kept for shape parity
    categoryName: u.businessCategoryName ?? null,
    lastPostDaysAgo: daysSince(latest?.timestamp),
    profilePicUrl: u.profilePicUrlHD ?? u.profilePicUrl ?? null,
    recentPosts: mapRecentPosts(u.latestPosts),
  };
}

/**
 * A post's play count, or null when the actor didn't really report one.
 *
 * `videoViewCount` is the only view-ish field this actor returns, and on many
 * accounts it comes back as a placeholder rather than a count: @a2d_army's
 * newest reel reported `1`, then `2` the next day, against 29,000 likes. Fed
 * straight through, that placeholder became the average and the creator's
 * public profile advertised "1 avg view per post" to brands.
 *
 * A post cannot have fewer views than likes, so anything at or below the like
 * count is a placeholder, not data. Returning null costs us the metric (the
 * profile falls back to the creator's YouTube view counts, which are real);
 * returning the placeholder costs us the creator's credibility.
 */
function postViews(raw: unknown, likes: number | null): number | null {
  const views = toNum(raw);
  if (views == null || views <= 0) return null;
  if (likes != null && views <= likes) return null;
  return views;
}

/** Map the actor's `latestPosts` array to the shared recent-post shape. */
function mapRecentPosts(raw: unknown): InstagramRecentPost[] {
  if (!Array.isArray(raw)) return [];
  const posts: InstagramRecentPost[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const shortcode = typeof p.shortCode === 'string' ? p.shortCode : null;
    const url = typeof p.url === 'string' ? p.url : shortcode ? `https://www.instagram.com/p/${shortcode}/` : null;
    if (!shortcode || !url) continue;
    const type = p.type === 'Video' || p.type === 'Sidecar' ? p.type : 'Image';
    const likes = toNum(p.likesCount);
    posts.push({
      url,
      shortcode,
      type,
      // Trim captions: they're display hints, not content storage.
      caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : null,
      likes,
      comments: toNum(p.commentsCount),
      views: postViews(p.videoViewCount, likes),
      takenAt: typeof p.timestamp === 'string' ? p.timestamp : null,
      displayUrl: typeof p.displayUrl === 'string' ? p.displayUrl : null,
      pinned: Boolean(p.isPinned),
    });
  }
  return posts;
}

/**
 * Interface parity with hikerapi.getLastPostDaysAgo. Apify returns recency inline
 * on the profile object, so this is a no-op fallback (returns null) and callers
 * should prefer `user.lastPostDaysAgo`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getLastPostDaysAgo(_userId: string): Promise<number | null> {
  return null;
}
