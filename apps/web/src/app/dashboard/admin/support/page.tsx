"use client";

/**
 * Support inbox — the admin side of a conversation with a user.
 *
 * Two-pane on desktop (queue on the left, thread on the right), single-pane on
 * mobile where selecting a ticket replaces the list. The queue is ordered by
 * "waiting longest", which is the ordering the database already maintains via
 * the trigger in migration 098 — this page does not re-sort, so what an admin
 * sees matches what the counters say.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Inbox,
  Lock,
  MessageSquare,
  Send,
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

interface TicketUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  last_message_at: string;
  awaiting_admin: boolean;
  context?: Record<string, string>;
  user: TicketUser | null;
}

interface TicketMessage {
  id: string;
  body: string;
  from_admin: boolean;
  internal: boolean;
  created_at: string;
}

interface SupportStats {
  open_tickets: number;
  awaiting_admin: number;
  urgent_tickets: number;
  resolved_7d: number;
  new_feedback: number;
  open_reports: number;
  avg_resolution_hours: number | null;
}

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "neutral" | "info"> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "info",
};

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"queue" | "resolved" | "closed">("queue");

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const loadQueue = useCallback(async (which: string) => {
    setLoading(true);
    const qs = which === "queue" ? "" : `?status=${which}`;
    const res = await apiFetch<{ tickets: Ticket[]; stats: SupportStats | null }>(
      `/api/admin/support${qs}`,
    );
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load the support queue");
    } else {
      setError("");
      setTickets(res.data.tickets || []);
      if (res.data.stats) setStats(res.data.stats);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue(filter);
  }, [filter, loadQueue]);

  const openThread = useCallback(async (ticket: Ticket) => {
    setSelected(ticket);
    setThreadLoading(true);
    setMessages([]);
    const res = await apiFetch<{ ticket: Ticket; messages: TicketMessage[] }>(
      `/api/admin/support?id=${encodeURIComponent(ticket.id)}`,
    );
    if (res.ok && res.data) {
      setSelected(res.data.ticket);
      setMessages(res.data.messages || []);
    } else {
      setError(res.error || "Could not open the ticket");
    }
    setThreadLoading(false);
  }, []);

  async function send() {
    if (!selected || reply.trim().length === 0) return;
    setSending(true);
    const res = await apiFetch<{ message: TicketMessage }>("/api/admin/support", {
      method: "POST",
      body: JSON.stringify({
        ticket_id: selected.id,
        message: reply.trim(),
        internal,
      }),
    });
    setSending(false);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not send the reply");
      return;
    }
    setMessages((prev) => [...prev, res.data!.message]);
    setReply("");
    // An internal note does not change the queue (the trigger skips it), so
    // only a real reply is worth refetching for.
    if (!internal) void loadQueue(filter);
  }

  async function update(patch: Record<string, unknown>) {
    if (!selected) return;
    const res = await apiFetch<{ ticket: Ticket }>("/api/admin/support", {
      method: "PATCH",
      body: JSON.stringify({ id: selected.id, ...patch }),
    });
    if (!res.ok) {
      setError(res.error || "Could not update the ticket");
      return;
    }
    setSelected((prev) => (prev ? { ...prev, ...patch } as Ticket : prev));
    void loadQueue(filter);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Customer support"
        title="Support inbox"
        subtitle="Every request a user has sent, oldest wait first"
        icon={<Inbox />}
      />

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Waiting on us"
            value={stats.awaiting_admin}
            tone={stats.awaiting_admin > 0 ? "warning" : "success"}
            icon={<Clock />}
            hint="User replied last"
          />
          <StatCard label="Open" value={stats.open_tickets} tone="brand" icon={<MessageSquare />} />
          <StatCard
            label="Urgent"
            value={stats.urgent_tickets}
            tone={stats.urgent_tickets > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Avg. resolution"
            value={stats.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : "—"}
            tone="info"
            hint="Last 30 days"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Queue */}
        <div className={cn("flex flex-col gap-3", selected && "hidden lg:flex")}>
          <SegmentedTabs
            value={filter}
            onValueChange={setFilter}
            size="sm"
            tabs={[
              { value: "queue", label: "Active" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ]}
          />

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox />}
                title="Nothing here"
                description="No tickets in this view."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openThread(t)}
                  className={cn(
                    "rounded-xl border border-hairline bg-surface-card px-4 py-3 text-left transition-colors hover:border-content-muted",
                    selected?.id === t.id && "border-brand bg-brand-soft/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-sm font-bold text-content">
                      {t.subject}
                    </span>
                    {t.awaiting_admin && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-warn" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={PRIORITY_VARIANT[t.priority] ?? "neutral"} size="sm">
                      {t.priority}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      {t.category}
                    </Badge>
                    <span className="text-[0.6875rem] text-content-muted">
                      {relative(t.last_message_at)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-content-muted">
                    {t.user?.name ?? "Deleted user"} · {t.user?.email ?? "—"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thread */}
        <div className={cn("flex flex-col gap-3", !selected && "hidden lg:flex")}>
          {!selected ? (
            <Card className="hidden lg:block">
              <EmptyState
                icon={<MessageSquare />}
                title="Pick a ticket"
                description="Select a request on the left to read and reply."
              />
            </Card>
          ) : (
            <Card className="flex min-h-[28rem] flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="lg:hidden"
                  onClick={() => setSelected(null)}
                  aria-label="Back to the queue"
                >
                  <ArrowLeft />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-extrabold text-content">{selected.subject}</h2>
                  <p className="text-xs text-content-muted">
                    {selected.user?.name} · {selected.user?.email} · opened{" "}
                    {new Date(selected.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Diagnostic context the user did not have to type. */}
              {selected.context && Object.keys(selected.context).length > 0 && (
                <div className="flex flex-wrap gap-1.5 rounded-xl bg-surface-muted px-3 py-2">
                  {Object.entries(selected.context).map(([k, v]) => (
                    <Badge key={k} variant="outline" size="sm">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="surface" onClick={() => update({ priority: "urgent" })}>
                  Mark urgent
                </Button>
                <Button size="sm" variant="surface" onClick={() => update({ assign_to_me: true })}>
                  Assign to me
                </Button>
                <Button size="sm" variant="brand" onClick={() => update({ status: "resolved" })}>
                  Resolve
                </Button>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
                {threadLoading ? (
                  <>
                    <Skeleton className="h-16 w-3/4 rounded-xl" />
                    <Skeleton className="h-16 w-3/4 self-end rounded-xl" />
                  </>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.internal
                          ? "self-end border border-warn/30 bg-warn-soft text-content"
                          : m.from_admin
                            ? "self-end bg-brand text-white"
                            : "self-start bg-surface-muted text-content",
                      )}
                    >
                      {m.internal && (
                        <span className="mb-1 flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide text-warn">
                          <Lock className="size-3" /> Internal note
                        </span>
                      )}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <span
                        className={cn(
                          "mt-1 block text-[0.625rem]",
                          m.from_admin && !m.internal ? "text-white/70" : "text-content-muted",
                        )}
                      >
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-hairline pt-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-content-soft">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    className="size-3.5 accent-[var(--warn)]"
                  />
                  Internal note — the user will not see this
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={internal ? "Note for the team…" : "Reply to the user…"}
                    rows={3}
                    className="min-h-[3.5rem] flex-1 resize-y rounded-xl border border-hairline bg-surface-card px-3 py-2 text-sm text-content outline-none focus:border-brand"
                  />
                  <Button
                    size="lg"
                    variant="brand"
                    disabled={sending || reply.trim().length === 0}
                    onClick={send}
                  >
                    <Send /> Send
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
