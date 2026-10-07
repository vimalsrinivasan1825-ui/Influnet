"use client";

/**
 * Admin audit trail.
 *
 * The `admin_audit_log` table has existed since migration 070 and nothing has
 * ever read it. Because the admin account is shared with the client, "who did
 * this and when" is the question most likely to be asked in an argument — and
 * until now the only way to answer it was the Supabase SQL editor.
 *
 * Each row expands to the full record: what changed (before → after for
 * edits), the reason, the IP, and the raw metadata. A row whose target is a
 * person links to that person's page, and `?targetId=<uuid>` opens the trail
 * already filtered to them (the user page links here that way).
 */

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, History, Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, TRow } from "@/components/ui/table";
import { DeveloperGate } from "@/components/dashboard/admin/developer-gate";
import { AdminUserLink } from "@/components/dashboard/admin/user-link";

interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  nextBefore: number | null;
  admins: { id: string; email: string | null }[];
  people: Record<string, string>;
}

const PERSON_TARGETS = new Set(["user", "profile", "business_profile"]);
const PAGE = 200;

/** Destructive or privilege-changing actions are worth spotting at a glance. */
function toneFor(action: string): "danger" | "warning" | "neutral" {
  if (action.includes("delete") || action.includes("revoke") || action.includes("admin"))
    return "danger";
  if (action.includes("update") || action.includes("approv") || action.includes("reject") || action.includes("decided"))
    return "warning";
  return "neutral";
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** One-line summary of what an entry did, from the metadata conventions the routes use. */
function summary(e: AuditEntry): string | null {
  const m = e.metadata ?? {};
  if (Array.isArray(m.fields) && m.fields.length) return `Changed ${(m.fields as string[]).join(", ")}`;
  if (typeof m.approval_status === "string") return `Set to ${m.approval_status}`;
  if (typeof m.status === "string") return `Status → ${m.status}`;
  if (typeof m.reason === "string" && m.reason) return m.reason;
  if (typeof m.email === "string") return m.email;
  return null;
}

// useSearchParams() needs a Suspense boundary, or the build bails out of
// prerendering this route.
export default function AdminAuditPage() {
  return (
    <Suspense>
      <AuditView />
    </Suspense>
  );
}

function AuditView() {
  const params = useSearchParams();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [admins, setAdmins] = useState<AuditResponse["admins"]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [targetIdFilter, setTargetIdFilter] = useState(params.get("targetId") ?? "");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const fetchPage = useCallback(
    async (before: number | null) => {
      const qs = new URLSearchParams({ limit: String(PAGE) });
      if (actionFilter.trim()) qs.set("action", actionFilter.trim());
      if (actorFilter) qs.set("actorId", actorFilter);
      if (targetIdFilter.trim()) qs.set("targetId", targetIdFilter.trim());
      if (before) qs.set("before", String(before));
      const res = await apiFetch<AuditResponse>(`/api/admin/audit?${qs.toString()}`);
      if (!res.ok || !res.data) {
        setError(res.error || "Could not load the audit log");
        return;
      }
      setError("");
      const d = res.data;
      setEntries((prev) => (before ? [...prev, ...d.entries] : d.entries));
      setPeople((prev) => (before ? { ...prev, ...d.people } : d.people));
      if (d.admins.length) setAdmins(d.admins);
      setNextBefore(d.nextBefore);
    },
    [actionFilter, actorFilter, targetIdFilter],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(null).finally(() => setLoading(false));
  }, [fetchPage]);

  // Action/admin/target round-trip to the API, so they search the whole
  // table; the free-text box only narrows what is already loaded.
  const q = search.toLowerCase();
  const filtered = entries.filter(
    (e) =>
      !q ||
      e.action.toLowerCase().includes(q) ||
      e.actor_email?.toLowerCase().includes(q) ||
      e.target_type?.toLowerCase().includes(q) ||
      (e.target_id && people[e.target_id]?.toLowerCase().includes(q)),
  );

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const targetName = targetIdFilter ? people[targetIdFilter] : null;

  return (
    <DeveloperGate>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <PageHeader
          eyebrow="Accountability"
          title="Audit log"
          subtitle="Append-only record of every admin action. Click a row for the full record."
          icon={<History />}
        />

        <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <InputGroup icon={<Search />} className="w-full sm:w-56">
            <Input
              placeholder="Search loaded rows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-surface px-2 text-sm text-content sm:w-56"
            aria-label="Filter by admin"
          >
            <option value="">All admins</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email ?? a.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <Input
            className="w-full sm:w-40"
            placeholder="Action prefix…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <Input
            className="w-full sm:w-64"
            placeholder="Target ID…"
            value={targetIdFilter}
            onChange={(e) => setTargetIdFilter(e.target.value)}
          />
          {targetIdFilter && (
            <Button variant="surface" size="sm" onClick={() => setTargetIdFilter("")}>
              <X /> {targetName ? `Only ${targetName}` : "Clear target"}
            </Button>
          )}
        </Card>

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
                  <th className="w-6" />
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th className="hidden md:table-cell">Target</th>
                </tr>
              </THead>
              <TBody>
                {filtered.map((e) => {
                  const isOpen = open.has(e.id);
                  const isPerson = !!e.target_id && PERSON_TARGETS.has(e.target_type ?? "");
                  const line = summary(e);
                  return (
                    <Fragment key={e.id}>
                      <TRow interactive onClick={() => toggle(e.id)}>
                        <td className="text-content-muted">
                          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </td>
                        <td className="whitespace-nowrap text-xs text-content-soft">
                          {new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </td>
                        <td className="text-sm text-content">
                          {e.actor_id ? (
                            <AdminUserLink id={e.actor_id}>{e.actor_email ?? e.actor_id.slice(0, 8)}</AdminUserLink>
                          ) : (
                            e.actor_email ?? "—"
                          )}
                        </td>
                        <td>
                          <Badge variant={toneFor(e.action)} size="sm">
                            {e.action}
                          </Badge>
                          {line && <div className="mt-0.5 max-w-xs truncate text-xs text-content-muted">{line}</div>}
                        </td>
                        <td className="hidden text-xs text-content-muted md:table-cell">
                          {isPerson ? (
                            <AdminUserLink id={e.target_id} showIcon className="font-semibold text-content">
                              {people[e.target_id!] ?? `${e.target_type} · ${e.target_id!.slice(0, 8)}…`}
                            </AdminUserLink>
                          ) : (
                            <>
                              {e.target_type ?? "—"}
                              {e.target_id ? ` · ${e.target_id.slice(0, 8)}…` : ""}
                            </>
                          )}
                        </td>
                      </TRow>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={4} className="pb-4">
                            <EntryDetail
                              e={e}
                              personName={e.target_id ? people[e.target_id] : undefined}
                              onFilterTarget={() => setTargetIdFilter(e.target_id ?? "")}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}

        {nextBefore && !loading && (
          <Button
            variant="surface"
            size="sm"
            className="self-center"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await fetchPage(nextBefore);
              setLoadingMore(false);
            }}
          >
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null} Load older entries
          </Button>
        )}
      </div>
    </DeveloperGate>
  );
}

function EntryDetail({
  e,
  personName,
  onFilterTarget,
}: {
  e: AuditEntry;
  personName?: string;
  onFilterTarget: () => void;
}) {
  const m = e.metadata ?? {};
  const before = (m.before ?? null) as Record<string, unknown> | null;
  const after = (m.after ?? null) as Record<string, unknown> | null;
  const changed = before || after ? [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])] : [];
  const rest = Object.fromEntries(Object.entries(m).filter(([k]) => k !== "before" && k !== "after"));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-muted p-4 text-xs">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Row label="Entry">#{e.id}</Row>
        <Row label="When (IST)">{new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</Row>
        <Row label="Admin">{e.actor_email ?? "—"}</Row>
        <Row label="IP address">{e.ip_address ?? "—"}</Row>
        <Row label="Target type">{e.target_type ?? "—"}</Row>
        <Row label="Target">
          {e.target_id ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{e.target_id}</span>
              {personName && <span>({personName})</span>}
              <button type="button" onClick={onFilterTarget} className="font-semibold text-brand hover:underline">
                Every action on this
              </button>
            </span>
          ) : (
            "—"
          )}
        </Row>
      </dl>

      {changed.length > 0 && (
        <div>
          <div className="mb-1 font-bold text-content">What changed</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-content-muted">
                  <th className="py-1 pr-4 font-semibold">Field</th>
                  <th className="py-1 pr-4 font-semibold">Before</th>
                  <th className="py-1 font-semibold">After</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((k) => (
                  <tr key={k} className="border-t border-hairline">
                    <td className="py-1 pr-4 font-semibold text-content">{k}</td>
                    <td className="py-1 pr-4 text-danger">{fmtValue(before?.[k])}</td>
                    <td className="py-1 text-ok">{fmtValue(after?.[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(rest).length > 0 && (
        <div>
          <div className="mb-1 font-bold text-content">Details</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface p-3 font-mono text-[0.6875rem] text-content-soft">
            {JSON.stringify(rest, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-semibold text-content-muted">{label}</dt>
      <dd className="min-w-0 text-content">{children}</dd>
    </div>
  );
}
