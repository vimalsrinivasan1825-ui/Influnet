"use client";

/**
 * The two halves of "who is this person and how did they get here" on the
 * admin user page:
 *
 *   <LifecycleCard>  — where they are right now (lib/admin-user-lifecycle.ts)
 *   <JourneyPanel>   — everything they did, oldest signup to today
 *                      (migration 198, /api/admin/users/[id]/journey)
 *
 * The journey loads lazily — only when its tab is opened — and pages
 * backwards 300 events at a time. Where 198 is not applied yet it falls back
 * to the older deal-only activity list rather than claiming the person has
 * done nothing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Circle,
  Handshake,
  History,
  IndianRupee,
  LifeBuoy,
  Loader2,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
  UserCog,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Lifecycle } from "@/lib/admin-user-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Shared formatting ──────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: IST });
}

function dayLabel(iso: string): string {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" });
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
}

function rupees(v: number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  // adminJson masks a hidden money field to the string "Hidden".
  if (typeof v === "string" && Number.isNaN(Number(v))) return v;
  return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

const TONE_CLASSES: Record<Lifecycle["tone"], string> = {
  ok: "border-ok/25 bg-ok-soft",
  warn: "border-warn/25 bg-warn-soft",
  danger: "border-danger/25 bg-danger-soft",
  neutral: "border-hairline bg-surface-muted",
};

const TONE_TEXT: Record<Lifecycle["tone"], string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-content",
};

export function LifecycleCard({ lifecycle }: { lifecycle: Lifecycle }) {
  const reached = lifecycle.milestones.filter((m) => m.done).length;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className={cn("rounded-xl border px-4 py-3", TONE_CLASSES[lifecycle.tone])}>
        <div className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-content-muted">Right now</div>
        <div className={cn("mt-0.5 text-base font-bold", TONE_TEXT[lifecycle.tone])}>{lifecycle.headline}</div>
        <div className="mt-0.5 text-sm text-content-soft">{lifecycle.detail}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Joined" value={`${lifecycle.daysSinceSignup}d ago`} />
        <Stat
          label="Last seen"
          value={lifecycle.daysSinceSeen === null ? "Never" : lifecycle.daysSinceSeen === 0 ? "Today" : `${lifecycle.daysSinceSeen}d ago`}
        />
        <Stat label="Live projects" value={String(lifecycle.activeProjects)} />
        <Stat label="Completed" value={String(lifecycle.completedProjects)} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-content">Journey so far</span>
          <span className="text-xs text-content-muted">
            {reached} of {lifecycle.milestones.length} milestones
          </span>
        </div>
        <ol className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-4">
          {lifecycle.milestones.map((m) => (
            <li key={m.key} className="flex items-center gap-1.5 text-xs">
              {m.done ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-ok" />
              ) : (
                <Circle className="size-3.5 shrink-0 text-content-muted" />
              )}
              <span className={m.done ? "font-semibold text-content" : "text-content-muted"}>{m.label}</span>
              {m.at && <span className="text-content-muted">· {shortDate(m.at)}</span>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline px-3 py-2">
      <div className="text-[0.6875rem] font-semibold text-content-muted">{label}</div>
      <div className="text-sm font-bold text-content">{value}</div>
    </div>
  );
}

// ── Journey ────────────────────────────────────────────────────────────────

export interface JourneyEvent {
  at: string;
  kind: string;
  category: string;
  title: string;
  detail: string | null;
  link: string | null;
  actor: "self" | "other" | "admin" | "system";
  amount_inr: number | string | null;
  ip_address: string | null;
  platform: string | null;
  admin_email: string | null;
}

/** The pre-198 shape (admin_get_user_activity), used only as a fallback. */
export interface LegacyActivityEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
}

const CATEGORIES: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "account", label: "Account", icon: <UserRound className="size-3.5" /> },
  { key: "profile", label: "Profile", icon: <BadgeCheck className="size-3.5" /> },
  { key: "verification", label: "Verification", icon: <ShieldCheck className="size-3.5" /> },
  { key: "campaigns", label: "Campaigns", icon: <Megaphone className="size-3.5" /> },
  { key: "deals", label: "Requests & terms", icon: <Handshake className="size-3.5" /> },
  { key: "projects", label: "Projects", icon: <Briefcase className="size-3.5" /> },
  { key: "money", label: "Money", icon: <IndianRupee className="size-3.5" /> },
  { key: "support", label: "Support", icon: <LifeBuoy className="size-3.5" /> },
  { key: "safety", label: "Safety", icon: <ShieldAlert className="size-3.5" /> },
  { key: "usage", label: "App usage", icon: <Smartphone className="size-3.5" /> },
  { key: "admin", label: "Influnet team", icon: <UserCog className="size-3.5" /> },
];
const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

const ACTOR_LABEL: Record<JourneyEvent["actor"], { label: string; variant: "brand" | "neutral" | "warning" | "info" }> = {
  self: { label: "They did", variant: "brand" },
  other: { label: "Other party", variant: "info" },
  admin: { label: "Influnet team", variant: "warning" },
  system: { label: "System", variant: "neutral" },
};

export function JourneyPanel({
  userId,
  fallback,
}: {
  userId: string;
  fallback: LegacyActivityEvent[];
}) {
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyThem, setOnlyThem] = useState(false);

  const load = useCallback(
    async (before: string | null) => {
      const qs = before ? `?before=${encodeURIComponent(before)}` : "";
      const res = await apiFetch<{ events: JourneyEvent[]; nextBefore: string | null; available: boolean }>(
        `/api/admin/users/${userId}/journey${qs}`,
      );
      if (!res.ok || !res.data) {
        setError(res.error || "Could not load the journey");
        return;
      }
      setError("");
      setAvailable(res.data.available);
      setNextBefore(res.data.nextBefore);
      setEvents((prev) => (before ? [...prev, ...res.data!.events] : res.data!.events));
    },
    [userId],
  );

  useEffect(() => {
    setLoading(true);
    void load(null).finally(() => setLoading(false));
  }, [load]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of events) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [events]);

  const visible = useMemo(
    () => events.filter((e) => !hidden.has(e.category) && (!onlyThem || e.actor === "self")),
    [events, hidden, onlyThem],
  );

  const days = useMemo(() => {
    const groups: { key: string; label: string; items: JourneyEvent[] }[] = [];
    for (const e of visible) {
      const key = dayKey(e.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, label: dayLabel(e.at), items: [e] });
    }
    return groups;
  }, [visible]);

  if (loading) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </Card>
    );
  }

  if (!available) return <LegacyTimeline activity={fallback} />;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content">
          <History className="size-4" /> Full journey
          <span className="font-normal text-content-muted">
            · {visible.length}
            {nextBefore ? "+" : ""} events
          </span>
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-content-soft">
          <input
            type="checkbox"
            checked={onlyThem}
            onChange={(e) => setOnlyThem(e.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Only what they did
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.filter((c) => counts.has(c.key)).map((c) => {
          const on = !hidden.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors",
                on
                  ? "border-hairline-strong bg-surface text-content"
                  : "border-hairline bg-surface-muted text-content-muted line-through",
              )}
            >
              {c.icon} {c.label} <span className="text-content-muted">{counts.get(c.key)}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {days.length === 0 ? (
        <EmptyState
          icon={<History />}
          title={events.length ? "Nothing matches these filters" : "Nothing recorded"}
          description={events.length ? "Turn a category back on to see it." : "No activity on this account yet."}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((d) => (
            <section key={d.key}>
              <div className="sticky top-0 z-[1] mb-1 bg-surface py-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-content-muted">
                {d.label}
              </div>
              <ol className="flex flex-col border-l border-hairline pl-4">
                {d.items.map((e, i) => (
                  <JourneyRow key={`${e.at}-${e.kind}-${i}`} e={e} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {nextBefore && (
        <Button
          variant="surface"
          size="sm"
          className="self-center"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(nextBefore);
            setLoadingMore(false);
          }}
        >
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null} Load older events
        </Button>
      )}
    </Card>
  );
}

function JourneyRow({ e }: { e: JourneyEvent }) {
  const cat = CATEGORY_BY_KEY.get(e.category);
  const actor = ACTOR_LABEL[e.actor] ?? ACTOR_LABEL.system;
  const money = rupees(e.amount_inr);
  const meta = [
    money,
    e.platform,
    e.ip_address ? `IP ${e.ip_address}` : null,
    e.admin_email ? `by ${e.admin_email}` : null,
  ].filter(Boolean);

  const body = (
    <div className="relative flex items-start justify-between gap-3 py-2">
      <span className="absolute -left-[1.4rem] top-3 flex size-3.5 items-center justify-center rounded-full bg-surface text-content-muted">
        {cat?.icon ?? <Circle className="size-3" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-content">{e.title}</div>
        {e.detail && <div className="text-xs text-content-soft">{e.detail}</div>}
        {meta.length > 0 && <div className="mt-0.5 text-[0.6875rem] text-content-muted">{meta.join(" · ")}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs tabular-nums text-content-muted">{timeOfDay(e.at)}</span>
        <Badge variant={actor.variant} size="sm">{actor.label}</Badge>
      </div>
    </div>
  );

  return (
    <li>
      {e.link ? (
        <Link href={e.link} className="-mx-2 block rounded-lg px-2 hover:bg-surface-muted">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function LegacyTimeline({ activity }: { activity: LegacyActivityEvent[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-content">
        <History className="size-4" /> Activity
      </h2>
      <p className="text-xs text-content-muted">
        Showing requests, projects and payments only — the full journey appears once migration 198 is applied.
      </p>
      {activity.length === 0 ? (
        <EmptyState icon={<History />} title="Nothing recorded" description="This user hasn't done anything yet." />
      ) : (
        <div className="flex flex-col divide-y divide-hairline">
          {activity.map((e, i) => {
            const row = (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-content">{e.title}</div>
                  {e.detail && <div className="truncate text-xs text-content-muted">{e.detail}</div>}
                </div>
                <span className="shrink-0 text-xs text-content-muted">{shortDate(e.at)}</span>
              </div>
            );
            return e.link ? (
              <Link key={i} href={e.link} className="-mx-2 rounded-lg px-2 hover:bg-surface-muted">
                {row}
              </Link>
            ) : (
              <div key={i}>{row}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
