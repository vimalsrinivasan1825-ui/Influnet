/**
 * Reading everything, not "the first thousand".
 *
 * PostgREST caps every response at Max Rows (1000 on this project) and does NOT
 * say so: a query for a list that has grown past that simply returns the first
 * 1000 rows and looks complete. That silently froze the admin Overview tiles once
 * (AGENTS.md: "Never count rows in Node"), and it is the same trap for any list
 * the admin reads whole. Counts belong in SQL; when a route genuinely needs every
 * row, it pages with these.
 */

/** PostgREST's Max Rows on this project. */
export const POSTGREST_MAX_ROWS = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Read every row of a range-able query, one page at a time.
 *
 * `page(from, to)` must return rows `from..to` INCLUSIVE, in a STABLE order (add a
 * unique tiebreaker such as `id`, or rows can repeat or vanish between pages).
 * Stops at the first short page. `truncated` is true only if `maxRows` was reached
 * with more rows still to read, so a caller can say so instead of pretending.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? POSTGREST_MAX_ROWS, 1), POSTGREST_MAX_ROWS);
  const maxRows = opts.maxRows ?? 100_000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
  }
}

/**
 * Read every row of an OFFSET/LIMIT RPC that returns `{ rows, total }` (the admin
 * insight RPCs, migrations 153/158/159). `total` is counted in SQL. Used so a CSV
 * export is the whole list, not whatever `limit` the button happened to send.
 */
export async function collectPagedRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<{ rows: T[]; total: number; truncated: boolean }> {
  const pageSize = Math.max(opts.pageSize ?? 500, 1);
  const maxRows = opts.maxRows ?? 50_000;
  const rows: T[] = [];
  let total = 0;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetchPage(offset, pageSize);
    total = res.total;
    rows.push(...res.rows);
    if (res.rows.length < pageSize || rows.length >= total) return { rows, total, truncated: false };
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), total, truncated: true };
  }
}

/** Split into groups of at most `size` (for `.in(column, ids)` filters, which have a URL length limit). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `fn` over `items` with at most `limit` in flight, keeping the results in order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
