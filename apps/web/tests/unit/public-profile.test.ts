import { describe, it, expect } from 'vitest';
import {
  buildCreatorProfileView,
  formatCount,
  resolveMockMode,
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
  it('defaults to mock on', () => {
    expect(resolveMockMode(undefined)).toBe(true);
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

  it('builds Instagram and YouTube cards with content thumbnails', () => {
    const ig = view.platforms.find((p) => p.platform === 'instagram');
    const yt = view.platforms.find((p) => p.platform === 'youtube');
    expect(ig?.content.length).toBe(3);
    expect(yt?.content.length).toBe(3);
    expect(ig?.connected).toBe(true);
  });

  it('derives a two-tone subtitle from niches', () => {
    expect(view.subtitleLead).toBe('Fashion & Beauty');
    expect(view.subtitleAccent).toBe('Content Creator');
  });
});

describe('buildCreatorProfileView — verified badge', () => {
  it('includes the verified orbit badge when the profile is verified', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: true });
    expect(view.isVerified).toBe(true);
    expect(view.floating.some((f) => f.platform === 'verified')).toBe(true);
  });

  it('omits the verified orbit badge when the profile is not verified', () => {
    for (const useMock of [true, false]) {
      const view = buildCreatorProfileView({ ...baseProfile, isVerified: false }, { useMock });
      expect(view.isVerified).toBe(false);
      expect(view.floating.some((f) => f.platform === 'verified')).toBe(false);
    }
  });

  it('treats a missing isVerified field as unverified', () => {
    const { isVerified: _omit, ...rest } = baseProfile;
    const view = buildCreatorProfileView(rest, { useMock: true });
    expect(view.floating.some((f) => f.platform === 'verified')).toBe(false);
  });
});

describe('buildCreatorProfileView — real mode', () => {
  const view = buildCreatorProfileView(baseProfile, { useMock: false });

  it('uses real follower counts and no fake content', () => {
    expect(view.usingMock).toBe(false);
    const ig = view.platforms.find((p) => p.platform === 'instagram');
    expect(ig?.content).toEqual([]);
    const followers = ig?.stats.find((s) => s.label === 'Followers');
    expect(followers?.value).toBe('248K');
    // no engagement chip without real data
    expect(view.heroStats.map((s) => s.label)).not.toContain('Engagement');
  });

  it('total reach sums real platform counts', () => {
    const reach = view.heroStats.find((s) => s.label === 'Total reach');
    expect(reach?.value).toBe('340K'); // 248000 + 92400 = 340400 -> 340K
  });

  it('omits a platform entirely when there is no handle or followers', () => {
    const minimal = buildCreatorProfileView(
      { userId: 'u2', name: 'Solo', username: 'solo', niche: ['Tech'] },
      { useMock: false },
    );
    expect(minimal.platforms).toEqual([]);
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
    const ig = view.platforms.find((p) => p.platform === 'instagram');
    expect(ig?.stats.find((s) => s.label === 'Followers')?.value).toBe('87.8M');
    expect(ig?.stats.find((s) => s.label === 'Posts')?.value).toBe('489');
    expect(ig?.stats.find((s) => s.label === 'Avg views')?.value).toBe('7.6M');
    expect(ig?.note).toMatch(/^Live from Instagram · updated 2h ago$/);
    expect(ig?.connected).toBe(true);
  });

  it('links real thumbnails to the original posts, skipping thumb-less ones', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false, instagram: snapshot });
    const ig = view.platforms.find((p) => p.platform === 'instagram');
    expect(ig?.content.length).toBe(3);
    expect(ig?.content.map((c) => c.href)).toEqual([
      'https://www.instagram.com/p/AAA/',
      'https://www.instagram.com/p/BBB/',
      'https://www.instagram.com/p/DDD/', // CCC has no cached thumb
    ]);
    // views label prefers video views, falls back to likes
    expect(ig?.content[0].views).toBe('5.8M');
    expect(ig?.content[1].views).toBe('8.4M');
  });

  it('shows the real engagement chip and snapshot-driven reach', () => {
    const view = buildCreatorProfileView(baseProfile, { useMock: false, instagram: snapshot });
    expect(view.heroStats.find((s) => s.label === 'Engagement')?.value).toBe('3.3%');
    // reach = snapshot followers + youtube subs = 87,845,356
    expect(view.heroStats.find((s) => s.label === 'Total reach')?.value).toBe('87.8M');
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
