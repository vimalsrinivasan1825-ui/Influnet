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
interface InfluencerDetails {
  username: string | null;
  instagram_handle: string | null;
  youtube_handle: string | null;
  tiktok_handle: string | null;
  niche: string[] | null;
  city: string | null;
  state: string | null;
  instagram_followers: number | null;
  youtube_subscribers: number | null;
  is_verified: boolean | null;
}
interface BusinessDetails {
  company_name: string | null;
  industry: string | null;
  business_type: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  gst_number: string | null;
  team_size: string | null;
  approval_status: string | null;
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
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
    verification_status: string;
    created_at: string | null;
  } | null;
  influencer: InfluencerDetails | null;
  business: BusinessDetails | null;
  /** null for business rows — the ownership gate only applies to influencers (086). */
  ownershipVerified: boolean | null;
  /** How many open (unresolved) checks are stacked behind this one — one card
   *  shows the latest, this says how many times they've run it since. */
  openAttempts: number;
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
            {/* Ownership is a SEPARATE fact from the confidence score — a low
                score with ownership proven is exactly the case this queue was
                missing before (needs_more_info was excluded entirely). Shown
                up front because it decides whether Verify below will work. */}
            {item.role === "influencer" && (
              <Badge variant={item.ownershipVerified ? "success" : "neutral"} size="sm" className="gap-1">
                <BadgeCheck className="size-3" /> {item.ownershipVerified ? "Ownership proven" : "Ownership not proven"}
              </Badge>
            )}
            {/* This card shows their LATEST check; older stacked ones from
                repeat "Run verification" clicks are collapsed into this count
                rather than each getting their own duplicate card. */}
            {item.openAttempts > 1 && (
              <Badge variant="neutral" size="sm">
                Run {item.openAttempts}×
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-content-soft">{item.profile?.email}</p>
        </div>
      </div>

      {/* Everything the user submitted at signup — the admin's source of truth. */}
      <SignupDetails item={item} />

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

      {item.role === "influencer" && !item.ownershipVerified && (
        <p className="text-xs text-content-muted">
          Verify is disabled — the server refuses to grant the badge without a proven bio-link
          claim (086), regardless of what an admin decides. Ask them to complete ownership
          verification first.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="bg-ok text-white hover:bg-ok/90"
          disabled={acting || (item.role === "influencer" && !item.ownershipVerified)}
          title={
            item.role === "influencer" && !item.ownershipVerified
              ? "Ownership not proven yet — the server will refuse this"
              : undefined
          }
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

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-content-muted">{label}</dt>
      <dd className="truncate text-xs font-semibold text-content" title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

/** The full set of signup fields the user submitted, so the admin can verify them. */
function SignupDetails({ item }: { item: QueueItem }) {
  const p = item.profile;
  const memberSince = p?.created_at
    ? new Date(p.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const inf = item.influencer;
  const biz = item.business;
  const fmt = (n: number | null | undefined) => (n != null ? n.toLocaleString("en-IN") : null);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-hairline bg-surface-muted px-3 py-3 sm:grid-cols-3">
      <Detail label="Full name" value={p?.name} />
      <Detail label="Email" value={p?.email} />
      <Detail label="Phone" value={p?.phone} />
      <Detail label="Location" value={p?.location} />
      <Detail label="Signed up" value={memberSince} />

      {item.role === "influencer" && inf && (
        <>
          <Detail label="Username" value={inf.username ? `@${inf.username}` : null} />
          <Detail label="Instagram" value={inf.instagram_handle ? `@${inf.instagram_handle.replace(/^@/, "")}` : null} />
          <Detail label="IG followers" value={fmt(inf.instagram_followers)} />
          <Detail label="YouTube" value={inf.youtube_handle} />
          <Detail label="YT subscribers" value={fmt(inf.youtube_subscribers)} />
          <Detail label="TikTok" value={inf.tiktok_handle} />
          <Detail label="Niche" value={inf.niche?.length ? inf.niche.join(", ") : null} />
          <Detail label="City / State" value={[inf.city, inf.state].filter(Boolean).join(", ") || null} />
        </>
      )}

      {item.role !== "influencer" && biz && (
        <>
          <Detail label="Company" value={biz.company_name} />
          <Detail label="Industry" value={biz.industry} />
          <Detail label="Business type" value={biz.business_type} />
          <Detail label="Team size" value={biz.team_size} />
          <Detail label="GST number" value={biz.gst_number} />
          <Detail label="Website" value={biz.website} />
          <Detail label="City / State" value={[biz.city, biz.state].filter(Boolean).join(", ") || null} />
          <Detail label="Approval" value={biz.approval_status} />
        </>
      )}
    </dl>
  );
}
