import { describe, it, expect } from 'vitest';
import { POSTGREST_MAX_ROWS, chunk, collectPagedRows, fetchAllRows, mapLimit } from '@/lib/paginate';

/**
 * PostgREST silently caps a response at Max Rows (1000). These prove the helpers
 * keep reading past it: the failure they exist to prevent is a list that looks
 * complete and is not.
 */

/** A fake table of `n` rows that behaves like PostgREST: never returns more than 1000 rows per call. */
function fakeTable(n: number) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + POSTGREST_MAX_ROWS - 1, n - 1);
    return { data: from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => ({ id: from + i })), error: null };
  };
  return { page, calls };
}

describe('fetchAllRows', () => {
  it.each([0, 1, 999, 1000, 1001, 2500, 5000])('reads all %i rows past the 1000 cap, once each and in order', async (n) => {
    const t = fakeTable(n);
    const { rows, truncated } = await fetchAllRows(t.page);
    expect(rows).toHaveLength(n);
    expect(truncated).toBe(false);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('a naive single read would have stopped at 1000 (the bug this prevents)', async () => {
    const t = fakeTable(2500);
    const naive = await t.page(0, 99_999);
    expect(naive.data).toHaveLength(POSTGREST_MAX_ROWS);
  });

  it('asks for exactly the pages it needs, and one extra only when the last page is exactly full', async () => {
    const a = fakeTable(2500);
    await fetchAllRows(a.page);
    expect(a.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    const b = fakeTable(2000);
    await fetchAllRows(b.page);
    expect(b.calls).toHaveLength(3); // 1000, 1000, then an empty page proves it is over
  });

  it('never asks for a page larger than PostgREST will honour', async () => {
    const t = fakeTable(3000);
    await fetchAllRows(t.page, { pageSize: 50_000 });
    expect(t.calls[0]).toEqual([0, 999]);
  });

  it('says so when it stops at maxRows with more still to read', async () => {
    const t = fakeTable(5000);
    const { rows, truncated } = await fetchAllRows(t.page, { maxRows: 2500 });
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(2500);
  });

  it('surfaces a database error instead of returning a partial list', async () => {
    let n = 0;
    await expect(
      fetchAllRows(async () => (++n === 2 ? { data: null, error: { message: 'boom' } } : { data: Array.from({ length: 1000 }, () => ({})), error: null })),
    ).rejects.toThrow('boom');
  });
});

describe('collectPagedRows (CSV export of an offset/limit RPC)', () => {
  function fakeRpc(total: number) {
    const seen: Array<[number, number]> = [];
    return {
      seen,
      fetchPage: async (offset: number, limit: number) => {
        seen.push([offset, limit]);
        const end = Math.min(offset + limit, total);
        return { rows: Array.from({ length: Math.max(end - offset, 0) }, (_, i) => ({ n: offset + i })), total };
      },
    };
  }

  it('exports EVERY row, not just the first page the button asked for', async () => {
    const r = fakeRpc(1234);
    const out = await collectPagedRows(r.fetchPage, { pageSize: 500 });
    expect(out.rows).toHaveLength(1234);
    expect(out.total).toBe(1234);
    expect(out.truncated).toBe(false);
    expect(r.seen).toEqual([[0, 500], [500, 500], [1000, 500]]);
  });

  it('handles an empty list and an exact multiple of the page size', async () => {
    expect((await collectPagedRows(fakeRpc(0).fetchPage)).rows).toHaveLength(0);
    const r = fakeRpc(1000);
    expect((await collectPagedRows(r.fetchPage, { pageSize: 500 })).rows).toHaveLength(1000);
    expect(r.seen).toHaveLength(2); // stops as soon as rows reach total, no wasted call
  });

  it('caps a runaway export and reports that it did', async () => {
    const out = await collectPagedRows(fakeRpc(90_000).fetchPage, { pageSize: 500, maxRows: 2000 });
    expect(out.truncated).toBe(true);
    expect(out.rows).toHaveLength(2000);
    expect(out.total).toBe(90_000);
  });
});

describe('chunk / mapLimit', () => {
  it('splits into groups of at most n', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it('keeps results in input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0, peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6], 2, async (x) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, x));
      inFlight--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
