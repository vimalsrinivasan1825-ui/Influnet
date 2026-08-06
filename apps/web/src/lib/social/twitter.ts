// X (Twitter) handler, via Apify.
//
// X has no free public feed (unlike YouTube's Atom feed) and no unauthenticated
// HTML worth parsing — logged-out twitter.com/x.com serves a login wall to
// datacenter IPs. The official API starts at $200/month for the tier that
// returns a user lookup, so an Apify actor is the practical provider; the actor
// id is env-overridable (APIFY_TWITTER_ACTOR) because these get renamed often.
//
// "Private" on X is the protected-account flag: a protected account's tweets
// are invisible to anyone who doesn't follow it, so — exactly like a private
// Instagram — we can never scrape it and its bio can never prove ownership.
// Signup surfaces that up front rather than after the account exists.

import {
  SocialProviderError,
  postViews,
  toIso,
  toNumber,
  type SocialHandler,
  type SocialPost,
  type SocialProfile,
} from './types';
import { ACTORS, isActorError, isApifyConfigured, isDemoOutput, runActor } from './apify';

const PLATFORM = 'twitter' as const;
const MAX_POSTS = 12;

/** Accepts a bare handle, @handle, or any twitter.com / x.com profile URL. */
function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  if (/twitter\.com|x\.com/i.test(value)) {
    try {
      const u = new URL(value.startsWith('http') ? value : `https://${value}`);
      value = u.pathname.split('/').filter(Boolean)[0] ?? '';
    } catch {
      return null;
    }
  }

  value = value.replace(/^@/, '').replace(/\/+$/, '').split('?')[0].trim();
  // X handles: 1–15 chars, letters/digits/underscore only.
  if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) return null;
  return value.toLowerCase();
}

function profileUrl(handle: string): string {
  return `https://x.com/${handle}`;
}

function mapPosts(raw: unknown): SocialPost[] {
  if (!Array.isArray(raw)) return [];
  const posts: SocialPost[] = [];
  for (const t of raw.slice(0, MAX_POSTS)) {
    if (!t || typeof t !== 'object') continue;
    const id = typeof t.id === 'string' ? t.id : typeof t.id_str === 'string' ? t.id_str : null;
    const url = typeof t.url === 'string' ? t.url : typeof t.twitterUrl === 'string' ? t.twitterUrl : null;
    if (!id && !url) continue;
    const likes = toNumber(t.likeCount ?? t.favorite_count);
    posts.push({
      url: url ?? `https://x.com/i/status/${id}`,
      id: id ?? url!,
      caption: typeof t.text === 'string' ? t.text.slice(0, 200) : typeof t.full_text === 'string' ? t.full_text.slice(0, 200) : null,
      likes,
      comments: toNumber(t.replyCount ?? t.reply_count),
      // X reports impressions as viewCount on video/post analytics. The
      // shared guard drops the placeholder values providers emit when the
      // real number isn't available to them.
      views: postViews(t.viewCount ?? t.views, likes),
      takenAt: toIso(t.createdAt ?? t.created_at),
      thumbUrl:
        typeof t.media?.[0]?.media_url_https === 'string'
          ? t.media[0].media_url_https
          : typeof t.extendedEntities?.media?.[0]?.media_url_https === 'string'
            ? t.extendedEntities.media[0].media_url_https
            : null,
    });
  }
  return posts;
}

/**
 * Actors for X disagree on whether an item is the user or a tweet carrying an
 * `author`. Accept both rather than pinning to one actor's shape — the actor
 * is env-swappable by design, so the mapper has to tolerate a swap.
 */
function userOf(items: any[]): any | null {
  for (const item of items) {
    if (isActorError(item)) continue;
    if (item.userName || item.screen_name || item.username) return item;
    if (item.author && (item.author.userName || item.author.screen_name)) return item.author;
  }
  return null;
}

async function fetchProfile(rawHandle: string): Promise<SocialProfile | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  if (!isApifyConfigured()) {
    throw new SocialProviderError(PLATFORM, 'unauthorized', 'APIFY_TOKEN is not configured');
  }

  const items = await runActor(PLATFORM, ACTORS.twitter(), {
    // Two spellings of the same intent: actors in this family have used both,
    // and an ignored extra key is free while a missing one returns nothing.
    twitterHandles: [handle],
    startUrls: [profileUrl(handle)],
    maxItems: MAX_POSTS,
    getFollowers: false,
    getFollowing: false,
  });

  // A rental actor on a free Apify plan answers 200 with stub items rather
  // than failing. Left unchecked, that turns every X lookup into "no such
  // account" — a lie about the creator's handle. Raise it as what it is.
  if (isDemoOutput(items)) {
    throw new SocialProviderError(
      PLATFORM,
      'not_supported',
      'The X scraper actor returned demo output — third-party Apify actors need a paid plan. ' +
        'Upgrade the Apify plan, or point APIFY_TWITTER_ACTOR at an actor the current plan can run.',
    );
  }

  const u = userOf(items);
  if (!u) return null;

  const tweets = Array.isArray(u.latestTweets)
    ? u.latestTweets
    : items.filter((i) => i && !isActorError(i) && (i.text || i.full_text));

  return {
    platform: PLATFORM,
    handle: (u.userName ?? u.screen_name ?? u.username ?? handle).toLowerCase(),
    url: profileUrl(u.userName ?? u.screen_name ?? handle),
    displayName: typeof u.name === 'string' ? u.name : null,
    biography: typeof u.description === 'string' ? u.description.slice(0, 500) : null,
    followerCount: toNumber(u.followers ?? u.followersCount ?? u.followers_count),
    avatarUrl:
      typeof u.profilePicture === 'string'
        ? u.profilePicture
        : typeof u.profile_image_url_https === 'string'
          ? // The default avatar URL is the 48px "_normal" crop; ask for the
            // full-size original so the preview card isn't a blurry thumbnail.
            u.profile_image_url_https.replace('_normal', '')
          : null,
    isVerified: typeof u.isVerified === 'boolean' ? u.isVerified : typeof u.verified === 'boolean' ? u.verified : null,
    isPrivate: Boolean(u.protected ?? u.isPrivate),
    postsCount: toNumber(u.statusesCount ?? u.statuses_count),
    recentPosts: mapPosts(tweets),
  };
}

export const twitterHandler: SocialHandler = {
  platform: PLATFORM,
  supported: true,
  isConfigured: isApifyConfigured,
  normalizeHandle,
  profileUrl,
  fetchProfile,
};
