"use client";

/**
 * Customer tracking — the CRM list of everyone with an account, with the
 * lifecycle stage they have actually reached (migration 159).
 * Source: /api/admin/insights/customers.
 */

import { useState } from "react";
import { Search, Users } from "lucide-react";
import {
  AdminPage, Badge, Button, DataTable, ExportButton, Input, KpiRow, SectionCard,
  ago, buildQuery, dateOnly, nf, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

const CREATOR_STAGES = ["signed_up", "profile_started", "ownership_confirmed", "verified", "in_conversation", "in_project", "completed_project", "repeat"];
const BUSINESS_STAGES = ["signed_up", "approved", "browsed", "reached_out", "in_project", "paying", "repeat"];

const STAGE_LABEL: Record<string, string> = {
  signed_up: "Signed up", profile_started: "Profile started", ownership_confirmed: "Ownership confirmed",
  verified: "Verified", in_conversation: "In conversation", in_project: "In a project",
  completed_project: "Completed a project", repeat: "Repeat", approved: "Approved",
  browsed: "Browsing", reached_out: "Reached out", paying: "Paying",
};

export default function CustomerTrackingPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [stage, setStage] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);

  const params = { search: query, role, stage, tier, sort, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("customers", null, params);
  const summary = data?.summary ?? {};
  const stages = role === "business_owner" ? BUSINESS_STAGES : role === "influencer" ? CREATOR_STAGES : [...new Set([...CREATOR_STAGES, ...BUSINESS_STAGES])];

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Customer tracking"
      subtitle="Everyone on the platform, what stage they reached, and what they are worth"
      icon={<Users />}
      error={error}
      actions={<ExportButton path={`/api/admin/insights/customers?${buildQuery(null, { ...params, limit: 500, format: "csv" })}`} filename="influnet-customers.csv" />}
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Creators", value: nf.format(summary.creators ?? 0) },
          { label: "Businesses", value: nf.format(summary.businesses ?? 0), tone: "info" },
          { label: "On Pro", value: nf.format(summary.pro ?? 0), tone: "warning" },
          { label: "Dormant 14d+", value: nf.format(summary.dormant_14d ?? 0), tone: "neutral" },
        ]}
      />

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} people`}
        title="Directory"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(search); }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, company…"
                className="h-8 w-48 text-xs"
              />
              <Button type="submit" variant="surface" size="sm"><Search /></Button>
            </form>
            <Select value={role} onChange={(v) => { setRole(v); setStage(""); setPage(0); }} options={[["", "All roles"], ["influencer", "Creators"], ["business_owner", "Businesses"]]} />
            <Select value={stage} onChange={(v) => { setStage(v); setPage(0); }} options={[["", "All stages"], ...stages.map((s) => [s, STAGE_LABEL[s] ?? s] as [string, string])]} />
            <Select value={tier} onChange={(v) => { setTier(v); setPage(0); }} options={[["", "All plans"], ["free", "Free"], ["pro", "Pro"]]} />
            <Select value={sort} onChange={(v) => { setSort(v); setPage(0); }} options={[["recent", "Recently active"], ["gmv", "Highest value"], ["projects", "Most projects"], ["oldest", "Oldest first"]]} />
          </div>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total}
          page={page}
          onPage={(p) => { setPage(p); reload(); }}
          onRowClick={(r: any) => { window.location.href = `/dashboard/admin/users/${r.id}`; }}
          columns={[
            {
              key: "name",
              label: "Name",
              render: (r: any) => (
                <div className="min-w-0">
                  <p className="truncate font-semibold text-content">{r.name || r.company_name || "—"}</p>
                  <p className="truncate text-xs text-content-muted">{r.email}</p>
                </div>
              ),
            },
            { key: "role", label: "Role", render: (r: any) => <Badge variant={r.role === "influencer" ? "brand" : "info"} size="sm">{r.role === "influencer" ? "Creator" : "Business"}</Badge> },
            { key: "stage", label: "Stage", render: (r: any) => <Badge variant="neutral" size="sm">{STAGE_LABEL[r.stage] ?? r.stage}</Badge> },
            { key: "tier", label: "Plan", render: (r: any) => (r.tier === "pro" ? <Badge variant="pro" size="sm">Pro</Badge> : <span className="text-xs text-content-muted">Free</span>) },
            { key: "city", label: "City", render: (r: any) => r.city || "—" },
            { key: "projects", label: "Projects", align: "right", render: (r: any) => `${r.completed}/${r.projects}` },
            { key: "value", label: "Value", align: "right", render: (r: any) => rupees((r.paid_paise ?? 0) + (r.earned_paise ?? 0), { compact: true }) },
            { key: "last_active_at", label: "Last active", align: "right", render: (r: any) => <span title={dateOnly(r.last_active_at)}>{ago(r.last_active_at)}</span> },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}
