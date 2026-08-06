// Facebook handler — public Pages and public profiles, via Apify.
//
// WHAT FACEBOOK ACTUALLY ALLOWS
// Facebook serves a public Page (facebook.com/<name>) to logged-out visitors;
// it serves almost nothing for a personal profile whose audience is Friends.
// That difference is the whole feature here: signup asks the creator for their
// Facebook, and we answer "we can see this one" or "this one is private/locked,
// nobody but your friends can see it" — the same public/private gate Instagram
// already has, for the same reason (an account we cannot read can never be
// scraped, and can never be ownership-verified from its bio).
//
// A personal profile that IS public reads fine and is accepted. Nothing here
// touches friends-only content, and no login/cookie is ever used to reach it.
//
// SCOPE: signup only needs existence + public/private + enough to render a
// recognisable preview card. Content/metric capture happens later, in-app,
// through captureSocialSnapshot — same fetch, different caller.

import {
  SocialProviderError,
  postViews,
  toIso,
  toNumber,
  type SocialHandler,
  type SocialPost,
  type SocialProfile,
} from './types';
import { ACTORS, isActorError, isApifyConfigured, runActor } from './apify';

const PLATFORM = 'facebook' as const;
const MAX_POSTS = 12;

/**
 * Accepts a bare name, an @name, or any facebook.com URL — including
 * `profile.php?id=<numeric>`, which is what the "copy link" button hands a
 * creator who never set a username, and which we must not mangle into the
 * literal handle "profile.php".
 */
function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  if (/facebook\.com|fb\.com|fb\.me/i.test(value)) {
    try {
      const u = new URL(value.startsWith('http') ? value : `https://${value}`);
      const numericId = u.searchParams.get('id');
      if (numericId && /^\d+$/.test(numericId)) return numericId;
      value = u.pathname.split('/').filter(Boolean)[0] ?? '';
      // people/<slug>/<id> — the id is the addressable part.
      if (value === 'people') {
        const parts = u.pathname.split('/').filter(Boolean);
        value = parts[2] ?? parts[1] ?? '';
      }
    } catch {
      return null;
    }
  }

  value = value.replace(/^@/, '').replace(/\/+$/, '').split('?')[0].trim();
  if (!value) return null;
  // Facebook usernames: letters, digits, dots; 5+ chars. Numeric ids are the
  // exception (any length) since profile.php ids are pure digits.
  if (/^\d+$/.test(value)) return value;
  if (!/^[A-Za-z0-9.]{2,60}$/.test(value)) return null;
  return value.toLowerCase();
}

function profileUrl(handle: string): string {
  return /^\d+$/.test(handle)
    ? `https://www.facebook.com/profile.php?id=${handle}`
    : `https://www.facebook.com/${handle}`;
}

/**
 * Followers is the number that means "audience" on Facebook; likes is the
 * older Page metric and many Pages now report only one of the two. Prefer
 * followers, fall back to likes, so a Page never shows a blank audience when
 * the provider actually returned one.
 */
function audienceOf(page: any): number | null {
  return toNumber(page.followers ?? page.followersCount) ?? toNumber(page.likes ?? page.likesCount);
}

function mapPosts(raw: unknown): SocialPost[] {
  if (!Array.isArray(raw)) return [];
  const posts: SocialPost[] = [];
  for (const p of raw.slice(0, MAX_POSTS)) {
    if (!p || typeof p !== 'object') continue;
    const url = typeof p.url === 'string' ? p.url : typeof p.postUrl === 'string' ? p.postUrl : null;
    const id = typeof p.postId === 'string' ? p.postId : typeof p.id === 'string' ? p.id : null;
    if (!url || !id) continue;
    const likes = toNumber(p.likes ?? p.likesCount);
    posts.push({
      url,
      id,
      // Captions are display hints, not content storage — trimmed on the way in.
      caption: typeof p.text === 'string' ? p.text.slice(0, 200) : null,
      likes,
      comments: toNumber(p.comments ?? p.commentsCount),
      views: postViews(p.viewsCount ?? p.videoViewCount, likes),
      takenAt: toIso(p.time ?? p.timestamp ?? p.date),
      thumbUrl: typeof p.thumbnailUrl === 'string' ? p.thumbnailUrl : typeof p.media?.[0]?.thumbnail === 'string' ? p.media[0].thumbnail : null,
    });
  }
  return posts;
}

/**
 * Recent posts — a SECOND billed actor run (see ACTORS.facebookPosts).
 *
 * Deliberately not part of fetchProfile: signup only needs to answer "can we
 * see this account", and charging every signup for a content scrape nobody
 * looks at yet is the same waste the Connect button was built to stop. The
 * in-app refresh calls this; the signup preview never does.
 *
 * Never throws — content is an enrichment, and a creator's follower count
 * shouldn't be lost because the posts actor had a bad run.
 */
async function fetchPosts(handle: string): Promise<SocialPost[]> {
  try {
    const items = await runActor(PLATFORM, ACTORS.facebookPosts(), {
      startUrls: [{ url: profileUrl(handle) }],
      resultsLimit: MAX_POSTS,
    });
    return mapPosts(items.filter((i) => !isActorError(i)));
  } catch {
    return [];
  }
}

async function fetchProfile(rawHandle: string): Promise<SocialProfile | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  if (!isApifyConfigured()) {
    throw new SocialProviderError(PLATFORM, 'unauthorized', 'APIFY_TOKEN is not configured');
  }

  const items = await runActor(PLATFORM, ACTORS.facebook(), {
    startUrls: [{ url: profileUrl(handle) }],
    resultsLimit: MAX_POSTS,
  });

  const page = items[0];
  if (!page || isActorError(page)) return null;

  // The actor returns a shell object for a page it could load but not read —
  // no name, no audience. That is exactly the locked/friends-only case, and it
  // must come back as "private", not "not found": the user's handle is right
  // and the fix is a privacy setting, so telling them "we couldn't find that
  // account" would send them to change the one thing that isn't wrong.
  //
  // Field names confirmed against a live run (2026-08-05, facebook.com/nasa):
  // title / pageName / followers / likes / intro / profilePictureUrl.
  const displayName =
    (typeof page.title === 'string' && page.title.trim()) ||
    (typeof page.name === 'string' && page.name.trim()) ||
    (typeof page.pageName === 'string' && page.pageName.trim()) ||
    null;
  const followerCount = audienceOf(page);
  const isPrivate = !displayName && followerCount == null;

  return {
    platform: PLATFORM,
    handle,
    url: typeof page.pageUrl === 'string' ? page.pageUrl : profileUrl(handle),
    displayName,
    biography:
      typeof page.intro === 'string'
        ? page.intro.slice(0, 500)
        : typeof page.info === 'string'
          ? page.info.slice(0, 500)
          : null,
    followerCount,
    avatarUrl:
      typeof page.profilePictureUrl === 'string'
        ? page.profilePictureUrl
        : typeof page.profilePhoto === 'string'
          ? page.profilePhoto
          : null,
    // The pages actor exposes no blue-tick field (verified live — the payload
    // has confirmed_owner, which is the "who is responsible for this Page"
    // disclosure, NOT Facebook's verification badge). null is the honest
    // answer; inferring a badge from an ownership label would put a checkmark
    // on accounts Facebook never verified.
    isVerified: typeof page.verified === 'boolean' ? page.verified : null,
    isPrivate,
    postsCount: toNumber(page.postsCount),
    // Empty here by design — posts come from fetchPosts (a second actor run),
    // which only the in-app capture path pays for.
    recentPosts: mapPosts(page.posts ?? page.latestPosts),
  };
}

export const facebookHandler: SocialHandler = {
  platform: PLATFORM,
  supported: true,
  isConfigured: isApifyConfigured,
  normalizeHandle,
  profileUrl,
  fetchProfile,
  fetchPosts,
};
