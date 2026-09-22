"use client";

/**
 * CRM leads — brands and creators the team sources offline, before they have an
 * account (migration 160). A lead links itself to the account automatically
 * when that person signs up with the same email or phone.
 */

import { useState } from "react";
import { ContactRound, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Badge, Button, DataTable, ErrorBanner, ExportButton, Input, KpiRow,
  SectionCard, ago, buildQuery, dateOnly, nf, pct, useInsight,
} from "@/components/dashboard/admin/kit";

const STAGES = ["new", "contacted", "interested", "invited", "signed_up", "active", "lost"];
const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", interested: "Interested", invited: "Invited",
  signed_up: "Signed up", active: "Active", lost: "Lost",
};
const STAGE_VARIANT: Record<string, any> = {
  new: "neutral", contacted: "info", interested: "brand", invited: "warning",
  signed_up: "success", active: "success", lost: "danger",
};

export default function LeadsPage() {
  const [stage, setStage] = useState("");
  const [due, setDue] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const params = { stage, due: due ? 1 : "", search: query, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("leads", null, params);
  const s = data?.summary ?? {};

  const move = async (lead: any, next: string) => {
    await apiFetch(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ stage: next }) });
    reload();
  };

  return (
    <AdminPage
      eyebrow="Engagement"
      title="Leads"
      subtitle="People the team is talking to before they sign up — and who owes them a follow-up"
      icon={<ContactRound />}
      error={error}
      actions={
        <div className="flex gap-2">
          <ExportButton path={`/api/admin/insights/leads?${buildQuery(null, { ...params, limit: 500, format: "csv" })}`} filename="influnet-leads.csv" />
          <Button variant="brand" size="lg" onClick={() => setAdding((v) => !v)}><Plus /> Add lead</Button>
        </div>
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: "Open leads", value: nf.format(STAGES.slice(0, 4).reduce((a, st) => a + (s.by_stage?.[st] ?? 0), 0)) },
          { label: "Follow-ups due", value: nf.format(s.due_today ?? 0), tone: (s.due_today ?? 0) > 0 ? "warning" : "success" },
          { label: "Signed up", value: nf.format(s.converted ?? 0), tone: "success" },
          { label: "Conversion", value: pct(s.conversion_rate, 1), tone: "info" },
        ]}
      />

      {adding && <AddLead onDone={() => { setAdding(false); reload(); }} />}

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} leads`}
        title="Pipeline"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(search); }} className="flex items-center gap-1.5">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, company…" className="h-8 w-40 text-xs" />
              <Button type="submit" variant="surface" size="sm"><Search /></Button>
            </form>
            <Button variant={due ? "brand" : "surface"} size="sm" onClick={() => { setDue((v) => !v); setPage(0); }}>
              Due now
            </Button>
            <select value={stage} onChange={(e) => { setStage(e.target.value); setPage(0); }} className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft">
              <option value="">All stages</option>
              {STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
            </select>
          </div>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total}
          page={page}
          onPage={setPage}
          columns={[
            { key: "name", label: "Lead", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">{r.name}</p>
                <p className="truncate text-xs text-content-muted">{r.company || r.handle || r.email || "—"}</p>
              </div>
            ) },
            { key: "kind", label: "Type", render: (r: any) => <Badge size="sm" variant={r.kind === "creator" ? "brand" : "info"}>{r.kind}</Badge> },
            { key: "stage", label: "Stage", render: (r: any) => (
              <select
                value={r.stage}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => void move(r, e.target.value)}
                className="rounded-lg border border-hairline bg-surface-card px-1.5 py-1 text-xs font-semibold"
              >
                {STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
              </select>
            ) },
            { key: "source", label: "Source", render: (r: any) => r.source || "—" },
            { key: "owner_name", label: "Owner", render: (r: any) => r.owner_name || "—" },
            { key: "next_follow_up", label: "Follow up", render: (r: any) => (
              r.next_follow_up
                ? <span className={new Date(r.next_follow_up) <= new Date() ? "font-bold text-warn" : ""}>{dateOnly(r.next_follow_up)}</span>
                : "—"
            ) },
            { key: "matched", label: "Account", render: (r: any) => (
              r.matched_user_id
                ? <Badge size="sm" variant="success">Signed up</Badge>
                : <span className="text-xs text-content-muted">—</span>
            ) },
            { key: "updated_at", label: "Updated", align: "right", render: (r: any) => ago(r.updated_at) },
          ]}
          empty={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-content">No leads yet.</p>
              <p className="mt-1 text-sm text-content-muted">Add the brands and creators you are already talking to.</p>
            </div>
          }
        />
      </SectionCard>
    </AdminPage>
  );
}

function AddLead({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ kind: "business", name: "", company: "", email: "", phone: "", handle: "", city: "", source: "event", next_follow_up: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true);
    setErr("");
    const res = await apiFetch("/api/admin/leads", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        handle: form.handle || null,
        city: form.city || null,
        next_follow_up: form.next_follow_up || null,
      }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not save this lead"); return; }
    onDone();
  };

  return (
    <SectionCard eyebrow="New" title="Add a lead">
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-content-muted">Type</span>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-10 rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm">
            <option value="business">Business</option>
            <option value="creator">Creator</option>
          </select>
        </label>
        {([["name", "Name"], ["company", "Company"], ["email", "Email"], ["phone", "Phone"], ["handle", "Handle"], ["city", "City"]] as [keyof typeof form, string][]).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-content-muted">{label}</span>
            <Input value={form[key] as string} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </label>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-content-muted">Source</span>
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="h-10 rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm">
            {["event", "referral", "instagram", "cold_call", "inbound", "other"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-content-muted">Follow up on</span>
          <Input type="date" value={form.next_follow_up} onChange={(e) => setForm({ ...form, next_follow_up: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="lg" onClick={onDone}>Cancel</Button>
        <Button variant="brand" size="lg" disabled={busy || !form.name} onClick={save}>{busy ? "Saving…" : "Save lead"}</Button>
      </div>
    </SectionCard>
  );
}
