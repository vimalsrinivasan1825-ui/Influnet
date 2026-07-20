"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileText,
  FolderKanban,
  History,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActivityEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
  project_id: number | null;
  actor_is_me: boolean;
}

const PAGE_SIZE = 50;

// Icon + accent per event family. Anything unrecognised falls back to a neutral
// dot, so a new activity type never renders as a broken row.
const STYLE: Record<string, { icon: React.ElementType; tone: string }> = {
  account_created: { icon: UserPlus, tone: "brand" },
  verified: { icon: BadgeCheck, tone: "ok" },
  request_sent: { icon: Send, tone: "brand" },
  request_received: { icon: Send, tone: "brand" },
  request_accepted: { icon: Check, tone: "ok" },
  request_declined: { icon: X, tone: "muted" },
  request_cancelled: { icon: Ban, tone: "muted" },
  terms_proposed: { icon: FileText, tone: "warn" },
  terms_accepted: { icon: Check, tone: "ok" },
  terms_declined: { icon: X, tone: "muted" },
  terms_withdrawn: { icon: Ban, tone: "muted" },
  project_started: { icon: FolderKanban, tone: "brand" },
  project_completed: { icon: Sparkles, tone: "ok" },
  project_cancelled: { icon: Ban, tone: "muted" },
  stage_advanced: { icon: ChevronRight, tone: "brand" },
  stage_signoff: { icon: Check, tone: "brand" },
  stage_skipped: { icon: ChevronRight, tone: "muted" },
  draft_approved: { icon: Check, tone: "ok" },
  revisions_requested: { icon: History, tone: "warn" },
  terms_change_proposed: { icon: FileText, tone: "warn" },
  terms_change_accepted: { icon: Check, tone: "ok" },
  terms_change_rejected: { icon: X, tone: "muted" },
  payment_paid: { icon: CircleDollarSign, tone: "ok" },
  completion_confirmed: { icon: Check, tone: "ok" },
  cancellation_requested: { icon: AlertTriangle, tone: "warn" },
  cancellation_accepted: { icon: Ban, tone: "muted" },
  cancellation_declined: { icon: Check, tone: "brand" },
};

const TONE: Record<string, string> = {
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  muted: "bg-surface-muted text-content-muted",
};

// "Today" / "Yesterday" / a real date — people scan a timeline by day.
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPage = async (offset: number) => {
    const res = await apiFetch<{ events: ActivityEvent[]; migration_pending?: boolean }>(
      `/api/activity?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    if (!res.ok || !res.data) throw new Error(res.error || "Failed to load your activity");
    return res.data.events || [];
  };

  useEffect(() => {
    (async () => {
      try {
        const first = await fetchPage(0);
        setEvents(first);
        if (first.length < PAGE_SIZE) setDone(true);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load your activity");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPage(events.length);
      setEvents((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE) setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {errorMsg}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  let lastDay: string | null = null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="My activity"
        subtitle="Everything you've done on Influnet, newest first. Tap any entry to open it."
      />

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History />}
            title="Nothing here yet"
            description="Your requests, projects and milestones will appear here as you go."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-1">
          {events.map((e, i) => {
            const day = dayLabel(e.at);
            const showDay = day !== lastDay;
            lastDay = day;
            const style = STYLE[e.kind] ?? { icon: History, tone: "muted" };
            const Icon = style.icon;
            const time = new Date(e.at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            });

            const row = (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors",
                  e.link && "hover:bg-surface-muted",
                )}
              >
                {/* The rail: icon plus a connecting line, so the sequence reads
                    as one continuous thread rather than separate cards. */}
                <div className="flex flex-col items-center self-stretch">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl",
                      TONE[style.tone],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-hairline" />}
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-content">{e.title}</span>
                    {e.actor_is_me && (
                      <Badge variant="neutral" size="sm">
                        You
                      </Badge>
                    )}
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 truncate text-xs text-content-soft">{e.detail}</p>
                  )}
                  <p className="mt-0.5 text-[0.6875rem] font-semibold text-content-muted">{time}</p>
                </div>

                {e.link && <ChevronRight className="mt-2 size-4 shrink-0 text-content-muted" />}
              </div>
            );

            return (
              <div key={`${e.at}-${e.kind}-${i}`}>
                {showDay && (
                  <div className="sticky top-0 z-10 bg-surface/90 px-3 pb-1 pt-3 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted backdrop-blur">
                    {day}
                  </div>
                )}
                {e.link ? <Link href={e.link}>{row}</Link> : row}
              </div>
            );
          })}

          {!done && (
            <Button
              variant="surface"
              size="sm"
              className="mt-3 self-center"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load older activity"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
