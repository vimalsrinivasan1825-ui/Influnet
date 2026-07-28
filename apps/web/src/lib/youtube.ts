// YouTube capture — recent videos for a creator's profile, with no API key.
//
// Instagram data comes from a paid scrape (see lib/apify-instagram.ts). YouTube
// does not need one: every channel publishes a public Atom feed at
// /feeds/videos.xml, which carries the last ~15 uploads including the video id,
// title, publish date and — usually — view and like counts. Thumbnails are
// derived from the video id (i.ytimg.com paths are permanent and unsigned), so
// unlike Instagram there is nothing to download into the social-cache bucket.
//
// The one thing the feed needs is a channel ID. Creators give us a handle
// ("@name"), so resolveChannelId fetches the channel page once and reads the ID
// out of it. That lookup is the only fragile part of this module; everything
// downstream degrades to "no videos" rather than failing.
//
// INVARIANTS
//  - Never throws: a YouTube failure must never break profile refresh, the
//    public profile render, or verification. Every entry point returns null.
//  - SERVER-ONLY: capture writes with the service-role key.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

/** Feed gives ~15; we keep what a profile grid can actually show. */
const MAX_VIDEOS = 12;
const FETCH_TIMEOUT_MS = 8_000;

/** YouTube blocks obviously-scripted requests to the channel page. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export interface YouTubeVideo {
  videoId: string;
  title: string;
  url: string;
  /** i.ytimg.com URL — permanent, no signing, safe to store. */
  thumbUrl: string;
  views: number | null;
  likes: number | null;
  publishedAt: string | null;
}

export interface YouTubeChannel {
  channelId: string;
  handle: string;
  /** Read off the channel page; null when the markup didn't yield it. */
  subscriberCount: number | null;
  videos: YouTubeVideo[];
}

/** Strip @, URLs and paths down to the bare handle or channel id. */
export function normalizeYouTubeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim();
  if (!h) return null;
  // Full URLs in any of YouTube's four shapes: /@handle, /channel/UC…, /c/name, /user/name
  const urlMatch = h.match(/youtube\.com\/(?:(?:channel|c|user)\/)?@?([A-Za-z0-9_.\-]+)/i);
  if (urlMatch) h = urlMatch[1];
  h = h.replace(/^@/, '').replace(/\/+$/, '').trim();
  return h || null;
}

/** A raw channel id needs no lookup — 'UC' + 22 url-safe chars. */
function isChannelId(handle: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(handle);
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse "1.2M subscribers" / "92.4K subscribers" / "1,284 subscribers".
 * Exported for tests — this is the format most likely to drift.
 */
export function parseSubscriberCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/([\d.,]+)\s*(million|billion|thousand|[KMB])?\s*subscriber/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toLowerCase();
  let mult = 1;
  if (unit === 'b' || unit === 'billion') mult = 1e9;
  else if (unit === 'm' || unit === 'million') mult = 1e6;
  else if (unit === 'k' || unit === 'thousand') mult = 1e3;
  return Math.round(n * mult);
}

/**
 * Handle → channel id. Returns the id plus whatever the page told us about
 * subscribers, since we already paid for the fetch.
 */
export async function resolveChannel(
  handle: string,
): Promise<{ channelId: string; subscriberCount: number | null } | null> {
  if (isChannelId(handle)) {
    // Already an id; the feed works directly, and subscribers stay unknown.
    return { channelId: handle, subscriberCount: null };
  }

  const html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`);
  if (!html) return null;

  // YouTube channel pages carry featured/linked channel IDs in the HTML,
  // which can appear before the owner's ID. Parse explicit metadata tags
  // (canonical link, og:url, itemprop) to guarantee we match the owner.
  const idMatch =
    html.match(/<meta\s+itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<meta\s+property="og:url"\s+content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<meta\s+name="twitter:app:url:googleplay"\s+content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/) ??
    html.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (!idMatch) return null;

  let subscriberCount: number | null = null;
  const ytDataMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
  if (ytDataMatch) {
    try {
      const data = JSON.parse(ytDataMatch[1]);
      const headerObj = data.header;

      // Modern YouTube header (pageHeaderViewModel)
      const metadataRows =
        headerObj?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
      for (const row of metadataRows) {
        for (const part of (row.metadataParts ?? [])) {
          const text = part.text?.content || part.accessibilityLabel;
          if (text && /subscribers?/i.test(text)) {
            subscriberCount = parseSubscriberCount(text);
            break;
          }
        }
        if (subscriberCount !== null) break;
      }

      // Legacy YouTube header (c4TabbedHeaderRenderer)
      if (subscriberCount === null && headerObj?.c4TabbedHeaderRenderer?.subscriberCountText) {
        const text =
          headerObj.c4TabbedHeaderRenderer.subscriberCountText.simpleText ||
          headerObj.c4TabbedHeaderRenderer.subscriberCountText.accessibility?.accessibilityData?.label;
        subscriberCount = parseSubscriberCount(text);
      }
    } catch {
      // JSON parse error — fall through to regex fallback
    }
  }

  // Fallback regex if ytInitialData header did not yield a result
  if (subscriberCount === null) {
    const subsMatch =
      html.match(/"text"\s*:\s*\{\s*"content"\s*:\s*"([^"]*subscribers[^"]*)"/i) ??
      html.match(/"accessibilityLabel"\s*:\s*"([^"]*subscribers[^"]*)"/i) ??
      html.match(/([\d.,]+\s*[KMB]?(?:\s*million|\s*billion|\s*thousand)?\s*subscribers?)/i);
    subscriberCount = parseSubscriberCount(subsMatch?.[1]);
  }

  return {
    channelId: idMatch[1],
    subscriberCount,
  };
}

const attr = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
};

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * Parse the Atom feed. Regex rather than an XML parser on purpose: the feed
 * shape is fixed and this keeps a zero-dependency path on the render side.
 * Exported for tests.
 */
export function parseVideoFeed(xml: string): YouTubeVideo[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const videos: YouTubeVideo[] = [];

  for (const entry of entries) {
    const videoId = tag(entry, 'yt:videoId');
    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) continue;

    // media:statistics / media:starRating are present on most public videos but
    // absent on some (very new uploads, hidden counts) — null, not zero.
    const statsBlock = entry.match(/<media:statistics[^>]*\/?>/)?.[0] ?? '';
    const ratingBlock = entry.match(/<media:starRating[^>]*\/?>/)?.[0] ?? '';
    const views = Number(attr(statsBlock, 'views'));
    const likes = Number(attr(ratingBlock, 'count'));

    videos.push({
      videoId,
      title: decode(tag(entry, 'title') ?? tag(entry, 'media:title') ?? 'Untitled'),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      views: Number.isFinite(views) && views > 0 ? views : null,
      likes: Number.isFinite(likes) && likes > 0 ? likes : null,
      publishedAt: tag(entry, 'published'),
    });

    if (videos.length >= MAX_VIDEOS) break;
  }

  return videos;
}

/** Fetch a channel's recent uploads. Null when the handle can't be resolved. */
export async function getYouTubeChannel(rawHandle: string | null | undefined): Promise<YouTubeChannel | null> {
  const handle = normalizeYouTubeHandle(rawHandle);
  if (!handle) return null;

  try {
    const resolved = await resolveChannel(handle);
    if (!resolved) {
      logger.warn('[youtube] could not resolve channel', { handle });
      return null;
    }

    const xml = await fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(resolved.channelId)}`,
    );
    if (!xml) return null;

    return {
      channelId: resolved.channelId,
      handle,
      subscriberCount: resolved.subscriberCount,
      videos: parseVideoFeed(xml),
    };
  } catch (err) {
    logger.error('[youtube] fetch failed', { handle, err: String(err) });
    return null;
  }
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Persist a channel into social_snapshots (platform='youtube'), the same table
 * the Instagram snapshot uses — so the public profile and the dashboard read
 * both platforms through one shape.
 *
 * `posts_count` is deliberately null: the feed carries recent uploads only, and
 * showing "12 videos" for a channel with 400 would be a lie.
 */
export async function captureYouTubeSnapshot(userId: string, channel: YouTubeChannel): Promise<boolean> {
  const supabase = serviceClient();
  if (!supabase) {
    logger.error('[youtube] no service-role key; snapshot skipped');
    return false;
  }

  const viewCounts = channel.videos.map((v) => v.views).filter((v): v is number => typeof v === 'number' && v > 0);
  const avgViews = viewCounts.length
    ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length)
    : null;

  const { error } = await supabase.from('social_snapshots').upsert(
    {
      user_id: userId,
      platform: 'youtube',
      handle: channel.handle.toLowerCase(),
      follower_count: channel.subscriberCount,
      posts_count: null,
      avg_views: avgViews,
      engagement_rate: null,
      is_verified: false,
      profile_pic_path: null,
      recent_posts: channel.videos.map((v) => ({
        url: v.url,
        video_id: v.videoId,
        title: v.title,
        // Not a storage path like Instagram's thumb_path: YouTube thumbnail
        // URLs never expire, so there is nothing to cache.
        thumb_url: v.thumbUrl,
        views: v.views,
        likes: v.likes,
        taken_at: v.publishedAt,
        type: 'Video',
      })),
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' },
  );

  if (error) {
    logger.error('[youtube] snapshot upsert failed', { userId, error: error.message });
    return false;
  }
  return true;
}

/** Fetch + persist in one call. Returns the channel on success, null otherwise. */
export async function refreshYouTubeSnapshot(
  userId: string,
  rawHandle: string | null | undefined,
): Promise<YouTubeChannel | null> {
  const channel = await getYouTubeChannel(rawHandle);
  if (!channel) return null;
  await captureYouTubeSnapshot(userId, channel);
  return channel;
}
