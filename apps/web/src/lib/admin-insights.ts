import { NextResponse } from 'next/server';

/**
 * Shared plumbing for the admin analytics surface.
 *
 * Every insight is an `is_admin()`-guarded RPC (migrations 152–160) reached
 * through ONE dispatch route, /api/admin/insights/[module], with the module
 * whitelisted here. A new report is a row in MODULES plus a page — not another
 * route handler, and never a query built from client input.
 *
 * Envelope (documented once, for all of them):
 *   { data, range: { from, to } | null, module, generated_at }
 */

export type AdminTier = 'admin' | 'super';

export interface InsightModule {
  /** Postgres function name. */
  rpc: string;
  tier: AdminTier;
  /** Builds the RPC arguments from the query string. */
  args: (q: URLSearchParams, range: DateRange) => Record<string, unknown>;
  /** Rows for CSV export, when this module supports one. */
  csv?: (data: any) => Record<string, unknown>[];
}

export interface DateRange {
  from: string;
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** IST "today" — the day boundary every report uses. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * `?from=&to=`, or `?days=N` (default 30). Clamped to a year: the RPCs refuse
 * anything wider, and this keeps the error a 400 rather than a 500.
 */
export function parseRange(q: URLSearchParams): DateRange {
  const today = istToday();
  const from = q.get('from');
  const to = q.get('to');
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
    const maxFrom = shiftDays(to, -366);
    return { from: from < maxFrom ? maxFrom : from, to: to > today ? today : to };
  }
  const daysRaw = Number(q.get('days') ?? 30);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 366) : 30;
  return { from: shiftDays(today, -(days - 1)), to: today };
}

export function intParam(q: URLSearchParams, key: string, dflt: number, min: number, max: number): number {
  const raw = Number(q.get(key) ?? dflt);
  if (!Number.isFinite(raw)) return dflt;
  return Math.min(Math.max(Math.trunc(raw), min), max);
}

/** Null for an absent/blank value, so an RPC's `NULL means no filter` holds. */
export function strParam(q: URLSearchParams, key: string, max = 120): string | null {
  const v = (q.get(key) ?? '').trim();
  if (!v) return null;
  return v.slice(0, max);
}

const page = (q: URLSearchParams) => ({
  p_limit: intParam(q, 'limit', 50, 1, 500),
  p_offset: intParam(q, 'offset', 0, 0, 100_000),
});

export const MODULES: Record<string, InsightModule> = {
  // ── Workspace ────────────────────────────────────────────────────────────
  founder: {
    rpc: 'admin_founder_dashboard',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
    csv: (d) => d?.series ?? [],
  },
  daily: {
    rpc: 'admin_daily_metrics',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
    csv: (d) => (Array.isArray(d) ? d : []),
  },
  product: {
    rpc: 'admin_product_analytics',
    tier: 'admin',
    args: (q) => ({ p_weeks: intParam(q, 'weeks', 8, 2, 26) }),
  },
  customers: {
    rpc: 'admin_customer_tracking',
    tier: 'admin',
    args: (q) => ({
      p_search: strParam(q, 'search'),
      p_role: strParam(q, 'role', 20),
      p_stage: strParam(q, 'stage', 30),
      p_tier: strParam(q, 'tier', 10),
      p_city: strParam(q, 'city', 80),
      p_dormant_days: q.get('dormant') ? intParam(q, 'dormant', 14, 1, 365) : null,
      p_sort: strParam(q, 'sort', 20) ?? 'recent',
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
  incomplete: {
    rpc: 'admin_incomplete_signups',
    tier: 'admin',
    args: (q) => ({ p_bucket: strParam(q, 'bucket', 40), ...page(q) }),
    csv: (d) => d?.rows ?? [],
  },
  deleted: {
    rpc: 'admin_deleted_accounts',
    tier: 'admin',
    args: (q, r) => ({
      p_from: r.from, p_to: r.to,
      p_via: strParam(q, 'via', 20),
      p_role: strParam(q, 'role', 20),
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
  app: {
    rpc: 'admin_app_activity',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
  },
  // ── Marketplace & engagement ─────────────────────────────────────────────
  marketplace: {
    rpc: 'admin_marketplace',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
  },
  engagement: {
    rpc: 'admin_engagement',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
  },
  search: {
    rpc: 'admin_search_analytics',
    tier: 'admin',
    args: (_q, r) => ({ p_from: r.from, p_to: r.to }),
  },
  // ── Money ────────────────────────────────────────────────────────────────
  payments: {
    rpc: 'admin_payments_ledger',
    tier: 'admin',
    args: (q, r) => ({
      p_from: r.from, p_to: r.to,
      p_flow: strParam(q, 'flow', 20),
      p_status: strParam(q, 'status', 20),
      p_search: strParam(q, 'search'),
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
  subscribers: {
    rpc: 'admin_pro_subscribers',
    tier: 'admin',
    args: (q) => ({
      p_state: strParam(q, 'state', 20),
      p_expiring_days: intParam(q, 'expiring', 7, 1, 60),
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
  // ── Comms ────────────────────────────────────────────────────────────────
  push_devices: {
    rpc: 'admin_push_device_stats',
    tier: 'admin',
    args: () => ({}),
  },
  // ── Logs ─────────────────────────────────────────────────────────────────
  // Phone numbers: masked for an admin, full for a super admin (the RPC
  // decides, from the caller's own flag).
  otp: {
    rpc: 'admin_otp_logs',
    tier: 'admin',
    args: (q, r) => ({
      p_from: r.from, p_to: r.to,
      p_status: strParam(q, 'status', 20),
      p_purpose: strParam(q, 'purpose', 20),
      p_phone: strParam(q, 'phone', 20),
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
  // ── CRM ──────────────────────────────────────────────────────────────────
  leads: {
    rpc: 'admin_crm_leads',
    tier: 'admin',
    args: (q) => ({
      p_stage: strParam(q, 'stage', 20),
      p_kind: strParam(q, 'kind', 20),
      p_owner: strParam(q, 'owner', 40),
      p_search: strParam(q, 'search'),
      p_due: q.get('due') === '1',
      ...page(q),
    }),
    csv: (d) => d?.rows ?? [],
  },
};

/** RFC4180-ish CSV. Values are quoted and internal quotes doubled. */
export function toCsv(rows: Record<string, unknown>[], omit: string[] = []): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]).filter((c) => !omit.includes(c));
  const cell = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export function csvResponse(filename: string, rows: Record<string, unknown>[], omit: string[] = []) {
  return new NextResponse(toCsv(rows, omit), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Datasets the report builder can query (migration 160's admin_report_dataset). */
export const DATASETS = [
  'users', 'projects', 'payments', 'subscriptions', 'requests', 'campaigns',
  'notifications', 'deleted_accounts',
] as const;

/** Columns a normal admin must not be able to export. */
export const CSV_SENSITIVE = ['phone', 'email_hash', 'phone_hash', 'provider_session_id'];
