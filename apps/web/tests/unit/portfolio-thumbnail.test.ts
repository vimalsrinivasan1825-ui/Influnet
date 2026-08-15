/**
 * resolveInstagramThumbnail() — where a portfolio card's picture comes from.
 *
 * The behaviour worth pinning down is not "does it find an image" but the rules
 * around the lookup: only the creator's OWN cached snapshot is readable, only
 * our own bucket path is returned, and nothing here ever reaches the network.
 * That last one is a regression guard with history: a scrape of Instagram's
 * embed page was written, measured against real posts, found to return a
 * client-rendered shell, and removed. If a future change reintroduces a fetch
 * here, this suite fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/social-snapshot', () => ({
  socialCachePublicUrl: (path: string) =>
    `https://project.supabase.co/storage/v1/object/public/social-cache/${path}`,
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

beforeEach(() => {
  fetchMock.mockReset();
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

  it('returns null for a post that is not in the snapshot', async () => {
    const supabase = stubSupabase([{ shortcode: 'SOMETHINGELSE', thumb_path: 'ig/u1/s.jpg' }]);
    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();
  });

  it('returns null rather than throwing when the snapshot cannot be read', async () => {
    const supabase = stubSupabase(null, {}, { message: 'relation does not exist' });
    expect(await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG')).toBeNull();
  });
});

describe('the invariants', () => {
  it('never makes a network request', async () => {
    // Instagram's embed endpoint no longer contains the image (see the module
    // header). Anything that reintroduces a fetch here is a regression.
    const supabase = stubSupabase([{ shortcode: 'CxYzAbCdEfG', thumb_path: 'ig/u1/x.jpg' }]);

    await resolveInstagramThumbnail(supabase, 'u1', 'CxYzAbCdEfG');
    await resolveInstagramThumbnail(supabase, 'u1', 'NOTINSNAPSHOT');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a shortcode the parser would not have produced', async () => {
    const supabase = stubSupabase([]);

    for (const bad of ['../../etc', 'a', 'code with spaces', 'x'.repeat(40)]) {
      expect(await resolveInstagramThumbnail(supabase, 'u1', bad)).toBeNull();
    }
  });
});
