"use client";

import {
  Briefcase,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Megaphone,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, Stagger } from "@/components/ui/motion";
import { BarChart, type ChartConfig } from "@/components/ui/chart";
import type { BusinessHomeData } from "./types";
import { BrandEarningsChart } from "@/components/dashboard/brand-earnings-chart";
const pipelineConfig: ChartConfig = {
  value: { label: "Collabs", color: "var(--brand)" },
};

export function BusinessHomeView({ data }: { data: BusinessHomeData }) {
  const s = data.stats;
  const p = data.profile;
  const company = p?.company_name || "Your brand";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      {/* Header */}
      <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={company} size="lg" square />
          <div className="min-w-0">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
              Brand partner portal
            </p>
            <h1 className="truncate text-xl font-extrabold tracking-tight text-content sm:text-2xl">
              Welcome back, {p?.name || "there"}
            </h1>
            {p?.industry && (
              <p className="text-sm text-content-soft">{company} · {p.industry}</p>
            )}
          </div>
        </div>
        {/* Discover feature temporarily disabled */}
      </Reveal>

      {/* KPIs */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" start={0.05}>
        <StatCard
          label="Pipeline value"
          value={`₹${s.pipeline_value.toLocaleString()}`}
          hint="Active & pending budgets"
          tone="brand"
          icon={<DollarSign />}
        />
        <StatCard
          label="Active campaigns"
          value={s.active_collabs_count}
          hint="Running now"
          tone="info"
          icon={<Briefcase />}
        />
        <StatCard
          label="Pending"
          value={s.pending_collabs_count}
          hint="Awaiting creators"
          tone="warning"
          icon={<Clock />}
        />
        <StatCard
          label="Completed"
          value={s.completed_collabs_count}
          hint={s.completed_value ? `₹${s.completed_value.toLocaleString()} delivered` : "Delivered & settled"}
          tone="success"
          icon={<CheckCircle2 />}
        />
      </Stagger>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.1} className="lg:col-span-2">
          <SectionCard eyebrow="Pipeline" title="Spend by creator" className="h-full">
            {data.earnings_series && data.earnings_series.length > 0 ? (
              <BrandEarningsChart
                endpoint="/api/business/dashboard"
                initialData={data.earnings_by_brand ?? []}
                initialSeries={data.earnings_series}
                initialRange={data.earnings_range ?? "week"}
                emptyLabel="No spend yet"
              />
            ) : (
              <BrandEarningsChart
                endpoint="/api/business/dashboard"
                initialData={data.weekly_spend.map((w) => ({ period: w.week, spend: w.spend }))}
                initialSeries={[{ key: "spend", label: "Spend" }]}
                initialRange="week"
                emptyLabel="No spend yet"
              />
            )}
          </SectionCard>
        </Reveal>
        <Reveal delay={0.15}>
          <SectionCard eyebrow="Pipeline" title="Campaign stages" className="h-full">
            {data.pipeline_data.some((d) => d.value > 0) ? (
              <BarChart
                data={data.pipeline_data}
                config={pipelineConfig}
                xKey="name"
                bars={[{ dataKey: "value" }]}
                height={220}
              />
            ) : (
              <EmptyState
                icon={<Megaphone />}
                title="Pipeline is empty"
                description="Start a campaign to see stages here."
              />
            )}
          </SectionCard>
        </Reveal>
      </div>

      {/* Recent collabs */}
      <Reveal delay={0.2}>
        <SectionCard
          eyebrow="Activity"
          title="Recent collaborations"
          action={
            <ButtonLink href="/dashboard/projects" variant="link" size="sm">
              View all
            </ButtonLink>
          }
        >
          {!data.recent_collabs || data.recent_collabs.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title="No collaborations yet"
              description="Wait for creators to send pitches or connect with them."
              action={null}
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.recent_collabs.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-muted px-3.5 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-content">{c.name}</p>
                      <p className="truncate text-xs text-content-muted">
                        {c.platform} · {c.reach} followers
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold text-content">{c.amount}</span>
                    <Badge variant={statusVariant(c.status)} size="sm" dot>
                      {c.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </Reveal>
    </div>
  );
}
