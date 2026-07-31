/**
 * getCreatorPortfolio() — the read path behind the portfolio on /c/[username].
 *
 * The assertion that matters is the trust one: a self-added entry must never
 * come back verified. The RPC decides that correctly in SQL, and this layer
 * re-derives it anyway, because `verified` is one careless edit away from being
 * selected off a creator-writable column — the same hole migration 083 closed
 * for the profile badge.
 */
import { describe, it, expect, vi } from 'vitest';
import { getCreatorPortfolio } from '@/lib/public-profile/get-portfolio';

const clientReturning = (data: unknown, error: unknown = null) => ({
  rpc: vi.fn().mockResolvedValue({ data, error }),
});

describe('provenance', () => {
  it('marks platform rows verified and manual rows not', async () => {
    const supabase = clientReturning([
      { id: '1', source: 'platform', verified: true, title: 'Launch film', brand_name: 'Verve' },
      { id: '2', source: 'manual', verified: false, title: 'My reel', brand_name: null },
    ]);

    const items = await getCreatorPortfolio(supabase, 'user-1');
    expect(items.map((i) => [i.source, i.verified])).toEqual([
      ['platform', true],
      ['manual', false],
    ]);
  });

  it('refuses to verify a manual row even when the payload says verified', async () => {
    // Simulates the RPC being changed to read `verified` off the table. The
    // source is the authority; the flag is not.
    const supabase = clientReturning([
      { id: '1', source: 'manual', verified: true, title: 'I marked myself verified' },
    ]);

    const [item] = await getCreatorPortfolio(supabase, 'user-1');
    expect(item.verified).toBe(false);
  });

  it('treats an unrecognised source as manual, not verified', async () => {
    const supabase = clientReturning([
      { id: '1', source: 'imported', verified: true, title: 'From somewhere new' },
      { id: '2', source: undefined, verified: true, title: 'No source at all' },
    ]);

    const items = await getCreatorPortfolio(supabase, 'user-1');
    expect(items.every((i) => i.source === 'manual' && i.verified === false)).toBe(true);
  });
});

describe('degraded states', () => {
  it('returns an empty portfolio when the migration is unapplied', async () => {
    // A database behind on migrations must render an empty section, never a
    // 500 on somebody's public profile.
    const supabase = clientReturning(null, { message: 'function get_creator_portfolio does not exist' });
    await expect(getCreatorPortfolio(supabase, 'user-1')).resolves.toEqual([]);
  });

  it('survives a thrown client error', async () => {
    const supabase = { rpc: vi.fn().mockRejectedValue(new Error('connection reset')) };
    await expect(getCreatorPortfolio(supabase, 'user-1')).resolves.toEqual([]);
  });

  it('survives a non-array payload', async () => {
    const supabase = clientReturning({ unexpected: 'shape' });
    await expect(getCreatorPortfolio(supabase, 'user-1')).resolves.toEqual([]);
  });
});

describe('field mapping', () => {
  it('normalises an unknown platform to "other"', async () => {
    const supabase = clientReturning([
      { id: '1', source: 'manual', platform: 'tiktok', title: 'A' },
      { id: '2', source: 'manual', platform: 'youtube', title: 'B' },
    ]);

    const items = await getCreatorPortfolio(supabase, 'user-1');
    expect(items.map((i) => i.platform)).toEqual(['other', 'youtube']);
  });

  it('coerces bigint view counts arriving as strings', async () => {
    // PostgREST serialises BIGINT as a string; Number() here keeps the UI's
    // formatter from printing "1200000" through a string path.
    const supabase = clientReturning([
      { id: '1', source: 'manual', title: 'A', views: '1200000' },
    ]);

    const [item] = await getCreatorPortfolio(supabase, 'user-1');
    expect(item.views).toBe(1_200_000);
  });

  it('falls back to a title rather than rendering "undefined"', async () => {
    const supabase = clientReturning([{ id: '1', source: 'manual' }]);
    const [item] = await getCreatorPortfolio(supabase, 'user-1');
    expect(item.title).toBe('Untitled');
  });
});
