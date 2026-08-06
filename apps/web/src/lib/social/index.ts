// The platform registry — the single place callers ask "read this handle".
//
// Instagram and YouTube keep their existing modules (lib/instagram.ts feeds the
// verification pipeline, lib/youtube.ts the free Atom-feed capture); they're
// adapted to the shared SocialHandler shape here rather than rewritten, so
// nothing already proven in production moves.

import { fetchInstagramProfile, InstagramProviderError, normalizeHandle as normalizeIgHandle, activeProvider } from '../instagram';
import { getYouTubeChannel, normalizeYouTubeHandle } from '../youtube';
import { facebookHandler } from './facebook';
import { twitterHandler } from './twitter';
import { snapchatHandler } from './snapchat';
import {
  SocialProviderError,
  type SocialHandler,
  type SocialPlatform,
  type SocialProfile,
} from './types';

export * from './types';
export { facebookHandler } from './facebook';
export { twitterHandler } from './twitter';
export { snapchatHandler } from './snapchat';

const instagramHandler: SocialHandler = {
  platform: 'instagram',
  supported: true,
  isConfigured: () => activeProvider() !== 'none',
  normalizeHandle: normalizeIgHandle,
  profileUrl: (handle) => `https://www.instagram.com/${handle}`,
  async fetchProfile(rawHandle) {
    const handle = normalizeIgHandle(rawHandle);
    if (!handle) return null;
    try {
      const u = await fetchInstagramProfile(handle);
      if (!u) return null;
      return {
        platform: 'instagram',
        handle: (u.username ?? handle).toLowerCase(),
        url: `https://www.instagram.com/${u.username ?? handle}`,
        displayName: u.fullName ?? null,
        biography: u.biography ?? null,
        followerCount: u.followerCount ?? null,
        avatarUrl: u.profilePicUrl ?? null,
        isVerified: u.isVerified ?? null,
        isPrivate: Boolean(u.isPrivate),
        postsCount: u.mediaCount ?? null,
        recentPosts: (u.recentPosts ?? []).map((p) => ({
          url: p.url,
          id: p.shortcode,
          caption: p.caption,
          likes: p.likes,
          comments: p.comments,
          views: p.views,
          takenAt: p.takenAt,
          thumbUrl: p.displayUrl,
        })),
      } satisfies SocialProfile;
    } catch (err) {
      // Re-wrap so callers only ever have to catch SocialProviderError; the
      // Instagram provider predates this layer and throws its own class.
      if (err instanceof InstagramProviderError) {
        throw new SocialProviderError('instagram', err.kind as any, err.message, err.status);
      }
      throw err;
    }
  },
};

const youtubeHandler: SocialHandler = {
  platform: 'youtube',
  supported: true,
  // The Atom feed needs no credentials — YouTube is always available.
  isConfigured: () => true,
  normalizeHandle: normalizeYouTubeHandle,
  profileUrl: (handle) => (/^UC[A-Za-z0-9_-]{22}$/.test(handle) ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/@${handle}`),
  async fetchProfile(rawHandle) {
    const channel = await getYouTubeChannel(rawHandle);
    if (!channel) return null;
    return {
      platform: 'youtube',
      handle: channel.handle,
      url: `https://www.youtube.com/channel/${channel.channelId}`,
      displayName: channel.title,
      biography: null,
      followerCount: channel.subscriberCount,
      avatarUrl: channel.avatarUrl,
      isVerified: null,
      // A channel that resolves is public by definition — YouTube has no
      // private-channel equivalent that still serves a feed.
      isPrivate: false,
      postsCount: null,
      recentPosts: channel.videos.map((v) => ({
        url: v.url,
        id: v.videoId,
        caption: v.title,
        likes: v.likes,
        comments: null,
        views: v.views,
        takenAt: v.publishedAt,
        thumbUrl: v.thumbUrl,
      })),
    } satisfies SocialProfile;
  },
};

const HANDLERS: Record<SocialPlatform, SocialHandler> = {
  instagram: instagramHandler,
  youtube: youtubeHandler,
  facebook: facebookHandler,
  twitter: twitterHandler,
  snapchat: snapchatHandler,
};

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && value in HANDLERS;
}

/** The handler for a platform, or null when the name isn't one we know. */
export function getSocialHandler(platform: string): SocialHandler | null {
  return isSocialPlatform(platform) ? HANDLERS[platform] : null;
}
