"use client";

/**
 * System health — the developer's view of what this deployment actually is.
 *
 * Three questions it exists to answer without SSH or a Supabase login:
 *   1. What is this environment pointed at? (Catches "staging is on the wrong
 *      database", which has happened.)
 *   2. Which integrations are configured? A missing secret explains a broken
 *      feature far more often than a bug does.
 *   3. Which migrations does the live database have? "Is 098 applied?" is the
 *      single most repeated question on this project.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Database,
  HeartPulse,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";

interface Health {
  environment: {
    app_env: string;
    node_env: string;
    app_url: string | null;
    supabase_project: string | null;
  };
  database: { reachable: boolean; latency_ms: number };
  integrations: { name: string; configured: boolean; required: boolean }[];
  features: { migration: string; label: string; applied: boolean }[];
  checked_at: string;
}

export default function AdminHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<Health>("/api/admin/health");
    if (!res.ok || !res.data) {
      setError(
        res.requestId ? `${res.error} (ref: ${res.requestId})` : res.error || "Could not read system health",
      );
    } else {
      setError("");
      setHealth(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missingRequired =
    health?.integrations.filter((i) => i.required && !i.configured) ?? [];
  const pendingMigrations = health?.features.filter((f) => !f.applied) ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Operations"
        title="System health"
        subtitle={
          health ? `Checked ${new Date(health.checked_at).toLocaleTimeString()}` : "What this deployment is running against"
        }
        icon={<HeartPulse />}
        actions={
          <Button size="sm" variant="surface" onClick={load}>
            <RefreshCw /> Re-check
          </Button>
        }
      />

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : !health ? null : (
        <>
          {/* Anything actually broken, stated first and plainly. */}
          {(missingRequired.length > 0 || pendingMigrations.length > 0 || !health.database.reachable) && (
            <Card className="flex flex-col gap-2 border-warn/30 bg-warn-soft p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-warn">
                <AlertTriangle className="size-4" /> Needs attention
              </p>
              {!health.database.reachable && (
                <p className="text-sm text-content">The database is not reachable from this deployment.</p>
              )}
              {missingRequired.map((i) => (
                <p key={i.name} className="text-sm text-content">
                  <strong>{i.name}</strong> is not configured — features that depend on it will fail.
                </p>
              ))}
              {pendingMigrations.map((f) => (
                <p key={f.label} className="text-sm text-content">
                  Migration <strong>{f.migration}</strong> is not applied — {f.label} is unavailable.
                </p>
              ))}
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Environment"
              value={health.environment.app_env}
              tone={health.environment.app_env === "production" ? "warning" : "brand"}
            />
            <StatCard
              label="Database"
              value={health.database.reachable ? "Connected" : "Down"}
              tone={health.database.reachable ? "success" : "warning"}
              hint={`${health.database.latency_ms}ms`}
              icon={<Database />}
            />
            <StatCard
              label="Supabase project"
              value={health.environment.supabase_project ?? "—"}
              tone="info"
            />
            <StatCard
              label="Migrations pending"
              value={pendingMigrations.length}
              tone={pendingMigrations.length > 0 ? "warning" : "success"}
            />
          </div>

          <SectionCard eyebrow="Credentials present on this deployment" title="Integrations">
            <div className="grid gap-2 sm:grid-cols-2">
              {health.integrations.map((i) => (
                <div
                  key={i.name}
                  className="flex items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2"
                >
                  <span className="text-sm font-semibold text-content">{i.name}</span>
                  {i.configured ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-ok">
                      <CheckCircle2 className="size-3.5" /> on
                    </span>
                  ) : i.required ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-danger">
                      <XCircle className="size-3.5" /> missing
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-content-muted">
                      <Circle className="size-3.5" /> off
                    </span>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Probed against the live database, not assumed"
            title="Applied migrations"
          >
            <div className="flex flex-col gap-2">
              {health.features.map((f) => (
                <div
                  key={`${f.migration}-${f.label}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" size="sm">
                      {f.migration}
                    </Badge>
                    <span className="text-sm font-semibold text-content">{f.label}</span>
                  </div>
                  <Badge variant={f.applied ? "success" : "warning"} size="sm">
                    {f.applied ? "applied" : "not applied"}
                  </Badge>
                </div>
              ))}
            </div>
          </SectionCard>

          <Card className="p-4 text-xs leading-relaxed text-content-muted">
            Serving from <code className="rounded bg-surface-muted px-1 py-0.5">{health.environment.app_url ?? "unknown"}</code>{" "}
            (NODE_ENV {health.environment.node_env}). Per-request HTTP telemetry lives in Azure
            Application Insights; error stacks live in Sentry. See
            docs/operations/OBSERVABILITY.md for what to check where.
          </Card>
        </>
      )}
    </div>
  );
}
