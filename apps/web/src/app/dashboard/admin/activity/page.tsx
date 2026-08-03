"use client";

/**
 * Live platform activity — the answer to "the app is a black box".
 *
 * Everything here is derived from rows that already exist (migration 099), so
 * it shows the full history rather than only what happened after the feature
 * shipped, and no writer can forget to emit an event.
 *
 * Auto-refreshes on a timer while the tab is visible. Polling rather than
 * Realtime on purpose: this joins nine tables, and a socket subscription would
 * need a channel per table plus a re-query on every event — the same load, more
 * moving parts, for a screen someone watches for ten minutes during a test.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ActivityEvent {
  at: string;
  kind: string;
  severity: "info" | "good" | "warn" | "bad";
  title: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  link: string | null;
}

interface Pulse {
  window_hours: number;
  signups: number;
  active_users: number;
  requests: number;
  projects: number;
  stage_moves: number;
  payments_paid: number;
  payments_failed: number;
  tickets: number;
  reports: number;
  stalled_creators: number;
}

const SEVERITY_DOT: Record<string, string> = {
  good: "bg-ok",
  warn: "bg-warn",
  bad: "bg-danger",
  info: "bg-content-muted",
};

const SEVERITY_BADGE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  good: "success",
  warn: "warning",
  bad: "danger",
  info: "neutral",
};

const REFRESH_MS = 20_000;

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${Math.max(secs, 0)}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hours, setHours] = useState<"24" | "168" | "720">("168");
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Keep the newest values available to the interval without making it a
  // dependency — re-creating the timer on every tick would drift the cadence.
  // Synced in an effect (not during render) and declared above the loader so
  // effect order guarantees `load` already sees the new value.
  const hoursRef = useRef(hours);
  useEffect(() => {
    hoursRef.current = hours;
  }, [hours]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await apiFetch<{ events: ActivityEvent[]; pulse: Pulse | null }>(
      `/api/admin/activity?hours=${hoursRef.current}&limit=150`,
    );
    if (!res.ok || !res.data) {
      setError(
        res.requestId ? `${res.error} (ref: ${res.requestId})` : res.error || "Could not load activity",
      );
    } else {
      setError("");
      setEvents(res.data.events || []);
      setPulse(res.data.pulse);
      setLastUpdated(new Date());
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [hours, load]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // Don't poll a tab nobody is looking at — it is pure database load.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load(true);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Transparency"
        title="Live activity"
        subtitle={
          lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()}${live ? " · refreshing every 20s" : ""}`
            : "Everything happening across the platform"
        }
        icon={<Activity />}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="surface" onClick={() => setLive((v) => !v)}>
              {live ? <Pause /> : <Play />}
              {live ? "Pause" : "Resume"}
            </Button>
            <Button size="sm" variant="surface" onClick={() => load()}>
              <RefreshCw /> Refresh
            </Button>
          </div>
        }
      />

      {pulse && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={`Signups / ${pulse.window_hours}h`} value={pulse.signups} tone="brand" />
          <StatCard label="Active users" value={pulse.active_users} tone="info" />
          <StatCard label="Stage moves" value={pulse.stage_moves} tone="success" />
          <StatCard
            label="Payments paid"
            value={pulse.payments_paid}
            tone={pulse.payments_failed > 0 ? "warning" : "success"}
            hint={pulse.payments_failed > 0 ? `${pulse.payments_failed} failed` : undefined}
          />
          <StatCard
            label="Tickets"
            value={pulse.tickets}
            tone={pulse.tickets > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Stalled creators"
            value={pulse.stalled_creators}
            tone={pulse.stalled_creators > 0 ? "warning" : "success"}
            hint="Signed up, not verified"
          />
        </div>
      )}

      <SegmentedTabs
        value={hours}
        onValueChange={setHours}
        size="sm"
        tabs={[
          { value: "24", label: "Last 24h" },
          { value: "168", label: "Last 7 days" },
          { value: "720", label: "Last 30 days" },
        ]}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity />}
            title="Nothing yet in this window"
            description="Once testers start using the app, every signup, request, stage move and payment appears here."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-hairline overflow-hidden p-0">
          {events.map((e, i) => {
            const row = (
              <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    SEVERITY_DOT[e.severity] ?? SEVERITY_DOT.info,
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-content">{e.title}</span>
                    {e.severity !== "info" && (
                      <Badge variant={SEVERITY_BADGE[e.severity]} size="sm">
                        {e.severity === "bad" ? "needs attention" : e.severity}
                      </Badge>
                    )}
                  </div>
                  {e.detail && (
                    <p className="truncate text-xs text-content-soft">{e.detail}</p>
                  )}
                  <p className="text-[0.6875rem] text-content-muted">
                    {e.actor_name ? `${e.actor_name}` : "System"}
                    {e.actor_role ? ` · ${e.actor_role === "business_owner" ? "business" : e.actor_role}` : ""}
                    {" · "}
                    {relative(e.at)}
                  </p>
                </div>
              </div>
            );

            return e.link ? (
              <Link key={`${e.at}-${e.kind}-${i}`} href={e.link} className="block">
                {row}
              </Link>
            ) : (
              <div key={`${e.at}-${e.kind}-${i}`}>{row}</div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
