"use client";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, Inbox, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/motion";

interface CollabRequest {
  id: string;
  status: string;
  message?: string | null;
  budget?: number | string | null;
  from_user_id: string;
  to_user_id: string;
  sender?: { name?: string | null; avatar_url?: string | null } | null;
  receiver?: { name?: string | null; avatar_url?: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
};

export default function RequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<CollabRequest[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const sb = createClient();
        const {
          data: { user },
          error: authErr,
        } = await sb.auth.getUser();
        if (authErr) throw authErr;
        setUserId(user?.id ?? null);

        const res = await apiFetch<{ collabs: CollabRequest[] }>("/api/collabs");
        if (!res.ok || !res.data) throw new Error(res.error || "HTTP error");
        setRequests(res.data.collabs || []);
      } catch (e) {
        console.error("[RequestsPage init error]:", e);
        setErrorMsg(e instanceof Error ? e.message : "Failed to load requests.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const refreshRequests = async () => {
    const res = await apiFetch<{ collabs: CollabRequest[] }>("/api/collabs");
    if (res.ok && res.data) setRequests(res.data.collabs || []);
  };

  // Fallback for accepted requests whose conversation predates this flow.
  const ensureConversation = async (otherUserId: string) => {
    const res = await apiFetch<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ other_user_id: otherUserId }),
    });
    return res.ok ? (res.data?.conversation?.id ?? null) : null;
  };

  const openConversation = async (requestId: string, otherUserId: string) => {
    setActionIds((prev) => new Set(prev).add(requestId));
    const convId = await ensureConversation(otherUserId);
    setActionIds((prev) => {
      const s = new Set(prev);
      s.delete(requestId);
      return s;
    });
    router.push(convId ? `/dashboard/messages?conv=${convId}` : "/dashboard/messages");
  };

  // Accepting a request no longer creates a project — it opens the conversation
  // where the two sides agree on terms and then create the project together.
  const handleAction = async (requestId: string, status: string, otherUserId: string) => {
    setActionIds((prev) => new Set(prev).add(requestId));
    try {
      const res = await apiFetch<{ conversation_id?: string | null }>("/api/collabs", {
        method: "PATCH",
        body: JSON.stringify({ id: requestId, status }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to update request");

      if (status === "accepted") {
        const convId =
          res.data?.conversation_id ?? (await ensureConversation(otherUserId));
        toast.success("Accepted — talk it through, then create the project together.");
        if (convId) {
          router.push(`/dashboard/messages?conv=${convId}`);
          return;
        }
      }
      await refreshRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setActionIds((prev) => {
        const s = new Set(prev);
        s.delete(requestId);
        return s;
      });
    }
  };

  const sent = userId ? requests.filter((r) => r.from_user_id === userId) : [];
  const received = userId ? requests.filter((r) => r.to_user_id === userId) : [];

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {errorMsg}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Collaboration requests"
        subtitle="Track every incoming and outgoing collaboration request."
      />

      {requests.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title="No requests yet"
            description="Requests will show up here once you start collaborating."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {received.length > 0 && (
            <RequestGroup
              label="Incoming"
              icon={<ArrowDownLeft className="size-3.5" />}
              count={received.length}
            >
              {received.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  isSender={false}
                  acting={actionIds.has(r.id)}
                  onAction={handleAction}
                  onOpenConversation={openConversation}
                />
              ))}
            </RequestGroup>
          )}

          {sent.length > 0 && (
            <RequestGroup
              label="Sent"
              icon={<ArrowUpRight className="size-3.5" />}
              count={sent.length}
            >
              {sent.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  isSender
                  acting={actionIds.has(r.id)}
                  onAction={handleAction}
                  onOpenConversation={openConversation}
                />
              ))}
            </RequestGroup>
          )}
        </div>
      )}
    </div>
  );
}

function RequestGroup({
  label,
  icon,
  count,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-brand">
          {icon}
          {label}
        </span>
        <Badge variant="brand" size="sm">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function RequestCard({
  r,
  isSender,
  acting,
  onAction,
  onOpenConversation,
}: {
  r: CollabRequest;
  isSender: boolean;
  acting: boolean;
  onAction: (id: string, status: string, otherUserId: string) => void;
  onOpenConversation: (id: string, otherUserId: string) => void;
}) {
  const otherParty = isSender ? r.receiver : r.sender;
  const otherUserId = isSender ? r.to_user_id : r.from_user_id;
  const title = r.message?.split("\n")[0] || "Collaboration request";
  const detail = r.message?.includes("\n")
    ? r.message.split("\n\n").slice(1).join(" ")
    : null;

  return (
    <Reveal>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 gap-3">
          <Avatar name={otherParty?.name} src={otherParty?.avatar_url} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-content">
                {otherParty?.name || "Unknown"}
              </span>
              <Badge variant={statusVariant(r.status)} size="sm" dot>
                {STATUS_LABEL[r.status] || r.status}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-content">{title}</p>
            {detail && <p className="truncate text-xs text-content-soft">{detail}</p>}
            {r.budget != null && r.budget !== "" && (
              <p className="mt-1 text-xs text-content-soft">
                Budget:{" "}
                <span className="font-bold text-content">
                  ₹{Number(r.budget).toLocaleString()}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          {isSender && r.status === "pending" && (
            <Button
              variant="surface"
              size="sm"
              disabled={acting}
              onClick={() => onAction(r.id, "cancelled", otherUserId)}
            >
              {acting ? "…" : "Cancel"}
            </Button>
          )}

          {!isSender && r.status === "pending" && (
            <>
              <Button
                variant="brand"
                size="sm"
                disabled={acting}
                onClick={() => onAction(r.id, "accepted", otherUserId)}
              >
                <Check /> {acting ? "…" : "Accept"}
              </Button>
              <Button
                variant="surface"
                size="sm"
                disabled={acting}
                onClick={() => onAction(r.id, "declined", otherUserId)}
              >
                Decline
              </Button>
            </>
          )}

          {/* Accepted means "we're talking", not "we're working" — the deal is
              agreed and the project created from inside the conversation. */}
          {r.status === "accepted" && (
            <Button
              variant="brand"
              size="sm"
              disabled={acting}
              onClick={() => onOpenConversation(r.id, otherUserId)}
            >
              <MessageSquare /> {acting ? "…" : "Open conversation"}
            </Button>
          )}
          {r.status === "declined" && (
            <Badge variant="danger" size="md">
              Declined
            </Badge>
          )}
          {r.status === "cancelled" && (
            <Badge variant="neutral" size="md">
              Cancelled
            </Badge>
          )}
        </div>
      </Card>
    </Reveal>
  );
}
