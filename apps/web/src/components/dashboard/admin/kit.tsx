"use client";

/**
 * Shared building blocks for the admin CRM screens.
 *
 * Every report page is: <AdminPage> → <DateRangeBar> → <KpiRow> → charts →
 * <DataTable>. Keeping that in one place is what stops seventeen screens from
 * each inventing their own date picker, delta chip and CSV button.
 *
 * Data comes from /api/admin/insights/<module> (lib/admin-insights.ts).
 */

import * as React from "react";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { apiFetch, getAuthToken } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, THead, TRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ── Dates (IST, to match every RPC) ─────────────────────────────────────────

export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface Range {
  from: string;
  to: string;
}

export function defaultRange(days = 30): Range {
  const to = istToday();
  return { from: shiftDays(to, -(days - 1)), to };
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

export function DateRangeBar({
  range,
  onChange,
  onRefresh,
  right,
}: {
  range: Range;
  onChange: (r: Range) => void;
  onRefresh?: () => void;
  right?: React.ReactNode;
}) {
  const [custom, setCustom] = React.useState(false);
  const activeDays = PRESETS.find(
    (p) => range.to === istToday() && range.from === shiftDays(range.to, -(p.days - 1)),
  )?.days;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-hairline bg-surface-card p-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setCustom(false);
              onChange(defaultRange(p.days));
            }}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
              activeDays === p.days && !custom
                ? "bg-brand-soft text-brand-strong"
                : "text-content-muted hover:text-content",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustom((v) => !v)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
            custom ? "bg-brand-soft text-brand-strong" : "text-content-muted hover:text-content",
          )}
        >
          Custom
        </button>
      </div>

      {custom && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => onChange({ ...range, from: e.target.value })}
            className="h-8 w-[9.5rem] text-xs"
          />
          <span className="text-xs text-content-muted">to</span>
          <Input
            type="date"
            value={range.to}
            max={istToday()}
            onChange={(e) => onChange({ ...range, to: e.target.value })}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
      )}

      {onRefresh && (
        <Button variant="surface" size="sm" onClick={onRefresh} title="Refresh">
          <RefreshCw /> Refresh
        </Button>
      )}
      {right}
    </div>
  );
}

// ── Data loading ────────────────────────────────────────────────────────────

export function buildQuery(range: Range | null, params: Record<string, string | number | null | undefined> = {}) {
  const q = new URLSearchParams();
  if (range) {
    q.set("from", range.from);
    q.set("to", range.to);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

/** GET /api/admin/insights/<module> with loading + error + reload. */
export function useInsight<T = any>(
  module: string,
  range: Range | null,
  params: Record<string, string | number | null | undefined> = {},
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [nonce, setNonce] = React.useState(0);
  const key = `${module}?${buildQuery(range, params)}`;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await apiFetch<{ data: T }>(`/api/admin/insights/${key}`);
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setError(res.error || "Could not load this report");
        setData(null);
      } else {
        setError("");
        setData(res.data.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

/** Downloads a CSV through fetch so the bearer token is attached. */
export async function downloadCsv(path: string, filename: string) {
  const token = await getAuthToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return false;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function ExportButton({ path, filename }: { path: string; filename: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="surface"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await downloadCsv(path, filename);
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Download />} CSV
    </Button>
  );
}

// ── Page chrome ─────────────────────────────────────────────────────────────

export function AdminPage({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} icon={icon} actions={actions} />
      {error && <ErrorBanner message={error} />}
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
      <AlertTriangle className="size-5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * "Nothing here" needs to distinguish two very different facts, or a blank
 * chart reads as "the business is dead" when it means "we only started
 * recording this on Tuesday".
 */
export function NoData({
  historyStarts,
  what = "data",
}: {
  historyStarts?: string | null;
  what?: string;
}) {
  if (historyStarts) {
    return (
      <EmptyState
        title={`No ${what} in this range`}
        description={`Recording started on ${new Date(historyStarts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — earlier dates have nothing to show.`}
      />
    );
  }
  return <EmptyState title={`No ${what} yet`} description="Nothing has been recorded for this period." />;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export const nf = new Intl.NumberFormat("en-IN");

export function rupees(paise: number | null | undefined, opts: { compact?: boolean } = {}) {
  const value = (Number(paise) || 0) / 100;
  if (opts.compact && value >= 100000) return `₹${(value / 100000).toFixed(value >= 1000000 ? 0 : 1)}L`;
  if (opts.compact && value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${nf.format(Math.round(value))}`;
}

export function pct(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function dateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export function dateOnly(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function ago(v: string | null | undefined) {
  if (!v) return "never";
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function deltaOf(current: number, previous: number | undefined) {
  if (previous == null || previous === 0) return undefined;
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change) || Math.abs(change) < 0.5) return undefined;
  return {
    value: `${Math.abs(change).toFixed(0)}%`,
    direction: (change > 0 ? "up" : "down") as "up" | "down",
  };
}

export interface Kpi {
  label: string;
  value: React.ReactNode;
  /** Raw numbers to compute the "vs previous period" chip. */
  current?: number;
  previous?: number;
  hint?: string;
  tone?: "brand" | "success" | "warning" | "info" | "neutral";
  icon?: React.ReactNode;
  /** Lower is better — flips the colour of the delta chip. */
  inverse?: boolean;
}

export function KpiRow({ items, loading, columns = 4 }: { items: Kpi[]; loading?: boolean; columns?: 3 | 4 | 5 }) {
  if (loading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3", columns === 5 ? "lg:grid-cols-5" : columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("grid grid-cols-2 gap-3", columns === 5 ? "lg:grid-cols-5" : columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
      {items.map((k) => {
        const d = k.current != null ? deltaOf(k.current, k.previous) : undefined;
        const direction = d && k.inverse ? (d.direction === "up" ? "down" : "up") : d?.direction;
        return (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value}
            hint={k.hint}
            tone={k.tone ?? "brand"}
            icon={k.icon}
            delta={d ? { value: d.value, direction: direction as "up" | "down" } : undefined}
          />
        );
      })}
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  loading,
  empty,
  total,
  page,
  pageSize = 50,
  onPage,
  onRowClick,
  historyStarts,
}: {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  empty?: React.ReactNode;
  total?: number;
  page?: number;
  pageSize?: number;
  onPage?: (page: number) => void;
  onRowClick?: (row: T) => void;
  historyStarts?: string | null;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty ?? <NoData historyStarts={historyStarts} what="rows" />}</>;

  const pages = total != null ? Math.ceil(total / pageSize) : 1;
  const current = (page ?? 0) + 1;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <THead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn(c.align === "right" && "text-right")}>
                {c.label}
              </th>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((row, i) => (
            <TRow key={row.id ?? i} interactive={!!onRowClick} onClick={() => onRowClick?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cn(c.align === "right" && "text-right tabular-nums", c.className)}>
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </TRow>
          ))}
        </TBody>
      </Table>

      {total != null && pages > 1 && onPage && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-content-muted">
            {nf.format(total)} rows · page {current} of {nf.format(pages)}
          </span>
          <div className="flex gap-1.5">
            <Button variant="surface" size="sm" disabled={current <= 1} onClick={() => onPage((page ?? 0) - 1)}>
              Previous
            </Button>
            <Button variant="surface" size="sm" disabled={current >= pages} onClick={() => onPage((page ?? 0) + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Charts the base kit does not have ───────────────────────────────────────

export function FunnelBars({
  steps,
}: {
  steps: { key: string; label: string; value: number; note?: string }[];
}) {
  const top = steps[0]?.value ?? 0;
  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, i) => {
        const share = top > 0 ? Math.round((step.value / top) * 100) : 0;
        const prev = i === 0 ? step.value : steps[i - 1].value;
        const dropped = Math.max(prev - step.value, 0);
        return (
          <div key={step.key} className="relative overflow-hidden rounded-xl border border-hairline bg-surface-card px-4 py-3">
            <div className="absolute inset-y-0 left-0 bg-brand-soft" style={{ width: `${share}%` }} aria-hidden />
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-content">{step.label}</p>
                {step.note && <p className="text-xs text-content-muted">{step.note}</p>}
              </div>
              <div className="flex items-center gap-3 text-right">
                {i > 0 && dropped > 0 && (
                  <span className="text-xs font-semibold text-danger">−{nf.format(dropped)}</span>
                )}
                <span className="text-base font-extrabold tabular-nums text-content">{nf.format(step.value)}</span>
                <span className="w-10 text-xs font-semibold tabular-nums text-content-muted">{share}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Weekly cohort retention. Cell shade = % of that cohort still active. */
export function CohortGrid({
  cohorts,
}: {
  cohorts: { cohort: string; size: number; weeks: { week: number; active: number }[] }[];
}) {
  const width = Math.max(...cohorts.map((c) => c.weeks?.length ?? 0), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-bold text-content-muted">Signed up</th>
            <th className="text-right font-bold text-content-muted">Size</th>
            {Array.from({ length: width }).map((_, i) => (
              <th key={i} className="text-center font-bold text-content-muted">
                W{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="whitespace-nowrap font-semibold text-content-soft">{dateOnly(c.cohort)}</td>
              <td className="text-right font-bold tabular-nums text-content">{c.size}</td>
              {Array.from({ length: width }).map((_, i) => {
                const cell = c.weeks?.find((w) => w.week === i);
                const share = cell && c.size > 0 ? Math.round((cell.active / c.size) * 100) : null;
                return (
                  <td
                    key={i}
                    className="rounded-md text-center font-semibold tabular-nums"
                    style={
                      share == null
                        ? undefined
                        : {
                            background: `color-mix(in oklab, var(--brand) ${Math.min(share, 100)}%, transparent)`,
                            color: share > 45 ? "#fff" : "var(--content-soft)",
                          }
                    }
                    title={cell ? `${cell.active} of ${c.size} active` : "no data"}
                  >
                    {share == null ? "·" : `${share}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 7 × 24 activity grid, IST. */
export function WeekHourHeatmap({ cells }: { cells: { weekday: number; hour: number; active: number }[] }) {
  const max = Math.max(...cells.map((c) => c.active), 1);
  const lookup = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.active]));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem]">
        <div className="mb-1 grid grid-cols-[2.5rem_repeat(24,1fr)] gap-0.5">
          <span />
          {Array.from({ length: 24 }).map((_, h) => (
            <span key={h} className="text-center text-[0.5625rem] font-bold text-content-muted">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((label, i) => (
          <div key={label} className="mb-0.5 grid grid-cols-[2.5rem_repeat(24,1fr)] items-center gap-0.5">
            <span className="text-[0.625rem] font-bold text-content-muted">{label}</span>
            {Array.from({ length: 24 }).map((_, h) => {
              const value = lookup.get(`${i + 1}:${h}`) ?? 0;
              return (
                <div
                  key={h}
                  title={`${label} ${String(h).padStart(2, "0")}:00 IST — ${value} active`}
                  className="aspect-square rounded-[3px] border border-hairline"
                  style={{
                    background:
                      value === 0
                        ? "var(--surface-muted)"
                        : `color-mix(in oklab, var(--brand) ${Math.max(12, Math.round((value / max) * 100))}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
        <p className="mt-2 text-[0.6875rem] text-content-muted">Hours are IST. Darker means more people were active.</p>
      </div>
    </div>
  );
}

/** Label → value rows, for the many small breakdowns these pages show. */
export function StatRows({
  rows,
  formatter = (v: number) => nf.format(v),
}: {
  rows: { label: string; value: number; tone?: string }[];
  formatter?: (v: number) => string;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-content-muted">Nothing yet.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="relative overflow-hidden rounded-lg border border-hairline bg-surface-muted px-3 py-2">
          <div
            className="absolute inset-y-0 left-0 bg-brand-soft"
            style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-content-soft">{r.label}</span>
            <span className="text-sm font-bold tabular-nums text-content">{formatter(r.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** `sent_for_review` → `Sent For Review`. Stage keys appear in several reports. */
export function prettyStage(stage: string | null | undefined) {
  if (!stage) return "—";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export { Badge, Button, Card, SectionCard, Skeleton, EmptyState, Input };
