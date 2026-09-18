"use client";

/**
 * Incomplete signups — the four places people stop before they are useful to
 * the marketplace, each with a Nudge action (migration 159 + broadcasts).
 */

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Badge, Button, DataTable, ExportButton, SectionCard,
  ago, buildQuery, dateOnly, nf, useInsight,
} from "@/components/dashboard/admin/kit";

const BUCKETS: { key: string; label: string; hint: string }[] = [
  { key: "orphan_auth", label: "Account, no profile", hint: "Signed up, never finished the wizard" },
  { key: "creator_no_handle", label: "Creator, no handle", hint: "No Instagram or YouTube added" },
  { key: "creator_no_ownership", label: "Creator, unproven", hint: "Handle added, bio code not confirmed" },
  { key: "creator_not_verified", label: "Creator, unverified", hint: "Ownership done, badge not granted" },
  { key: "business_pending_approval", label: "Business, awaiting approval", hint: "Waiting on us" },
  { key: "business_no_activity", label: "Business, idle", hint: "Approved but never reached out" },
];

export default function IncompleteSignupsPage() {
  const [bucket, setBucket] = useState(BUCKETS[0].key);
  const [page, setPage] = useState(0);
  const [nudging, setNudging] = useState(false);
  const [note, setNote] = useState("");
  const params = { bucket, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("incomplete", null, params);
  const counts = data?.counts ?? {};

  const nudge = async () => {
    const ids = (data?.rows ?? []).filter((r: any) => r.reachable_push).map((r: any) => r.id);
    if (ids.length === 0) {
      setNote("Nobody on this page has the app installed, so there is nobody to push to.");
      return;
    }
    if (!window.confirm(`Send a reminder push to ${ids.length} people in "${BUCKETS.find((b) => b.key === bucket)?.label}"?`)) return;
    setNudging(true);
    const copy = BUCKET_COPY[bucket] ?? BUCKET_COPY.default;
    const created = await apiFetch<{ broadcast: { id: string } }>("/api/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        name: `Nudge — ${bucket} — ${new Date().toISOString().slice(0, 10)}`,
        kind: "system",
        title: copy.title,
        body: copy.body,
        deep_link: copy.link,
        channels: ["push", "in_app"],
        audience: { user_ids: ids },
      }),
    });
    if (!created.ok || !created.data) {
      setNote(created.error || "Could not create the nudge.");
      setNudging(false);
      return;
    }
    const sent = await apiFetch(`/api/admin/broadcasts/${created.data.broadcast.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "send_now" }),
    });
    setNote(sent.ok ? `Sent to ${ids.length} people.` : sent.error || "Could not send the nudge.");
    setNudging(false);
  };

  return (
    <AdminPage
      eyebrow="Workspace"
      title="Incomplete signups"
      subtitle="People who started and stopped — and the one action that unblocks each group"
      icon={<UserPlus />}
      error={error}
      actions={<ExportButton path={`/api/admin/insights/incomplete?${buildQuery(null, { ...params, limit: 500, format: "csv" })}`} filename={`influnet-${bucket}.csv`} />}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => { setBucket(b.key); setPage(0); setNote(""); }}
            className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
              bucket === b.key ? "border-brand bg-brand-soft" : "border-hairline bg-surface-card hover:border-content-muted"
            }`}
          >
            <p className="text-2xl font-extrabold tabular-nums text-content">{nf.format(counts[b.key] ?? 0)}</p>
            <p className="text-sm font-bold text-content">{b.label}</p>
            <p className="text-xs text-content-muted">{b.hint}</p>
          </button>
        ))}
      </div>

      {note && <p className="text-sm font-semibold text-brand-strong">{note}</p>}

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} people`}
        title={BUCKETS.find((b) => b.key === bucket)?.label ?? "People"}
        bodyClassName="px-0 sm:px-0"
        action={
          bucket !== "orphan_auth" ? (
            <Button variant="brand" size="sm" onClick={nudge} disabled={nudging || loading}>
              {nudging ? "Sending…" : "Nudge this page"}
            </Button>
          ) : null
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total}
          page={page}
          onPage={setPage}
          columns={[
            { key: "name", label: "Who", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">{r.name || "(no profile yet)"}</p>
                <p className="truncate text-xs text-content-muted">{r.email}</p>
              </div>
            ) },
            { key: "role", label: "Role", render: (r: any) => r.role ? <Badge size="sm" variant={r.role === "influencer" ? "brand" : "info"}>{r.role === "influencer" ? "Creator" : "Business"}</Badge> : <Badge size="sm" variant="neutral">Unknown</Badge> },
            { key: "created_at", label: "Signed up", render: (r: any) => dateOnly(r.created_at) },
            { key: "age_days", label: "Age", align: "right", render: (r: any) => `${r.age_days}d` },
            { key: "last_active_at", label: "Last active", align: "right", render: (r: any) => ago(r.last_active_at) },
            { key: "reachable_push", label: "App", align: "right", render: (r: any) => r.reachable_push ? <Badge size="sm" variant="success">Installed</Badge> : <span className="text-xs text-content-muted">—</span> },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}

const BUCKET_COPY: Record<string, { title: string; body: string; link: string }> = {
  creator_no_handle: { title: "Add your social handle", body: "Brands find you through your Instagram or YouTube. It takes a minute.", link: "/dashboard/profile" },
  creator_no_ownership: { title: "Confirm your account", body: "Add the code to your bio and get the verified badge brands look for.", link: "/dashboard/verification" },
  creator_not_verified: { title: "You are one step from verified", body: "Finish verification so brands can trust your profile.", link: "/dashboard/verification" },
  business_pending_approval: { title: "We are reviewing your account", body: "You will be able to reach creators as soon as approval is done.", link: "/dashboard/home" },
  business_no_activity: { title: "Find your first creator", body: "Search by niche and city, or post a campaign and let creators come to you.", link: "/dashboard/campaigns" },
  default: { title: "Finish setting up", body: "You are a step away from getting started on Influnet.", link: "/dashboard/home" },
};
