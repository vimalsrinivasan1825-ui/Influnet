"use client";

/**
 * App activity — DAU by platform, app-version adoption, push reach, and the
 * weekday × hour heatmap (migrations 152 + 156 + 159).
 */

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { AreaChart, CHART_COLORS, DonutChart } from "@/components/ui/chart";
import {
  AdminPage, DataTable, DateRangeBar, KpiRow, NoData, SectionCard, StatRows,
  WeekHourHeatmap, defaultRange, nf, pct, useInsight,
} from "@/components/dashboard/admin/kit";

export default function AppActivityPage() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error, reload } = useInsight<any>("app", range);

  const totals = data?.totals ?? {};
  const push = data?.push ?? {};
  const byDay = new Map<string, any>();
  for (const row of data?.by_platform_day ?? []) {
    const entry = byDay.get(row.day) ?? { name: new Date(row.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) };
    entry[row.platform === "web" ? "Web" : row.platform === "ios" ? "iOS" : row.platform === "android" ? "Android" : "Unknown"] = row.users;
    byDay.set(row.day, entry);
  }
  const series = [...byDay.values()];
  const reach = push.total_users ? Math.round((push.users_reachable / push.total_users) * 100) : 0;

  return (
    <AdminPage
      eyebrow="Workspace"
      title="App activity"
      subtitle="Where people use Influnet from, which app versions are live, and when they are online"
      icon={<Smartphone />}
      error={error}
      actions={<DateRangeBar range={range} onChange={setRange} onRefresh={reload} />}
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Active users", value: nf.format(totals.active_users ?? 0), hint: `${nf.format(totals.sessions ?? 0)} visits` },
          { label: "Mobile only", value: nf.format(totals.mobile_only ?? 0), tone: "info", hint: "Never used the web app" },
          { label: "Reachable by push", value: nf.format(push.users_reachable ?? 0), tone: "success", hint: `${pct(reach)} of all accounts` },
          { label: "Dead devices", value: nf.format(push.disabled_devices ?? 0), tone: push.disabled_devices > 0 ? "warning" : "neutral", hint: "Uninstalled or token rotated" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Trend" title="Daily active users by platform" className="lg:col-span-2">
          {series.length === 0 ? (
            <NoData what="activity" historyStarts={data?.history_starts} />
          ) : (
            <AreaChart
              data={series}
              config={{
                Web: { label: "Web", color: CHART_COLORS[0] },
                iOS: { label: "iOS", color: CHART_COLORS[1] },
                Android: { label: "Android", color: CHART_COLORS[2] },
                Unknown: { label: "Unknown", color: CHART_COLORS[7] },
              }}
              areas={[{ dataKey: "Web" }, { dataKey: "iOS" }, { dataKey: "Android" }, { dataKey: "Unknown" }]}
              height={250}
            />
          )}
        </SectionCard>

        <SectionCard eyebrow="Devices" title="Registered for push">
          {(push.by_platform ?? []).length === 0 ? (
            <NoData what="devices" />
          ) : (
            <DonutChart
              data={(push.by_platform ?? []).map((p: any, i: number) => ({
                name: p.platform === "ios" ? "iOS" : p.platform === "android" ? "Android" : "Unknown",
                value: p.count,
                fill: CHART_COLORS[i % CHART_COLORS.length],
              }))}
              centerLabel="Devices"
              height={200}
            />
          )}
          <div className="mt-3">
            <StatRows
              rows={[
                { label: "Creators reachable", value: push.creators_reachable ?? 0 },
                { label: "Businesses reachable", value: push.businesses_reachable ?? 0 },
              ]}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="When"
        title="Weekday × hour activity (IST)"
      >
        {(data?.heatmap ?? []).length === 0 ? (
          <NoData what="activity" historyStarts={data?.history_starts} />
        ) : (
          <WeekHourHeatmap cells={data.heatmap} />
        )}
      </SectionCard>

      <SectionCard eyebrow="Versions" title="App versions in use" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={data?.versions ?? []}
          columns={[
            { key: "platform", label: "Platform", render: (r: any) => (r.platform === "ios" ? "iOS" : "Android") },
            { key: "version", label: "Version" },
            { key: "users", label: "Active users", align: "right" },
          ]}
          empty={<NoData what="version data" historyStarts={data?.history_starts} />}
        />
        <p className="px-5 pt-3 text-xs text-content-muted">
          Version and platform come from the app itself, so they fill in as people open the updated build.
        </p>
      </SectionCard>
    </AdminPage>
  );
}
