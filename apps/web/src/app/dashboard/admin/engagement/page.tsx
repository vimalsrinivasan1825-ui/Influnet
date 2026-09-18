"use client";

/**
 * Engagement — profile visits, link clicks, contact reveals, saves, pins and
 * notification read rates (migration 159). These are the product's "RB
 * features" equivalents.
 */

import { useState } from "react";
import { Heart } from "lucide-react";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, DataTable, DateRangeBar, KpiRow, SectionCard, StatRows,
  defaultRange, nf, pct, prettyStage, useInsight,
} from "@/components/dashboard/admin/kit";

export default function EngagementPage() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error, reload } = useInsight<any>("engagement", range);
  const t = data?.totals ?? {};
  const nudges = data?.nudges ?? {};

  const series = (data?.views_series ?? []).map((r: any) => ({
    name: new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    "Creator profiles": r.creator_views,
    "Business profiles": r.business_views,
    "Link clicks": r.link_clicks,
  }));

  return (
    <AdminPage
      eyebrow="Marketplace"
      title="Engagement"
      subtitle="Who is being looked at, saved and contacted — and whether our notifications are read"
      icon={<Heart />}
      error={error}
      actions={<DateRangeBar range={range} onChange={setRange} onRefresh={reload} />}
    >
      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Creator profile views", value: nf.format(t.creator_profile_views ?? 0) },
          { label: "Business profile views", value: nf.format(t.business_profile_views ?? 0), tone: "info" },
          { label: "Contact reveals", value: nf.format(t.contact_reveals ?? 0), tone: "success" },
          { label: "Saves", value: nf.format(t.saves ?? 0), tone: "warning" },
          { label: "Notifications sent", value: nf.format(t.notifications ?? 0), tone: "neutral" },
        ]}
      />

      <SectionCard eyebrow="Attention" title="Profile visits and link clicks per day">
        {series.length === 0 ? (
          <p className="py-12 text-center text-sm text-content-muted">Nothing recorded in this range.</p>
        ) : (
          <AreaChart
            data={series}
            config={{
              "Creator profiles": { label: "Creator profiles", color: CHART_COLORS[0] },
              "Business profiles": { label: "Business profiles", color: CHART_COLORS[1] },
              "Link clicks": { label: "Link clicks", color: CHART_COLORS[2] },
            }}
            areas={[{ dataKey: "Creator profiles" }, { dataKey: "Business profiles" }, { dataKey: "Link clicks" }]}
            height={250}
          />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Most viewed" title="Creators people look at">
          <StatRows rows={(data?.most_viewed_creators ?? []).map((x: any) => ({ label: x.name ?? "—", value: x.views }))} />
        </SectionCard>
        <SectionCard eyebrow="Link-in-bio" title="Clicks by destination">
          <StatRows rows={(data?.link_types ?? []).map((x: any) => ({ label: prettyStage(x.type), value: x.count }))} />
        </SectionCard>
        <SectionCard eyebrow="Saved" title="What gets saved">
          <StatRows rows={(data?.saved_kinds ?? []).map((x: any) => ({ label: prettyStage(x.kind), value: x.count }))} />
        </SectionCard>
      </div>

      <SectionCard eyebrow="Our messages" title="Notifications and whether they are read" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={data?.notifications_by_type ?? []}
          columns={[
            { key: "type", label: "Type", render: (r: any) => prettyStage(r.type) },
            { key: "sent", label: "Sent", align: "right" },
            { key: "read", label: "Read", align: "right" },
            { key: "read_rate", label: "Read rate", align: "right", render: (r: any) => pct(r.read_rate, 1) },
            { key: "median_minutes_to_read", label: "Median time to read", align: "right", render: (r: any) => (r.median_minutes_to_read != null ? `${r.median_minutes_to_read} min` : "—") },
          ]}
        />
        <div className="px-5 pt-4">
          <p className="text-sm text-content-soft">
            Re-engagement nudges: <strong>{nf.format(nudges.sent ?? 0)}</strong> sent,{" "}
            <strong>{nf.format(nudges.returned_within_72h ?? 0)}</strong> came back within 72 hours
            {nudges.sent ? ` (${pct((nudges.returned_within_72h / nudges.sent) * 100, 0)})` : ""}.
          </p>
          <p className="mt-1 text-sm text-content-soft">
            Emails: <strong>{nf.format(data?.emails?.sent ?? 0)}</strong> sent
            {data?.emails?.failed ? `, ${nf.format(data.emails.failed)} failed` : ""}.
          </p>
        </div>
      </SectionCard>
    </AdminPage>
  );
}
