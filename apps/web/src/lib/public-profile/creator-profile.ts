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
  /** Permanent link to the original post; renders the thumbnail as a link. */
  href?: string | null;
  /** True if this is a video format. */
  isVideo?: boolean;
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
  languages: string[];
  niches: string[];
  isVerified: boolean;
  heroChips: ProfileStat[];
  heroStats: ProfileStat[];
  floating: FloatingBadge[];
  stats: ProfileStat[];
  featured: PlatformContentItem[];
  audience?: {
    locations: { label: string; pct: number }[];
    ages: { label: string; pct: number }[];
    genders: { label: string; pct: number }[];
  } | null;
  pastCollaborations: string[];
  pricing: { title: string; desc: string; amount: string; features: string[] }[];
  usingMock: boolean;
  profileUrl: string;
  snapshotAge: string | null;
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
  // Fields the RPC also returns, consumed by the media kit.
  collabTypes?: string[] | null;
  priceRange?: string | null;
  pricingMin?: number | null;
  pricingMax?: number | null;
  audienceDemographics?: Record<string, unknown> | null;
  pastCollaborations?: unknown[] | null;
  engagementRate?: number | null;
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
 * Decide whether to render mock analytics. Mock is OFF by default: real visitors
 * (and brands) must never see fabricated follower/engagement/past-brand numbers.
 * Opt in for local design work with NEXT_PUBLIC_PROFILE_MOCK=on, or per-request
 * with ?mock=1. Force it off with ?mock=0.
 */
export function resolveMockMode(searchParam?: string | string[]): boolean {
  const q = Array.isArray(searchParam) ? searchParam[0] : searchParam;
  if (q === '0' || q === 'off' || q === 'false') return false;
  if (q === '1' || q === 'on' || q === 'true') return true;
  return process.env.NEXT_PUBLIC_PROFILE_MOCK === 'on';
}

const cleanHandle = (h?: string | null) => (h ? h.replace(/^@/, '') : '');

/** One `{label,pct}` slice of an audience breakdown. */
export interface AudienceSlice {
  label: string;
  pct: number;
}

/**
 * Normalise a self-reported audience breakdown. Accepts `{"India": 72, ...}` or
 * `[{label|name, pct|value|percent}]`, returns slices sorted high→low (max 6).
 */
export function parseAudienceSlices(raw: unknown): AudienceSlice[] | null {
  if (!raw) return null;
  let entries: [string, number][] = [];
  if (Array.isArray(raw)) {
    entries = raw
      .map((r: any): [string, number] => [
        String(r?.label ?? r?.name ?? ''),
        Number(r?.pct ?? r?.value ?? r?.percent ?? NaN),
      ])
      .filter(([l, v]) => l && Number.isFinite(v));
  } else if (typeof raw === 'object') {
    entries = Object.entries(raw as Record<string, unknown>)
      .map(([k, v]): [string, number] => [k, Number(v)])
      .filter(([l, v]) => l && Number.isFinite(v));
  }
  if (entries.length === 0) return null;
  return entries
    .map(([label, pct]) => ({ label, pct: Math.max(0, Math.min(100, Math.round(pct))) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);
}

/** First present value among `keys` on `obj` (used for shape-tolerant demographics). */
export function pickKey(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return null;
  for (const k of keys) if (obj[k] != null) return obj[k];
  return null;
}

/** Map the raw audience_demographics jsonb into the three display breakdowns. */
export function parseAudience(demo: Record<string, unknown> | null | undefined): {
  locations: AudienceSlice[];
  ages: AudienceSlice[];
  genders: AudienceSlice[];
} | null {
  if (!demo) return null;
  const locations = parseAudienceSlices(pickKey(demo, ['locations', 'top_locations', 'topLocations', 'countries']));
  const ages = parseAudienceSlices(pickKey(demo, ['ages', 'age', 'age_range', 'ageRange']));
  const genders = parseAudienceSlices(pickKey(demo, ['genders', 'gender']));
  if (!locations && !ages && !genders) return null;
  return { locations: locations ?? [], ages: ages ?? [], genders: genders ?? [] };
}

/** Normalise self-reported past collaborations (strings or {brand|name} objects) to names. */
export function parseCollaborationNames(raw: unknown[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => (typeof c === 'string' ? c : (c?.brand ?? c?.name ?? '')))
    .map((s: string) => s.trim())
    .filter(Boolean);
}

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

// ── Real analytics — captured social snapshot (see lib/social-snapshot.ts) ─────

/** One recent post, already resolved for display (thumb is a durable public URL). */
export interface SnapshotPostView {
  /** Permanent instagram.com post link. */
  url: string;
  /** Cached thumbnail public URL (social-cache bucket), or null. */
  thumbUrl: string | null;
  views: number | null;
  likes: number | null;
  type: string;
  takenAt?: string | null;
}

/** Instagram analytics snapshot, mapped from a social_snapshots row by the page. */
export interface InstagramSnapshotView {
  followerCount: number | null;
  postsCount: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  isVerified: boolean;
  /** Cached profile pic public URL, or null. */
  profilePicUrl: string | null;
  posts: SnapshotPostView[];
  fetchedAt: string | null;
}

function relativeAge(iso: string | null): string {
  if (!iso) return 'recently';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'recently';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  audience: {
    locations: [
      { label: 'India', pct: 72 },
      { label: 'USA', pct: 11 },
      { label: 'UK', pct: 6 },
      { label: 'UAE', pct: 4 },
      { label: 'Others', pct: 7 },
    ],
    ages: [
      { label: '18-24', pct: 38 },
      { label: '25-34', pct: 41 },
      { label: '35-44', pct: 15 },
      { label: '45+', pct: 6 },
    ],
    genders: [
      { label: 'Male', pct: 82 },
      { label: 'Female', pct: 17 },
      { label: 'Others', pct: 1 },
    ]
  },
  pastCollaborations: ['mamaearth', 'Upstox', 'NordVPN', 'Skillshare', 'CoinDCX', 'UNACADEMY'],
  pricing: [
    {
      title: 'Instagram Post',
      desc: 'Single image post with caption featuring your brand.',
      amount: '$1,200',
      features: ['Permanent post', 'Brand tagging', 'Link in bio for 24h'],
    }
  ]
};

export function buildCreatorProfileView(
  profile: RawPublicProfile,
  opts: {
    useMock: boolean;
    instagram?: InstagramSnapshotView | null;
    origin?: string;
    /** Brand names from completed collaborations in-app; merged with self-reported. */
    autoCollaborations?: string[];
  },
): CreatorProfileView {
  const ig = opts.instagram ?? null;
  // A captured snapshot beats mock data: once real analytics exist, always show
  // them. Mock remains only the development placeholder for snapshot-less accounts.
  const useMock = opts.useMock && !ig;
  const { lead, accent } = splitSubtitle(profile);
  const username = cleanHandle(profile.username);

  const igFollowersReal = ig?.followerCount ?? profile.instagramFollowers ?? 0;
  const ytSubsReal = profile.youtubeSubscribers ?? 0;
  let reachReal = igFollowersReal + ytSubsReal + (profile.tiktokFollowers ?? 0);
  
  if (ig && ig.posts.length > 0) {
    // Attempt to calculate 30-day reach from scraped views
    const postsWithDates = ig.posts.filter(p => p.takenAt).sort((a, b) => Date.parse(b.takenAt!) - Date.parse(a.takenAt!));
    const totalViews = ig.posts.reduce((sum, p) => sum + (p.views || p.likes || 0), 0);
    if (postsWithDates.length >= 4) {
      // Drop the oldest 3 posts assuming they might be old pinned posts
      const recent = postsWithDates.slice(0, postsWithDates.length - 3);
      const recentViews = recent.reduce((sum, p) => sum + (p.views || p.likes || 0), 0);
      const newestDate = Date.parse(recent[0].takenAt!);
      const oldestDate = Date.parse(recent[recent.length - 1].takenAt!);
      const daysDiff = Math.max((newestDate - oldestDate) / (1000 * 60 * 60 * 24), 1);
      reachReal = Math.round((recentViews / daysDiff) * 30);
    } else if (postsWithDates.length >= 2) {
      const newestDate = Date.parse(postsWithDates[0].takenAt!);
      const oldestDate = Date.parse(postsWithDates[postsWithDates.length - 1].takenAt!);
      const daysDiff = Math.max((newestDate - oldestDate) / (1000 * 60 * 60 * 24), 1);
      reachReal = Math.round((totalViews / daysDiff) * 30);
    } else {
      reachReal = totalViews;
    }
  }

  // Hero stat chips
  const heroStats: ProfileStat[] = [
    { label: '30-Day Reach', value: useMock ? MOCK.reach : formatCount(reachReal) },
    {
      label: 'Followers',
      value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal),
    },
  ];
  if (ig?.engagementRate != null) {
    heroStats.push({ label: 'Engagement', value: `${ig.engagementRate}%` });
  } else if (useMock) {
    heroStats.push({ label: 'Engagement', value: MOCK.engagement });
  }

  // Hero stat chips (small pills under avatar)
  const heroChips: ProfileStat[] = [];
  if (igFollowersReal > 0 || useMock) heroChips.push({ label: 'Followers', value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal) });
  if (ytSubsReal > 0 || useMock) heroChips.push({ label: 'Subscribers', value: useMock ? MOCK.youtube.subscribers : formatCount(ytSubsReal) });
  if (ig?.postsCount || useMock) heroChips.push({ label: 'Posts', value: useMock ? MOCK.instagram.posts : formatCount(ig?.postsCount) });

  // Main stat cards
  const stats: ProfileStat[] = [
    { label: '30-Day Reach', value: useMock ? MOCK.reach : formatCount(reachReal) },
    { label: 'Followers', value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal) },
  ];
  if (ig?.engagementRate != null) {
    stats.push({ label: 'Engagement', value: `${ig.engagementRate}%` });
  } else if (useMock) {
    stats.push({ label: 'Engagement', value: MOCK.engagement });
  } else if (ig?.avgViews != null) {
    stats.push({ label: 'Avg Views', value: formatCount(ig.avgViews) });
  }

  // Featured Content (6 tiles max)
  const hasIg = useMock || !!ig || !!profile.instagramHandle || igFollowersReal > 0;
  const featured: PlatformContentItem[] = [];
  if (ig) {
    featured.push(...(ig.posts ?? [])
      .filter((p) => p.thumbUrl)
      .slice(0, 6)
      .map((p) => ({
        href: p.url,
        imageUrl: p.thumbUrl as string,
        views: formatCount(p.views ?? p.likes),
        isVideo: p.type === 'Video',
      }))
    );
  } else if (useMock) {
    featured.push(...MOCK.instagram.content.map(c => ({ ...c, isVideo: true, href: '#' })), ...MOCK.youtube.content.map(c => ({ ...c, isVideo: true, href: '#' })));
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
  const hasYt = useMock || !!profile.youtubeHandle || ytSubsReal > 0;
  if (hasYt) {
    floating.push({
      platform: 'youtube',
      value: useMock ? MOCK.youtube.subscribers : formatCount(ytSubsReal),
      label: 'YouTube',
    });
  }
  if (profile.isVerified) {
    floating.push({ platform: 'verified', value: 'Verified', label: 'by Influnet' });
  }

  // Real self-reported audience demographics take precedence over mock.
  const realAudience = parseAudience(profile.audienceDemographics);
  const audience = realAudience
    ? { locations: realAudience.locations, ages: realAudience.ages, genders: realAudience.genders }
    : useMock
      ? MOCK.audience
      : null;

  // Past collaborations: in-app completed collabs (trustworthy) merged with the
  // creator's self-reported list, de-duplicated case-insensitively.
  const selfReported = parseCollaborationNames(profile.pastCollaborations);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const name of [...(opts.autoCollaborations ?? []), ...selfReported]) {
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  const pastCollaborations = merged.length ? merged.slice(0, 24) : useMock ? MOCK.pastCollaborations : [];

  const origin = (opts.origin || 'https://influnet.app').replace(/\/$/, '');

  return {
    name: profile.name || (profile.username ? `@${profile.username}` : 'Creator'),
    username: cleanHandle(profile.username),
    avatarUrl: profile.avatarUrl ?? ig?.profilePicUrl ?? null,
    subtitleLead: lead,
    subtitleAccent: accent,
    tagline:
      (profile.bio || profile.headline || '').trim() ||
      'Creating content that helps brands reach and move real audiences.',
    location: profile.city ? [profile.city, profile.state].filter(Boolean).join(', ') : (profile.location ?? null),
    languages: (profile.languages ?? []).slice(0, 4),
    niches: (profile.niche ?? []).slice(0, 8),
    isVerified: !!profile.isVerified,
    heroStats,
    heroChips,
    floating,
    stats,
    featured: featured.slice(0, 6),
    audience,
    pastCollaborations,
    pricing: profile.pricingMin ? [{
      title: 'Instagram Post',
      desc: 'Single image post with caption featuring your brand.',
      amount: profile.priceRange || `$${profile.pricingMin.toLocaleString()}`,
      features: ['Permanent post', 'Brand tagging'],
    }] : (useMock ? MOCK.pricing : []),
    usingMock: useMock,
    profileUrl: `${origin}/c/${username}`,
    snapshotAge: relativeAge(ig?.fetchedAt ?? null),
  };
}
