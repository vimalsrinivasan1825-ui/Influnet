"use client";

/**
 * Admin audit trail.
 *
 * The `admin_audit_log` table has existed since migration 070 and nothing has
 * ever read it. Because the admin account is shared with the client, "who did
 * this and when" is the question most likely to be asked in an argument — and
 * until now the only way to answer it was the Supabase SQL editor.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, History, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, TRow } from "@/components/ui/table";

interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Destructive or privilege-changing actions are worth spotting at a glance. */
function toneFor(action: string): "danger" | "warning" | "neutral" {
  if (action.includes("delete") || action.includes("revoke") || action.includes("admin"))
    return "danger";
  if (action.includes("update") || action.includes("approve") || action.includes("reject"))
    return "warning";
  return "neutral";
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ entries: AuditEntry[] }>("/api/admin/audit?limit=250");
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load the audit log");
    } else {
      setError("");
      setEntries(res.data.entries || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = entries.filter(
    (e) =>
      !search ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actor_email?.toLowerCase().includes(search.toLowerCase()) ||
      e.target_type?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        subtitle="Append-only record of every admin action"
        icon={<History />}
        actions={
          <InputGroup icon={<Search />} className="w-full sm:w-64">
            <Input
              placeholder="Filter by action or admin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History />}
            title="Nothing recorded"
            description="Admin actions will appear here as they happen."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th className="hidden md:table-cell">Target</th>
              </tr>
            </THead>
            <TBody>
              {filtered.map((e) => (
                <TRow key={e.id}>
                  <td className="whitespace-nowrap text-xs text-content-soft">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="text-sm text-content">{e.actor_email ?? "—"}</td>
                  <td>
                    <Badge variant={toneFor(e.action)} size="sm">
                      {e.action}
                    </Badge>
                  </td>
                  <td className="hidden text-xs text-content-muted md:table-cell">
                    {e.target_type ? `${e.target_type}` : "—"}
                    {e.target_id ? ` · ${e.target_id.slice(0, 8)}…` : ""}
                  </td>
                </TRow>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
