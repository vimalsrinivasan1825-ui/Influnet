import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InstagramProfile } from '@/lib/instagram';

// Mock the provider SELECTOR (lib/instagram) — the seam verification-live depends
// on. Keep the real normalizeHandle + InstagramProviderError + activeProvider so
// the enrichment logic and error mapping run for real.
const mocks = vi.hoisted(() => ({
  fetchInstagramProfile: vi.fn(),
  isInstagramProviderConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/instagram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instagram')>();
  return {
    ...actual,
    fetchInstagramProfile: mocks.fetchInstagramProfile,
    isInstagramProviderConfigured: mocks.isInstagramProviderConfigured,
    activeProvider: () => 'apify',
  };
});

import { enrichWithLiveData } from '@/lib/verification-live';
import { buildCreatorSignals } from '@/lib/verification-scraper';
import { decide } from '@/lib/verification';
import { InstagramProviderError, normalizeHandle } from '@/lib/instagram';

function fakeUser(over: Partial<InstagramProfile> = {}): InstagramProfile {
  return {
    pk: '123',
    username: 'creator',
    fullName: 'A Creator',
    followerCount: 250_000,
    followingCount: 300,
    mediaCount: 500,
    isVerified: false,
    isPrivate: false,
    isBusiness: false,
    biography: 'fitness coach',
    externalUrl: null,
    externalUrls: [],
    publicEmail: null,
    categoryName: null,
    lastPostDaysAgo: 4,
    ...over,
  };
}

const base = () => buildCreatorSignals({ instagram_handle: 'creator', niche: ['fitness'], bio: 'fitness coach' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isInstagramProviderConfigured.mockReturnValue(true);
});

describe('normalizeHandle', () => {
  it('strips @, whitespace, and instagram.com URLs', () => {
    expect(normalizeHandle('@nasa')).toBe('nasa');
    expect(normalizeHandle('  MrBeast  ')).toBe('MrBeast');
    expect(normalizeHandle('https://instagram.com/cristiano/')).toBe('cristiano');
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });
});

describe('enrichWithLiveData', () => {
  it('confirms a real, IG-verified account and enables auto-approval', async () => {
    mocks.fetchInstagramProfile.mockResolvedValue(fakeUser({ isVerified: true, followerCount: 400_000 }));
    const { signals } = await enrichWithLiveData('influencer', { instagram_handle: '@creator' }, base());

    expect(signals.social_handles_live?.instagram).toBe(true);
    expect(signals.platform_verified).toBe(true);
    expect(signals.follower_count).toBe(400_000);
    expect(signals.last_post_days_ago).toBe(4);
    expect(signals.live?.status).toBe('ok');
    expect(signals.live?.provider).toBe('apify');
    // Strong metrics alone escalate; with proven ownership they auto-verify.
    expect(decide('influencer', signals).status).toBe('in_review');
    expect(decide('influencer', { ...signals, ownership_verified: true }).status).toBe('verified');
  });

  it('flags a handle that does not resolve and escalates to a human', async () => {
    mocks.fetchInstagramProfile.mockResolvedValue(null);
    const { signals } = await enrichWithLiveData('influencer', { instagram_handle: '@ghost' }, base());

    expect(signals.social_handles_live?.instagram).toBe(false);
    expect(signals.flags).toContain('instagram_handle_not_found');
    expect(signals.live?.status).toBe('not_found');
    expect(decide('influencer', signals).status).toBe('in_review');
  });

  it('flags an inflated follower claim', async () => {
    mocks.fetchInstagramProfile.mockResolvedValue(fakeUser({ followerCount: 1_000 }));
    const { signals } = await enrichWithLiveData(
      'influencer',
      { instagram_handle: '@creator', instagram_followers: 500_000 },
      base(),
    );
    expect(signals.flags).toContain('follower_count_inflated');
    expect(decide('influencer', signals).status).toBe('in_review');
  });

  it('degrades gracefully when the provider credit is exhausted (402)', async () => {
    mocks.fetchInstagramProfile.mockRejectedValue(new InstagramProviderError('insufficient_funds', 'no balance', 402));
    const { signals, note } = await enrichWithLiveData('influencer', { instagram_handle: '@creator' }, base());

    expect(signals.flags).toContain('live_check_unavailable');
    expect(signals.live?.status).toBe('unavailable');
    expect(signals.live?.instagram?.error).toBe('insufficient_funds');
    expect(note).toMatch(/exhausted/i);
    // Never throws, and the structural handle signal survives.
    expect(signals.social_handles_live?.instagram).toBe(true);
  });

  it('skips cleanly when no handle is provided', async () => {
    const { signals } = await enrichWithLiveData('influencer', { instagram_handle: null }, base());
    expect(signals.live?.status).toBe('skipped');
    expect(mocks.fetchInstagramProfile).not.toHaveBeenCalled();
  });

  it('marks provider not configured without calling the network', async () => {
    mocks.isInstagramProviderConfigured.mockReturnValue(false);
    const { signals } = await enrichWithLiveData('influencer', { instagram_handle: '@creator' }, base());
    expect(signals.flags).toContain('live_check_not_configured');
    expect(mocks.fetchInstagramProfile).not.toHaveBeenCalled();
  });
});
