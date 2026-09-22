"use client";

/**
 * Match system — what brands search for, and what they fail to find
 * (migration 160). "Local" means the searcher asked for their own city.
 *
 * The zero-result list is the point: every row is demand we cannot supply, and
 * that is what tells you which creators to go recruit.
 */

import { useState } from "react";
import { Radar } from "lucide-react";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, DataTable, DateRangeBar, KpiRow, NoData, SectionCard, StatRows,
  defaultRange, nf, pct, useInsight,
} from "@/components/dashboard/admin/kit";

export default function MatchSystemPage() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error, reload } = useInsight<any>("search", range);
  const t = data?.totals ?? {};

  const series = (data?.series ?? []).map((r: any) => ({
    name: new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Searches: r.searches,
    "No results": r.zero,
  }));

  return (
    <AdminPage
      eyebrow="Marketplace"
      title="Match system"
      subtitle="What people search for, whether we can answer, and where supply is missing"
      icon={<Radar />}
      error={error}
      actions={<DateRangeBar range={range} onChange={setRange} onRefresh={reload} />}
    >
      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Searches", value: nf.format(t.searches ?? 0), hint: `${nf.format(t.searchers ?? 0)} people` },
          { label: "No results", value: nf.format(t.zero_results ?? 0), tone: (t.zero_results ?? 0) > 0 ? "warning" : "success", inverse: true, hint: pct(t.zero_rate, 1) },
          { label: "Median results", value: t.median_results ?? "—", tone: "info" },
          { label: "Local searches", value: nf.format(t.local_searches ?? 0), tone: "neutral", hint: "Searcher's own city" },
          { label: "Anywhere", value: nf.format(t.global_searches ?? 0), tone: "neutral", hint: "No location filter" },
        ]}
      />

      <SectionCard eyebrow="Trend" title="Searches and misses">
        {series.length === 0 ? (
          <NoData what="searches" historyStarts={data?.history_starts} />
        ) : (
          <AreaChart
            data={series}
            config={{ Searches: { label: "Searches", color: CHART_COLORS[0] }, "No results": { label: "No results", color: CHART_COLORS[6] } }}
            areas={[{ dataKey: "Searches" }, { dataKey: "No results" }]}
            height={240}
          />
        )}
      </SectionCard>

      <SectionCard eyebrow="Supply gaps" title="Searches that found nobody" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={data?.zero_result_filters ?? []}
          columns={[
            { key: "niche", label: "Niche", render: (r: any) => r.niche || "—" },
            { key: "industry", label: "Industry", render: (r: any) => r.industry || "—" },
            { key: "location", label: "Location", render: (r: any) => r.location || "Anywhere" },
            { key: "count", label: "Times", align: "right" },
          ]}
          empty={<NoData what="empty searches" historyStarts={data?.history_starts} />}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow="Demand vs supply" title="Most searched niches" bodyClassName="px-0 sm:px-0">
          <DataTable
            loading={loading}
            rows={data?.top_niches ?? []}
            columns={[
              { key: "niche", label: "Niche" },
              { key: "searches", label: "Searches", align: "right" },
              { key: "creators_available", label: "Creators we have", align: "right" },
            ]}
            empty={<NoData what="niche searches" historyStarts={data?.history_starts} />}
          />
        </SectionCard>
        <SectionCard eyebrow="Where" title="Most searched locations">
          <StatRows rows={(data?.top_locations ?? []).map((x: any) => ({ label: x.location, value: x.searches }))} />
        </SectionCard>
      </div>
    </AdminPage>
  );
}
