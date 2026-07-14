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
