"use client";

/**
 * Moderation queue for user reports.
 *
 * `/api/admin/reports` has existed since migration 056 with a full GET/PATCH
 * workflow, but nothing ever rendered it — every harassment or scam report
 * filed by a user landed in a table no one on the team could see. This page is
 * that missing surface.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Flag, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/ui/tabs";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  project_id: number | null;
  created_at: string;
  reporter: { id: string; name: string } | null;
  reported: { id: string; name: string; verification_status?: string } | null;
}

const REASON_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  harassment: "danger",
  scam: "danger",
  spam: "warning",
  fake: "warning",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "reviewing">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ reports: Report[] }>("/api/admin/reports");
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load reports");
    } else {
      setError("");
      setReports(res.data.reports || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(id: string, status: string) {
    setBusyId(id);
    const res = await apiFetch("/api/admin/reports", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error || "Could not update the report");
      return;
    }
    // Actioned and dismissed both leave the queue (the API only returns
    // open/reviewing), so drop the row rather than refetching the whole list.
    if (status === "actioned" || status === "dismissed") {
      setReports((prev) => prev.filter((r) => r.id !== id));
    } else {
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
  }

  const visible = reports.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Trust & safety"
        title="Reports"
        subtitle={`${reports.length} report${reports.length === 1 ? "" : "s"} waiting on a decision`}
        icon={<ShieldAlert />}
      />

      <SegmentedTabs
        value={filter}
        onValueChange={setFilter}
        tabs={[
          { value: "all", label: "All", count: reports.length },
          {
            value: "open",
            label: "New",
            count: reports.filter((r) => r.status === "open").length,
          },
          {
            value: "reviewing",
            label: "Reviewing",
            count: reports.filter((r) => r.status === "reviewing").length,
          },
        ]}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Flag />}
            title="Nothing to review"
            description="No open reports. This is the state you want."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={REASON_TONE[r.reason] ?? "neutral"} size="sm">
                      {r.reason}
                    </Badge>
                    <Badge variant={r.status === "open" ? "warning" : "info"} size="sm">
                      {r.status}
                    </Badge>
                    {r.project_id != null && (
                      <Badge variant="outline" size="sm">
                        Project #{r.project_id}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-bold text-content">
                    {r.reported?.name ?? "Deleted user"}
                    <span className="font-medium text-content-muted"> reported by </span>
                    {r.reporter?.name ?? "Deleted user"}
                  </p>
                  <p className="text-xs text-content-muted">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {r.details && (
                <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm leading-relaxed text-content-soft">
                  {r.details}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {r.status === "open" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => move(r.id, "reviewing")}
                  >
                    Start reviewing
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === r.id}
                  onClick={() => move(r.id, "actioned")}
                >
                  Action taken
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === r.id}
                  onClick={() => move(r.id, "dismissed")}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
