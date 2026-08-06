// Shared vocabulary for every social platform we read.
//
// Before this module, "read a social profile" meant `getInstagramUser` and
// nothing else: YouTube had its own shape, and Facebook/Twitter handles were
// stored as text nobody ever fetched. Each new platform would otherwise add
// another bespoke branch to signup, to /api/profile/refresh, and to the
// snapshot writer.
//
// So: one profile shape, one error, one handler interface. A platform is added
// by writing a handler and registering it (see ./index.ts) — callers never
// branch on the platform name.

/** Every platform the product knows about, scrapable or not. */
export type SocialPlatform = 'instagram' | 'youtube' | 'facebook' | 'twitter' | 'snapchat';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'youtube',
  'facebook',
  'twitter',
  'snapchat',
];

/** Human label for a platform, for UI copy and error messages. */
export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  twitter: 'X',
  snapchat: 'Snapchat',
};

export type SocialErrorKind =
  | 'unauthorized'
  | 'insufficient_funds'
  | 'rate_limited'
  | 'network'
  | 'not_supported'
  | 'unknown';

export class SocialProviderError extends Error {
  kind: SocialErrorKind;
  platform: SocialPlatform;
  status?: number;
  constructor(platform: SocialPlatform, kind: SocialErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'SocialProviderError';
    this.platform = platform;
    this.kind = kind;
    this.status = status;
  }
}

/** One piece of content, normalised across platforms. */
export interface SocialPost {
  /** Permanent, platform-hosted link to the post. */
  url: string;
  /** Platform-native id (shortcode / post id / tweet id). */
  id: string;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  /** Real view count only — never a provider placeholder (see postViews below). */
  views: number | null;
  /** ISO timestamp, or null when the provider didn't report one. */
  takenAt: string | null;
  /** Provider-hosted image URL; may be signed/expiring, so cache before storing. */
  thumbUrl: string | null;
}

/**
 * A public social profile, normalised.
 *
 * `isPrivate` is the field signup actually gates on: a private (or
 * login-walled) account can never be scraped or ownership-verified, so the
 * user has to hear about it while they can still fix it, not after signup.
 */
export interface SocialProfile {
  platform: SocialPlatform;
  handle: string;
  url: string;
  displayName: string | null;
  biography: string | null;
  followerCount: number | null;
  avatarUrl: string | null;
  /** Platform's own blue-tick, when reported. */
  isVerified: boolean | null;
  isPrivate: boolean;
  postsCount: number | null;
  recentPosts: SocialPost[];
}

export interface SocialHandler {
  platform: SocialPlatform;
  /**
   * False for platforms we deliberately accept a handle for but do not read
   * (Snapchat). Callers must treat these as "link only" and never present an
   * unfetched handle as verified.
   */
  supported: boolean;
  /** Whether credentials for this handler are present in the environment. */
  isConfigured(): boolean;
  /** Strip @/URL wrappers down to a bare handle, or null when unusable. */
  normalizeHandle(raw: string | null | undefined): string | null;
  /** Canonical public URL for a handle. */
  profileUrl(handle: string): string;
  /**
   * Fetch the public profile. Returns null when the handle doesn't resolve,
   * throws SocialProviderError on a provider failure (so callers can degrade
   * rather than treat an outage as "account not found").
   */
  fetchProfile(handle: string): Promise<SocialProfile | null>;
  /**
   * Recent content, for platforms whose profile fetch doesn't include it
   * (Facebook: the pages actor returns metadata only, posts are a separate
   * billed run). Optional — when absent, fetchProfile's recentPosts is all
   * there is. Implementations must not throw: content is enrichment, and
   * losing it must never cost the caller the profile it already fetched.
   */
  fetchPosts?(handle: string): Promise<SocialPost[]>;
}

/**
 * A post's view count, or null when the provider reported a placeholder.
 *
 * Learned on Instagram (see apify-instagram.ts): the actor returned
 * `videoViewCount: 1` against 29,000 likes, and fed straight through that
 * became the creator's published "1 avg view per post". A post cannot have
 * fewer views than likes — anything at or below the like count is a
 * placeholder, not a measurement. Every platform's mapper goes through here.
 */
export function postViews(raw: unknown, likes: number | null): number | null {
  const views = toNumber(raw);
  if (views == null || views <= 0) return null;
  if (likes != null && views <= likes) return null;
  return views;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ISO string from whatever date-ish value a provider hands back. */
export function toIso(v: unknown): string | null {
  if (typeof v === 'number') {
    // Providers disagree on seconds vs milliseconds; anything below ~year 2001
    // in ms is really a seconds epoch.
    const ms = v < 1e11 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}
