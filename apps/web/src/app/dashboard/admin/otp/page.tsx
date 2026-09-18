"use client";

/**
 * OTP logs (Kesavan's list) — signup delivery health, abuse signals and cost.
 *
 * Phone numbers are masked for a normal admin and shown in full only to a
 * developer super admin; the RPC decides that, not this page. OTP codes are
 * never stored anywhere.
 *
 * The alarm worth watching is the success rate: a broken provider template once
 * turned every SMS into a voice call while still reporting success.
 */

import { useState } from "react";
import { MessageSquareLock, Search, TriangleAlert } from "lucide-react";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import {
  AdminPage, Badge, Button, DataTable, DateRangeBar, ExportButton, Input, KpiRow,
  SectionCard, StatRows, buildQuery, dateTime, defaultRange, nf, pct, useInsight,
} from "@/components/dashboard/admin/kit";

const STATUS_VARIANT: Record<string, any> = {
  verified: "success", sent: "info", expired: "neutral", failed: "danger", verifying: "warning",
};

export default function OtpLogsPage() {
  const [range, setRange] = useState(defaultRange(7));
  const [status, setStatus] = useState("");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const params = { status, phone: query, limit: 50, offset: page * 50 };
  const { data, loading, error, reload } = useInsight<any>("otp", range, params);
  const s = data?.summary ?? {};

  const series = (data?.series ?? []).map((r: any) => ({
    name: r.bucket.length > 10 ? r.bucket.slice(11) : new Date(r.bucket).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Sent: r.sent,
    Verified: r.verified,
    Failed: r.failed,
  }));

  const lowSuccess = s.success_rate != null && s.success_rate < 70 && (s.sessions ?? 0) >= 10;

  return (
    <AdminPage
      eyebrow="Logs"
      title="OTP logs"
      subtitle="Every signup verification code: sent, verified, failed or expired"
      icon={<MessageSquareLock />}
      error={error}
      actions={
        <DateRangeBar
          range={range}
          onChange={setRange}
          onRefresh={reload}
          right={<ExportButton path={`/api/admin/insights/otp?${buildQuery(range, { ...params, limit: 500, format: "csv" })}`} filename={`influnet-otp-${range.from}.csv`} />}
        />
      }
    >
      {lowSuccess && (
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4 text-sm font-semibold text-warn">
          <TriangleAlert className="size-5 shrink-0" />
          <span>
            Only {pct(s.success_rate, 1)} of codes are being verified. That usually means delivery is broken —
            check the provider template before assuming people are mistyping.
          </span>
        </div>
      )}

      <KpiRow
        loading={loading}
        columns={5}
        items={[
          { label: "Codes sent", value: nf.format(s.sends ?? 0), hint: `${nf.format(s.unique_phones ?? 0)} phone numbers` },
          { label: "Verified", value: nf.format(s.verified ?? 0), tone: "success" },
          { label: "Success rate", value: pct(s.success_rate, 1), tone: lowSuccess ? "warning" : "info" },
          { label: "Expired", value: nf.format(s.expired ?? 0), tone: "neutral", hint: "Code never used" },
          { label: "Median time to verify", value: s.median_seconds_to_verify != null ? `${s.median_seconds_to_verify}s` : "—", tone: "info" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard eyebrow="Delivery" title="Sent vs verified" className="lg:col-span-2">
          {series.length === 0 ? (
            <p className="py-12 text-center text-sm text-content-muted">No codes sent in this range.</p>
          ) : (
            <AreaChart
              data={series}
              config={{
                Sent: { label: "Sent", color: CHART_COLORS[1] },
                Verified: { label: "Verified", color: CHART_COLORS[2] },
                Failed: { label: "Failed or expired", color: CHART_COLORS[6] },
              }}
              areas={[{ dataKey: "Sent" }, { dataKey: "Verified" }, { dataKey: "Failed" }]}
              height={240}
            />
          )}
        </SectionCard>
        <div className="flex flex-col gap-4">
          <SectionCard eyebrow="Failures" title="Why verification failed">
            <StatRows rows={(data?.failure_reasons ?? []).map((r: any) => ({ label: String(r.reason).replace(/_/g, " "), value: r.count }))} />
          </SectionCard>
          <SectionCard eyebrow="Watch" title="Numbers asking repeatedly">
            <StatRows rows={(data?.top_phones ?? []).map((r: any) => ({ label: `${r.phone} (${r.verified} verified)`, value: r.sessions }))} />
          </SectionCard>
        </div>
      </div>

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} attempts`}
        title="Verification attempts"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!data?.unmasked && <Badge variant="neutral" size="sm">Numbers masked</Badge>}
            <form onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(phone); }} className="flex items-center gap-1.5">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Last digits…" className="h-8 w-32 text-xs" />
              <Button type="submit" variant="surface" size="sm"><Search /></Button>
            </form>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2 text-xs font-semibold text-content-soft">
              <option value="">Any status</option>
              <option value="verified">Verified</option>
              <option value="sent">Awaiting code</option>
              <option value="expired">Expired</option>
              <option value="failed">Failed</option>
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
            { key: "created_at", label: "When", render: (r: any) => dateTime(r.created_at) },
            { key: "phone", label: "Phone", render: (r: any) => <span className="font-mono text-xs">{r.phone}</span> },
            { key: "status", label: "Status", render: (r: any) => <Badge size="sm" variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge> },
            { key: "purpose", label: "Purpose" },
            { key: "send_attempt", label: "Sends", align: "right" },
            { key: "verify_attempts", label: "Tries", align: "right" },
            { key: "user_name", label: "Account", render: (r: any) => r.user_name || "—" },
            { key: "verified_at", label: "Verified", align: "right", render: (r: any) => (r.verified_at ? dateTime(r.verified_at) : "—") },
          ]}
        />
        <p className="px-5 pt-3 text-xs text-content-muted">
          Rows older than 90 days are deleted automatically — a phone number has no reporting value after that.
        </p>
      </SectionCard>
    </AdminPage>
  );
}
