"use client";

/**
 * Payments — one ledger over both money flows: project payments (advance /
 * final / quick) and Pro subscription orders (migration 155).
 *
 * "Abandoned" is computed, not stored: an order still unpaid an hour after it
 * was created. That is the number that was invisible before — a Pro checkout
 * opened and closed left no row at all.
 */

import { useState } from "react";
import { CreditCard, Search } from "lucide-react";
import { BarChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, Badge, Button, DataTable, DateRangeBar, ExportButton, Input, KpiRow,
  SectionCard, StatRows, buildQuery, dateTime, defaultRange, nf, pct, prettyStage, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

const STATUS_VARIANT: Record<string, any> = {
  paid: "success", failed: "danger", pending: "warning", abandoned: "neutral", refunded: "info",
};

export default function PaymentsPage() {
  const [range, setRange] = useState(defaultRange(30));
  const [flow, setFlow] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const params = { flow, status, search: query, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("payments", range, params);
  const s = data?.summary ?? {};

  const series = (data?.series ?? []).map((r: any) => ({
    name: new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Projects: Math.round((r.project_paise ?? 0) / 100),
    Pro: Math.round((r.pro_paise ?? 0) / 100),
  }));

  return (
    <AdminPage
      eyebrow="Payments"
      title="All payments"
      subtitle="Creator payments and Pro subscriptions, including the ones that failed or were never finished"
      icon={<CreditCard />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={setRange}
          onRefresh={reload}
          right={<ExportButton path={`/api/admin/insights/payments?${buildQuery(range, { ...params, limit: 500, format: "csv" })}`} filename={`influnet-payments-${range.from}.csv`} />}
        />
      }
    >
      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Creator payments", value: rupees(s.gmv_paise, { compact: true }), tone: "success", hint: `${s.paid ?? 0} succeeded` },
          { label: "Pro revenue", value: rupees(s.pro_revenue_paise, { compact: true }), tone: "warning", hint: `${s.pro_new ?? 0} new · ${s.pro_renewals ?? 0} renewals` },
          { label: "Success rate", value: pct(s.success_rate, 1), tone: "info" },
          { label: "Failed", value: nf.format(s.failed ?? 0), tone: s.failed > 0 ? "warning" : "neutral", inverse: true },
          { label: "Not completed", value: nf.format(s.abandoned ?? 0), tone: "neutral", hint: "Checkout opened, never paid" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Trend" title="Money received per day" className="lg:col-span-2">
          {series.length === 0 ? (
            <p className="py-12 text-center text-sm text-content-muted">No payments in this range.</p>
          ) : (
            <BarChart
              data={series}
              config={{ Projects: { label: "Creator payments (₹)", color: CHART_COLORS[2] }, Pro: { label: "Pro (₹)", color: CHART_COLORS[3] } }}
              bars={[{ dataKey: "Projects", color: CHART_COLORS[2], stackId: "m" }, { dataKey: "Pro", color: CHART_COLORS[3], stackId: "m" }]}
              stacked
              height={240}
              prefix="₹"
            />
          )}
        </SectionCard>
        <SectionCard eyebrow="Why payments fail" title="Reasons">
          <StatRows rows={(data?.failure_reasons ?? []).map((r: any) => ({ label: r.reason, value: r.count }))} />
        </SectionCard>
      </div>

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} payments`}
        title="Ledger"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(search); }} className="flex items-center gap-1.5">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, order id…" className="h-8 w-44 text-xs" />
              <Button type="submit" variant="surface" size="sm"><Search /></Button>
            </form>
            <select value={flow} onChange={(e) => { setFlow(e.target.value); setPage(0); }} className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft">
              <option value="">Both kinds</option>
              <option value="project">Creator payments</option>
              <option value="pro">Pro subscriptions</option>
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft">
              <option value="">Any status</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="abandoned">Not completed</option>
              <option value="refunded">Refunded</option>
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
            { key: "created_at", label: "When", render: (r: any) => dateTime(r.paid_at ?? r.created_at) },
            { key: "kind", label: "What", render: (r: any) => (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content">{prettyStage(r.kind)}</p>
                {r.project_title && <p className="truncate text-xs text-content-muted">{r.project_title}</p>}
              </div>
            ) },
            { key: "payer_name", label: "Paid by", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate text-sm text-content">{r.payer_name || "—"}</p>
                {r.payee_name && <p className="truncate text-xs text-content-muted">to {r.payee_name}</p>}
              </div>
            ) },
            { key: "amount_paise", label: "Amount", align: "right", render: (r: any) => rupees(r.amount_paise) },
            { key: "status", label: "Status", render: (r: any) => (
              <div className="min-w-0">
                <Badge size="sm" variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status === "abandoned" ? "Not completed" : r.status}</Badge>
                {r.failure_reason && <p className="truncate text-xs text-content-muted" title={r.failure_reason}>{r.failure_reason}</p>}
              </div>
            ) },
            { key: "razorpay_order_id", label: "Razorpay", render: (r: any) => (
              <span className="font-mono text-[0.6875rem] text-content-muted">{r.razorpay_payment_id || r.razorpay_order_id || "—"}</span>
            ) },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
