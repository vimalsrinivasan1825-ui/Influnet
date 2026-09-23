"use client";

/**
 * Broadcasts — compose a push / in-app pop-up / tutorial / email, target an
 * audience, preview the real recipient count, test it on your own phone, then
 * schedule it once or on a repeat (migration 157).
 *
 * Deliberate friction, in order: nothing sends from the composer, a draft has
 * to be scheduled; the recipient count is fetched live before you can; a send
 * over the approval threshold needs a second admin; quiet hours hold anything
 * promotional until 9am IST.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Send, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Badge, Button, DataTable, ErrorBanner, Input, KpiRow, SectionCard,
  dateTime, nf, useInsight,
} from "@/components/dashboard/admin/kit";

const KIND_LABEL: Record<string, string> = {
  announcement: "Announcement", promo: "Promotion", tutorial: "Tutorial", system: "System", reminder: "Reminder",
};
const STATUS_VARIANT: Record<string, any> = {
  draft: "neutral", scheduled: "info", sending: "warning", sent: "success", paused: "warning", cancelled: "neutral", failed: "danger",
};

export default function BroadcastsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ data: any }>("/api/admin/broadcasts?limit=100");
    if (!res.ok || !res.data) setError(res.error || "Could not load broadcasts");
    else {
      setError("");
      setRows(res.data.data?.rows ?? []);
      setSummary(res.data.data?.summary ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminPage
      eyebrow="Engagement"
      title="Broadcasts"
      subtitle="Push notifications, in-app pop-ups, tutorials and email — to everyone or to a segment"
      icon={<Megaphone />}
      error={error}
      actions={
        <Button variant="brand" size="xl" onClick={() => setComposing(true)}>
          <Plus /> New broadcast
        </Button>
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Scheduled", value: nf.format(summary.scheduled ?? 0), hint: `${summary.recurring ?? 0} repeating` },
          { label: "Sends (30 days)", value: nf.format(summary.sent_30d ?? 0), tone: "info" },
          { label: "Pushes delivered", value: nf.format(summary.push_delivered_30d ?? 0), tone: "success", hint: `${nf.format(summary.push_sent_30d ?? 0)} sent` },
          { label: "Opened", value: nf.format(summary.opened_30d ?? 0), tone: "warning", hint: "Tapped or clicked" },
        ]}
      />

      {composing && <Composer onClose={() => setComposing(false)} onSaved={() => { setComposing(false); void load(); }} />}

      <SectionCard eyebrow={`${rows.length} broadcasts`} title="All broadcasts" bodyClassName="px-0 sm:px-0">
        <DataTable
          loading={loading}
          rows={rows}
          onRowClick={(r: any) => { window.location.href = `/dashboard/admin/broadcasts/${r.id}`; }}
          columns={[
            { key: "name", label: "Name", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">{r.name}</p>
                <p className="truncate text-xs text-content-muted">{r.title}</p>
              </div>
            ) },
            { key: "kind", label: "Kind", render: (r: any) => <Badge size="sm" variant="neutral">{KIND_LABEL[r.kind] ?? r.kind}</Badge> },
            { key: "channels", label: "Channels", render: (r: any) => (
              <div className="flex flex-wrap gap-1">
                {(r.channels ?? []).map((c: string) => (
                  <Badge key={c} size="sm" variant="outline">{c === "in_app" ? "in-app" : c}</Badge>
                ))}
              </div>
            ) },
            { key: "schedule", label: "Schedule", render: (r: any) => (
              r.frequency === "once" ? (r.send_at ? dateTime(r.send_at) : "Not scheduled")
                : `${r.frequency} at ${String(r.time_ist ?? "").slice(0, 5)} IST`
            ) },
            { key: "status", label: "Status", render: (r: any) => <Badge size="sm" variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge> },
            { key: "stats", label: "Sent", align: "right", render: (r: any) => nf.format(r.stats?.sent ?? 0) },
            { key: "opened", label: "Opened", align: "right", render: (r: any) => nf.format(r.stats?.opened ?? 0) },
          ]}
          empty={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-content">No broadcasts yet.</p>
              <p className="mt-1 text-sm text-content-muted">Create one to reach creators or businesses on their phones.</p>
            </div>
          }
        />
      </SectionCard>
    </AdminPage>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

const AUDIENCE_PRESETS: { key: string; label: string; audience: Record<string, unknown> }[] = [
  { key: "everyone", label: "Everyone", audience: { role: "both" } },
  { key: "creators", label: "All creators", audience: { role: "influencer" } },
  { key: "businesses", label: "All businesses", audience: { role: "business_owner" } },
  { key: "creators_verified", label: "Verified creators", audience: { role: "influencer", creator_verification: ["verified"] } },
  { key: "businesses_approved", label: "Approved businesses", audience: { role: "business_owner", business_approval: ["approved"] } },
  { key: "free", label: "Free plan only", audience: { role: "both", tier: ["free"] } },
  { key: "pro", label: "Pro subscribers", audience: { role: "both", tier: ["pro"] } },
  { key: "expiring", label: "Pro expiring in 7 days", audience: { role: "both", pro_expiring_within_days: 7 } },
  { key: "dormant", label: "Away for 14+ days", audience: { role: "both", dormant_for_days: 14 } },
  { key: "app_users", label: "Has the app installed", audience: { role: "both", has_push_device: true } },
  // Platform comes from the device row. Builds older than the platform header
  // are recognised from the request instead, but only once they next call the
  // API — so soon after a release these two under-count, and "Has the app
  // installed" is the safer reach for anything everyone must see.
  { key: "ios", label: "iPhone users", audience: { role: "both", platforms: ["ios"] } },
  { key: "android", label: "Android users", audience: { role: "both", platforms: ["android"] } },
];

function Composer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    kind: "announcement",
    title: "",
    body: "",
    image_url: "",
    deep_link: "",
    cta_label: "",
    channels: ["push", "in_app"] as string[],
    in_app_style: "banner",
    preset: "creators",
    frequency: "once",
    send_at: "",
    time_ist: "10:00",
    by_weekday: [1] as number[],
    by_monthday: 1,
  });
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const audience = AUDIENCE_PRESETS.find((p) => p.key === form.preset)?.audience ?? { role: "both" };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{ data: any }>("/api/admin/broadcasts/preview", {
        method: "POST",
        body: JSON.stringify({ audience, kind: form.kind }),
      });
      if (!cancelled && res.ok) setPreview(res.data?.data ?? null);
    })();
    return () => { cancelled = true; };
  }, [form.preset, form.kind]);

  const save = async (schedule: boolean) => {
    setBusy(true);
    setErr("");
    const payload: Record<string, unknown> = {
      name: form.name || form.title,
      kind: form.kind,
      title: form.title,
      body: form.body,
      image_url: form.image_url || null,
      deep_link: form.deep_link || null,
      cta_label: form.cta_label || null,
      channels: form.channels,
      in_app_style: form.in_app_style,
      audience,
      frequency: form.frequency,
      send_at: form.frequency === "once" && form.send_at ? new Date(form.send_at).toISOString() : null,
      time_ist: form.frequency === "once" ? null : form.time_ist,
      by_weekday: form.frequency === "weekly" ? form.by_weekday : null,
      by_monthday: form.frequency === "monthly" ? form.by_monthday : null,
    };
    const created = await apiFetch<{ broadcast: { id: string } }>("/api/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!created.ok || !created.data) {
      setErr(created.error || "Could not save this broadcast");
      setBusy(false);
      return;
    }
    if (schedule) {
      const res = await apiFetch(`/api/admin/broadcasts/${created.data.broadcast.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: form.send_at ? "schedule" : "send_now" }),
      });
      if (!res.ok) {
        setErr(res.error || "Saved as a draft, but could not schedule it.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onSaved();
  };

  const toggleChannel = (c: string) =>
    setForm((f) => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] }));

  return (
    <SectionCard
      eyebrow="New"
      title="Compose a broadcast"
      action={<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>}
    >
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Internal name" hint="Only you see this">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="September creator update" />
          </Field>

          <Field label="Kind">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm"
            >
              <option value="announcement">Announcement</option>
              <option value="promo">Promotion</option>
              <option value="tutorial">Tutorial</option>
              <option value="reminder">Reminder</option>
              <option value="system">System message</option>
            </select>
          </Field>

          <Field label="Title" hint={`${form.title.length}/65 — what shows on the lock screen`}>
            <Input value={form.title} maxLength={65} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New campaigns in your niche" />
          </Field>

          <Field label="Message" hint={`${form.body.length}/240`}>
            <textarea
              value={form.body}
              maxLength={240}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm"
              placeholder="Three brands are looking for creators like you this week."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens (in-app path)">
              <Input value={form.deep_link} onChange={(e) => setForm({ ...form, deep_link: e.target.value })} placeholder="/dashboard/campaigns" />
            </Field>
            <Field label="Button label">
              <Input value={form.cta_label} maxLength={30} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} placeholder="See campaigns" />
            </Field>
          </div>

          <Field label="Image URL" hint="Shows on Android and in-app. iOS needs a new app build.">
            <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Channels">
            <div className="flex flex-wrap gap-2">
              {[["push", "Push notification"], ["in_app", "In-app"], ["email", "Email"]].map(([c, label]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    form.channels.includes(c) ? "border-brand bg-brand-soft text-brand-strong" : "border-hairline bg-surface-card text-content-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {form.channels.includes("in_app") && (
            <Field label="In-app style">
              <select
                value={form.in_app_style}
                onChange={(e) => setForm({ ...form, in_app_style: e.target.value })}
                className="h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm"
              >
                <option value="toast">Small card (slides in)</option>
                <option value="banner">Banner (stays until dismissed)</option>
                <option value="modal">Pop-up (full attention)</option>
              </select>
            </Field>
          )}

          <Field label="Who gets it">
            <select
              value={form.preset}
              onChange={(e) => setForm({ ...form, preset: e.target.value })}
              className="h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm"
            >
              {AUDIENCE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </Field>

          <div className="rounded-xl border border-hairline bg-surface-muted px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-content">
              <Users className="size-4 text-brand" />
              {preview ? `${nf.format(preview.total)} people` : "Counting…"}
            </div>
            {preview && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-content-muted">
                <li>{nf.format(preview.creators)} creators · {nf.format(preview.businesses)} businesses</li>
                <li>{nf.format(preview.with_push_device)} have the app installed ({nf.format(preview.push_devices)} devices)</li>
                {preview.push_opted_out > 0 && <li>{nf.format(preview.push_opted_out)} opted out of this kind</li>}
              </ul>
            )}
          </div>

          <Field label="When">
            <select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              className="h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm"
            >
              <option value="once">Once</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </Field>

          {form.frequency === "once" ? (
            <Field label="Send at" hint="Leave empty to send as soon as you press Schedule">
              <Input type="datetime-local" value={form.send_at} onChange={(e) => setForm({ ...form, send_at: e.target.value })} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time (IST)">
                <Input type="time" value={form.time_ist} onChange={(e) => setForm({ ...form, time_ist: e.target.value })} />
              </Field>
              {form.frequency === "weekly" && (
                <Field label="Day">
                  <select
                    value={form.by_weekday[0]}
                    onChange={(e) => setForm({ ...form, by_weekday: [Number(e.target.value)] })}
                    className="h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => (
                      <option key={d} value={i + 1}>{d}</option>
                    ))}
                  </select>
                </Field>
              )}
              {form.frequency === "monthly" && (
                <Field label="Day of month">
                  <Input type="number" min={1} max={28} value={form.by_monthday} onChange={(e) => setForm({ ...form, by_monthday: Number(e.target.value) })} />
                </Field>
              )}
            </div>
          )}

          <p className="text-xs text-content-muted">
            Announcements, promotions and tutorials are held between 9pm and 9am IST, and capped at one push per
            person per day. System messages and reminders are not.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-4">
        <Button variant="surface" size="lg" disabled={busy || !form.title || !form.body} onClick={() => save(false)}>
          Save as draft
        </Button>
        <Button variant="brand" size="lg" disabled={busy || !form.title || !form.body || form.channels.length === 0} onClick={() => save(true)}>
          <Send /> {busy ? "Working…" : form.send_at || form.frequency !== "once" ? "Schedule" : "Send now"}
        </Button>
      </div>
      <p className="mt-2 text-right text-xs text-content-muted">
        Open the broadcast afterwards to send yourself a test before it reaches anyone else.
      </p>
    </SectionCard>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.06em] text-content-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-content-muted">{hint}</span>}
    </label>
  );
}
