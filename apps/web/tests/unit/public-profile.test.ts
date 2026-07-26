import { describe, it, expect } from 'vitest';
import {
  buildCreatorProfileView,
  extractContact,
  formatCount,
  resolveMockMode,
  titleCaseLabel,
  type RawPublicProfile,
} from '@/lib/public-profile/creator-profile';

const baseProfile: RawPublicProfile = {
  userId: 'u1',
  name: 'Aanya Rao',
  username: 'aanya.rao',
  avatarUrl: null,
  bio: 'Fashion stories.',
  city: 'Mumbai',
  state: 'MH',
  languages: ['English', 'Hindi'],
  niche: ['Fashion', 'Beauty'],
  isVerified: true,
  instagramFollowers: 248000,
  youtubeSubscribers: 92400,
  instagramHandle: '@aanya.rao',
  youtubeHandle: 'AanyaRao',
};

describe('formatCount', () => {
  it('formats thousands and millions compactly', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(920)).toBe('920');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(92400)).toBe('92K');
    expect(formatCount(1_200_000)).toBe('1.2M');
  });
  it('handles null/undefined', () => {
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
  });
});

describe('resolveMockMode', () => {
  it('defaults to mock off (no fabricated numbers for real visitors)', () => {
    const prev = process.env.NEXT_PUBLIC_PROFILE_MOCK;
    delete process.env.NEXT_PUBLIC_PROFILE_MOCK;
    expect(resolveMockMode(undefined)).toBe(false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_PROFILE_MOCK = prev;
  });
  it('respects explicit off/on query values', () => {
    expect(resolveMockMode('0')).toBe(false);
    expect(resolveMockMode('off')).toBe(false);
    expect(resolveMockMode('1')).toBe(true);
  });
});

describe('buildCreatorProfileView — mock mode', () => {
  const view = buildCreatorProfileView(baseProfile, { useMock: true });

  it('keeps the real identity but adds mock analytics', () => {
    expect(view.name).toBe('Aanya Rao');
    expect(view.username).toBe('aanya.rao');
    expect(view.location).toBe('Mumbai, MH');
    expect(view.usingMock).toBe(true);
    // engagement chip only exists in mock mode
    expect(view.heroStats.map((s) => s.label)).toContain('Engagement');
  });

  it('builds featured content from mock data', () => {
    expect(view.featured.length).toBeGreaterThan(0);
    // The mock data fills out 6 items max, and they should be marked isVideo with a '#' href
    expect(view.featured[0].href).toBe('#');
    expect(view.featured[0].isVideo).toBe(true);
  });

  it('derives a two-tone subtitle from niches', () => {
    expect(view.subtitleLead).toBe('Fashion & Beauty');
    expect(view.subtitleAccent).toBe('Content Creator');
  });
});

describe('buildCreatorProfileView — verified badge', () => {
  it('reports verified when the profile is verified', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: true });
    expect(view.isVerified).toBe(true);
  });

  it('reports unverified when the profile is not verified', () => {
    for (const useMock of [true, false]) {
      const view = buildCreatorProfileView({ ...baseProfile, isVerified: false }, { useMock });
      expect(view.isVerified).toBe(false);
    }
  });

  it('treats a missing isVerified field as unverified', () => {
    const { isVerified: _omit, ...rest } = baseProfile;
    const view = buildCreatorProfileView(rest, { useMock: true });
    expect(view.isVerified).toBe(false);
  });
});

describe('buildCreatorProfileView — platform column', () => {
  it('never repeats the same metric twice', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: true });
    const labels = view.platformCards.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('omits a platform the creator has no presence on', () => {
    const view = buildCreatorProfileView(
      { userId: 'u9', name: 'IG only', username: 'igonly', instagramFollowers: 5000 },
      { useMock: false },
    );
    expect(view.platformCards.some((c) => c.platform === 'youtube')).toBe(false);
    expect(view.platformCards.some((c) => c.platform === 'instagram')).toBe(true);
  });
});

describe('buildCreatorProfileView — real mode', () => {
  const view = buildCreatorProfileView(baseProfile, { useMock: false });

  it('uses real follower counts and no fake content', () => {
    expect(view.usingMock).toBe(false);
    expect(view.featured).toEqual([]);
    const followers = view.stats.find((s) => s.label === 'Followers');
    expect(followers?.value).toBe('248K');
    // no engagement chip without real data
    expect(view.stats.map((s) => s.label)).not.toContain('Engagement');
  });

  it('total reach sums real platform counts', () => {
    const reach = view.stats.find((s) => s.label === '30-Day Reach');
    expect(reach?.value).toBe('340K'); // 248000 + 92400 = 340400 -> 340K
  });

  it('omits a platform entirely when there is no handle or followers', () => {
    const minimal = buildCreatorProfileView(
      { userId: 'u2', name: 'Solo', username: 'solo', niche: ['Tech'] },
      { useMock: false },
    );
    expect(minimal.stats.find((s) => s.label === 'Followers')?.value).toBe('0');
  });
});

describe('buildCreatorProfileView — live Instagram snapshot', () => {
  const snapshot = {
    followerCount: 87_752_956,
    postsCount: 489,
    avgViews: 7_593_774,
    engagementRate: 3.3,
    isVerified: true,
    profilePicUrl: 'https://cdn.example/social-cache/ig/u1/profile.jpg',
    fetchedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    posts: [
      { url: 'https://www.instagram.com/p/AAA/', thumbUrl: 'https://cdn.example/a.jpg', views: null, likes: 5_795_006, type: 'Sidecar' },
      { url: 'https://www.instagram.com/p/BBB/', thumbUrl: 'https://cdn.example/b.jpg', views: 8_429_166, likes: 1_095_815, type: 'Video' },
      { url: 'https://www.instagram.com/p/CCC/', thumbUrl: null, views: 100, likes: 5, type: 'Video' },
      { url: 'https://www.instagram.com/p/DDD/', thumbUrl: 'https://cdn.example/d.jpg', views: null, likes: 719_888, type: 'Sidecar' },
    ],
  };

  it('overrides mock mode entirely when a snapshot exists', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: true, instagram: snapshot });
    expect(view.usingMock).toBe(false);
    expect(view.platformCards.find((s) => s.label === 'Instagram followers')?.value).toBe('87.8M');
    expect(view.platformCards.find((s) => s.label === 'Posts published')?.value).toBe('489');
    expect(view.snapshotAge).toMatch(/^2h ago$/);
  });

  it('links real thumbnails to the original posts, skipping thumb-less ones', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false, instagram: snapshot });
    expect(view.featured.length).toBe(3);
    expect(view.featured.map((c) => c.href)).toEqual([
      'https://www.instagram.com/p/AAA/',
      'https://www.instagram.com/p/BBB/',
      'https://www.instagram.com/p/DDD/', // CCC has no cached thumb
    ]);
    // views label prefers video views, falls back to likes
    expect(view.featured[0].views).toBe('5.8M');
    expect(view.featured[1].views).toBe('8.4M');
  });

  it('shows the real engagement chip and snapshot-driven reach', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false, instagram: snapshot });
    expect(view.stats.find((s) => s.label === 'Engagement')?.value).toBe('3.3%');
    // reach = sum of views/likes in recent posts when no dates are available = 14.9M
    expect(view.stats.find((s) => s.label === '30-Day Reach')?.value).toBe('14.9M');
  });

  it('falls back to the cached profile pic when no avatar is set', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false, instagram: snapshot });
    expect(view.avatarUrl).toBe('https://cdn.example/social-cache/ig/u1/profile.jpg');
    const withAvatar = buildCreatorProfileView(
      { ...baseProfile, avatarUrl: 'https://example.com/me.jpg' },
      { useMock: false, instagram: snapshot },
    );
    expect(withAvatar.avatarUrl).toBe('https://example.com/me.jpg');
  });
});

describe('extractContact', () => {
  // The real bio that motivated this: a sentence with the only actionable
  // details buried inside it.
  const realBio =
    'The official page of A2D channel This Page is handled by Admin For Sponsorships: collab@a2dmediagroup.com NukePC - @nukepc.in / 9025380083';

  it('pulls the email and phone out of a real bio', () => {
    const { contact } = extractContact(realBio);
    expect(contact).toEqual([
      { kind: 'email', value: 'collab@a2dmediagroup.com', href: 'mailto:collab@a2dmediagroup.com' },
      { kind: 'phone', value: '9025380083', href: 'tel:+919025380083' },
    ]);
  });

  it('leaves the bio readable, with no leftover contact text', () => {
    const { rest } = extractContact(realBio);
    expect(rest).not.toContain('collab@a2dmediagroup.com');
    expect(rest).not.toContain('9025380083');
    expect(rest).toContain('The official page of A2D channel');
    // No doubled spaces or dangling separators where the removals happened.
    expect(rest).not.toMatch(/\s{2,}/);
    expect(rest).not.toMatch(/[:;,\-/|]\s*$/);
  });

  it('does not mistake a social handle for an email address', () => {
    const { contact } = extractContact('Reach me @nukepc.in on Instagram');
    expect(contact).toEqual([]);
  });

  it('does not mistake a long number for a phone number', () => {
    const { contact } = extractContact('Order id 90253800835512 shipped');
    expect(contact.filter((c) => c.kind === 'phone')).toEqual([]);
  });

  it('normalises a +91-prefixed number with separators to a tel: href', () => {
    const { contact } = extractContact('Call +91 90253-80083');
    expect(contact[0].href).toBe('tel:+919025380083');
  });

  it('keeps each contact once even when repeated', () => {
    const { contact } = extractContact('a@b.com and again a@b.com');
    expect(contact).toHaveLength(1);
  });

  it('returns an empty list and the untouched bio when there is nothing to find', () => {
    const { contact, rest } = extractContact('Just a creator who makes things.');
    expect(contact).toEqual([]);
    expect(rest).toBe('Just a creator who makes things.');
  });
});

describe('titleCaseLabel', () => {
  it('fixes creator-typed casing without touching what is already right', () => {
    expect(titleCaseLabel('india')).toBe('India');
    expect(titleCaseLabel('united states')).toBe('United States');
    expect(titleCaseLabel('Sri Lanka')).toBe('Sri Lanka');
    expect(titleCaseLabel('18-25')).toBe('18-25');
  });
});

describe('buildCreatorProfileView — contact and rate', () => {
  it('surfaces bio contact details as tappable rows', () => {
    const view = buildCreatorProfileView(
      { ...baseProfile, bio: 'Sponsorships: hi@brand.com / 9876543210' },
      { useMock: false },
    );
    expect(view.contact.map((c) => c.kind)).toEqual(['email', 'phone']);
    expect(view.tagline).not.toContain('hi@brand.com');
  });

  it('renders a price tier slug as the range it means, never the raw slug', () => {
    const view = buildCreatorProfileView(
      { ...baseProfile, priceRange: 'pro' },
      { useMock: false },
    );
    expect(view.priceLabel).toBe('₹25K+');
  });

  it('has no rate at all when the creator never set one', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false });
    expect(view.priceLabel).toBeNull();
  });
});
