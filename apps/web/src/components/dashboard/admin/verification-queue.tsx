"use client";
import { toast } from "sonner";

// Admin cockpit for the verification escalation queue. Everything the AI scorer
// could not auto-approve (medium confidence, suspicious flags, or a provider
// outage) lands here for a human decision. Consumes /api/admin/verifications.

import { useEffect, useState } from "react";
import { AtSign, BadgeCheck, CheckCircle2, Clock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface LiveIg {
  handle: string;
  found: boolean;
  follower_count: number | null;
  is_verified: boolean;
  is_private: boolean;
  last_post_days_ago: number | null;
  error?: string;
}
interface AiSignals {
  flags?: string[];
  platform_verified?: boolean;
  live?: { provider: string; status: string; instagram?: LiveIg };
}
interface QueueItem {
  id: string;
  user_id: string;
  role: string;
  status: string;
  ai_score: number | null;
  ai_reason: string | null;
  ai_signals: AiSignals | null;
  created_at: string;
  profile: { id: string; name: string; email: string; verification_status: string } | null;
}

type Decision = "verified" | "rejected" | "needs_more_info";

export function VerificationQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await apiFetch<{ queue: QueueItem[] }>("/api/admin/verifications");
    if (res.ok && res.data) setQueue(res.data.queue || []);
    else setError(res.error || "Failed to load verification queue");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (userId: string, status: Decision) => {
    setActingId(userId);
    try {
      const res = await apiFetch("/api/admin/verifications", {
        method: "PATCH",
        body: JSON.stringify({ user_id: userId, status }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to update");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActingId(null);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-brand">
          <ShieldCheck className="size-3.5" /> Verification queue
        </span>
        <Badge variant="brand" size="sm">
          {queue.length}
        </Badge>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <Card className="h-24 animate-pulse" />
      ) : queue.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title="Nothing to review"
            description="No verification requests are awaiting a decision."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((item) => (
            <QueueRow key={item.id} item={item} acting={actingId === item.user_id} onDecide={decide} />
          ))}
        </div>
      )}
    </section>
  );
}

function QueueRow({
  item,
  acting,
  onDecide,
}: {
  item: QueueItem;
  acting: boolean;
  onDecide: (userId: string, status: Decision) => void;
}) {
  const name = item.profile?.name || "Unknown user";
  const scorePct = item.ai_score != null ? Math.round(item.ai_score * 100) : null;
  const ig = item.ai_signals?.live?.instagram;
  const flags = item.ai_signals?.flags ?? [];
  const suspicious = flags.some((f) => /not_found|inflated|fraud|impersonat/.test(f));

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={name} size="md" square />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-content">{name}</span>
            <Badge variant={item.role === "influencer" ? "brand" : "neutral"} size="sm">
              {item.role === "influencer" ? "Creator" : "Business"}
            </Badge>
            {scorePct != null && (
              <Badge variant={scorePct >= 70 ? "success" : scorePct >= 40 ? "warning" : "danger"} size="sm">
                {scorePct}% confidence
              </Badge>
            )}
            {suspicious && (
              <Badge variant="danger" size="sm" className="gap-1">
                <ShieldAlert className="size-3" /> Flagged
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-content-soft">{item.profile?.email}</p>
        </div>
      </div>

      {item.ai_reason && <p className="text-xs text-content-muted">{item.ai_reason}</p>}

      {/* Live Instagram facts pulled during scoring — the human's evidence. */}
      {ig && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-soft">
          <span className="flex items-center gap-1 font-semibold text-content">
            <AtSign className="size-3.5" /> @{ig.handle}
          </span>
          {!ig.found && <span className="text-danger">not found / unavailable{ig.error ? ` (${ig.error})` : ""}</span>}
          {ig.found && (
            <>
              {ig.follower_count != null && <span>{ig.follower_count.toLocaleString()} followers</span>}
              {ig.is_verified && (
                <span className="flex items-center gap-1 text-brand">
                  <BadgeCheck className="size-3.5" /> IG verified
                </span>
              )}
              {ig.is_private && <span>private</span>}
              {ig.last_post_days_ago != null && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> last post {ig.last_post_days_ago}d ago
                </span>
              )}
            </>
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={f} variant={/not_found|inflated|fraud|impersonat/.test(f) ? "danger" : "neutral"} size="sm">
              {f}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="bg-ok text-white hover:bg-ok/90"
          disabled={acting}
          onClick={() => onDecide(item.user_id, "verified")}
        >
          <BadgeCheck /> {acting ? "…" : "Verify"}
        </Button>
        <Button variant="surface" size="sm" disabled={acting} onClick={() => onDecide(item.user_id, "needs_more_info")}>
          Ask for info
        </Button>
        <Button variant="surface" size="sm" className="text-danger" disabled={acting} onClick={() => onDecide(item.user_id, "rejected")}>
          <X /> Reject
        </Button>
      </div>
    </Card>
  );
}
