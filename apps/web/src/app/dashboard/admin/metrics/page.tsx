"use client";

/**
 * Daily metrics — the per-day table the client's other consoles call "Daily
 * User Metrics" and "Daily Order Metrics", in two tabs over one dataset.
 * Source: /api/admin/insights/daily (migration 158).
 */

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import { SegmentedTabs } from "@/components/ui/tabs";
import {
  AdminPage, DataTable, DateRangeBar, ExportButton, KpiRow, SectionCard,
  buildQuery, defaultRange, nf, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

type Tab = "users" | "marketplace";

export default function DailyMetricsPage() {
  const [range, setRange] = useState(defaultRange(30));
  const [tab, setTab] = useState<Tab>("users");
  const { data, loading, error, reload } = useInsight<any[]>("daily", range);

  const rows = [...(data ?? [])].reverse();
  const sum = (key: string) => (data ?? []).reduce((acc: number, r: any) => acc + (Number(r[key]) || 0), 0);
  const latest = (data ?? [])[(data ?? []).length - 1] ?? {};

  const chart = (data ?? []).map((r: any) => ({
    name: new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    ...(tab === "users"
      ? { DAU: r.dau, WAU: r.wau, Signups: (r.signups_creators ?? 0) + (r.signups_businesses ?? 0) }
      : { Requests: r.requests_sent, Projects: r.projects_created, Completed: r.projects_completed }),
  }));

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Daily metrics"
      subtitle="One row per day, IST. Every column is derived from the database, not sampled."
      icon={<CalendarDays />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={setRange}
          onRefresh={reload}
          right={<ExportButton path={`/api/admin/insights/daily?${buildQuery(range, { format: "csv" })}`} filename={`influnet-daily-${range.from}.csv`} />}
        />
      }
    >
      <SegmentedTabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "users", label: "Users" },
          { value: "marketplace", label: "Marketplace & money" },
        ]}
      />

      {tab === "users" ? (
        <KpiRow
          loading={loading}
          items={[
            { label: "Signups in range", value: nf.format(sum("signups_creators") + sum("signups_businesses")), hint: `${nf.format(sum("signups_creators"))} creators` },
            { label: "DAU (latest day)", value: nf.format(latest.dau ?? 0), tone: "info" },
            { label: "WAU (latest day)", value: nf.format(latest.wau ?? 0), tone: "info" },
            { label: "Verified in range", value: nf.format(sum("verified")), tone: "success" },
          ]}
        />
      ) : (
        <KpiRow
          loading={loading}
          items={[
            { label: "Requests", value: nf.format(sum("requests_sent")) },
            { label: "Projects started", value: nf.format(sum("projects_created")), tone: "info" },
            { label: "Completed", value: nf.format(sum("projects_completed")), tone: "success" },
            { label: "GMV", value: rupees(sum("gmv_paise"), { compact: true }), tone: "success" },
          ]}
        />
      )}

      <SectionCard eyebrow={`${range.from} → ${range.to}`} title="Trend">
        {chart.length === 0 ? (
          <p className="py-12 text-center text-sm text-content-muted">No data in this range.</p>
        ) : (
          <AreaChart
            data={chart}
            config={
              tab === "users"
                ? { DAU: { label: "DAU", color: CHART_COLORS[0] }, WAU: { label: "WAU", color: CHART_COLORS[1] }, Signups: { label: "Signups", color: CHART_COLORS[2] } }
                : { Requests: { label: "Requests", color: CHART_COLORS[0] }, Projects: { label: "Projects", color: CHART_COLORS[1] }, Completed: { label: "Completed", color: CHART_COLORS[2] } }
            }
            areas={
              tab === "users"
                ? [{ dataKey: "DAU" }, { dataKey: "WAU" }, { dataKey: "Signups" }]
                : [{ dataKey: "Requests" }, { dataKey: "Projects" }, { dataKey: "Completed" }]
            }
            height={250}
          />
        )}
      </SectionCard>

      <SectionCard eyebrow="Detail" title="Day by day" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={rows}
          columns={
            tab === "users"
              ? [
                  { key: "day", label: "Day" },
                  { key: "signups_creators", label: "New creators", align: "right" },
                  { key: "signups_businesses", label: "New businesses", align: "right" },
                  { key: "verified", label: "Verified", align: "right" },
                  { key: "dau", label: "DAU", align: "right" },
                  { key: "new_active", label: "First-time active", align: "right" },
                  { key: "wau", label: "WAU", align: "right" },
                  { key: "mau", label: "MAU", align: "right" },
                  { key: "deletions", label: "Deleted", align: "right" },
                ]
              : [
                  { key: "day", label: "Day" },
                  { key: "requests_sent", label: "Requests", align: "right" },
                  { key: "requests_accepted", label: "Accepted", align: "right" },
                  { key: "proposals_sent", label: "Proposals", align: "right" },
                  { key: "projects_created", label: "Projects", align: "right" },
                  { key: "projects_completed", label: "Completed", align: "right" },
                  { key: "campaigns_published", label: "Campaigns", align: "right" },
                  { key: "applications", label: "Applications", align: "right" },
                  { key: "payments_paid", label: "Payments", align: "right" },
                  { key: "gmv", label: "GMV", align: "right", render: (r: any) => rupees(r.gmv_paise) },
                  { key: "pro_paid", label: "Pro", align: "right" },
                ]
          }
        />
      </SectionCard>
    </AdminPage>
  );
}
