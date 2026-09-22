"use client";

/**
 * Error log (Kesavan's list) — what is breaking right now, for an ordinary
 * admin. Sentry remains the source of truth; this is a readable summary of it.
 * Stack traces and code locations stay on the developer Observability page.
 */

import { useCallback, useEffect, useState } from "react";
import { Bug, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  AdminPage, Badge, Button, DataTable, ErrorBanner, KpiRow, SectionCard,
  ago, dateTime, nf,
} from "@/components/dashboard/admin/kit";

const LEVEL_VARIANT: Record<string, any> = { fatal: "danger", error: "danger", warning: "warning", info: "info" };

export default function AdminErrorsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    const res = await apiFetch<any>(`/api/admin/errors${refresh ? "?refresh=1" : ""}`);
    if (!res.ok) setError(res.error || "Could not load errors");
    else { setError(""); setData(res.data); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = data?.counts ?? {};

  return (
    <AdminPage
      eyebrow="Logs"
      title="Error log"
      subtitle="Unresolved problems users are hitting, newest first"
      icon={<Bug />}
      error={error}
      actions={
        <Button variant="surface" size="sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw /> Refresh
        </Button>
      }
    >
      {data && !data.configured && (
        <ErrorBanner message="Error tracking is not switched on for this environment yet, so there is nothing to show. Once a Sentry key is configured, errors appear here automatically." />
      )}
      {data?.configured && !data.ok && <ErrorBanner message={data.reason || "Sentry could not be reached."} />}

      <KpiRow
        loading={loading}
        items={[
          { label: "Open issues", value: nf.format(counts.issues ?? 0), tone: (counts.issues ?? 0) > 0 ? "warning" : "success" },
          { label: "New since last release", value: nf.format(counts.newIssues ?? 0), tone: (counts.newIssues ?? 0) > 0 ? "warning" : "success", inverse: true },
          { label: "Total occurrences", value: nf.format(counts.events ?? 0), tone: "neutral" },
          { label: "People affected", value: nf.format(counts.usersAffected ?? 0), tone: (counts.usersAffected ?? 0) > 0 ? "warning" : "success", inverse: true },
        ]}
      />

      <SectionCard
        eyebrow={data?.generatedAt ? `Updated ${ago(data.generatedAt)}` : "Live"}
        title="What is breaking"
        bodyClassName="px-0 sm:px-0"
      >
        <DataTable
          loading={loading}
          rows={data?.issues ?? []}
          columns={[
            { key: "title", label: "Problem", render: (r: any) => (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">{r.title}</p>
                <p className="text-xs text-content-muted">First seen {dateTime(r.firstSeen)}</p>
              </div>
            ) },
            { key: "level", label: "Level", render: (r: any) => <Badge size="sm" variant={LEVEL_VARIANT[r.level] ?? "neutral"}>{r.level}</Badge> },
            { key: "isNew", label: "", render: (r: any) => (r.isNew ? <Badge size="sm" variant="warning">New</Badge> : null) },
            { key: "count", label: "Times", align: "right" },
            { key: "userCount", label: "People", align: "right" },
            { key: "lastSeen", label: "Last seen", align: "right", render: (r: any) => ago(r.lastSeen) },
          ]}
          empty={
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-content">Nothing unresolved.</p>
              <p className="mt-1 text-sm text-content-muted">No open errors are being reported right now.</p>
            </div>
          }
        />
      </SectionCard>
    </AdminPage>
  );
}
