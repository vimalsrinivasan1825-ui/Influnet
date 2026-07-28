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

/**
 * Consent cookies. From a datacenter IP — which is every deployment of this app
 * — YouTube answers the channel page with a consent interstitial instead of the
 * channel, and the interstitial carries no header, no channel id and no
 * subscriber count. A browser gets past it by holding these cookies; a fetch has
 * to send them itself. This is why a scrape that works on a laptop returns
 * nothing in production.
 */
const CONSENT_COOKIE = 'CONSENT=YES+cb; SOCS=CAI';

async function fetchText(url: string, label: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: CONSENT_COOKIE,
      },
    });
    if (!res.ok) {
      // Logged, not swallowed: silence here is what made a stale subscriber
      // count look like a parsing bug for two days.
      logger.warn('[youtube] fetch returned a non-OK status', { label, status: res.status });
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.warn('[youtube] fetch failed', { label, err: String(err) });
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
 * Pull a top-level JSON object out of an inline script, e.g. `var ytInitialData
 * = {…};`.
 *
 * A `{[\s\S]*?};</script>` regex looks equivalent but isn't: the blob is over a
 * megabyte of nested JSON and any `};</script>` sequence inside one of its
 * STRINGS ends the match early, so JSON.parse throws and the caller silently
 * falls back to guessing. Scanning braces (while tracking string/escape state)
 * always ends on the object's real closing brace.
 */
export function extractInlineJson(html: string, marker: string): any | null {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * The owner's subscriber count, and only the owner's.
 *
 * A channel page embeds the subscriber count of every OTHER channel it links to
 * — featured channels, the shelves of collaborators — so "the first number next
 * to the word subscribers" is a coin flip. On @a2dchannel it picked a featured
 * channel's 568K and published it in place of the owner's 2.51M.
 *
 * Every source below is owner-scoped by construction: the page header renderers
 * describe the channel whose page this is, and the last-resort regex only
 * accepts a string that names the channel's own handle. When none of them
 * match we return null — a missing number degrades to "keep the last known
 * value", whereas a confident wrong one gets published to brands.
 *
 * Exported for tests: this is the format most likely to drift.
 */
export function extractOwnerSubscriberCount(html: string, handle: string): number | null {
  const data = extractInlineJson(html, 'var ytInitialData = ');
  const header = data?.header;

  // Modern header (pageHeaderViewModel). accessibilityLabel first: it spells the
  // unit out ("2.51 million subscribers") where content abbreviates it.
  const metadataRows =
    header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows ?? [];
  for (const row of metadataRows) {
    for (const part of row?.metadataParts ?? []) {
      const text = part?.accessibilityLabel || part?.text?.content;
      if (text && /subscribers?/i.test(text)) {
        const n = parseSubscriberCount(text);
        if (n !== null) return n;
      }
    }
  }

  // Legacy header (c4TabbedHeaderRenderer), still served to some clients.
  const legacy = header?.c4TabbedHeaderRenderer?.subscriberCountText;
  if (legacy) {
    const n = parseSubscriberCount(
      legacy.simpleText || legacy.accessibility?.accessibilityData?.label,
    );
    if (n !== null) return n;
  }

  // Last resort: the header subtitle, which reads "@handle • 2.51M subscribers".
  // Requiring the handle in the same string is what keeps a featured channel's
  // count out — without it this line is the bug it is here to prevent.
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subtitle = html.match(
    new RegExp(`@${escaped}[^"]{0,40}?subscribers?`, 'i'),
  );
  return parseSubscriberCount(subtitle?.[0]);
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

  // hl/gl pin the response to English: the parsers below match the word
  // "subscribers", and a server geolocated elsewhere gets served its own locale.
  const html = await fetchText(
    `https://www.youtube.com/@${encodeURIComponent(handle)}?hl=en&gl=US`,
    'channel-page',
  );
  if (!html) return null;

  // YouTube channel pages carry featured/linked channel IDs in the HTML, which
  // can appear before the owner's ID. channelMetadataRenderer.externalId is the
  // page's own declaration of whose channel this is; the meta tags after it say
  // the same thing in markup, and only then do we fall back to guessing.
  const externalId: string | undefined =
    extractInlineJson(html, 'var ytInitialData = ')?.metadata?.channelMetadataRenderer?.externalId;
  const idMatch =
    (isChannelId(externalId ?? '') ? [null, externalId] : null) ??
    html.match(/<meta\s+itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<meta\s+property="og:url"\s+content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/<meta\s+name="twitter:app:url:googleplay"\s+content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/i) ??
    html.match(/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/) ??
    html.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (!idMatch?.[1]) return null;

  const subscriberCount = extractOwnerSubscriberCount(html, handle);
  if (subscriberCount === null) {
    logger.warn('[youtube] channel page yielded no owner subscriber count', { handle });
  }

  return { channelId: idMatch[1], subscriberCount };
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
      'video-feed',
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

  // A page whose header we couldn't read tells us nothing about the channel's
  // size — it must not erase what we already knew. Blanking the count would
  // drop the creator's public profile from "2.5M subscribers" to nothing on a
  // single bad fetch, which is a worse failure than showing yesterday's number.
  let followerCount = channel.subscriberCount;
  if (followerCount === null) {
    const { data: prior } = await supabase
      .from('social_snapshots')
      .select('follower_count')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .maybeSingle();
    followerCount = (prior as { follower_count: number | null } | null)?.follower_count ?? null;
  }

  const { error } = await supabase.from('social_snapshots').upsert(
    {
      user_id: userId,
      platform: 'youtube',
      handle: channel.handle.toLowerCase(),
      follower_count: followerCount,
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
