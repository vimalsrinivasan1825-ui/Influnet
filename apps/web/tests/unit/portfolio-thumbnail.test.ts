/**
 * resolveInstagramThumbnail() — where a portfolio card's picture comes from.
 *
 * The behaviour worth pinning down is not "does it find an image" but the rules
 * around the lookup: only the creator's OWN cached snapshot is readable, only
 * our own bucket path is ever returned, and the network fallback only ever
 * follows a redirect to a host we recognise.
 *
 * This suite used to assert the opposite of that last rule — that nothing here
 * touched the network at all — because a scrape of Instagram's *embed page* had
 * been written, measured, found to return a client-rendered shell, and removed.
 * That guard was aimed at the wrong thing: it forbade all fetching, when what
 * does not work is parsing that one HTML document. The /media/ endpoint is a
 * redirect, and it does work (verified 2026-08-29 on real posts, one from
 * 2023). So the invariant is now about WHERE a redirect may lead, which is the
 * property that actually keeps this safe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Typed to the real signature (Promise<string | null>) so a test can simulate
// a failed cache with mockResolvedValueOnce(null) — the inferred type from the
// implementation alone would be Promise<string> and reject that.
const cacheSocialImage = vi.fn<(url: string, path: string) => Promise<string | null>>(
  async (_url, path) => path,
);

vi.mock('@/lib/social-snapshot', () => ({
  socialCachePublicUrl: (path: string) =>
    `https://project.supabase.co/storage/v1/object/public/social-cache/${path}`,
  cacheSocialImage: (url: string, path: string) => cacheSocialImage(url, path),
}));

const { resolveInstagramThumbnail } = await import('@/lib/portfolio-thumbnail');

const fetchMock = vi.fn();

/**
 * A Supabase stub that answers one snapshot query and records the filters it
 * was given, so the "own snapshot only" rule can be asserted rather than assumed.
 */
function stubSupabase(
  recentPosts: unknown,
  filters: Record<string, unknown> = {},
  error: unknown = null,
) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    maybeSingle: async () => ({ data: error ? null : { recent_posts: recentPosts }, error }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

/** A 302 whose Location is `location`, as the /media/ endpoint answers. */
function redirectTo(location: string) {
  return { status: 302, headers: { get: (h: string) => (h === 'location' ? location : null) } };
}

beforeEach(() => {
  fetchMock.mockReset();
  cacheSocialImage.mockClear();
  // Default: the endpoint finds nothing, so tests that are not about the
  // fallback keep asserting a null result.
  fetchMock.mockResolvedValue({ status: 404, headers: { get: () => null } });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the creator’s own cached snapshot', () => {
  it('returns the bucket URL for a post the pipeline already cached', async () => {
    const supabase = stubSupabase([
      { shortcode: 'OTHERPOST1', thumb_path: 'ig/u1/OTHERPOST1.jpg' },
      { shortcode: 'CxYzAbCdEfG', thumb_path: 'ig/u1/CxYzAbCdEfG.jpg' },
    ]);

    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBe(
      'https://project.supabase.co/storage/v1/object/public/social-cache/ig/u1/CxYzAbCdEfG.jpg',
    );
  });

  it('is scoped to the caller — a rival’s post cannot borrow their picture', async () => {
    const filters: Record<string, unknown> = {};
    const supabase = stubSupabase([{ shortcode: 'CxYzAbCdEfG', thumb_path: 'ig/u1/x.jpg' }], filters);

    await resolveInstagramThumbnail(supabase, 'u2', 'CxYzAbCdEfG');

    expect(filters.user_id).toBe('u2');
    expect(filters.platform).toBe('instagram');
  });

  it('falls back to a provider URL only when that is all the snapshot has', async () => {
    const supabase = stubSupabase([
      { shortcode: 'CxYzAbCdEfG', thumb_url: 'https://cdn.example/a.jpg' },
    ]);

    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBe(
      'https://cdn.example/a.jpg',
    );
  });

  it('does not reach the network when the snapshot already has the picture', async () => {
    const supabase = stubSupabase([{ shortcode: 'CxYzAbCdEfG', thumb_path: 'ig/u1/x.jpg' }]);

    await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the /media/ redirect fallback', () => {
  it('caches our own copy and returns the bucket URL', async () => {
    const supabase = stubSupabase([{ shortcode: 'SOMETHINGELSE', thumb_path: 'ig/u1/s.jpg' }]);
    fetchMock.mockResolvedValue(
      redirectTo('https://instagram.fmaa3-3.fna.fbcdn.net/v/t51/123_n.jpg?oe=DEADBEEF'),
    );

    const got = await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG');

    // The CDN URL carries a signed expiry, so what is STORED must be ours.
    expect(cacheSocialImage).toHaveBeenCalledWith(
      'https://instagram.fmaa3-3.fna.fbcdn.net/v/t51/123_n.jpg?oe=DEADBEEF',
      'ig/u1/CxYzAbCdEfG.jpg',
    );
    expect(got).toBe(
      'https://project.supabase.co/storage/v1/object/public/social-cache/ig/u1/CxYzAbCdEfG.jpg',
    );
  });

  it('runs for a creator who has no snapshot at all', async () => {
    // The common case for someone who never connected Instagram. This used to
    // return null before the lookup even started.
    const supabase = stubSupabase(null, {}, { message: 'no rows' });
    fetchMock.mockResolvedValue(redirectTo('https://scontent.cdninstagram.com/v/x.jpg'));

    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBe(
      'https://project.supabase.co/storage/v1/object/public/social-cache/ig/u1/CxYzAbCdEfG.jpg',
    );
  });

  it('refuses to follow a redirect off Instagram’s CDN', async () => {
    const supabase = stubSupabase([]);

    for (const evil of [
      'http://169.254.169.254/latest/meta-data/',
      'https://attacker.example/x.jpg',
      'https://fbcdn.net.attacker.example/x.jpg',
      'http://scontent.cdninstagram.com/x.jpg',
    ]) {
      cacheSocialImage.mockClear();
      fetchMock.mockResolvedValue(redirectTo(evil));

      expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();
      expect(cacheSocialImage).not.toHaveBeenCalled();
    }
  });

  it('returns null when the post does not resolve, or the fetch throws', async () => {
    const supabase = stubSupabase([]);

    fetchMock.mockResolvedValue({ status: 404, headers: { get: () => null } });
    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();

    // 200 means a page (the login/consent wall), not an image.
    fetchMock.mockResolvedValue({ status: 200, headers: { get: () => null } });
    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();

    fetchMock.mockRejectedValue(new Error('timed out'));
    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();
  });

  it('returns null when the image could not be cached', async () => {
    const supabase = stubSupabase([]);
    fetchMock.mockResolvedValue(redirectTo('https://scontent.cdninstagram.com/v/x.jpg'));
    cacheSocialImage.mockResolvedValueOnce(null);

    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();
  });
});

describe('the invariants', () => {
  it('only ever asks Instagram about a URL it built itself', async () => {
    const supabase = stubSupabase([]);

    await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://www.instagram.com/p/CxYzAbCdEfG/media/?size=l',
    );
    // Manual, so the host check below is reachable at all.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a shortcode the parser would not have produced — before any fetch', async () => {
    const supabase = stubSupabase([]);

    for (const bad of ['../../etc', 'a', 'code with spaces', 'x'.repeat(40)]) {
      expect(await resolveInstagramThumbnail(supabase, 'u1', bad)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
