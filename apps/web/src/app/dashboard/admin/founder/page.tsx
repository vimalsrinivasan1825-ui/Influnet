"use client";

/**
 * Founder dashboard — "is the business working?" on one screen.
 *
 * Every tile carries a delta against the previous period of the same length,
 * because a number with nothing to compare it to tells you almost nothing.
 * Source: /api/admin/insights/founder (migration 158).
 */

import { useState } from "react";
import {
  BadgeCheck, Building2, CircleDollarSign, Crown, FolderKanban,
  LineChart, Send, Sparkles, Users, Wallet,
} from "lucide-react";
import { AreaChart, BarChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, DateRangeBar, ExportButton, KpiRow, SectionCard, StatRows,
  buildQuery, defaultRange, nf, pct, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

export default function FounderDashboardPage() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error, reload } = useInsight<any>("founder", range);

  const cur = data?.current ?? {};
  const prev = data?.previous ?? {};
  const totals = data?.totals ?? {};
  const activity = data?.activity ?? {};
  const liquidity = data?.liquidity ?? {};
  const series = (data?.series ?? []).map((r: any) => ({
    name: new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Signups: r.signups,
    Active: r.active,
    Requests: r.requests,
    Projects: r.projects,
    GMV: Math.round((r.gmv_paise ?? 0) / 100),
    Pro: Math.round((r.pro_paise ?? 0) / 100),
  }));

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Founder dashboard"
      subtitle="Growth, liquidity and money for the selected period, against the period before it"
      icon={<LineChart />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={setRange}
          onRefresh={reload}
          right={<ExportButton path={`/api/admin/insights/founder?${buildQuery(range, { format: "csv" })}`} filename={`influnet-founder-${range.from}.csv`} />}
        />
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Signups", value: nf.format(cur.signups ?? 0), current: cur.signups, previous: prev.signups, icon: <Users />, hint: `${cur.signups_creators ?? 0} creators · ${cur.signups_businesses ?? 0} businesses` },
          { label: "Active users", value: nf.format(cur.active_users ?? 0), current: cur.active_users, previous: prev.active_users, tone: "info", icon: <Sparkles />, hint: `DAU ${activity.dau ?? 0} · MAU ${activity.mau ?? 0}` },
          { label: "GMV", value: rupees(cur.gmv_paise, { compact: true }), current: cur.gmv_paise, previous: prev.gmv_paise, tone: "success", icon: <CircleDollarSign />, hint: `${cur.payments_paid ?? 0} payments` },
          { label: "Pro revenue", value: rupees(cur.pro_revenue_paise, { compact: true }), current: cur.pro_revenue_paise, previous: prev.pro_revenue_paise, tone: "warning", icon: <Crown />, hint: `MRR ${rupees(totals.mrr_paise, { compact: true })}` },
        ]}
      />

      <KpiRow
        loading={loading}
        items={[
          { label: "Requests", value: nf.format(cur.requests_sent ?? 0), current: cur.requests_sent, previous: prev.requests_sent, icon: <Send />, tone: "brand", hint: `${cur.requests_accepted ?? 0} accepted` },
          { label: "Projects started", value: nf.format(cur.projects_created ?? 0), current: cur.projects_created, previous: prev.projects_created, icon: <FolderKanban />, tone: "info" },
          { label: "Projects completed", value: nf.format(cur.projects_completed ?? 0), current: cur.projects_completed, previous: prev.projects_completed, icon: <BadgeCheck />, tone: "success" },
          { label: "Deletions", value: nf.format(cur.deletions ?? 0), current: cur.deletions, previous: prev.deletions, icon: <Building2 />, tone: cur.deletions > 0 ? "warning" : "neutral", inverse: true, hint: "Accounts closed" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Trend" title="Signups, activity and deals" className="lg:col-span-2">
          {series.length === 0 ? (
            <p className="py-12 text-center text-sm text-content-muted">No data in this range.</p>
          ) : (
            <AreaChart
              data={series}
              config={{
                Signups: { label: "Signups", color: CHART_COLORS[0] },
                Active: { label: "Active", color: CHART_COLORS[1] },
                Requests: { label: "Requests", color: CHART_COLORS[2] },
                Projects: { label: "Projects", color: CHART_COLORS[3] },
              }}
              areas={[
                { dataKey: "Signups", color: CHART_COLORS[0] },
                { dataKey: "Active", color: CHART_COLORS[1] },
                { dataKey: "Requests", color: CHART_COLORS[2] },
                { dataKey: "Projects", color: CHART_COLORS[3] },
              ]}
              height={260}
            />
          )}
        </SectionCard>

        <SectionCard eyebrow="Right now" title="Platform totals">
          <StatRows
            rows={[
              { label: "Creators", value: totals.creators ?? 0 },
              { label: "Businesses", value: totals.businesses ?? 0 },
              { label: "Verified creators", value: totals.verified_creators ?? 0 },
              { label: "Approved businesses", value: totals.approved_businesses ?? 0 },
              { label: "Active projects", value: totals.active_projects ?? 0 },
              { label: "Live campaigns", value: totals.live_campaigns ?? 0 },
              { label: "Pro subscribers", value: totals.active_pro ?? 0 },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Money" title="Revenue per day" className="lg:col-span-2">
          {series.length === 0 ? (
            <p className="py-12 text-center text-sm text-content-muted">No payments in this range.</p>
          ) : (
            <BarChart
              data={series}
              config={{ GMV: { label: "Creator payments (₹)", color: CHART_COLORS[2] }, Pro: { label: "Pro (₹)", color: CHART_COLORS[3] } }}
              bars={[
                { dataKey: "GMV", color: CHART_COLORS[2], stackId: "money" },
                { dataKey: "Pro", color: CHART_COLORS[3], stackId: "money" },
              ]}
              stacked
              height={240}
              prefix="₹"
            />
          )}
        </SectionCard>

        <SectionCard eyebrow="Health" title="Liquidity & queues">
          <div className="flex flex-col gap-3">
            <Metric label="Requests answered in 48h" value={pct(cur.answered_within_48h_pct, 0)} />
            <Metric label="Requests that became projects" value={pct(liquidity.request_to_project_pct, 0)} />
            <Metric label="Live campaigns with applicants" value={pct(liquidity.live_campaigns_with_applications_pct, 0)} />
            <Metric label="Creators who ever had a project" value={pct(liquidity.creators_with_project_pct, 0)} />
            <Metric label="Stickiness (DAU ÷ MAU)" value={pct(activity.stickiness, 0)} />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Queue label="Pending approvals" value={totals.pending_approvals ?? 0} href="/dashboard/admin/approvals" />
              <Queue label="Verifications" value={totals.pending_verifications ?? 0} href="/dashboard/admin/approvals" />
              <Queue label="Open tickets" value={totals.open_tickets ?? 0} href="/dashboard/admin/support" />
              <Queue label="Open reports" value={totals.open_reports ?? 0} href="/dashboard/admin/reports" />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Lifetime" title="Since day one" bodyClassName="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Big label="Creator payments" value={rupees(totals.lifetime_gmv_paise, { compact: true })} icon={<Wallet />} />
        <Big label="Pro revenue" value={rupees(totals.lifetime_pro_paise, { compact: true })} icon={<Crown />} />
        <Big label="People" value={nf.format(totals.users ?? 0)} icon={<Users />} />
        <Big label="MRR" value={rupees(totals.mrr_paise, { compact: true })} icon={<CircleDollarSign />} />
      </SectionCard>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2 last:border-0">
      <span className="text-sm text-content-soft">{label}</span>
      <span className="text-sm font-extrabold tabular-nums text-content">{value}</span>
    </div>
  );
}

function Queue({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <a
      href={href}
      className="rounded-xl border border-hairline bg-surface-muted px-3 py-2 transition-colors hover:border-brand"
    >
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-content-muted">{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-content">{value}</p>
    </a>
  );
}

function Big({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-muted px-4 py-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:size-4">{icon}</span>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-content">{value}</p>
      <p className="text-xs font-medium text-content-muted">{label}</p>
    </div>
  );
}
