/**
 * Bucketing money by time window AND by counterparty — the shared arithmetic
 * behind the Dashboard's per-brand earnings chart, for both roles.
 *
 * The chart used to be one purple line: every brand's money summed into a
 * single series, so a creator working with five different brands could not
 * tell which one was driving a given week's spike. The fix is not a new chart
 * — AreaChart already draws as many series as it's given — it's reshaping the
 * same rows into one series per counterparty instead of one total. This module
 * is that reshape, used identically by the influencer and business dashboard
 * routes so "how does the range toggle bucket time" can never drift between
 * what a creator sees and what a brand sees.
 *
 * Server-only in practice (it runs inside a route handler against rows already
 * fetched from Supabase), but it is plain, dependency-free TypeScript so nothing
 * stops a future client-side chart from importing it too.
 */

export type EarningsRange = "week" | "month" | "year";

export interface BucketWindow {
  start: Date;
  end: Date;
  label: string;
}

/** How many buckets each range shows. Matches the six-week window the single-series chart always showed, so "week" isn't a visible regression. */
const BUCKET_COUNT: Record<EarningsRange, number> = { week: 6, month: 6, year: 4 };

export function parseEarningsRange(value: string | null): EarningsRange {
  return value === "month" || value === "year" ? value : "week";
}

/** The N most recent buckets for a range, oldest first — what a left-to-right chart needs. */
export function bucketWindows(range: EarningsRange, now = new Date()): BucketWindow[] {
  const count = BUCKET_COUNT[range];
  const windows: BucketWindow[] = [];

  for (let i = count - 1; i >= 0; i--) {
    if (range === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay() - i * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 7 * 86_400_000);
      windows.push({ start, end, label: start.toLocaleDateString("en-IN", { month: "short", day: "numeric" }) });
    } else if (range === "month") {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      windows.push({ start, end, label: start.toLocaleDateString("en-IN", { month: "short" }) });
    } else {
      const start = new Date(now.getFullYear() - i, 0, 1);
      const end = new Date(now.getFullYear() - i + 1, 0, 1);
      windows.push({ start, end, label: String(start.getFullYear()) });
    }
  }
  return windows;
}

export interface MoneyRow {
  date: Date;
  amount: number;
  /** Display name of the other party — a brand's name on the creator side, a creator's name on the business side. */
  counterparty: string;
}

export interface EarningsSeries {
  /** A sanitised, Recharts-safe object key — never the display name itself. */
  key: string;
  label: string;
}

/**
 * Bucket a flat list of money rows by window AND by counterparty, keeping only
 * the top `topN` counterparties as their own series and folding everyone else
 * into "Other".
 *
 * `topN` defaults to 4: enough to show real variation without the chart
 * legend outgrowing the chart, and matched to the categorical color set below
 * having exactly that many really-distinct hues to spare before a fifth line
 * starts reading as a duplicate of the first.
 */
export function bucketByCounterparty(
  windows: BucketWindow[],
  rows: MoneyRow[],
  topN = 4,
): { data: Record<string, number | string>[]; series: EarningsSeries[] } {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.counterparty, (totals.get(r.counterparty) ?? 0) + r.amount);

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, topN).map(([name]) => name);
  const topSet = new Set(top);
  const hasOther = ranked.length > top.length;

  const keyFor = new Map<string, string>();
  top.forEach((name, i) => keyFor.set(name, `s${i}`));

  const series: EarningsSeries[] = [
    ...top.map((name, i) => ({ key: `s${i}`, label: name })),
    ...(hasOther ? [{ key: "other", label: "Other" }] : []),
  ];

  const data: Record<string, number | string>[] = windows.map((w) => {
    const row: Record<string, number | string> = { period: w.label };
    for (const s of series) row[s.key] = 0;
    return row;
  });

  for (const r of rows) {
    const idx = windows.findIndex((w) => r.date >= w.start && r.date < w.end);
    if (idx === -1) continue;
    const key = topSet.has(r.counterparty) ? keyFor.get(r.counterparty)! : hasOther ? "other" : null;
    if (!key) continue;
    data[idx][key] = (Number(data[idx][key]) || 0) + r.amount;
  }

  return { data, series };
}
