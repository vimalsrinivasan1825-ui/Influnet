"use client";

/**
 * Deleted users (Kesavan's list). Deletion is a hard cascade, so this reads the
 * tombstone written before the delete (migration 153) — it deliberately holds
 * no name, email or phone in clear.
 */

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { BarChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, Badge, DataTable, DateRangeBar, ExportButton, KpiRow, SectionCard, StatRows,
  buildQuery, dateTime, defaultRange, nf, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

const REASONS: Record<string, string> = {
  not_useful: "Not useful", privacy: "Privacy", duplicate: "Duplicate account",
  found_alternative: "Went elsewhere", too_expensive: "Too expensive",
  bad_experience: "Bad experience", admin_action: "Removed by admin",
  other: "Other", not_given: "No reason given",
};

export default function DeletedUsersPage() {
  const [range, setRange] = useState(defaultRange(90));
  const [via, setVia] = useState("");
  const [page, setPage] = useState(0);
  const params = { via, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("deleted", range, params);
  const s = data?.summary ?? {};

  const weekly = (s.weekly ?? []).map((w: any) => ({
    name: new Date(w.week).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Self: w.self,
    Admin: w.admin,
  }));

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Deleted users"
      subtitle="Who left, why, and what they had done first. No personal details are kept."
      icon={<UserMinus />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={setRange}
          onRefresh={reload}
          right={<ExportButton path={`/api/admin/insights/deleted?${buildQuery(range, { ...params, limit: 500, format: "csv" })}`} filename={`influnet-deleted-${range.from}.csv`} />}
        />
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Accounts closed", value: nf.format(data?.total ?? 0), tone: "warning" },
          { label: "By the person", value: nf.format(s.self ?? 0) },
          { label: "By an admin", value: nf.format(s.admin ?? 0), tone: "neutral" },
          { label: "Average days on platform", value: s.avg_days_on_platform != null ? `${s.avg_days_on_platform}` : "—", tone: "info" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Trend" title="Deletions per week" className="lg:col-span-2">
          {weekly.length === 0 ? (
            <p className="py-12 text-center text-sm text-content-muted">No deletions in this range.</p>
          ) : (
            <BarChart
              data={weekly}
              config={{ Self: { label: "Self-service", color: CHART_COLORS[3] }, Admin: { label: "By admin", color: CHART_COLORS[1] } }}
              bars={[{ dataKey: "Self", color: CHART_COLORS[3], stackId: "d" }, { dataKey: "Admin", color: CHART_COLORS[1], stackId: "d" }]}
              stacked
              height={230}
            />
          )}
        </SectionCard>
        <SectionCard eyebrow="Why" title="Reasons given">
          <StatRows rows={(s.by_reason ?? []).map((r: any) => ({ label: REASONS[r.reason] ?? r.reason, value: r.count }))} />
        </SectionCard>
      </div>

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} records`}
        title="Closed accounts"
        bodyClassName="px-0 sm:px-0"
        action={
          <select
            value={via}
            onChange={(e) => { setVia(e.target.value); setPage(0); }}
            className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft"
          >
            <option value="">Everyone</option>
            <option value="self">Self-service</option>
            <option value="admin">By an admin</option>
          </select>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total}
          page={page}
          onPage={setPage}
          columns={[
            { key: "deleted_at", label: "Deleted", render: (r: any) => dateTime(r.deleted_at) },
            { key: "role", label: "Role", render: (r: any) => <Badge size="sm" variant={r.role === "influencer" ? "brand" : r.role === "business_owner" ? "info" : "neutral"}>{r.role === "influencer" ? "Creator" : r.role === "business_owner" ? "Business" : r.role}</Badge> },
            { key: "deleted_via", label: "How", render: (r: any) => r.deleted_via === "admin" ? "Admin" : r.deleted_via === "self_mobile" ? "App" : "Web" },
            { key: "reason_code", label: "Reason", render: (r: any) => (
              <div className="min-w-0">
                <p className="text-sm text-content">{REASONS[r.reason_code] ?? "Not given"}</p>
                {r.reason_text && <p className="truncate text-xs text-content-muted" title={r.reason_text}>{r.reason_text}</p>}
              </div>
            ) },
            { key: "city", label: "City", render: (r: any) => r.city || "—" },
            { key: "days", label: "Days here", align: "right", render: (r: any) => r.signed_up_at ? Math.round((new Date(r.deleted_at).getTime() - new Date(r.signed_up_at).getTime()) / 86400000) : "—" },
            { key: "projects", label: "Projects", align: "right", render: (r: any) => `${r.stats?.projects_completed ?? 0}/${r.stats?.projects ?? 0}` },
            { key: "gmv", label: "Value", align: "right", render: (r: any) => rupees(r.stats?.gmv_paise, { compact: true }) },
            { key: "pro", label: "Was Pro", align: "right", render: (r: any) => r.stats?.was_pro ? <Badge size="sm" variant="pro">Pro</Badge> : "—" },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
