"use client";

/**
 * Report builder — pick a dataset and a date range, look at it, export it.
 *
 * Deliberately not a SQL console: the datasets are whitelisted in the database
 * function (migration 160), so there is no way to ask for a table nobody
 * intended to expose. Every export is written to the admin audit log.
 */

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Button, DataTable, DateRangeBar, ExportButton, Input, SectionCard,
  buildQuery, defaultRange, nf,
} from "@/components/dashboard/admin/kit";

const DATASETS: { key: string; label: string; hint: string }[] = [
  { key: "users", label: "People", hint: "Everyone who signed up, with their stage and plan" },
  { key: "projects", label: "Projects", hint: "Every project with status, stage and money" },
  { key: "payments", label: "Payments", hint: "Creator payments, including failures" },
  { key: "subscriptions", label: "Pro orders", hint: "New and renewal Pro purchases" },
  { key: "requests", label: "Requests", hint: "Collaboration requests and response times" },
  { key: "campaigns", label: "Campaigns", hint: "Campaigns and how many applied" },
  { key: "notifications", label: "Notifications", hint: "What we sent and whether it was read" },
  { key: "deleted_accounts", label: "Deleted accounts", hint: "Closed accounts and why" },
];

export default function ReportBuilderPage() {
  const [dataset, setDataset] = useState("users");
  const [range, setRange] = useState(defaultRange(30));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState<any[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = buildQuery(range, { dataset, limit: 100, offset: page * 100 });
    const res = await apiFetch<{ data: any }>(`/api/admin/reports/dataset?${q}`);
    if (!res.ok || !res.data) { setError(res.error || "Could not build this report"); setData(null); }
    else { setError(""); setData(res.data.data); }
    setLoading(false);
  }, [dataset, range, page]);

  const loadSaved = useCallback(async () => {
    const res = await apiFetch<{ reports: any[] }>("/api/admin/reports/saved");
    if (res.ok && res.data) setSaved(res.data.reports);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  const rows = data?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]).slice(0, 9).map((k) => ({
    key: k,
    label: k.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    render: (r: any) => format(r[k]),
  })) : [];

  const save = async () => {
    if (!name) return;
    await apiFetch("/api/admin/reports/saved", {
      method: "POST",
      body: JSON.stringify({ name, dataset, filters: { from: range.from, to: range.to } }),
    });
    setName("");
    void loadSaved();
  };

  return (
    <AdminPage
      eyebrow="Reports"
      title="Report builder"
      subtitle="Pick a dataset, choose a period, export it as a spreadsheet"
      icon={<FileSpreadsheet />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={(r) => { setRange(r); setPage(0); }}
          onRefresh={load}
          right={<ExportButton path={`/api/admin/reports/dataset?${buildQuery(range, { dataset, format: "csv" })}`} filename={`influnet-${dataset}-${range.from}.csv`} />}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {DATASETS.map((d) => (
          <button
            key={d.key}
            onClick={() => { setDataset(d.key); setPage(0); }}
            className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
              dataset === d.key ? "border-brand bg-brand-soft" : "border-hairline bg-surface-card hover:border-content-muted"
            }`}
          >
            <p className="text-sm font-bold text-content">{d.label}</p>
            <p className="text-xs text-content-muted">{d.hint}</p>
          </button>
        ))}
      </div>

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} rows`}
        title={DATASETS.find((d) => d.key === dataset)?.label ?? "Report"}
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex items-center gap-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save this view as…" className="h-8 w-44 text-xs" />
            <Button variant="surface" size="sm" disabled={!name} onClick={save}>Save</Button>
          </div>
        }
      >
        <DataTable
          loading={loading}
          rows={rows}
          columns={columns}
          total={data?.total}
          pageSize={100}
          page={page}
          onPage={setPage}
        />
        <p className="px-5 pt-3 text-xs text-content-muted">
          Showing the first columns of each row; the CSV export has every column. Phone numbers are left out
          unless you are a developer admin, and every export is recorded in the audit log.
        </p>
      </SectionCard>

      {saved.length > 0 && (
        <SectionCard eyebrow="Saved" title="Your saved reports" bodyClassName="px-0 sm:px-0">
          <DataTable
            rows={saved}
            columns={[
              { key: "name", label: "Name" },
              { key: "dataset", label: "Dataset" },
              { key: "filters", label: "Range", render: (r: any) => `${r.filters?.from ?? "—"} → ${r.filters?.to ?? "—"}` },
              { key: "open", label: "", align: "right", render: (r: any) => (
                <Button variant="surface" size="sm" onClick={() => {
                  setDataset(r.dataset);
                  if (r.filters?.from && r.filters?.to) setRange({ from: r.filters.from, to: r.filters.to });
                }}>Open</Button>
              ) },
            ]}
          />
        </SectionCard>
      )}
    </AdminPage>
  );
}

function format(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
  }
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
