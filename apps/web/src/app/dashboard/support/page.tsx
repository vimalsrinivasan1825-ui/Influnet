"use client";

/**
 * Help & support — the user's side of a support conversation.
 *
 * Before this there was no in-product route to a human at all: a creator stuck
 * on verification or a business whose payment failed had nowhere to go inside
 * the app. One page, two states — the list of your requests, and the thread.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowLeft, LifeBuoy, Plus, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { track } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  last_message_at: string;
  awaiting_admin: boolean;
  created_at: string;
}

interface Message {
  id: string;
  body: string;
  from_admin: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: "account", label: "My account" },
  { value: "payment", label: "Payments" },
  { value: "verification", label: "Verification" },
  { value: "project", label: "A project" },
  { value: "bug", label: "Something is broken" },
  { value: "other", label: "Something else" },
];

const STATUS_VARIANT: Record<string, "warning" | "info" | "success" | "neutral"> = {
  open: "warning",
  pending: "info",
  resolved: "success",
  closed: "neutral",
};

export default function SupportPage() {
  const pathname = usePathname();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ tickets: Ticket[] }>("/api/support/tickets");
    if (!res.ok || !res.data) setError(res.error || "Could not load your requests");
    else {
      setError("");
      setTickets(res.data.tickets || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openThread(id: string) {
    setOpenId(id);
    setThreadLoading(true);
    const res = await apiFetch<{ ticket: Ticket; messages: Message[] }>(
      `/api/support/tickets/${id}`,
    );
    if (res.ok && res.data) setMessages(res.data.messages || []);
    else setError(res.error || "Could not open this request");
    setThreadLoading(false);
  }

  async function create() {
    setSubmitting(true);
    const res = await apiFetch<{ ticket: Ticket }>("/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({
        subject,
        category,
        message,
        // Context the support team would otherwise have to ask for. Only the
        // route, never the full URL — query strings carry tokens.
        context: {
          route: pathname,
          platform: "web",
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : undefined,
        },
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Could not open your request");
      return;
    }
    track("support_ticket_opened", { category });
    setComposing(false);
    setSubject("");
    setMessage("");
    setCategory("other");
    void load();
  }

  async function sendReply() {
    if (!openId || reply.trim().length === 0) return;
    const res = await apiFetch<{ message: Message }>(`/api/support/tickets/${openId}`, {
      method: "POST",
      body: JSON.stringify({ message: reply.trim() }),
    });
    if (!res.ok || !res.data) {
      setError(res.error || "Could not send your reply");
      return;
    }
    setMessages((prev) => [...prev, res.data!.message]);
    setReply("");
  }

  // ── Thread view ──────────────────────────────────────────────────────────
  if (openId) {
    const ticket = tickets.find((t) => t.id === openId);
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Button size="icon-sm" variant="ghost" onClick={() => setOpenId(null)} aria-label="Back">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-content">
              {ticket?.subject ?? "Your request"}
            </h1>
            {ticket && (
              <Badge variant={STATUS_VARIANT[ticket.status] ?? "neutral"} size="sm">
                {ticket.status}
              </Badge>
            )}
          </div>
        </div>

        <Card className="flex min-h-[24rem] flex-col gap-3 p-4 sm:p-5">
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
                    m.from_admin
                      ? "self-start bg-surface-muted text-content"
                      : "self-end bg-brand text-white",
                  )}
                >
                  {m.from_admin && (
                    <span className="mb-1 block text-[0.625rem] font-bold uppercase tracking-wide text-brand">
                      Influnet support
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <span
                    className={cn(
                      "mt-1 block text-[0.625rem]",
                      m.from_admin ? "text-content-muted" : "text-white/70",
                    )}
                  >
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>

          {ticket?.status !== "closed" && (
            <div className="flex items-end gap-2 border-t border-hairline pt-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="Add to this request…"
                className="min-h-[3rem] flex-1 resize-y rounded-xl border border-hairline bg-surface-card px-3 py-2 text-sm text-content outline-none focus:border-brand"
              />
              <Button variant="brand" size="lg" disabled={!reply.trim()} onClick={sendReply}>
                <Send /> Send
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="We're here"
        title="Help & support"
        subtitle="Ask us anything. A real person reads every request."
        icon={<LifeBuoy />}
        actions={
          !composing && (
            <Button variant="brand" onClick={() => setComposing(true)}>
              <Plus /> New request
            </Button>
          )
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {composing && (
        <Card className="flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="text-sm font-extrabold text-content">What do you need help with?</h2>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  category === c.value
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-hairline text-content-soft hover:border-content-muted",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Short summary"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="What happened? The more detail, the faster we can help."
            className="resize-y rounded-xl border border-hairline bg-surface-card px-3 py-2 text-sm text-content outline-none focus:border-brand"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={submitting || subject.trim().length < 3 || message.trim().length < 10}
              onClick={create}
            >
              Send request
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : tickets.length === 0 && !composing ? (
        <Card>
          <EmptyState
            icon={<LifeBuoy />}
            title="No requests yet"
            description="When something goes wrong or you're unsure, open a request and we'll pick it up."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className="rounded-xl border border-hairline bg-surface-card px-4 py-3 text-left transition-colors hover:border-content-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-content">{t.subject}</span>
                <Badge variant={STATUS_VARIANT[t.status] ?? "neutral"} size="sm">
                  {t.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-content-muted">
                Opened {new Date(t.created_at).toLocaleDateString()}
                {!t.awaiting_admin && t.status !== "closed" ? " · we've replied" : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
