"use client";

/**
 * The Dashboard's headline chart: money over time, one line per counterparty.
 *
 * It used to be one purple area covering every brand (or every creator, on the
 * business side) summed together — a working chart, and a useless one, because
 * "who is this money actually coming from" is the question a list of five
 * ongoing brands makes you want answered. AreaChart already draws as many
 * series as it's given (apps/web/src/components/ui/chart.tsx); the fix is
 * entirely in what data reaches it. /api/influencer/dashboard and
 * /api/business/dashboard now return earnings_by_brand pre-bucketed into up to
 * four named series plus "Other" (see lib/earnings-buckets.ts), and this
 * component is the one place that turns that into `areas` + a legend, shared
 * by both roles so they can never drift into two different chart behaviors.
 *
 * Colors come from colorForKey(label) — the same hash the Avatar component
 * uses — so a brand's line here and its avatar in Project Roster below land on
 * the same color without either component knowing the other exists.
 */
import { useState } from "react";
import { AreaChart, type ChartConfig } from "@/components/ui/chart";
import { SegmentedTabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api-client";
import { chartSeriesColors } from "@/lib/entity-color";
import { Sparkles } from "lucide-react";

export type EarningsRange = "week" | "month" | "year";

export interface EarningsSeriesMeta {
  key: string;
  label: string;
}

/**
 * @param endpoint The role's own dashboard route — this component re-fetches
 *   it with ?range= on each toggle rather than owning any bucketing logic
 *   itself, so week/month/year always reflect the server's arithmetic.
 * @param dataField / seriesField Which top-level keys of the JSON response
 *   hold the bucketed rows and the series list. Both routes use the same
 *   names (earnings_by_brand / earnings_series) but are passed explicitly
 *   rather than hard-coded, so a future third role isn't blocked on matching
 *   that exact shape.
 */
export function BrandEarningsChart({
  endpoint,
  initialData,
  initialSeries,
  initialRange = "week",
  prefix = "₹",
  emptyLabel = "No earnings yet",
}: {
  endpoint: string;
  initialData: Record<string, number | string>[];
  initialSeries: EarningsSeriesMeta[];
  initialRange?: EarningsRange;
  prefix?: string;
  emptyLabel?: string;
}) {
  const [range, setRange] = useState<EarningsRange>(initialRange);
  const [data, setData] = useState(initialData);
  const [series, setSeries] = useState(initialSeries);
  const [loading, setLoading] = useState(false);

  const changeRange = async (next: EarningsRange) => {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    try {
      const res = await apiFetch<{ earnings_by_brand?: typeof data; earnings_series?: typeof series }>(
        `${endpoint}?range=${next}`,
      );
      if (res.ok && res.data) {
        setData(res.data.earnings_by_brand ?? []);
        setSeries(res.data.earnings_series ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const hasValues = data.some((row) => series.some((s) => Number(row[s.key]) > 0));

  // By position, not by hashing each brand's name — see chartSeriesColors.
  // Series already arrive ranked biggest-first from the server, so the top
  // brand is consistently red, the second consistently blue, and so on; what
  // it gives up is a brand's line matching its avatar's color elsewhere,
  // which matters far less than five lines actually looking like five things.
  const seriesColors = chartSeriesColors(series.length);
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: seriesColors[i] }]),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SegmentedTabs
          size="sm"
          value={range}
          onValueChange={(v) => changeRange(v as EarningsRange)}
          tabs={[
            { value: "week", label: "Weekly" },
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
        />
      </div>

      {!hasValues ? (
        <EmptyState icon={<Sparkles />} title={emptyLabel} description="Your earnings will chart here once work is agreed." />
      ) : (
        <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <AreaChart
            data={data}
            config={config}
            xKey="period"
            areas={series.map((s, i) => ({ dataKey: s.key, color: seriesColors[i] }))}
            height={220}
            prefix={prefix}
          />
          {/* One legend chip per series, in the same color as its line — the
              chart above already labels each series in its tooltip, but a
              tooltip only appears on hover, and "which color is which brand"
              is exactly the thing that must be visible at rest. */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {series.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: seriesColors[i] }} />
                <span className="text-xs font-medium text-content-soft">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
