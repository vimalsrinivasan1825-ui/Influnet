// View model + mock-data layer for the creator public profile (/c/[username]).
//
// Today the platform analytics (posts, avg views, popular content) aren't in the
// database yet — they arrive once account-connect + scraping ship. So this module
// assembles a view from the creator's REAL identity fields and fills the
// not-yet-available analytics with mock data, controlled by a flag. Flip the flag
// off (or pass ?mock=0) once real `social_connections` data is wired in.

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok';

export interface ProfileStat {
  label: string;
  value: string;
}

export interface PlatformContentItem {
  /** Optional thumbnail URL. When absent the UI renders a themed gradient. */
  imageUrl?: string | null;
  /** Formatted view count, e.g. "1.2M". */
  views: string;
  /** Video duration for YouTube, e.g. "12:04". */
  duration?: string;
}

export interface PlatformCardView {
  platform: SocialPlatform;
  displayName: string;
  handle: string;
  stats: ProfileStat[];
  content: PlatformContentItem[];
  /** Trust line, e.g. "Connect-verified · refreshed 2h ago". */
  note: string;
  connected: boolean;
}

export interface FloatingBadge {
  platform: SocialPlatform | 'verified';
  value: string;
  label: string;
}

export interface CreatorProfileView {
  name: string;
  username: string;
  avatarUrl: string | null;
  /** Lead part of the two-tone subtitle, e.g. "Fashion & Lifestyle". */
  subtitleLead: string;
  /** Accented part of the subtitle, e.g. "Content Creator". */
  subtitleAccent: string;
  tagline: string;
  location: string | null;
  niches: string[];
  isVerified: boolean;
  heroStats: ProfileStat[];
  floating: FloatingBadge[];
  platforms: PlatformCardView[];
  usingMock: boolean;
}

/** Loosely-typed shape of the `get_public_influencer` RPC payload. */
export interface RawPublicProfile {
  userId?: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  languages?: string[] | null;
  niche?: string[] | null;
  isVerified?: boolean | null;
  instagramFollowers?: number | null;
  youtubeSubscribers?: number | null;
  tiktokFollowers?: number | null;
  instagramHandle?: string | null;
  youtubeHandle?: string | null;
  tiktokHandle?: string | null;
}

/** Format a raw count into a compact label: 1284 → "1,284", 92400 → "92.4K". */
export function formatCount(n: number | null | undefined): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-IN');
}

/**
 * Decide whether to render mock analytics. Mock is ON by default so the profile
 * looks complete during development; turn it off with NEXT_PUBLIC_PROFILE_MOCK=off
 * or per-request with ?mock=0. Force it on with ?mock=1.
 */
export function resolveMockMode(searchParam?: string | string[]): boolean {
  const q = Array.isArray(searchParam) ? searchParam[0] : searchParam;
  if (q === '0' || q === 'off' || q === 'false') return false;
  if (q === '1' || q === 'on' || q === 'true') return true;
  return process.env.NEXT_PUBLIC_PROFILE_MOCK !== 'off';
}

const cleanHandle = (h?: string | null) => (h ? h.replace(/^@/, '') : '');

function splitSubtitle(profile: RawPublicProfile): { lead: string; accent: string } {
  const niches = profile.niche ?? [];
  if (niches.length > 0) {
    return { lead: niches.slice(0, 2).join(' & '), accent: 'Content Creator' };
  }
  const headline = (profile.headline || '').trim();
  if (headline) {
    const parts = headline.split(' ');
    if (parts.length > 1) {
      return { lead: parts.slice(0, -2).join(' ') || parts[0], accent: parts.slice(-2).join(' ') };
    }
    return { lead: headline, accent: '' };
  }
  return { lead: 'Content', accent: 'Creator' };
}

function locationOf(profile: RawPublicProfile): string | null {
  if (profile.city) return [profile.city, profile.state].filter(Boolean).join(', ');
  return profile.location ?? null;
}

// ── Mock analytics — placeholder numbers until real data is connected ──────────
const MOCK = {
  reach: '340K',
  engagement: '6.1%',
  instagram: {
    followers: '248K',
    posts: '1,284',
    avgViews: '92K',
    content: [{ views: '1.2M' }, { views: '860K' }, { views: '640K' }],
  },
  youtube: {
    subscribers: '92.4K',
    videos: '156',
    avgViews: '84K',
    content: [
      { views: '210K', duration: '12:04' },
      { views: '148K', duration: '08:37' },
      { views: '96K', duration: '15:22' },
    ],
  },
};

export function buildCreatorProfileView(
  profile: RawPublicProfile,
  opts: { useMock: boolean },
): CreatorProfileView {
  const { useMock } = opts;
  const { lead, accent } = splitSubtitle(profile);
  const igHandle = cleanHandle(profile.instagramHandle) || cleanHandle(profile.username);
  const ytHandle = cleanHandle(profile.youtubeHandle) || profile.name || '';

  const igFollowersReal = profile.instagramFollowers ?? 0;
  const ytSubsReal = profile.youtubeSubscribers ?? 0;
  const reachReal = igFollowersReal + ytSubsReal + (profile.tiktokFollowers ?? 0);

  // Hero stat chips
  const heroStats: ProfileStat[] = [
    { label: 'Total reach', value: useMock ? MOCK.reach : formatCount(reachReal) },
    {
      label: 'Followers',
      value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal),
    },
  ];
  if (useMock) heroStats.push({ label: 'Engagement', value: MOCK.engagement });

  // Platform cards
  const platforms: PlatformCardView[] = [];
  const hasIg = useMock || !!profile.instagramHandle || igFollowersReal > 0;
  if (hasIg) {
    platforms.push({
      platform: 'instagram',
      displayName: igHandle ? `@${igHandle}` : 'Instagram',
      handle: 'Instagram',
      stats: [
        { label: 'Posts', value: useMock ? MOCK.instagram.posts : '—' },
        { label: 'Followers', value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal) },
        { label: 'Avg views', value: useMock ? MOCK.instagram.avgViews : '—' },
      ],
      content: useMock ? MOCK.instagram.content : [],
      note: useMock ? 'Connect-verified · refreshed 2h ago' : 'Connect Instagram to show live stats',
      connected: useMock,
    });
  }
  const hasYt = useMock || !!profile.youtubeHandle || ytSubsReal > 0;
  if (hasYt) {
    platforms.push({
      platform: 'youtube',
      displayName: ytHandle || 'YouTube',
      handle: 'YouTube',
      stats: [
        { label: 'Subscribers', value: useMock ? MOCK.youtube.subscribers : formatCount(ytSubsReal) },
        { label: 'Videos', value: useMock ? MOCK.youtube.videos : '—' },
        { label: 'Avg views', value: useMock ? MOCK.youtube.avgViews : '—' },
      ],
      content: useMock ? MOCK.youtube.content : [],
      note: useMock ? 'Connect-verified · 1.6M views this year' : 'Connect YouTube to show live stats',
      connected: useMock,
    });
  }

  // Floating orbit badges
  const floating: FloatingBadge[] = [];
  if (hasIg) {
    floating.push({
      platform: 'instagram',
      value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal),
      label: 'Instagram',
    });
  }
  if (hasYt) {
    floating.push({
      platform: 'youtube',
      value: useMock ? MOCK.youtube.subscribers : formatCount(ytSubsReal),
      label: 'YouTube',
    });
  }
  floating.push({ platform: 'verified', value: 'Verified', label: 'by Influnet' });

  return {
    name: profile.name || (profile.username ? `@${profile.username}` : 'Creator'),
    username: cleanHandle(profile.username),
    avatarUrl: profile.avatarUrl ?? null,
    subtitleLead: lead,
    subtitleAccent: accent,
    tagline:
      (profile.bio || profile.headline || '').trim() ||
      'Creating content that helps brands reach and move real audiences.',
    location: locationOf(profile),
    niches: profile.niche ?? [],
    isVerified: !!profile.isVerified,
    heroStats,
    floating,
    platforms,
    usingMock: useMock,
  };
}
