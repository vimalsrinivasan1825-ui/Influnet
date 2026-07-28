import { describe, it, expect } from 'vitest';
import { computeInstagramMetrics } from '@/lib/social-snapshot';
import type { HikerInstagramUser, InstagramRecentPost } from '@/lib/hikerapi';

function post(overrides: Partial<InstagramRecentPost>): InstagramRecentPost {
  return {
    url: 'https://www.instagram.com/p/X/',
    shortcode: 'X',
    type: 'Image',
    caption: null,
    likes: null,
    comments: null,
    views: null,
    takenAt: null,
    displayUrl: null,
    pinned: false,
    ...overrides,
  };
}

function user(overrides: Partial<HikerInstagramUser>): HikerInstagramUser {
  return {
    pk: '1',
    username: 'creator',
    fullName: 'Creator',
    followerCount: 100_000,
    followingCount: 10,
    mediaCount: 42,
    isVerified: false,
    isPrivate: false,
    isBusiness: false,
    biography: null,
    externalUrl: null,
    publicEmail: null,
    categoryName: null,
    ...overrides,
  };
}

describe('computeInstagramMetrics', () => {
  it('computes avg views over video posts only and engagement over all posts', () => {
    const m = computeInstagramMetrics(
      user({
        followerCount: 1_000_000,
        recentPosts: [
          post({ type: 'Video', views: 4_000_000, likes: 90_000, comments: 10_000 }),
          post({ type: 'Video', views: 2_000_000, likes: 45_000, comments: 5_000 }),
          post({ type: 'Image', likes: 28_000, comments: 2_000 }),
        ],
      }),
    );
    expect(m.postsCount).toBe(42);
    expect(m.avgViews).toBe(3_000_000);
    // avg engaged = (100k + 50k + 30k)/3 = 60k over 1M followers = 6%
    expect(m.engagementRate).toBe(6);
  });

  it('rounds engagement to one decimal', () => {
    const m = computeInstagramMetrics(
      user({
        followerCount: 87_752_956,
        recentPosts: [post({ likes: 2_870_000, comments: 30_000 })],
      }),
    );
    expect(m.engagementRate).toBe(3.3);
  });

  it('returns nulls when there is nothing to compute', () => {
    const noPosts = computeInstagramMetrics(user({ recentPosts: [] }));
    expect(noPosts.avgViews).toBeNull();
    expect(noPosts.engagementRate).toBeNull();

    const noFollowers = computeInstagramMetrics(
      user({ followerCount: 0, recentPosts: [post({ likes: 10 })] }),
    );
    expect(noFollowers.engagementRate).toBeNull();

    const undefinedPosts = computeInstagramMetrics(user({}));
    expect(undefinedPosts.avgViews).toBeNull();
    expect(undefinedPosts.engagementRate).toBeNull();
  });

  it('ignores zero-view and zero-engagement posts rather than dragging averages', () => {
    const m = computeInstagramMetrics(
      user({
        followerCount: 100_000,
        recentPosts: [
          post({ type: 'Video', views: 0, likes: 0, comments: 0 }),
          post({ type: 'Video', views: 500_000, likes: 5_000, comments: 0 }),
        ],
      }),
    );
    expect(m.avgViews).toBe(500_000);
    expect(m.engagementRate).toBe(5);
  });

  it('discards a view count that is lower than the like count', () => {
    // What Apify actually returned for @a2d_army: a placeholder `1` on a reel
    // with 29,234 likes. Averaged in, it published "1 avg view per post" on a
    // 636K-follower profile. A post cannot be seen fewer times than it is liked.
    const m = computeInstagramMetrics(
      user({
        followerCount: 635_547,
        recentPosts: [
          post({ type: 'Video', views: 1, likes: 29_234, comments: 61 }),
          post({ type: 'Video', views: null, likes: 13_378, comments: 137 }),
        ],
      }),
    );
    expect(m.avgViews).toBeNull();
  });

  it('keeps a genuine view count that sits just above likes', () => {
    const m = computeInstagramMetrics(
      user({ followerCount: 1000, recentPosts: [post({ type: 'Video', views: 101, likes: 100 })] }),
    );
    expect(m.avgViews).toBe(101);
  });
});
