"use client";

/**
 * Product analytics — both funnels, retention cohorts, stage drop-off and
 * time-to-value. Source: /api/admin/insights/product (migration 158).
 *
 * The creator funnel existed before; the business funnel, cohorts and stage
 * drop-off are new and answer "where does each side stall?".
 */

import { useState } from "react";
import { Activity, TrendingDown } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import {
  AdminPage, CohortGrid, DataTable, FunnelBars, KpiRow, NoData, SectionCard,
  nf, prettyStage, useInsight,
} from "@/components/dashboard/admin/kit";

const CREATOR_NOTES: Record<string, string> = {
  signed_up: "Created a creator account",
  has_handle: "Added a social handle",
  ownership_done: "Confirmed the bio code",
  verified: "Holds the verified badge",
  in_conversation: "Sent or received a request",
  in_project: "Reached a real deal",
  completed: "Finished a collaboration",
  paid: "Received money through the platform",
};

const BUSINESS_NOTES: Record<string, string> = {
  signed_up: "Created a business account",
  profile_done: "Filled in the company profile",
  approved: "Passed the approval gate",
  browsed: "Opened a creator profile",
  reached_out: "Sent a request or published a campaign",
  in_project: "Started a project",
  paid: "Paid a creator",
  repeat: "Ran more than one project",
};

export default function ProductAnalyticsPage() {
  const [side, setSide] = useState<"creator" | "business">("creator");
  const { data, loading, error, reload } = useInsight<any>("product", null, { weeks: 8 });

  const funnel = (side === "creator" ? data?.creator_funnel : data?.business_funnel) ?? [];
  const steps = funnel.map((s: any) => ({
    key: s.key,
    label: s.label,
    value: Number(s.value) || 0,
    note: (side === "creator" ? CREATOR_NOTES : BUSINESS_NOTES)[s.key],
  }));
  const ttv = data?.time_to_value ?? {};
  const cohorts = data?.cohorts ?? [];
  const anyCohortData = cohorts.some((c: any) => (c.weeks ?? []).some((w: any) => w.active > 0));

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Product analytics"
      subtitle="Where each side stalls, how long the good path takes, and whether people come back"
      icon={<Activity />}
      error={error}
      actions={
        <SegmentedTabs
          value={side}
          onValueChange={(v) => setSide(v as "creator" | "business")}
          tabs={[
            { value: "creator", label: "Creators" },
            { value: "business", label: "Businesses" },
          ]}
        />
      }
    >
      <KpiRow
        loading={loading}
        columns={3}
        items={[
          { label: "Signup → verified", value: ttv.signup_to_verified_hours != null ? `${nf.format(Math.round(ttv.signup_to_verified_hours))} h` : "—", hint: "Median, creators" },
          { label: "Signup → first project", value: ttv.signup_to_first_project_hours != null ? `${nf.format(Math.round(ttv.signup_to_first_project_hours / 24))} d` : "—", hint: "Median, both sides", tone: "info" },
          { label: "Project duration", value: ttv.project_duration_days != null ? `${ttv.project_duration_days} d` : "—", hint: "Median, start to complete", tone: "success" },
        ]}
      />

      <SectionCard
        eyebrow="Lifetime totals"
        title={side === "creator" ? "Creator funnel" : "Business funnel"}
      >
        {loading ? <p className="py-10 text-center text-sm text-content-muted">Loading…</p> : <FunnelBars steps={steps} />}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow="Pipeline" title="Where active projects are sitting">
          <DataTable
            loading={loading}
            rows={data?.stage_distribution ?? []}
            columns={[
              { key: "stage", label: "Stage", render: (r: any) => <span className="font-semibold">{prettyStage(r.stage)}</span> },
              { key: "count", label: "Projects", align: "right" },
              { key: "median_days_in_stage", label: "Median days here", align: "right" },
            ]}
            empty={<NoData what="active projects" />}
          />
        </SectionCard>

        <SectionCard
          eyebrow="Drop-off"
          title="Of projects that entered a stage, how many left it"
          action={<TrendingDown className="size-4 text-content-muted" />}
        >
          <DataTable
            loading={loading}
            rows={data?.stage_dropoff ?? []}
            columns={[
              { key: "stage", label: "Stage", render: (r: any) => prettyStage(r.stage) },
              { key: "entered", label: "Entered", align: "right" },
              { key: "left", label: "Moved on", align: "right" },
              {
                key: "rate",
                label: "Continued",
                align: "right",
                render: (r: any) => (r.entered ? `${Math.round((r.left / r.entered) * 100)}%` : "—"),
              },
              { key: "median_hours", label: "Median hours", align: "right" },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Retention"
        title="Weekly signup cohorts — % active in each later week"
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-content-muted">Loading…</p>
        ) : !anyCohortData ? (
          <NoData what="retention history" historyStarts={data?.cohorts?.[0]?.cohort} />
        ) : (
          <CohortGrid cohorts={cohorts} />
        )}
        <p className="mt-3 text-xs text-content-muted">
          Activity history began when daily activity tracking shipped, so cohorts from before that show no
          activity even where people were using the product.
        </p>
      </SectionCard>
    </AdminPage>
  );
}
