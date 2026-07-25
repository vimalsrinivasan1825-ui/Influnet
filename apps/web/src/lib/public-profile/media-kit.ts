// View model for the creator media kit (/c/[username]/media-kit) — the
// brand-facing one-pager (design: docs/product/mockups/creator-media-kit.html).
//
// Data policy: REAL data only, no mock numbers. Sections without data are
// omitted (`null`) and the page simply doesn't render them:
//   - identity/stats/featured posts  → scraped snapshot (social_snapshots)
//   - location/languages/niches/packages → creator's own profile (signup)
//   - audience insights / past collaborations → self-reported profile fields
//   - testimonials → real platform reviews

import {
  formatCount,
  type InstagramSnapshotView,
  type RawPublicProfile,
} from './creator-profile';
import { publicOrigin } from '@/lib/site';

export interface MediaKitStat {
  label: string;
  value: string;
}

export interface MediaKitPost {
  href: string;
  thumbUrl: string;
  label: string; // formatted views (videos) or likes
  isVideo: boolean;
}

export interface AudienceSlice {
  label: string;
  pct: number;
}

export interface MediaKitPackage {
  platform: 'instagram' | 'youtube' | 'other';
  title: string;
  description: string;
  priceLabel: string;
  perks: string[];
  featured: boolean;
}

export interface MediaKitReview {
  rating: number;
  comment: string;
}

export interface MediaKitView {
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean;
  subtitleLead: string;
  subtitleAccent: string;
  tagline: string;
  /** Floating chips next to the avatar: IG followers, YT subs, posts. */
  heroChips: MediaKitStat[];
  /** Reach / followers / engagement stat cards. */
  stats: MediaKitStat[];
  /** Up to 6 real recent posts with cached thumbnails. Empty → section hidden. */
  featured: MediaKitPost[];
  /** Self-reported audience insights; null → section hidden. */
  audience: {
    locations: AudienceSlice[] | null;
    age: AudienceSlice[] | null;
    gender: AudienceSlice[] | null;
  } | null;
  /** Self-reported brand names; null → section hidden. */
  pastCollaborations: string[] | null;
  /** Derived from the creator's collab types + pricing; null → section hidden. */
  packages: MediaKitPackage[] | null;
  /** Real reviews; null → section hidden. */
  reviews: MediaKitReview[] | null;
  location: string | null;
  languages: string[];
  niches: string[];
  /** e.g. "18-34 yrs" from self-reported age data. */
  topAudience: string | null;
  profileUrl: string;
  snapshotAge: string | null;
}

// ── audience demographics (self-reported jsonb, shape-tolerant) ───────────────

/** Accepts {"India": 72, ...} or [{label|name, pct|value|percent}], returns sorted slices. */
function parseSlices(raw: unknown): AudienceSlice[] | null {
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

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return null;
  for (const k of keys) if (obj[k] != null) return obj[k];
  return null;
}

// ── pricing packages ───────────────────────────────────────────────────────────

const PRICE_RANGE_LABEL: Record<string, string> = {
  entry: '₹1K – ₹5K',
  standard: '₹5K – ₹10K',
  premium: '₹10K – ₹25K',
  pro: '₹25K+',
};

const PACKAGE_COPY: Record<string, Omit<MediaKitPackage, 'priceLabel' | 'featured'>> = {
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
  const range = (profile.priceRange ?? '').toLowerCase();
  return PRICE_RANGE_LABEL[range] ?? 'Ask for pricing';
}

function buildPackages(profile: RawPublicProfile): MediaKitPackage[] | null {
  const types = (profile.collabTypes ?? []).filter((t) => PACKAGE_COPY[t]);
  if (types.length === 0) return null;
  const priceLabel = priceLabelOf(profile);
  // Feature the middle card (matches the mockup's emphasized column).
  const featuredIdx = types.length >= 3 ? 1 : types.length - 1;
  return types.slice(0, 3).map((t, i) => ({
    ...PACKAGE_COPY[t],
    priceLabel,
    featured: i === featuredIdx,
  }));
}

// ── misc helpers ───────────────────────────────────────────────────────────────

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const cleanHandle = (h?: string | null) => (h ? h.replace(/^@/, '') : '');

function subtitleOf(profile: RawPublicProfile): { lead: string; accent: string } {
  const niches = profile.niche ?? [];
  if (niches.length > 0) return { lead: niches.slice(0, 2).join(' & '), accent: 'Content Creator' };
  return { lead: 'Content', accent: 'Creator' };
}

/** "18-34 yrs" from the top self-reported age slices (or null). */
function topAudienceOf(age: AudienceSlice[] | null): string | null {
  if (!age || age.length === 0) return null;
  return `${age[0].label} yrs`;
}

// ── builder ────────────────────────────────────────────────────────────────────

export function buildMediaKitView(
  profile: RawPublicProfile,
  instagram: InstagramSnapshotView | null,
  reviews: MediaKitReview[],
  opts: { origin?: string } = {},
): MediaKitView {
  const { lead, accent } = subtitleOf(profile);
  const username = cleanHandle(profile.username);

  const igFollowers = instagram?.followerCount ?? profile.instagramFollowers ?? 0;
  const ytSubs = profile.youtubeSubscribers ?? 0;
  const reach = igFollowers + ytSubs + (profile.tiktokFollowers ?? 0);

  const heroChips: MediaKitStat[] = [];
  if (igFollowers > 0) heroChips.push({ label: 'Followers', value: formatCount(igFollowers) });
  if (ytSubs > 0) heroChips.push({ label: 'Subscribers', value: formatCount(ytSubs) });
  if (instagram?.postsCount) heroChips.push({ label: 'Posts', value: formatCount(instagram.postsCount) });

  const stats: MediaKitStat[] = [
    { label: 'Total Reach', value: formatCount(reach) },
    { label: 'Followers', value: formatCount(igFollowers) },
  ];
  if (instagram?.engagementRate != null) {
    stats.push({ label: 'Engagement', value: `${instagram.engagementRate}%` });
  } else if (instagram?.avgViews != null) {
    stats.push({ label: 'Avg Views', value: formatCount(instagram.avgViews) });
  }

  const featured: MediaKitPost[] = (instagram?.posts ?? [])
    .filter((p) => p.thumbUrl)
    .slice(0, 6)
    .map((p) => ({
      href: p.url,
      thumbUrl: p.thumbUrl as string,
      label: formatCount(p.views ?? p.likes),
      isVideo: p.type === 'Video',
    }));

  const demo = (profile.audienceDemographics ?? null) as Record<string, unknown> | null;
  const locations = parseSlices(pick(demo, ['locations', 'top_locations', 'topLocations', 'countries']));
  const age = parseSlices(pick(demo, ['age', 'age_range', 'ageRange', 'ages']));
  const gender = parseSlices(pick(demo, ['gender', 'genders']));
  const audience = locations || age || gender ? { locations, age, gender } : null;

  const pastCollaborations = (() => {
    const raw = profile.pastCollaborations ?? [];
    const names = raw
      .map((c: any) => (typeof c === 'string' ? c : (c?.brand ?? c?.name ?? '')))
      .map((s: string) => s.trim())
      .filter(Boolean);
    return names.length ? names.slice(0, 8) : null;
  })();

  return {
    name: profile.name || (username ? `@${username}` : 'Creator'),
    username,
    avatarUrl: profile.avatarUrl ?? instagram?.profilePicUrl ?? null,
    isVerified: !!profile.isVerified,
    subtitleLead: lead,
    subtitleAccent: accent,
    tagline:
      (profile.bio || profile.headline || '').trim() ||
      'Creating content that helps brands reach and move real audiences.',
    heroChips,
    stats,
    featured,
    audience,
    pastCollaborations,
    packages: buildPackages(profile),
    reviews: reviews.length ? reviews.slice(0, 5) : null,
    location: profile.city ? [profile.city, profile.state].filter(Boolean).join(', ') : (profile.location ?? null),
    languages: (profile.languages ?? []).slice(0, 4),
    niches: (profile.niche ?? []).slice(0, 8),
    topAudience: topAudienceOf(age),
    profileUrl: `${opts.origin ?? publicOrigin()}/c/${username}`,
    snapshotAge: relativeAge(instagram?.fetchedAt ?? null),
  };
}
