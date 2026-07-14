import { describe, it, expect } from 'vitest';
import { buildMediaKitView } from '@/lib/public-profile/media-kit';
import type { RawPublicProfile, InstagramSnapshotView } from '@/lib/public-profile/creator-profile';

const profile: RawPublicProfile = {
  userId: 'u1',
  name: 'MrBeast E2ETest',
  username: 'mrbeast_e2e_0714',
  bio: 'Watch my latest video!! 👇',
  city: 'Chennai',
  state: 'Tamil Nadu',
  languages: ['English'],
  niche: ['Entertainment'],
  isVerified: false,
  instagramHandle: 'mrbeast',
  collabTypes: ['Reel', 'Post'],
  priceRange: 'pro',
  pricingMin: 25000,
  pricingMax: null,
};

const snapshot: InstagramSnapshotView = {
  followerCount: 87_754_345,
  postsCount: 489,
  avgViews: 6_740_233,
  engagementRate: 3.3,
  isVerified: true,
  profilePicUrl: 'https://cdn.example/profile.jpg',
  fetchedAt: new Date().toISOString(),
  posts: [
    { url: 'https://www.instagram.com/p/A/', thumbUrl: 'https://cdn.example/a.jpg', views: null, likes: 5_795_236, type: 'Sidecar' },
    { url: 'https://www.instagram.com/p/B/', thumbUrl: null, views: 100, likes: 10, type: 'Video' },
    { url: 'https://www.instagram.com/p/C/', thumbUrl: 'https://cdn.example/c.jpg', views: 8_429_166, likes: 1_096_015, type: 'Video' },
  ],
};

describe('buildMediaKitView', () => {
  const view = buildMediaKitView(profile, snapshot, []);

  it('builds real stats and hero chips from the snapshot', () => {
    expect(view.stats.map((s) => s.value)).toEqual(['87.8M', '87.8M', '3.3%']);
    expect(view.heroChips).toEqual([
      { label: 'Followers', value: '87.8M' },
      { label: 'Posts', value: '489' },
    ]);
  });

  it('features only posts with cached thumbnails, videos labeled by views', () => {
    expect(view.featured).toEqual([
      { href: 'https://www.instagram.com/p/A/', thumbUrl: 'https://cdn.example/a.jpg', label: '5.8M', isVideo: false },
      { href: 'https://www.instagram.com/p/C/', thumbUrl: 'https://cdn.example/c.jpg', label: '8.4M', isVideo: true },
    ]);
  });

  it('derives packages from collab types with the creator pricing', () => {
    expect(view.packages?.map((p) => p.title)).toEqual(['Instagram Reel', 'Instagram Post']);
    expect(view.packages?.every((p) => p.priceLabel === '₹25,000+')).toBe(true);
    expect(view.packages?.filter((p) => p.featured).length).toBe(1);
  });

  it('hides data-less sections instead of faking them', () => {
    expect(view.audience).toBeNull();
    expect(view.pastCollaborations).toBeNull();
    expect(view.reviews).toBeNull();
  });

  it('parses self-reported audience demographics in either shape', () => {
    const withDemo = buildMediaKitView(
      {
        ...profile,
        audienceDemographics: {
          locations: { India: 72, USA: 11 },
          age: [
            { label: '18-24', pct: 38 },
            { label: '25-34', pct: 41 },
          ],
        },
      },
      snapshot,
      [],
    );
    expect(withDemo.audience?.locations?.[0]).toEqual({ label: 'India', pct: 72 });
    // sorted descending by pct
    expect(withDemo.audience?.age?.[0]).toEqual({ label: '25-34', pct: 41 });
    expect(withDemo.audience?.gender).toBeNull();
    expect(withDemo.topAudience).toBe('25-34 yrs');
  });

  it('falls back to the price-range tier label when no explicit pricing', () => {
    const v = buildMediaKitView({ ...profile, pricingMin: null, priceRange: 'entry' }, snapshot, []);
    expect(v.packages?.[0].priceLabel).toBe('₹1K – ₹5K');
  });

  it('works without a snapshot (identity only, no featured content)', () => {
    const v = buildMediaKitView({ ...profile, instagramFollowers: 1000 }, null, []);
    expect(v.featured).toEqual([]);
    expect(v.stats.map((s) => s.label)).toEqual(['Total Reach', 'Followers']);
    expect(v.snapshotAge).toBeNull();
  });
});
