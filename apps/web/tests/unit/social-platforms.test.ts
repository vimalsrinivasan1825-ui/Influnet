import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { facebookHandler } from '@/lib/social/facebook';
import { twitterHandler } from '@/lib/social/twitter';
import { snapchatHandler } from '@/lib/social/snapchat';
import { postViews, toIso, toNumber, SocialProviderError } from '@/lib/social/types';

/**
 * These handlers stand between a creator's typed handle and a billed provider
 * call, so the parts worth testing are the ones that decide WHAT gets called
 * and HOW a result is read — not the network round-trip itself.
 */

describe('handle normalisation', () => {
  it('accepts the shapes people actually paste for Facebook', () => {
    expect(facebookHandler.normalizeHandle('mypage')).toBe('mypage');
    expect(facebookHandler.normalizeHandle('@MyPage')).toBe('mypage');
    expect(facebookHandler.normalizeHandle('https://www.facebook.com/MyPage')).toBe('mypage');
    expect(facebookHandler.normalizeHandle('facebook.com/MyPage/')).toBe('mypage');
  });

  it('keeps a numeric profile.php id intact', () => {
    // The "copy link" button hands this to anyone who never set a username.
    // Splitting on the path would turn it into the literal handle "profile.php"
    // and look up a page that doesn't exist.
    expect(facebookHandler.normalizeHandle('https://www.facebook.com/profile.php?id=100064123456789')).toBe(
      '100064123456789',
    );
    expect(facebookHandler.profileUrl('100064123456789')).toContain('profile.php?id=100064123456789');
  });

  it('reads the id out of a /people/ link', () => {
    expect(facebookHandler.normalizeHandle('https://facebook.com/people/Some-Name/61550123456789/')).toBe(
      '61550123456789',
    );
  });

  it('normalises X handles from either domain', () => {
    expect(twitterHandler.normalizeHandle('@Creator')).toBe('creator');
    expect(twitterHandler.normalizeHandle('https://twitter.com/Creator')).toBe('creator');
    expect(twitterHandler.normalizeHandle('https://x.com/Creator/status/123')).toBe('creator');
  });

  it('rejects handles the platform itself would reject', () => {
    // X caps at 15 characters; sending a longer one spends a provider call on
    // a lookup that cannot succeed.
    expect(twitterHandler.normalizeHandle('sixteencharacters')).toBeNull();
    expect(twitterHandler.normalizeHandle('has spaces')).toBeNull();
    expect(facebookHandler.normalizeHandle('a')).toBeNull();
    // Snapchat usernames must start with a letter.
    expect(snapchatHandler.normalizeHandle('1abc')).toBeNull();
    expect(snapchatHandler.normalizeHandle('https://www.snapchat.com/add/creator')).toBe('creator');
  });
});

describe('snapchat is link-only', () => {
  it('never returns a profile, so nothing can be shown as checked', async () => {
    expect(snapchatHandler.supported).toBe(false);
    await expect(snapchatHandler.fetchProfile('creator')).resolves.toBeNull();
  });
});

describe('view counts', () => {
  it('drops a placeholder view count that sits at or below the like count', () => {
    // The bug this guards: an actor reported videoViewCount 1 against 29,000
    // likes, and that "1" became the creator's published average view count.
    expect(postViews(1, 29_000)).toBeNull();
    expect(postViews(29_000, 29_000)).toBeNull();
    expect(postViews(31_000, 29_000)).toBe(31_000);
  });

  it('treats missing and zero as no data, not as zero views', () => {
    expect(postViews(null, 10)).toBeNull();
    expect(postViews(0, 10)).toBeNull();
    expect(postViews(undefined, null)).toBeNull();
  });

  it('still returns a count when the like count is unknown', () => {
    expect(postViews(500, null)).toBe(500);
  });
});

describe('value coercion', () => {
  it('parses the comma-formatted numbers providers return as strings', () => {
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('not a number')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  it('reads both seconds and milliseconds epochs', () => {
    // Facebook actors report seconds; others report milliseconds. Reading a
    // seconds epoch as milliseconds dates every post to January 1970.
    expect(toIso(1_700_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
    expect(toIso(1_700_000_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
    expect(toIso('2026-07-14T10:00:00.000Z')).toBe('2026-07-14T10:00:00.000Z');
    expect(toIso('never')).toBeNull();
  });
});

describe('facebook fetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.APIFY_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockActor(body: unknown, status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as any;
  }

  it('reads a public page', async () => {
    mockActor([
      {
        title: 'Madan Gowri',
        followers: 1_200_000,
        likes: 900_000,
        profilePictureUrl: 'https://scontent.example/pic.jpg',
        verified: true,
        posts: [
          { postId: 'p1', url: 'https://facebook.com/p1', text: 'hello', likes: 100, comments: 5, time: 1_700_000_000 },
        ],
      },
    ]);

    const profile = await facebookHandler.fetchProfile('madangowri');
    expect(profile?.displayName).toBe('Madan Gowri');
    expect(profile?.followerCount).toBe(1_200_000);
    expect(profile?.isPrivate).toBe(false);
    expect(profile?.recentPosts[0].id).toBe('p1');
  });

  it('falls back to the likes count when a page reports no followers', () => {
    // Many older Pages report only one of the two. Showing a blank audience
    // when the provider did return one reads as "we couldn't find you".
    mockActor([{ title: 'Old Page', likes: 4_321 }]);
    return expect(facebookHandler.fetchProfile('oldpage')).resolves.toMatchObject({
      followerCount: 4_321,
    });
  });

  it('reports an unreadable account as private, not as missing', async () => {
    // A locked/friends-only profile comes back as a shell with no name and no
    // audience. Calling that "not found" would send the creator to fix the one
    // thing that isn't wrong — their handle.
    mockActor([{ pageUrl: 'https://facebook.com/someone' }]);
    const profile = await facebookHandler.fetchProfile('someone');
    expect(profile?.isPrivate).toBe(true);
  });

  it('returns null for a handle that does not resolve', async () => {
    mockActor([]);
    await expect(facebookHandler.fetchProfile('nobodyhere')).resolves.toBeNull();
  });

  it('throws rather than reporting "not found" when the provider is out of credit', async () => {
    // The distinction the whole error class exists for: a billing failure must
    // never be shown to a creator as "that account doesn't exist".
    mockActor({}, 402);
    await expect(facebookHandler.fetchProfile('mypage')).rejects.toBeInstanceOf(SocialProviderError);
  });

  it('never calls the provider for a handle that cannot be valid', async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    await expect(facebookHandler.fetchProfile('!!')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('twitter fetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.APIFY_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('accepts either actor shape: a user item, or tweets carrying an author', async () => {
    // The actor id is env-swappable by design, so the mapper has to survive a
    // swap between actors that disagree on the item shape.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: '1',
          text: 'a tweet',
          likeCount: 10,
          author: { userName: 'creator', name: 'A Creator', followers: 5_000, protected: false },
        },
      ],
    }) as any;

    const profile = await twitterHandler.fetchProfile('@Creator');
    expect(profile?.handle).toBe('creator');
    expect(profile?.followerCount).toBe(5_000);
    expect(profile?.recentPosts[0].url).toContain('1');
  });

  it('raises a provider error when a rental actor returns demo stubs', async () => {
    // Measured live 2026-08-05: on a FREE Apify plan, apidojo/twitter-user-
    // scraper answers 200 with ten `{demo: true}` items and tweet-scraper with
    // `{noResults: true}`. Without this check the mapper finds no user and the
    // route answers "no such account" — telling a creator whose handle is
    // perfectly correct that their account doesn't exist.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => Array.from({ length: 10 }, () => ({ demo: true })),
    }) as any;

    await expect(twitterHandler.fetchProfile('nasa')).rejects.toMatchObject({
      kind: 'not_supported',
    });
  });

  it('does not mistake a real single-result payload for demo output', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ userName: 'nasa', name: 'NASA', followers: 100 }],
    }) as any;

    await expect(twitterHandler.fetchProfile('nasa')).resolves.toMatchObject({ handle: 'nasa' });
  });

  it('flags a protected account as private', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ userName: 'locked', name: 'Locked', protected: true, followers: 12 }],
    }) as any;

    await expect(twitterHandler.fetchProfile('locked')).resolves.toMatchObject({ isPrivate: true });
  });
});
