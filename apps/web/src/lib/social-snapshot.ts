// Social snapshot capture — persists the rich Instagram payload the verification
// scrape already paid for, so the public profile can show REAL analytics.
//
// What gets stored (see migration 060):
//   - social_snapshots row: followers, posts count, avg views, engagement rate,
//     recent posts (permanent instagram.com links + our own cached thumbnails)
//   - social-cache bucket: thumbnail/profile-pic images, downloaded at capture
//     time because Instagram CDN URLs are signed and expire after days
//
// INVARIANTS
//  - Never throws: snapshot capture is a best-effort side effect of verification;
//    any failure is logged and swallowed so it can never break a verification run.
//  - SERVER-ONLY: uses the service-role key (bucket + table writes bypass RLS).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { HikerInstagramUser } from './hikerapi';
import type { SocialPlatform, SocialProfile } from './social/types';

/** How many recent posts to keep in the snapshot / cache thumbnails for. */
const MAX_POSTS = 12;
/**
 * Every post we keep, not the first six. The download is parallel, size-capped
 * and best-effort, so the six we were skipping cost little — and they are the
 * difference between a portfolio entry finding its picture and drawing a grey
 * tile, since a creator adding "past work" often reaches back further than
 * their last six posts. See lib/portfolio-thumbnail.ts.
 */
const MAX_THUMBS = MAX_POSTS;
const IMAGE_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // matches the bucket's file_size_limit

export interface InstagramMetrics {
  postsCount: number | null;
  /** Mean video view count across recent video posts; null when none have views. */
  avgViews: number | null;
  /** avg(likes+comments) per recent post / followers, as a percentage (1 decimal). */
  engagementRate: number | null;
}

/**
 * Pure metric computation from a scraped profile. Pinned posts are included —
 * they're what visitors actually see first on the account.
 */
export function computeInstagramMetrics(user: HikerInstagramUser): InstagramMetrics {
  const posts = user.recentPosts ?? [];

  // Views at or below the like count are a provider placeholder, not a
  // measurement (see postViews in apify-instagram.ts) — averaging them in is
  // how a 636K-follower account came to advertise "1 avg view per post". The
  // provider filters these already; the guard is repeated here because the
  // metric is what gets published and there is more than one provider.
  const viewCounts = posts
    .map((p) => p.views)
    .filter((v, i): v is number => typeof v === 'number' && v > 0 && v > (posts[i].likes ?? 0));
  const avgViews = viewCounts.length
    ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length)
    : null;

  let engagementRate: number | null = null;
  const followers = user.followerCount ?? 0;
  const engaged = posts
    .map((p) => (p.likes ?? 0) + (p.comments ?? 0))
    .filter((n) => n > 0);
  if (followers > 0 && engaged.length > 0) {
    const avgEngaged = engaged.reduce((a, b) => a + b, 0) / engaged.length;
    engagementRate = Math.round((avgEngaged / followers) * 1000) / 10; // 1 decimal, in %
  }

  return { postsCount: user.mediaCount ?? null, avgViews, engagementRate };
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Public URL for a path inside the social-cache bucket. */
export function socialCachePublicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${base}/storage/v1/object/public/social-cache/${path}`;
}

/** Download an image (size- and time-capped). Returns null on any failure. */
async function fetchImage(url: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Download + upload one image into social-cache. Returns the storage path or null. */
async function cacheImage(
  admin: SupabaseClient,
  sourceUrl: string,
  path: string,
): Promise<string | null> {
  const img = await fetchImage(sourceUrl);
  if (!img) return null;
  const { error } = await admin.storage
    .from('social-cache')
    .upload(path, img.bytes, { contentType: img.contentType, upsert: true });
  if (error) {
    logger.warn('social-snapshot: image upload failed (non-fatal)', { path, error: error.message });
    return null;
  }
  return path;
}

/**
 * Download one image into the social-cache bucket under `path`.
 *
 * The snapshot pipeline's own `cacheImage` with the admin client resolved
 * here, exposed for callers outside this module — specifically
 * lib/portfolio-thumbnail.ts, which caches a single post's picture on demand
 * when that post is older than the snapshot window. Storing OUR copy is the
 * whole point: the CDN URLs these come from carry a signed expiry, so keeping
 * one in the database would give a portfolio card that works today and breaks
 * silently in a few weeks.
 *
 * Returns the storage path, or null if anything at all went wrong.
 */
export async function cacheSocialImage(sourceUrl: string, path: string): Promise<string | null> {
  const admin = serviceClient();
  if (!admin) {
    logger.warn('social-snapshot: cacheSocialImage skipped — service role key not configured');
    return null;
  }
  return cacheImage(admin, sourceUrl, path);
}

/**
 * Persist an Instagram snapshot for a user from an already-fetched profile.
 * Fire-and-forget semantics: logs and returns false on failure, never throws.
 */
export async function captureInstagramSnapshot(
  userId: string,
  user: HikerInstagramUser,
): Promise<boolean> {
  try {
    const admin = serviceClient();
    if (!admin) {
      logger.warn('social-snapshot: skipped — service role key not configured');
      return false;
    }
    const handle = (user.username ?? '').toLowerCase();
    if (!handle) return false;

    const metrics = computeInstagramMetrics(user);
    const posts = (user.recentPosts ?? []).slice(0, MAX_POSTS);

    // Cache thumbnails for the first few posts + the profile pic, in parallel.
    // Shortcode-based paths make refreshes overwrite naturally.
    const thumbJobs = posts.slice(0, MAX_THUMBS).map((p, i) =>
      p.displayUrl
        ? cacheImage(admin, p.displayUrl, `ig/${userId}/${p.shortcode}.jpg`).then((path) => ({ i, path }))
        : Promise.resolve({ i, path: null as string | null }),
    );
    const avatarJob = user.profilePicUrl
      ? cacheImage(admin, user.profilePicUrl, `ig/${userId}/profile.jpg`)
      : Promise.resolve(null);
    const [thumbs, profilePicPath] = await Promise.all([Promise.all(thumbJobs), avatarJob]);

    const thumbPathByIndex = new Map(thumbs.map((t) => [t.i, t.path]));
    const recentPosts = posts.map((p, i) => ({
      url: p.url,
      shortcode: p.shortcode,
      type: p.type,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      taken_at: p.takenAt,
      thumb_path: thumbPathByIndex.get(i) ?? null,
      pinned: p.pinned,
    }));

    const { error: upsertErr } = await admin.from('social_snapshots').upsert(
      {
        user_id: userId,
        platform: 'instagram',
        handle,
        follower_count: user.followerCount,
        posts_count: metrics.postsCount,
        avg_views: metrics.avgViews,
        engagement_rate: metrics.engagementRate,
        is_verified: user.isVerified,
        profile_pic_path: profilePicPath,
        recent_posts: recentPosts,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    );
    if (upsertErr) {
      logger.warn('social-snapshot: upsert failed (non-fatal)', { userId, error: upsertErr.message });
      return false;
    }

    // Keep the creator's profile row in step with reality: refresh the follower
    // count, and fill the avatar from the cached profile pic when none is set.
    const { data: prof } = await admin
      .from('influencer_profiles')
      .select('avatar_url')
      .eq('user_id', userId)
      .maybeSingle();
    const updates: Record<string, unknown> = {};
    if (user.followerCount != null) updates.instagram_followers = user.followerCount;
    if (prof && !prof.avatar_url && profilePicPath) {
      updates.avatar_url = socialCachePublicUrl(profilePicPath);
    }
    if (Object.keys(updates).length > 0) {
      await admin.from('influencer_profiles').update(updates).eq('user_id', userId);
    }

    await backfillPortfolioThumbnails(admin, userId, recentPosts);

    return true;
  } catch (err) {
    logger.warn('social-snapshot: capture failed (non-fatal)', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Give already-saved portfolio entries the picture this capture just fetched.
 *
 * A creator who added Instagram work BEFORE their account was scraped has rows
 * with a null thumbnail, and nothing would ever revisit them — the resolver in
 * lib/portfolio-thumbnail.ts only runs on insert. So each capture sweeps the
 * shortcodes it just cached across the portfolio and fills the blanks.
 *
 * Only ever fills nulls. A row that already has a thumbnail is left alone,
 * including one the creator's own embed-page lookup found, because overwriting
 * a working image with another working image is churn with a failure mode.
 */
async function backfillPortfolioThumbnails(
  admin: SupabaseClient,
  userId: string,
  posts: { shortcode?: string | null; thumb_path?: string | null }[],
): Promise<void> {
  const withThumbs = posts.filter((p) => p.shortcode && p.thumb_path);
  if (withThumbs.length === 0) return;

  try {
    const { data: rows } = await admin
      .from('creator_portfolio_items')
      .select('id, content_url')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .is('thumbnail_url', null);

    if (!rows?.length) return;

    await Promise.all(
      withThumbs.map((post) => {
        // The stored URL is the canonical one this shortcode produces (see
        // resolvePortfolioLink), so an exact match is enough and avoids a LIKE
        // whose wildcards would have to be escaped out of a user-supplied code.
        const canonical = `https://www.instagram.com/p/${post.shortcode}/`;
        const match = rows.find((r: { content_url: string | null }) => r.content_url === canonical);
        if (!match) return Promise.resolve();

        return admin
          .from('creator_portfolio_items')
          .update({ thumbnail_url: socialCachePublicUrl(post.thumb_path!) })
          .eq('id', match.id)
          .then(() => undefined);
      }),
    );
  } catch (err) {
    logger.warn('social-snapshot: portfolio thumbnail backfill failed (non-fatal)', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Generic capture — Facebook, X, and any platform added after them
// ---------------------------------------------------------------------------

/**
 * Where each platform's audience count lands on influencer_profiles.
 *
 * Snapchat is absent on purpose: it has no readable public metric (see
 * lib/social/snapchat.ts), and a column that is always 0 becomes a "0
 * followers" badge on someone's public profile.
 */
const FOLLOWER_COLUMN: Partial<Record<SocialPlatform, string>> = {
  instagram: 'instagram_followers',
  youtube: 'youtube_subscribers',
  facebook: 'facebook_followers',
  twitter: 'twitter_followers',
};

/**
 * Mean view count across posts that reported a real one.
 *
 * Posts without a view count are EXCLUDED rather than counted as zero —
 * treating "the provider didn't tell us" as "nobody watched" is how an
 * account's average collapses toward zero the moment one platform gets stingy
 * with its numbers.
 */
function averageViews(profile: SocialProfile): number | null {
  const counts = profile.recentPosts
    .map((p) => p.views)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (counts.length === 0) return null;
  return Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
}

/** avg(likes+comments) per post over followers, as a percentage. */
function engagementRate(profile: SocialProfile): number | null {
  const followers = profile.followerCount ?? 0;
  const engaged = profile.recentPosts
    .map((p) => (p.likes ?? 0) + (p.comments ?? 0))
    .filter((n) => n > 0);
  if (followers <= 0 || engaged.length === 0) return null;
  const avg = engaged.reduce((a, b) => a + b, 0) / engaged.length;
  return Math.round((avg / followers) * 1000) / 10;
}

/**
 * Persist a snapshot for any platform from an already-fetched profile.
 *
 * Same fire-and-forget contract as captureInstagramSnapshot: logs and returns
 * false on failure, never throws, because a snapshot write is a side effect of
 * a refresh and must never fail the refresh itself.
 *
 * Instagram keeps its own capture function above — that one also caches
 * thumbnails into the social-cache bucket, which Instagram specifically needs
 * because its CDN URLs are signed and expire within days. Facebook and X post
 * thumbnails are comparatively stable, so this path stores the provider URL
 * directly rather than paying for a download on every refresh.
 */
export async function captureSocialSnapshot(
  userId: string,
  profile: SocialProfile,
): Promise<boolean> {
  try {
    const admin = serviceClient();
    if (!admin) {
      logger.warn('social-snapshot: skipped — service role key not configured');
      return false;
    }
    if (!profile.handle) return false;
    // A profile we couldn't actually read has nothing worth publishing, and
    // writing it would overwrite a good earlier snapshot with empty numbers.
    if (profile.isPrivate) return false;

    const posts = profile.recentPosts.slice(0, MAX_POSTS);
    const profilePicPath = profile.avatarUrl
      ? await cacheImage(admin, profile.avatarUrl, `${profile.platform}/${userId}/profile.jpg`)
      : null;

    const { error: upsertErr } = await admin.from('social_snapshots').upsert(
      {
        user_id: userId,
        platform: profile.platform,
        handle: profile.handle,
        follower_count: profile.followerCount,
        posts_count: profile.postsCount,
        avg_views: averageViews(profile),
        engagement_rate: engagementRate(profile),
        is_verified: profile.isVerified ?? false,
        profile_pic_path: profilePicPath,
        recent_posts: posts.map((p) => ({
          url: p.url,
          shortcode: p.id,
          caption: p.caption,
          likes: p.likes,
          comments: p.comments,
          views: p.views,
          taken_at: p.takenAt,
          // Provider-hosted, not a social-cache path — the readers check for
          // thumb_path first and fall back to thumb_url.
          thumb_url: p.thumbUrl,
        })),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    );
    if (upsertErr) {
      logger.warn('social-snapshot: upsert failed (non-fatal)', {
        userId,
        platform: profile.platform,
        error: upsertErr.message,
      });
      return false;
    }

    const column = FOLLOWER_COLUMN[profile.platform];
    if (column && profile.followerCount != null) {
      await admin
        .from('influencer_profiles')
        .update({ [column]: profile.followerCount })
        .eq('user_id', userId);
    }

    return true;
  } catch (err) {
    logger.warn('social-snapshot: capture failed (non-fatal)', {
      userId,
      platform: profile.platform,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
