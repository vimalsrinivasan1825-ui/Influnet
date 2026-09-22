"use client";

/**
 * Observability — Sentry and PostHog on one screen.
 *
 * The daily two-minute check: is anything newly broken (Sentry), are people
 * using it and where do they stop (PostHog), and is it fast for them (web
 * vitals). Each panel stands alone; a vendor that is unconfigured or down says
 * so in its own card and never blanks the other.
 *
 * Envelope: GET /api/admin/observability → { sentry, posthog, generatedAt, cached }.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bug,
  ExternalLink,
  Gauge,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { ObservabilitySnapshot, SourceStatus } from "@/lib/observability-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaChart, CHART_COLORS } from "@/components/ui/chart";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, THead, TRow } from "@/components/ui/table";
import { DeveloperGate } from "@/components/dashboard/admin/developer-gate";

const EVENT_LABEL: Record<string, string> = {
  signup_completed: "Signed up",
  profile_completed: "Completed profile",
  collab_request_sent: "Sent a request",
  collab_request_accepted: "Request accepted",
  deal_agreed: "Agreed a deal",
  project_created: "Project created",
  project_completed: "Project completed",
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
};

/** Google's "good" thresholds. LCP/INP arrive in ms, CLS is unitless. */
const VITALS: Record<string, { label: string; good: number; poor: number; unit: "ms" | "" }> = {
  LCP: { label: "Largest contentful paint", good: 2500, poor: 4000, unit: "ms" },
  INP: { label: "Interaction to next paint", good: 200, poor: 500, unit: "ms" },
  CLS: { label: "Cumulative layout shift", good: 0.1, poor: 0.25, unit: "" },
};

const LEVEL_VARIANT: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  fatal: "danger",
  error: "danger",
  warning: "warning",
  info: "info",
};

function relative(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function NotReady({ vendor, status, setup }: { vendor: string; status: SourceStatus; setup: string[] }) {
  if (!status.configured) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-hairline-strong p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-content">
          <Settings2 className="size-4 text-content-muted" /> {vendor} is not connected to this dashboard
        </div>
        {status.reason && <p className="text-sm text-content-soft">{status.reason}</p>}
        <div className="text-sm text-content-soft">
          <p className="font-medium text-content">Set on the server (Container App env), then redeploy or restart:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {status.missing.map((m) => (
              <li key={m}>
                <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">{m}</code>
              </li>
            ))}
          </ul>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-content-muted">
            {setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-content">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <p>{status.reason ?? `${vendor} is unavailable right now.`}</p>
    </div>
  );
}

function VendorLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  );
}

function ObservabilityContent() {
  const [data, setData] = useState<ObservabilitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setRefreshing(refresh);
    setError(null);
    const res = await apiFetch<ObservabilitySnapshot>(
      `/api/admin/observability${refresh ? "?refresh=1" : ""}`,
    );
    if (res.ok && res.data) setData(res.data);
    else setError(res.error || "Could not load observability data");
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
  }, [load]);

  const s = data?.sentry;
  const p = data?.posthog;
  const latestUsers = p?.activeUsers.at(-1)?.users ?? null;
  const peakUsers = p?.activeUsers.reduce((m, d) => Math.max(m, d.users), 0) ?? null;
  const signups = p?.funnel.find((f) => f.event === "signup_completed")?.users ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Operations"
        title="Observability"
        subtitle="Errors from Sentry and product usage from PostHog, side by side."
        icon={<Activity />}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && <Card className="border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</Card>}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
          <Skeleton className="h-72 rounded-2xl sm:col-span-2 lg:col-span-4" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Unresolved issues"
              value={s?.ok ? `${s.totals.unresolved}${s.totals.truncated ? "+" : ""}` : "--"}
              hint={s?.ok ? `${s.totals.newIn24h} new in 24h` : "Sentry not readable"}
              icon={<Bug />}
              tone={!s?.ok ? "neutral" : s.totals.newIn24h > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Users hit by errors (24h)"
              value={s?.ok ? s.totals.usersAffected24h : "--"}
              hint={s?.ok ? `${s.totals.events24h} error events` : undefined}
              icon={<AlertTriangle />}
              tone={s?.ok && s.totals.usersAffected24h > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Active users today"
              value={p?.ok && latestUsers !== null ? latestUsers : "--"}
              hint={p?.ok && peakUsers !== null ? `peak ${peakUsers} in 14 days` : "PostHog not readable"}
              icon={<Users />}
              tone="info"
            />
            <StatCard
              label="Signups (7d)"
              value={p?.ok ? signups : "--"}
              hint={p?.ok ? `${p.clientErrors24h} browser errors in 24h` : undefined}
              icon={<Gauge />}
              tone="brand"
            />
          </div>

          <SectionCard
            eyebrow="Sentry · unresolved, by frequency (24h)"
            title="What is broken"
            action={<VendorLink href={s?.dashboardUrl ?? null} label="Open Sentry" />}
          >
            {!s?.ok ? (
              <NotReady
                vendor="Sentry"
                status={s!}
                setup={[
                  "Sentry → click your avatar → User settings → Auth Tokens (a USER token, not an Organization Token — those are now restricted to org:ci and won't offer event:read) → create one with the event:read scope.",
                  "SENTRY_ORG and SENTRY_PROJECT are the slugs in your Sentry URL (CI already has them).",
                  "This token is separate from SENTRY_AUTH_TOKEN, which only uploads source maps.",
                ]}
              />
            ) : s.issues.length === 0 ? (
              <p className="py-8 text-center text-sm text-content-muted">
                No unresolved issues. This is the boring answer you want.
              </p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <th>Issue</th>
                    <th>Level</th>
                    <th className="text-right">Events</th>
                    <th className="text-right">Users</th>
                    <th>Last seen</th>
                  </tr>
                </THead>
                <TBody>
                  {s.issues.map((i) => (
                    <TRow key={i.id}>
                      <td className="max-w-[28rem]">
                        <div className="flex items-center gap-2">
                          {i.isNew && <Badge variant="warning">new</Badge>}
                          {i.permalink ? (
                            <a
                              href={i.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-medium text-content hover:text-brand hover:underline"
                            >
                              {i.title}
                            </a>
                          ) : (
                            <span className="truncate font-medium text-content">{i.title}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate font-mono text-xs text-content-muted">
                          {i.shortId}
                          {i.culprit ? ` · ${i.culprit}` : ""}
                        </p>
                      </td>
                      <td>
                        <Badge variant={LEVEL_VARIANT[i.level] ?? "neutral"}>{i.level}</Badge>
                      </td>
                      <td className="text-right tabular-nums">{i.count}</td>
                      <td className="text-right tabular-nums">{i.userCount}</td>
                      <td className="whitespace-nowrap text-content-soft">{relative(i.lastSeen)}</td>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-5">
            <SectionCard
              className="lg:col-span-3"
              eyebrow="PostHog · last 14 days"
              title="Active users"
              action={<VendorLink href={p?.dashboardUrl ?? null} label="Open PostHog" />}
            >
              {!p?.ok ? (
                <NotReady
                  vendor="PostHog"
                  status={p!}
                  setup={[
                    "PostHog → Settings → Personal API keys → create a key with Query Read.",
                    "POSTHOG_PROJECT_ID is the number in your PostHog project URL.",
                    "Counts include web and mobile; environments that share one PostHog project are combined.",
                  ]}
                />
              ) : p.activeUsers.length === 0 ? (
                <p className="py-10 text-center text-sm text-content-muted">No events in the last 14 days.</p>
              ) : (
                <AreaChart
                  data={p.activeUsers.map((d) => ({ name: d.date.slice(5), Users: d.users }))}
                  config={{ Users: { label: "Active users", color: CHART_COLORS[0] } }}
                  areas={[{ dataKey: "Users", color: CHART_COLORS[0] }]}
                />
              )}
            </SectionCard>

            <SectionCard className="lg:col-span-2" eyebrow="Real users · p75, 7 days" title="Speed">
              {!p?.ok ? (
                <p className="text-sm text-content-muted">Needs PostHog.</p>
              ) : p.webVitals.length === 0 ? (
                <p className="text-sm text-content-muted">No web-vitals samples yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {p.webVitals.map((v) => {
                    const def = VITALS[v.metric];
                    const rating = !def ? "neutral" : v.p75 <= def.good ? "success" : v.p75 <= def.poor ? "warning" : "danger";
                    const shown = def?.unit === "ms" ? `${Math.round(v.p75)} ms` : v.p75.toFixed(3);
                    return (
                      <li key={v.metric} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content">{v.metric}</p>
                          <p className="truncate text-xs text-content-muted">
                            {def?.label ?? "Web vital"} · {v.samples} samples
                          </p>
                        </div>
                        <Badge variant={rating as "success" | "warning" | "danger" | "neutral"}>{shown}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>

          {p?.ok && (
            <SectionCard eyebrow="PostHog · last 7 days" title="Collaboration funnel — people who did each step">
              <ul className="flex flex-col gap-2.5">
                {p.funnel.map((f) => {
                  const top = Math.max(1, ...p.funnel.map((x) => x.users));
                  const pct = Math.round((f.users / top) * 100);
                  return (
                    <li key={f.event} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_6rem]">
                      <span className="truncate text-content-soft">{EVENT_LABEL[f.event] ?? f.event}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                        <span
                          className={`block h-full rounded-full ${f.event === "payment_failed" ? "bg-danger" : "bg-brand"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-content">
                        {f.users}
                        <span className="text-xs text-content-muted"> / {f.events}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-content-muted">
                People / events. A step at zero is a finding, not missing data.
              </p>
            </SectionCard>
          )}

          <p className="text-right text-xs text-content-muted">
            Updated {relative(data.generatedAt)}
            {data.cached ? " · cached" : ""}
          </p>
        </>
      )}
    </div>
  );
}

export default function AdminObservabilityPage() {
  return (
    <DeveloperGate>
      <ObservabilityContent />
    </DeveloperGate>
  );
}
