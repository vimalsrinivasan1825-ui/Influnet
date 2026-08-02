"use client";

/**
 * Platform analytics, computed from our own database (see
 * /api/admin/analytics for why this is not PostHog).
 *
 * The funnel is the point of this page. "How many users do we have" was
 * already answerable; "where do creators stop" was not, and that is the
 * question that decides what to build next.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, TrendingDown } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/ui/tabs";

interface GrowthRow {
  day: string;
  signups: number;
  collabs: number;
  projects: number;
  completed: number;
  tickets: number;
}

interface Funnel {
  signed_up: number;
  has_handle: number;
  ownership_done: number;
  verified: number;
  in_collab: number;
  in_project: number;
  completed: number;
}

const FUNNEL_STEPS: { key: keyof Funnel; label: string; note: string }[] = [
  { key: "signed_up", label: "Signed up", note: "Created a creator account" },
  { key: "has_handle", label: "Added a handle", note: "Filled in a social handle" },
  { key: "ownership_done", label: "Proved ownership", note: "Confirmed the bio code" },
  { key: "verified", label: "Verified", note: "Holds the verified badge" },
  { key: "in_collab", label: "In a conversation", note: "Sent or received a request" },
  { key: "in_project", label: "In a project", note: "Reached a real deal" },
  { key: "completed", label: "Completed one", note: "Finished a collaboration" },
];

export default function AdminAnalyticsPage() {
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90">("30");

  const load = useCallback(async (window: string) => {
    setLoading(true);
    const res = await apiFetch<{ growth: GrowthRow[]; funnel: Funnel | null }>(
      `/api/admin/analytics?days=${window}`,
    );
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load analytics");
      setGrowth([]);
      setFunnel(null);
    } else {
      setError("");
      setGrowth(res.data.growth || []);
      setFunnel(res.data.funnel);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const chartData = growth.map((row) => ({
    name: new Date(row.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    Signups: row.signups,
    Requests: row.collabs,
    Projects: row.projects,
  }));

  const top = funnel?.signed_up ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Insights"
        title="Platform analytics"
        subtitle="Computed from the database — accurate even for users who block trackers"
        icon={<BarChart3 />}
        actions={
          <SegmentedTabs
            value={days}
            onValueChange={setDays}
            size="sm"
            tabs={[
              { value: "7", label: "7d" },
              { value: "30", label: "30d" },
              { value: "90", label: "90d" },
            ]}
          />
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      <SectionCard eyebrow={`Last ${days} days`} title="Growth">
        {loading ? (
          <Skeleton className="h-60 w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-content-muted">No data yet.</p>
        ) : (
          <AreaChart
            data={chartData}
            config={{
              Signups: { label: "Signups", color: CHART_COLORS[0] },
              Requests: { label: "Requests", color: CHART_COLORS[1] },
              Projects: { label: "Projects", color: CHART_COLORS[2] },
            }}
            areas={[
              { dataKey: "Signups", color: CHART_COLORS[0] },
              { dataKey: "Requests", color: CHART_COLORS[1] },
              { dataKey: "Projects", color: CHART_COLORS[2] },
            ]}
          />
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Lifetime totals"
        title="Creator funnel — where creators stop"
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : !funnel ? (
          <p className="py-10 text-center text-sm text-content-muted">No data yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {FUNNEL_STEPS.map((step, i) => {
              const value = funnel[step.key] ?? 0;
              const pct = top > 0 ? Math.round((value / top) * 100) : 0;
              const prev = i === 0 ? value : funnel[FUNNEL_STEPS[i - 1].key] ?? 0;
              // Drop-off from the PREVIOUS step, not from the top: that is the
              // number that tells you which screen to go fix.
              const dropped = Math.max(prev - value, 0);
              return (
                <div
                  key={step.key}
                  className="relative overflow-hidden rounded-xl border border-hairline bg-surface-card px-4 py-3"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-brand-soft"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <div className="relative flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-content">{step.label}</p>
                      <p className="text-xs text-content-muted">{step.note}</p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {i > 0 && dropped > 0 && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                          <TrendingDown className="size-3.5" />
                          {dropped} lost
                        </span>
                      )}
                      <span className="text-base font-extrabold tabular-nums text-content">
                        {value}
                      </span>
                      <span className="w-10 text-xs font-semibold tabular-nums text-content-muted">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <Card className="p-4 text-xs leading-relaxed text-content-muted">
        These numbers come straight from Postgres. Product analytics (PostHog)
        is wired but stays completely inactive until{" "}
        <code className="rounded bg-surface-muted px-1 py-0.5">NEXT_PUBLIC_POSTHOG_KEY</code>{" "}
        is set — see docs/operations/ANALYTICS.md.
      </Card>
    </div>
  );
}
