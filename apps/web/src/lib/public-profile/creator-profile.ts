// View model + mock-data layer for the creator public profile (/c/[username]).
//
// Today the platform analytics (posts, avg views, popular content) aren't in the
// database yet — they arrive once account-connect + scraping ship. So this module
// assembles a view from the creator's REAL identity fields and fills the
// not-yet-available analytics with mock data, controlled by a flag. Flip the flag
// off (or pass ?mock=0) once real `social_connections` data is wired in.

import { PRICE_TIERS } from '@influnet/core';
import { publicOrigin } from '@/lib/site';
import type { PublicPortfolioItem } from './get-portfolio';

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

/** One YouTube upload, ready for display. */
export interface YouTubeVideoItem {
  url: string;
  title: string;
  thumbUrl: string | null;
  /** Formatted view count, e.g. "210K"; null when YouTube didn't report one. */
  views: string | null;
  publishedAt: string | null;
}

/** A rating left by a brand on a completed project (migration 080). */
export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
  createdAt: string | null;
}

export interface ReviewSummary {
  count: number;
  /** Mean rating to one decimal, or null when there are no reviews. */
  average: number | null;
  items: ReviewItem[];
}

/**
 * A way to reach the creator, lifted out of the free-text bio.
 *
 * The RPC deliberately does NOT expose `profiles.email` / `phone` — those are
 * private columns and publishing them for every creator would leak PII from
 * people who never agreed to it. What a creator typed into their own public bio
 * is already public by their choice, so the profile promotes it to a labelled
 * row instead of leaving it buried mid-paragraph.
 */
export interface ContactMethod {
  kind: 'email' | 'phone';
  value: string;
  href: string;
}

/** One metric in the platform column beside the avatar. */
export interface PlatformCard {
  platform: 'instagram' | 'youtube';
  label: string;
  value: string;
}

/** A real recent post, shown as the "what a collaboration looks like" sample. */
export interface PostPreview {
  imageUrl: string;
  href: string;
  /** Formatted likes, e.g. "10.2K"; null when the snapshot didn't report any. */
  likes: string | null;
}

export interface ProfilePackage {
  platform: 'instagram' | 'youtube' | 'other';
  title: string;
  description: string;
  perks: string[];
  priceLabel: string;
  featured?: boolean;
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
  /** Email/phone the creator published in their bio, as tappable rows. */
  contact: ContactMethod[];
  location: string | null;
  languages: string[];
  niches: string[];
  isVerified: boolean;
  heroStats: ProfileStat[];
  /** Per-platform metrics, deduplicated, for the column beside the avatar. */
  platformCards: PlatformCard[];
  stats: ProfileStat[];
  featured: PlatformContentItem[];
  audience?: {
    locations: { label: string; pct: number }[];
    ages: { label: string; pct: number }[];
    genders: { label: string; pct: number }[];
    /** Topic affinities. Empty unless the creator has filled them in. */
    interests: { label: string; pct: number }[];
  } | null;
  pastCollaborations: string[];
  /**
   * Past work as cards, replacing the bare brand-name chips above. Carries its
   * own `verified` flag per item: platform-completed projects are vouched for,
   * self-added entries are not, and the UI must keep the two distinguishable.
   */
  portfolio: PublicPortfolioItem[];
  /** The formats this creator takes on, from `collab_types`. */
  collabTypes: string[];
  /** Human-readable rate, e.g. "₹25K+". Null when the creator hasn't set one. */
  priceLabel: string | null;
  /** Sample of the creator's actual work for the collaborate section. */
  postPreview: PostPreview | null;
  /** Recent uploads from the captured YouTube snapshot; null when unconnected. */
  videos: YouTubeVideoItem[];
  /** Ratings from completed in-app projects; null when there are none. */
  reviews: ReviewSummary | null;
  usingMock: boolean;
  profileUrl: string;
  snapshotAge: string | null;
  instagramHandle?: string | null;
  youtubeHandle?: string | null;
  packages: ProfilePackage[];
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

/**
 * Tidy a creator-typed slice label for display: "india" → "India".
 *
 * These are hand-entered, so casing is whatever the creator happened to type.
 * Left-alone they render as "india 30%" next to "Male 68%", which reads as a
 * rendering bug rather than as the creator's own text.
 */
export function titleCaseLabel(label: string): string {
  return label
    .split(/(\s+|-)/)
    .map((part) =>
      /^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join('');
}

/** Map the raw audience_demographics jsonb into the display breakdowns. */
export function parseAudience(demo: Record<string, unknown> | null | undefined): {
  locations: AudienceSlice[];
  ages: AudienceSlice[];
  genders: AudienceSlice[];
  interests: AudienceSlice[];
} | null {
  if (!demo) return null;
  const tidy = (slices: AudienceSlice[] | null) =>
    (slices ?? []).map((s) => ({ ...s, label: titleCaseLabel(s.label) }));

  const locations = parseAudienceSlices(pickKey(demo, ['locations', 'top_locations', 'topLocations', 'countries']));
  const ages = parseAudienceSlices(pickKey(demo, ['ages', 'age', 'age_range', 'ageRange']));
  const genders = parseAudienceSlices(pickKey(demo, ['genders', 'gender']));
  // Topic affinity. No creator has filled this in yet — the signup flow doesn't
  // collect it — so the panel stays hidden rather than inventing percentages.
  const interests = parseAudienceSlices(
    pickKey(demo, ['interests', 'interest', 'topics', 'audience_interests', 'audienceInterests']),
  );
  if (!locations && !ages && !genders && !interests) return null;
  return {
    locations: tidy(locations),
    ages: tidy(ages),
    genders: tidy(genders),
    interests: tidy(interests),
  };
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]*[a-zA-Z]/g;
// Indian mobile numbers: 10 digits starting 6-9, optionally +91-prefixed, and
// tolerant of the spaces/hyphens people type. Bounded by non-digits so a long
// id or a follower count can never be mistaken for a phone number.
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

/**
 * Pull contact details out of the bio, and return the bio without them.
 *
 * Creators paste "Sponsorships: name@brand.com / 9025380083" into the one free
 * text field they have, so the page rendered a wall of prose with the single
 * most actionable thing in it buried mid-sentence. Extracting them lets the
 * profile show a mailto: and a tel: row a brand can actually tap, and keeps the
 * bio to the sentence it was meant to be.
 */
export function extractContact(bio: string): { contact: ContactMethod[]; rest: string } {
  const contact: ContactMethod[] = [];
  const seen = new Set<string>();
  let rest = bio;

  for (const match of bio.match(EMAIL_RE) ?? []) {
    const value = match.trim();
    if (seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    contact.push({ kind: 'email', value, href: `mailto:${value}` });
    rest = rest.replace(match, ' ');
  }

  for (const match of rest.match(PHONE_RE) ?? []) {
    const value = match.trim();
    const digits = value.replace(/\D/g, '');
    if (seen.has(digits)) continue;
    seen.add(digits);
    contact.push({ kind: 'phone', value, href: `tel:+${digits.length === 10 ? `91${digits}` : digits}` });
    rest = rest.replace(match, ' ');
  }

  // Tidy what the removals left behind: orphaned separators, doubled spaces,
  // and a trailing label like "For Sponsorships:" with nothing after it.
  rest = rest
    .replace(/\s*[/|,·-]\s*(?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/[\s:;,\-/|]+$/, '')
    .trim();

  return { contact, rest };
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

/** Snapshot of a creator's YouTube channel, as read by get-youtube-snapshot.ts. */
export interface YouTubeSnapshotInput {
  subscriberCount: number | null;
  avgViews: number | null;
  videos: { url: string; title: string; thumbUrl: string | null; views: number | null; publishedAt: string | null }[];
  fetchedAt: string | null;
}

const DAY_MS = 86_400_000;
/** Below this many days of captured content, a monthly run-rate is noise. */
const MIN_DAYS_TO_EXTRAPOLATE = 5;

/**
 * The headline reach figure, across every connected platform.
 *
 * This used to sum Instagram LIKES (falling back to them whenever views were
 * missing, which is always — see postViews in apify-instagram.ts), drop the
 * three oldest posts on the guess that they might be pinned, and scale the rest
 * to 30 days. It reported 886K for a creator whose actual monthly views run to
 * several million, and the number it reported wasn't views at all.
 *
 * Now: real view counts only, from posts and videos published inside the
 * window. When no platform reports views we say so by relabelling the stat —
 * audience size is a fact worth showing, but it is not reach, and captioning it
 * as reach is the thing brands would have priced against.
 */
export function computeReachStat(
  posts: { views: number | null; takenAt?: string | null }[],
  videos: { views: number | null; publishedAt: string | null }[],
  audienceSize: number,
): ProfileStat {
  const now = Date.now();
  const cutoff = now - 30 * DAY_MS;
  let total = 0;
  let oldest = Infinity;

  const consider = (views: number | null, when: string | null | undefined) => {
    if (typeof views !== 'number' || views <= 0) return;
    const t = when ? Date.parse(when) : NaN;
    if (!Number.isFinite(t) || t < cutoff || t > now) return;
    total += views;
    oldest = Math.min(oldest, t);
  };
  for (const p of posts) consider(p.views, p.takenAt);
  for (const v of videos) consider(v.views, v.publishedAt);

  if (total === 0) return { label: 'Total Audience', value: formatCount(audienceSize) };

  // Both feeds carry a fixed number of recent items, so a creator who posts
  // daily gives us a window far shorter than a month; scaling to 30 days is
  // what makes two creators comparable. The cutoff above caps daysCovered at
  // 30, so this only ever scales up — and only from a sample wide enough to
  // mean anything, since one big day times thirty is a fantasy, not a forecast.
  const daysCovered = Math.max((now - oldest) / DAY_MS, 1);
  const value =
    daysCovered >= MIN_DAYS_TO_EXTRAPOLATE ? Math.round((total / daysCovered) * 30) : total;

  return { label: '30-Day Reach', value: formatCount(value) };
}

export function buildCreatorProfileView(
  profile: RawPublicProfile,
  opts: {
    useMock: boolean;
    instagram?: InstagramSnapshotView | null;
    youtube?: YouTubeSnapshotInput | null;
    reviews?: ReviewSummary | null;
    origin?: string;
    /** Brand names from completed collaborations in-app; merged with self-reported. */
    autoCollaborations?: string[];
    /** Portfolio cards from get_creator_portfolio (migration 087). */
    portfolio?: PublicPortfolioItem[];
  },
): CreatorProfileView {
  const ig = opts.instagram ?? null;
  const yt = opts.youtube ?? null;
  // A captured snapshot beats mock data: once real analytics exist, always show
  // them. Mock remains only the development placeholder for snapshot-less accounts.
  const useMock = opts.useMock && !ig && !yt;
  const { lead, accent } = splitSubtitle(profile);
  const username = cleanHandle(profile.username);

  const igFollowersReal = ig?.followerCount ?? profile.instagramFollowers ?? 0;
  // A captured channel beats the self-reported number — the creator types the
  // latter and it goes stale the day after they type it.
  const ytSubsReal = yt?.subscriberCount ?? profile.youtubeSubscribers ?? 0;
  const audienceSize = igFollowersReal + ytSubsReal + (profile.tiktokFollowers ?? 0);
  const reachStat = computeReachStat(ig?.posts ?? [], yt?.videos ?? [], audienceSize);

  // Hero stat chips
  const heroStats: ProfileStat[] = [
    useMock ? { label: '30-Day Reach', value: MOCK.reach } : reachStat,
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

  /**
   * The platform column beside the avatar.
   *
   * Every entry is a DISTINCT metric. The previous hero showed follower counts
   * twice — once as a chip and again as a floating badge labelled "Instagram" —
   * so the same 635K appeared twice in the same eyeline, which reads as broken
   * rather than emphatic.
   */
  const platformCards: PlatformCard[] = [];
  if (igFollowersReal > 0 || useMock) {
    platformCards.push({
      platform: 'instagram',
      label: 'Instagram followers',
      value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal),
    });
  }
  if (ytSubsReal > 0 || useMock) {
    platformCards.push({
      platform: 'youtube',
      label: 'YouTube subscribers',
      value: useMock ? MOCK.youtube.subscribers : formatCount(ytSubsReal),
    });
  }
  if (ig?.postsCount || useMock) {
    platformCards.push({
      platform: 'instagram',
      label: 'Posts published',
      value: useMock ? MOCK.instagram.posts : formatCount(ig?.postsCount),
    });
  }
  if (ig?.avgViews != null) {
    platformCards.push({
      platform: 'instagram',
      label: 'Avg views per post',
      value: formatCount(ig.avgViews),
    });
  } else if (yt?.avgViews != null) {
    platformCards.push({
      platform: 'youtube',
      label: 'Avg views per video',
      value: formatCount(yt.avgViews),
    });
  }

  // Main stat cards
  const stats: ProfileStat[] = [
    useMock ? { label: '30-Day Reach', value: MOCK.reach } : reachStat,
    { label: 'Followers', value: useMock ? MOCK.instagram.followers : formatCount(igFollowersReal) },
  ];
  if (ig?.engagementRate != null) {
    stats.push({ label: 'Engagement', value: `${ig.engagementRate}%` });
  } else if (useMock) {
    stats.push({ label: 'Engagement', value: MOCK.engagement });
  } else if (ig?.avgViews != null) {
    stats.push({ label: 'Avg Views', value: formatCount(ig.avgViews) });
  } else if (yt?.avgViews != null) {
    // Instagram rarely reports usable view counts; YouTube's feed always does.
    stats.push({ label: 'Avg Views', value: formatCount(yt.avgViews) });
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

  // Real self-reported audience demographics take precedence over mock.
  const realAudience = parseAudience(profile.audienceDemographics);
  const audience = realAudience
    ? realAudience
    : useMock
      ? { ...MOCK.audience, interests: [] }
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

  const origin = (opts.origin || publicOrigin()).replace(/\/$/, '');

  // Contact details the creator published in their own bio, promoted out of the
  // paragraph. `rest` is the bio with them removed, so nothing appears twice.
  const { contact, rest: bioWithoutContact } = extractContact(
    (profile.bio || profile.headline || '').trim(),
  );

  // The rate the creator picked at signup is stored as a TIER SLUG ('pro'), not
  // a number — rendering it raw printed the literal word "pro" where a price
  // belonged. PRICE_TIERS is the only thing that knows what a slug is worth.
  const priceLabel =
    PRICE_TIERS.find((t) => t.value === profile.priceRange)?.range ??
    (profile.pricingMin ? `₹${formatCount(profile.pricingMin)}+` : null);

  // One real post as a sample of the work. Pulled from the same snapshot the
  // Featured strip uses, so it is genuinely this creator's most recent content.
  const previewSource = (ig?.posts ?? []).find((p) => p.thumbUrl);
  const postPreview: PostPreview | null = previewSource
    ? {
        imageUrl: previewSource.thumbUrl as string,
        href: previewSource.url,
        likes: previewSource.likes != null ? formatCount(previewSource.likes) : null,
      }
    : null;

  return {
    name: profile.name || (profile.username ? `@${profile.username}` : 'Creator'),
    username: cleanHandle(profile.username),
    avatarUrl: profile.avatarUrl ?? ig?.profilePicUrl ?? null,
    subtitleLead: lead,
    subtitleAccent: accent,
    tagline:
      bioWithoutContact ||
      'Creating content that helps brands reach and move real audiences.',
    contact,
    location: profile.city ? [profile.city, profile.state].filter(Boolean).join(', ') : (profile.location ?? null),
    languages: (profile.languages ?? []).slice(0, 4),
    niches: (profile.niche ?? []).slice(0, 8),
    isVerified: !!profile.isVerified,
    heroStats,
    platformCards: platformCards.slice(0, 4),
    collabTypes: (profile.collabTypes ?? []).slice(0, 6),
    priceLabel,
    postPreview,
    stats,
    featured: featured.slice(0, 6),
    audience,
    pastCollaborations,
    // Never mocked: an invented portfolio would put fake work on a real
    // creator's page, and every card here is a claim about a specific post.
    portfolio: opts.portfolio ?? [],
    // Videos are their own section rather than merged into `featured`: a
    // YouTube upload has a title worth reading, an Instagram tile doesn't.
    videos: (yt?.videos ?? [])
      .filter((v) => v.thumbUrl)
      .slice(0, 6)
      .map((v) => ({
        url: v.url,
        title: v.title,
        thumbUrl: v.thumbUrl,
        views: v.views != null ? formatCount(v.views) : null,
        publishedAt: v.publishedAt,
      })),
    // Never synthesised: a fabricated rating is the one number on this page a
    // brand would make a spending decision on.
    reviews: opts.reviews && opts.reviews.count > 0 ? opts.reviews : null,
    usingMock: useMock,
    profileUrl: `${origin}/c/${username}`,
    snapshotAge: relativeAge(ig?.fetchedAt ?? null),
    instagramHandle: cleanHandle(profile.instagramHandle ?? null),
    youtubeHandle: cleanHandle(profile.youtubeHandle ?? (yt as any)?.handle ?? null),
    packages: buildProfilePackages(profile),
  };
}

const PACKAGE_COPY: Record<string, Omit<ProfilePackage, 'priceLabel' | 'featured'>> = {
  Post: {
    platform: 'instagram',
    title: 'Instagram Post',
    description: 'Single image post with caption featuring your brand.',
    perks: ['1 feed post', 'Caption + tags', 'Story mention'],
  },
  Reel: {
    platform: 'instagram',
    title: 'Instagram Reel',
    description: 'Engaging reel to showcase your product or service.',
    perks: ['1 reel (15–60s)', 'Caption + tags', '2 story mentions'],
  },
  Story: {
    platform: 'instagram',
    title: 'Instagram Story',
    description: 'Story feature with link sticker and brand mention.',
    perks: ['2 story frames', 'Link sticker', 'Brand tag'],
  },
  'YouTube Video': {
    platform: 'youtube',
    title: 'YouTube Video',
    description: 'Dedicated video review or integration.',
    perks: ['1 YouTube video', 'Description + links', 'Community post'],
  },
  'Event Appearance': {
    platform: 'other',
    title: 'Event Appearance',
    description: 'In-person appearance, launch, or meet-and-greet.',
    perks: ['On-site appearance', 'Social coverage', 'Audience meet & greet'],
  },
};

function priceLabelOf(profile: RawPublicProfile): string {
  const min = profile.pricingMin;
  const max = profile.pricingMax;
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (min != null && max != null) return `${inr(min)} – ${inr(max)}`;
  if (min != null) return `${inr(min)}+`;
  const PRICE_RANGE_LABEL: Record<string, string> = {
    entry: '₹1K – ₹5K',
    standard: '₹5K – ₹10K',
    premium: '₹10K – ₹25K',
    pro: '₹25K+',
  };
  const range = (profile.priceRange ?? '').toLowerCase();
  return PRICE_RANGE_LABEL[range] ?? '₹25,000+';
}

function buildProfilePackages(profile: RawPublicProfile): ProfilePackage[] {
  let types = (profile.collabTypes ?? []).filter((t) => PACKAGE_COPY[t]);
  if (types.length === 0) {
    types = ['YouTube Video', 'Event Appearance', 'Post'];
  }
  const priceLabel = priceLabelOf(profile);
  const featuredIdx = types.length >= 3 ? 1 : types.length - 1;
  return types.slice(0, 3).map((t, i) => ({
    ...PACKAGE_COPY[t],
    priceLabel,
    featured: i === featuredIdx,
  }));
}
