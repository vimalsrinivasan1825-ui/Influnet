"use client";

/**
 * Marketplace analytics — campaigns, projects and requests, i.e. the
 * "Property Analytics" of this product (migration 159).
 */

import { useState } from "react";
import { Store } from "lucide-react";
import { DonutChart, CHART_COLORS } from "@/components/ui/chart";
import { SegmentedTabs } from "@/components/ui/tabs";
import {
  AdminPage, DataTable, DateRangeBar, KpiRow, SectionCard, StatRows,
  defaultRange, nf, pct, prettyStage, useInsight,
} from "@/components/dashboard/admin/kit";

type Tab = "campaigns" | "projects" | "requests";

export default function MarketplacePage() {
  const [range, setRange] = useState(defaultRange(30));
  const [tab, setTab] = useState<Tab>("projects");
  const { data, loading, error, reload } = useInsight<any>("marketplace", range);
  const c = data?.campaigns ?? {};
  const p = data?.projects ?? {};
  const r = data?.requests ?? {};

  const donut = (obj: Record<string, number> | undefined) =>
    Object.entries(obj ?? {}).map(([name, value], i) => ({
      name: prettyStage(name),
      value: Number(value),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

  return (
    <AdminPage
      eyebrow="Marketplace"
      title="Campaigns, projects & requests"
      subtitle="What is being listed, what turns into work, and what quietly stalls"
      icon={<Store />}
      error={error}
      actions={<DateRangeBar range={range} onChange={setRange} onRefresh={reload} />}
    >
      <SegmentedTabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: "projects", label: "Projects" },
          { value: "campaigns", label: "Campaigns" },
          { value: "requests", label: "Requests" },
        ]}
      />

      {tab === "projects" && (
        <>
          <KpiRow
            loading={loading}
            columns={5}
            items={[
              { label: "Active", value: nf.format(p.by_status?.active ?? 0) },
              { label: "Completed", value: nf.format(p.by_status?.completed ?? 0), tone: "success" },
              { label: "Cancelled", value: nf.format(p.by_status?.cancelled ?? 0), tone: "warning", inverse: true },
              { label: "Completion rate", value: pct(p.completion_rate, 1), tone: "info" },
              { label: "Median duration", value: p.median_duration_days != null ? `${p.median_duration_days} d` : "—", tone: "neutral" },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard eyebrow="Mix" title="Projects by status">
              <DonutChart data={donut(p.by_status)} centerLabel="Projects" height={220} />
            </SectionCard>
            <SectionCard eyebrow="Why they stop" title="Cancellation reasons">
              <StatRows rows={(p.cancel_reasons ?? []).map((x: any) => ({ label: prettyStage(x.reason), value: x.count }))} />
            </SectionCard>
            <SectionCard eyebrow="Where they stop" title="Cancelled at stage">
              <StatRows rows={(p.cancelled_at_stage ?? []).map((x: any) => ({ label: prettyStage(x.stage), value: x.count }))} />
            </SectionCard>
          </div>
          <SectionCard
            eyebrow="Needs a nudge"
            title="Live projects with no activity for a week"
            bodyClassName="px-0 sm:px-0"
          >
            <DataTable
              loading={loading}
              rows={p.stuck ?? []}
              onRowClick={(row: any) => { window.location.href = `/dashboard/admin/projects/${row.id}`; }}
              columns={[
                { key: "title", label: "Project", render: (row: any) => <span className="font-semibold">{row.title}</span> },
                { key: "stage", label: "Stage", render: (row: any) => prettyStage(row.stage) },
                { key: "owner", label: "Owner" },
                { key: "counterparty", label: "Other side" },
                { key: "days_idle", label: "Days idle", align: "right" },
              ]}
            />
          </SectionCard>
        </>
      )}

      {tab === "campaigns" && (
        <>
          <KpiRow
            loading={loading}
            columns={5}
            items={[
              { label: "Live", value: nf.format(c.by_status?.live ?? 0) },
              { label: "Published in range", value: nf.format(c.created_in_range ?? 0), tone: "info" },
              { label: "Applications", value: nf.format(c.applications_in_range ?? 0), tone: "success" },
              { label: "Median applications", value: c.median_applications ?? "—", tone: "neutral" },
              { label: "Live with no applicants", value: nf.format(c.live_without_applications ?? 0), tone: (c.live_without_applications ?? 0) > 0 ? "warning" : "success", inverse: true },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard eyebrow="Mix" title="Campaigns by status">
              <DonutChart data={donut(c.by_status)} centerLabel="Campaigns" height={220} />
            </SectionCard>
            <SectionCard eyebrow="Demand" title="Top categories">
              <StatRows rows={(c.top_categories ?? []).map((x: any) => ({ label: x.category, value: x.count }))} />
            </SectionCard>
            <SectionCard eyebrow="Where" title="Top locations">
              <StatRows rows={(c.top_locations ?? []).map((x: any) => ({ label: x.location, value: x.count }))} />
            </SectionCard>
          </div>
          <SectionCard eyebrow="Outcomes" title="What happens to applications">
            <StatRows rows={Object.entries(c.application_outcomes ?? {}).map(([k, v]) => ({ label: prettyStage(k), value: Number(v) }))} />
            <p className="mt-3 text-xs text-content-muted">
              Median time to the first application: {c.median_hours_to_first_application != null ? `${c.median_hours_to_first_application} hours` : "not enough data"}.
            </p>
          </SectionCard>
        </>
      )}

      {tab === "requests" && (
        <>
          <KpiRow
            loading={loading}
            columns={5}
            items={[
              { label: "Sent in range", value: nf.format(r.sent_in_range ?? 0) },
              { label: "Accept rate", value: pct(r.accept_rate, 1), tone: "success" },
              { label: "Median response", value: r.median_response_hours != null ? `${r.median_response_hours} h` : "—", tone: "info" },
              { label: "Awaiting reply", value: nf.format(r.awaiting_response ?? 0), tone: "warning" },
              { label: "Waiting 48h+", value: nf.format(r.awaiting_over_48h ?? 0), tone: (r.awaiting_over_48h ?? 0) > 0 ? "warning" : "success", inverse: true },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard eyebrow="Requests" title="By status">
              <StatRows rows={Object.entries(r.by_status ?? {}).map(([k, v]) => ({ label: prettyStage(k), value: Number(v) }))} />
            </SectionCard>
            <SectionCard eyebrow="Proposals" title="Deal terms sent after a request">
              <StatRows rows={Object.entries(r.proposals ?? {}).map(([k, v]) => ({ label: prettyStage(k), value: Number(v) }))} />
            </SectionCard>
          </div>
        </>
      )}
    </AdminPage>
  );
}
