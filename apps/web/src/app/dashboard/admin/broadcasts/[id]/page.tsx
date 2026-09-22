"use client";

/**
 * One broadcast: what it says, who it reached, and what happened to every
 * delivery. Also where you test it on your own phone, pause it, or cancel it.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Ban, Megaphone, Pause, Play, Send, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Badge, Button, DataTable, KpiRow, SectionCard, StatRows,
  dateTime, nf, pct,
} from "@/components/dashboard/admin/kit";

const STATUS_VARIANT: Record<string, any> = {
  delivered: "success", sent: "info", queued: "neutral", deferred: "warning",
  skipped: "neutral", error: "danger", sending: "warning",
};

export default function BroadcastDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ limit: "50", offset: String(page * 50) });
    if (filter) q.set("status", filter);
    const res = await apiFetch<{ data: any }>(`/api/admin/broadcasts/${id}?${q}`);
    if (!res.ok || !res.data) setError(res.error || "Could not load this broadcast");
    else { setError(""); setData(res.data.data); }
    setLoading(false);
  }, [id, filter, page]);

  useEffect(() => { if (id) void load(); }, [id, load]);

  const act = async (action: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(action);
    setNote("");
    const res = await apiFetch<any>(`/api/admin/broadcasts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    setBusy("");
    if (!res.ok) {
      setNote(res.error || "That did not work.");
      return;
    }
    setNote(
      action === "test" ? "Test sent to your own devices."
        : action === "send_now" ? `Sending to ${nf.format(res.data?.recipients ?? 0)} people.`
        : "Done.",
    );
    void load();
  };

  const b = data?.broadcast ?? {};
  const runs = data?.runs ?? [];
  const totals = runs.filter((r: any) => !r.is_test).reduce(
    (acc: any, r: any) => ({
      targeted: acc.targeted + (r.targeted ?? 0),
      sent: acc.sent + Number(r.stats?.sent ?? 0),
      delivered: acc.delivered + Number(r.stats?.delivered ?? 0),
      opened: acc.opened + Number(r.stats?.opened ?? 0),
      errors: acc.errors + Number(r.stats?.errors ?? 0),
      skipped: acc.skipped + Number(r.stats?.skipped ?? 0),
    }),
    { targeted: 0, sent: 0, delivered: 0, opened: 0, errors: 0, skipped: 0 },
  );

  return (
    <AdminPage
      eyebrow="Engagement"
      title={b.name || "Broadcast"}
      subtitle={b.title}
      icon={<Megaphone />}
      error={error}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/admin/broadcasts")}>
            <ArrowLeft /> All broadcasts
          </Button>
          <Button variant="surface" size="sm" disabled={!!busy} onClick={() => act("test")}>
            <Smartphone /> Test on my phone
          </Button>
          {(b.status === "draft" || b.status === "paused") && (
            <Button variant="brand" size="sm" disabled={!!busy} onClick={() => act("send_now", "Send this to everyone in the audience now?")}>
              <Send /> Send now
            </Button>
          )}
          {b.status === "scheduled" && (
            <Button variant="surface" size="sm" disabled={!!busy} onClick={() => act("pause")}>
              <Pause /> Pause
            </Button>
          )}
          {b.status === "paused" && (
            <Button variant="surface" size="sm" disabled={!!busy} onClick={() => act("resume")}>
              <Play /> Resume
            </Button>
          )}
          {["scheduled", "paused", "sending"].includes(b.status) && (
            <Button variant="destructive" size="sm" disabled={!!busy} onClick={() => act("cancel", "Cancel this broadcast? Anything still queued will not be sent.")}>
              <Ban /> Cancel
            </Button>
          )}
        </div>
      }
    >
      {note && <p className="text-sm font-semibold text-brand-strong">{note}</p>}

      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Targeted", value: nf.format(totals.targeted) },
          { label: "Sent", value: nf.format(totals.sent), tone: "info" },
          { label: "Delivered", value: nf.format(totals.delivered), tone: "success", hint: totals.sent ? pct((totals.delivered / totals.sent) * 100, 0) : undefined },
          { label: "Opened", value: nf.format(totals.opened), tone: "warning", hint: totals.delivered ? pct((totals.opened / totals.delivered) * 100, 0) : undefined },
          { label: "Skipped / failed", value: nf.format(totals.skipped + totals.errors), tone: totals.errors > 0 ? "warning" : "neutral", inverse: true },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Message" title="What people see" className="lg:col-span-2">
          <div className="rounded-2xl border border-hairline bg-surface-muted p-4">
            <p className="text-sm font-bold text-content">{b.title}</p>
            <p className="mt-1 text-sm text-content-soft">{b.body}</p>
            {b.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image_url} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
            )}
            {b.deep_link && (
              <p className="mt-3 text-xs text-content-muted">
                Opens <code className="rounded bg-surface-card px-1 py-0.5">{b.deep_link}</code>
                {b.cta_label ? ` · button "${b.cta_label}"` : ""}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[b.status] ?? "neutral"}>{b.status}</Badge>
            {(b.channels ?? []).map((c: string) => (
              <Badge key={c} variant="outline">{c === "in_app" ? `in-app (${b.in_app_style})` : c}</Badge>
            ))}
            <Badge variant="neutral">
              {b.frequency === "once" ? (b.send_at ? dateTime(b.send_at) : "not scheduled") : `${b.frequency} at ${String(b.time_ist ?? "").slice(0, 5)} IST`}
            </Badge>
            {b.created_by_name && <span className="text-xs text-content-muted">Created by {b.created_by_name}</span>}
          </div>
        </SectionCard>

        <div className="flex flex-col gap-4">
          <SectionCard eyebrow="Why some did not get it" title="Skips and errors">
            <StatRows rows={(data?.skip_reasons ?? []).map((r: any) => ({ label: String(r.reason ?? "unknown").replace(/_/g, " "), value: r.count }))} />
          </SectionCard>
          {b.channels?.includes("in_app") && (
            <SectionCard eyebrow="In-app" title="Pop-up engagement">
              <StatRows
                rows={[
                  { label: "Seen", value: data?.announcement?.seen ?? 0 },
                  { label: "Dismissed", value: data?.announcement?.dismissed ?? 0 },
                  { label: "Clicked", value: data?.announcement?.clicked ?? 0 },
                ]}
              />
            </SectionCard>
          )}
        </div>
      </div>

      <SectionCard eyebrow="Runs" title="Every send of this broadcast" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={runs}
          columns={[
            { key: "started_at", label: "Started", render: (r: any) => dateTime(r.started_at) },
            { key: "is_test", label: "Type", render: (r: any) => (r.is_test ? <Badge size="sm" variant="neutral">Test</Badge> : "Live") },
            { key: "targeted", label: "Targeted", align: "right" },
            { key: "sent", label: "Sent", align: "right", render: (r: any) => r.stats?.sent ?? 0 },
            { key: "delivered", label: "Delivered", align: "right", render: (r: any) => r.stats?.delivered ?? 0 },
            { key: "errors", label: "Errors", align: "right", render: (r: any) => r.stats?.errors ?? 0 },
            { key: "finished_at", label: "Finished", align: "right", render: (r: any) => (r.finished_at ? dateTime(r.finished_at) : "in progress") },
          ]}
        />
      </SectionCard>

      <SectionCard
        eyebrow={`${nf.format(data?.total_deliveries ?? 0)} deliveries`}
        title="Delivery log"
        bodyClassName="px-0 sm:px-0"
        action={
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft"
          >
            <option value="">All</option>
            <option value="delivered">Delivered</option>
            <option value="sent">Sent</option>
            <option value="queued">Queued</option>
            <option value="deferred">Held (quiet hours)</option>
            <option value="skipped">Skipped</option>
            <option value="error">Failed</option>
          </select>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.deliveries ?? []}
          total={data?.total_deliveries}
          page={page}
          onPage={setPage}
          columns={[
            { key: "user_name", label: "Person", render: (r: any) => (
              <Link href={`/dashboard/admin/users/${r.user_id}`} className="font-semibold text-content hover:text-brand">
                {r.user_name || "—"}
              </Link>
            ) },
            { key: "channel", label: "Channel", render: (r: any) => (r.channel === "in_app" ? "in-app" : r.channel) },
            { key: "platform", label: "Device", render: (r: any) => r.platform || "—" },
            { key: "status", label: "Status", render: (r: any) => (
              <div className="min-w-0">
                <Badge size="sm" variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge>
                {(r.skip_reason || r.error_code) && (
                  <p className="truncate text-xs text-content-muted">{(r.skip_reason ?? r.error_code).replace(/_/g, " ")}</p>
                )}
              </div>
            ) },
            { key: "sent_at", label: "Sent", render: (r: any) => dateTime(r.sent_at) },
            { key: "opened_at", label: "Opened", align: "right", render: (r: any) => (r.opened_at ? dateTime(r.opened_at) : "—") },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
