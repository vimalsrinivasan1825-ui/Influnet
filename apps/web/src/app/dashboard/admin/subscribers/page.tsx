"use client";

/**
 * Pro subscribers and renewal reminders (migration 155).
 *
 * Pro is sold as a fixed 30-day period paid with a one-off order, not a
 * mandate, so EVERY renewal is a deliberate repurchase — which is exactly why
 * the expiring list and its reminders matter to revenue.
 */

import { useState } from "react";
import { BellRing, Crown } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { BarChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, Badge, Button, DataTable, ExportButton, KpiRow, SectionCard,
  ago, buildQuery, dateOnly, nf, pct, rupees, useInsight,
} from "@/components/dashboard/admin/kit";

const STATE_LABEL: Record<string, string> = {
  active: "Active", expiring: "Expiring soon", grace: "In grace", halted: "Payment failed", expired: "Expired",
};
const STATE_VARIANT: Record<string, any> = {
  active: "success", expiring: "warning", grace: "warning", halted: "danger", expired: "neutral",
};

export default function SubscribersPage() {
  const [state, setState] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const params = { state, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("subscribers", null, params);
  const s = data?.summary ?? {};

  const monthly = (data?.monthly ?? []).map((m: any) => ({
    name: m.month,
    New: m.new,
    Renewals: m.renewals,
    Expired: m.expired,
  }));

  const remind = async (row: any) => {
    if (!window.confirm(`Send a renewal reminder to ${row.name}?`)) return;
    setBusy(row.user_id);
    const daysLeft = row.days_left ?? 0;
    const created = await apiFetch<{ broadcast: { id: string } }>("/api/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        name: `Renewal reminder — ${row.name} — ${new Date().toISOString().slice(0, 10)}`,
        kind: "reminder",
        title: daysLeft > 0 ? `Your Pro plan ends in ${daysLeft} days` : "Your Pro plan has ended",
        body: "Renew to keep your Pro limits, badge and insights without a gap.",
        deep_link: "/dashboard/billing",
        cta_label: "Renew Pro",
        channels: ["push", "in_app", "email"],
        audience: { user_ids: [row.user_id] },
      }),
    });
    if (created.ok && created.data) {
      const sent = await apiFetch(`/api/admin/broadcasts/${created.data.broadcast.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "send_now" }),
      });
      setNote(sent.ok ? `Reminder sent to ${row.name}.` : sent.error || "Could not send.");
    } else {
      setNote(created.error || "Could not send.");
    }
    setBusy(null);
    reload();
  };

  return (
    <AdminPage
      eyebrow="Payments"
      title="Pro subscribers"
      subtitle="Who is paying, who is about to lapse, and what that is worth per month"
      icon={<Crown />}
      error={error}
      actions={<ExportButton path={`/api/admin/insights/subscribers?${buildQuery(null, { ...params, limit: 500, format: "csv" })}`} filename="influnet-subscribers.csv" />}
    >
      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Active", value: nf.format(s.active ?? 0), tone: "success" },
          { label: "MRR", value: rupees(s.mrr_paise, { compact: true }), tone: "warning", hint: `${rupees(data?.price_paise)} per month` },
          { label: "Expiring soon", value: nf.format(s.expiring ?? 0), tone: "warning", hint: "Within 7 days" },
          { label: "Churn (30d)", value: pct(s.churn_rate_30d, 1), tone: "neutral", inverse: true, hint: `${s.expired_last_30d ?? 0} lapsed` },
          { label: "Lifetime revenue", value: rupees(s.lifetime_revenue_paise, { compact: true }), tone: "info", hint: `${s.paying_customers_ever ?? 0} customers ever` },
        ]}
      />

      {note && <p className="text-sm font-semibold text-brand-strong">{note}</p>}

      <SectionCard eyebrow="History" title="New vs renewals per month">
        {monthly.length === 0 ? (
          <p className="py-12 text-center text-sm text-content-muted">No subscription history yet.</p>
        ) : (
          <BarChart
            data={monthly}
            config={{
              New: { label: "New", color: CHART_COLORS[0] },
              Renewals: { label: "Renewals", color: CHART_COLORS[2] },
              Expired: { label: "Lapsed", color: CHART_COLORS[6] },
            }}
            bars={[{ dataKey: "New", color: CHART_COLORS[0] }, { dataKey: "Renewals", color: CHART_COLORS[2] }, { dataKey: "Expired", color: CHART_COLORS[6] }]}
            height={240}
          />
        )}
      </SectionCard>

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} subscribers`}
        title="Subscribers & renewals"
        bodyClassName="px-0 sm:px-0"
        action={
          <select value={state} onChange={(e) => { setState(e.target.value); setPage(0); }} className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft">
            <option value="">Everyone</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring soon</option>
            <option value="grace">In grace</option>
            <option value="halted">Payment failed</option>
            <option value="expired">Expired</option>
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
            { key: "name", label: "Subscriber", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">{r.name}</p>
                <p className="truncate text-xs text-content-muted">{r.email}</p>
              </div>
            ) },
            { key: "state", label: "State", render: (r: any) => <Badge size="sm" variant={STATE_VARIANT[r.state] ?? "neutral"}>{STATE_LABEL[r.state] ?? r.state}</Badge> },
            { key: "current_period_end", label: "Period ends", render: (r: any) => (
              <div className="min-w-0">
                <p className="text-sm text-content">{dateOnly(r.current_period_end)}</p>
                {r.days_left != null && (
                  <p className="text-xs text-content-muted">{r.days_left >= 0 ? `${r.days_left} days left` : `${Math.abs(r.days_left)} days ago`}</p>
                )}
              </div>
            ) },
            { key: "payments", label: "Payments", align: "right" },
            { key: "paid_paise", label: "Paid", align: "right", render: (r: any) => rupees(r.paid_paise) },
            { key: "last_active_at", label: "Last active", align: "right", render: (r: any) => ago(r.last_active_at) },
            { key: "remind", label: "", align: "right", render: (r: any) => (
              <Button
                variant="surface"
                size="sm"
                disabled={busy === r.user_id}
                onClick={(e) => { e.stopPropagation(); void remind(r); }}
                title={r.last_reminded_at ? `Last reminded ${ago(r.last_reminded_at)}` : "Never reminded"}
              >
                <BellRing /> {busy === r.user_id ? "Sending…" : "Remind"}
              </Button>
            ) },
          ]}
        />
        <p className="px-5 pt-3 text-xs text-content-muted">
          Automatic reminders go out 7, 3 and 1 days before a plan ends, and once just after — from the daily
          maintenance job. This button sends one immediately.
        </p>
      </SectionCard>
    </AdminPage>
  );
}
