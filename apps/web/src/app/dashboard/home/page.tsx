"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  Camera,
  Check,
  Clock,
  Copy,
  CreditCard,
  Eye,
  ExternalLink,
  FileClock,
  FolderKanban,
  Handshake,
  Inbox,
  AtSign,
  PlaySquare,
  Play,
  Heart,

  Star,
  Users,
  CheckCircle2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedBadge, type VerificationStatus } from "@/components/ui/verified-badge";
import { useEntitlements } from "@/lib/hooks/use-entitlements";
import { Reveal } from "@/components/ui/motion";
import { dealStateOf, DEAL_STATE_STYLE } from "@/lib/project-status";
import { STAGE_LABELS, type Stage } from "@/lib/project-lifecycle";
import { PlatformMark, platformLabel, platformColor } from "@/components/dashboard/platform-mark";
import { cn } from "@/lib/utils";

interface HomeData {
  role: string;
  profile: {
    name: string;
    location: string | null;
    verified: boolean;
    verification_status: VerificationStatus | null;
  };
  public_profile: Record<string, any>;
  public_path: string | null;
  ongoing: {
    id: number;
    title: string;
    status: string;
    current_stage: string | null;
    budget: number | string | null;
    partner: string | null;
  }[];
  completed: {
    id: number;
    title: string;
    budget: number | string | null;
    completed_at: string | null;
    partner: string | null;
  }[];
  social: {
    followers: number | null;
    posts_count: number | null;
    avg_views: number | null;
    engagement_rate: number | null;
    fetched_at: string | null;
    posts: {
      url: string;
      thumbUrl: string | null;
      views: number | null;
      likes: number | null;
      type: string;
    }[];
  } | null;
  youtube: {
    subscribers: number | null;
    avg_views: number | null;
    handle: string | null;
    fetched_at: string | null;
    videos: {
      url: string;
      title: string;
      thumbUrl: string | null;
      views: number | null;
      likes: number | null;
      publishedAt: string | null;
    }[];
  } | null;
  audience: {
    locations: { label: string; pct: number }[];
    ages: { label: string; pct: number }[];
    genders: { label: string; pct: number }[];
  } | null;
  past_collaborations: string[];
  reviews: {
    count: number;
    average: number | null;
    items: {
      id: string;
      rating: number;
      comment: string | null;
      reviewerName: string;
      createdAt: string | null;
    }[];
  } | null;
  counts: {
    ongoing: number;
    completed: number;
    awaiting_me: number;
    awaiting_them: number;
    pending_requests: number;
  };
  /**
   * Four blocks that existed in the database and were rendered nowhere until
   * migration 116 and the Home rework — views, click-through, settled money and
   * the funnel. All optional: a backend one deploy behind omits them, and every
   * reader below treats missing as "don't draw the card" rather than as zero.
   */
  attention?: {
    profile_views: number;
    profile_views_delta_pct: number | null;
    business_viewers: number | null;
    window_days: number;
  } | null;
  reach?: {
    people: number;
    clicks: number;
    delta_pct: number | null;
    channels: { link_type: string; clicks: number; people: number }[];
    window_days: number;
  } | null;
  money?: {
    earned: number;
    pending: number;
    windows: { week: number; month: number; year: number };
    settled_payments_exist: boolean;
  } | null;
  pipeline?: { key: string; label: string; count: number }[];
}

const rupees = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * One icon + one color per pipeline step, so the funnel reads as six distinct
 * places rather than six identical purple boxes with different numbers. Keyed
 * off the same step keys /api/home sends (see PIPELINE_STEPS there) — mobile's
 * strip and this one can never draw a different funnel because both read the
 * same six keys, but each picks its own presentation for its own screen.
 */
const PIPELINE_STEP_STYLE: Record<string, { icon: typeof Inbox; color: string }> = {
  requests: { icon: Inbox, color: "#0BA5EC" },
  setup: { icon: Handshake, color: "#6172F3" },
  production: { icon: Camera, color: "#9E77ED" },
  review: { icon: Eye, color: "#F79009" },
  payment: { icon: CreditCard, color: "#12B76A" },
  completed: { icon: BadgeCheck, color: "#16A34A" },
};

const compact = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
};

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Purely cosmetic — it decides whether this user's own verified badge is
  // gold. `isPro` is false while loading and false when paid plans are switched
  // off, so the badge never flashes gold and then downgrades.
  const { isPro } = useEntitlements();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<HomeData>("/api/home");
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load your home");
        setData(res.data);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load your home");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyLink = () => {
    if (!data?.public_path) return;
    navigator.clipboard.writeText(`${window.location.origin}${data.public_path}`);
    setCopied(true);
    toast.success("Public link copied.");
    setTimeout(() => setCopied(false), 2000);
  };

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" /> {errorMsg}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const isCreator = data.role === "influencer";
  const pp = data.public_profile;
  const handle = pp.username ? `@${pp.username}` : null;
  const needsMe = data.counts.awaiting_me + data.counts.pending_requests;

  const social = data.social;
  const youtube = data.youtube;
  // Instagram gives us posts we could not cache a thumbnail for. Showing those
  // as blank placeholder tiles reads as broken, so only fetched images appear.
  const thumbedPosts = (social?.posts ?? []).filter((p) => p.thumbUrl);
  const videos = (youtube?.videos ?? []).filter((v) => v.thumbUrl);
  const audience = data.audience;
  const reviews = data.reviews;
  const attention = data.attention ?? null;
  const reach = data.reach ?? null;
  const money = data.money ?? null;
  const pipeline = data.pipeline ?? [];

  // The headline numbers a brand judges you on, straight from the captured
  // snapshot the public page renders — not a second set of figures.
  const analytics = isCreator
    ? [
        { label: "Followers", value: compact(social?.followers ?? pp.instagram_followers) },
        {
          label: "Engagement",
          value: social?.engagement_rate != null ? `${social.engagement_rate}%` : null,
        },
        { label: "Avg views", value: compact(social?.avg_views) },
        { label: "Posts", value: compact(social?.posts_count) },
        { label: "Subscribers", value: compact(youtube?.subscribers ?? pp.youtube_subscribers) },
      ].filter((s) => s.value)
    : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      {/* ── How you appear publicly ─────────────────────────────────────── */}
      <Reveal>
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-4 bg-brand-soft/50 p-5 sm:flex-row sm:items-center sm:p-6">
            {/* Creators show their captured Instagram picture — the same one
                on their public page; brands show their logo. */}
            <Avatar
              name={data.profile.name}
              src={pp.avatar_url ?? pp.logo_url}
              size="xl"
              className="size-20 shrink-0 text-2xl sm:size-24 sm:text-3xl"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-extrabold tracking-tight text-content">
                  {isCreator ? data.profile.name : pp.company_name || data.profile.name}
                </h1>
                {/* Gold on a Pro subscriber's mark. `pro` only ever gilds a
                    badge that is ALREADY verified (VerifiedBadge enforces
                    that) — paying must never look like being verified. */}
                {data.profile.verified && (
                  <VerifiedBadge
                    status={data.profile.verification_status}
                    size="sm"
                    pro={isPro}
                  />
                )}
              </div>
              <p className="mt-0.5 text-sm text-content-soft">
                {handle ?? "Set a username in Settings to get a public link"}
                {data.profile.location ? ` · ${data.profile.location}` : ""}
                {!isCreator && pp.industry ? ` · ${pp.industry}` : ""}
              </p>

              {pp.bio && (
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-content-soft">{pp.bio}</p>
              )}

              {(pp.niche ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(pp.niche as string[]).slice(0, 5).map((n) => (
                    <Badge key={n} variant="brand" size="sm">
                      {n}
                    </Badge>
                  ))}
                </div>
              )}

              {isCreator && (pp.instagram_handle || pp.youtube_handle) && (
                <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-content-soft">
                  {pp.instagram_handle && (
                    <span className="inline-flex items-center gap-1">
                      <AtSign className="size-3.5" /> {pp.instagram_handle}
                    </span>
                  )}
                  {pp.youtube_handle && (
                    <span className="inline-flex items-center gap-1">
                      <PlaySquare className="size-3.5" /> {pp.youtube_handle}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <ButtonLink href="/dashboard/profile" variant="brand" size="sm">
                View public profile
              </ButtonLink>
              {data.public_path && (
                <>
                  <Button variant="surface" size="sm" onClick={copyLink}>
                    {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
                  </Button>
                  <ButtonLink
                    href={data.public_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="surface"
                    size="sm"
                    aria-label="Open public profile in a new tab"
                  >
                    <ExternalLink />
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

        </Card>
      </Reveal>

      {/* Without a captured snapshot there are no numbers and no posts, which
          otherwise reads as a broken page rather than an unconnected account. */}
      {isCreator && !social && (
        <Reveal>
          <Card className="flex flex-col gap-3 border-warn/30 bg-warn-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-sm font-bold text-content">Connect Instagram to show your numbers</p>
              <p className="text-xs text-content-soft">
                Brands see your followers, engagement and recent posts on your public profile.
                Nothing is shown until your account is linked.
              </p>
            </div>
            <ButtonLink href="/dashboard/settings" variant="brand" size="sm" className="shrink-0">
              Connect account <ArrowRight />
            </ButtonLink>
          </Card>
        </Reveal>
      )}

      {/* ── Anything waiting on a decision ──────────────────────────────── */}
      {/* Right below the profile card, above everything else — this is the
          answer to "what do I open Home to do", and it was previously buried
          below the pipeline and money sections where opening the page for a
          decision meant scrolling past two cards that aren't one. One card per
          KIND of thing waiting, not one banner naming both: a single line
          reading "3 collaboration requests · 2 sets of terms" made the two
          into one blur with one button that only ever went to one of them. */}
      {needsMe > 0 && (
        <Reveal>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-content">
              {needsMe} thing{needsMe > 1 ? "s" : ""} waiting on you
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.counts.pending_requests > 0 && (
                <Link href="/dashboard/requests">
                  <Card
                    interactive
                    className="flex cursor-pointer items-center gap-3 border-warn/30 bg-warn-soft p-4 transition-colors"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/60 text-warn">
                      <Inbox className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-content">
                        {data.counts.pending_requests} collaboration{" "}
                        {data.counts.pending_requests > 1 ? "requests" : "request"}
                      </p>
                      <p className="text-xs text-content-soft">
                        {isCreator ? "Brands waiting for your reply" : "Waiting for a reply"}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-warn" />
                  </Card>
                </Link>
              )}
              {data.counts.awaiting_me > 0 && (
                <Link href="/dashboard/messages">
                  <Card
                    interactive
                    className="flex cursor-pointer items-center gap-3 p-4 transition-colors"
                    style={{ backgroundColor: "#9E77ED14", borderColor: "#9E77ED40" }}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/60"
                      style={{ color: "#7C3AED" }}
                    >
                      <FileClock className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-content">
                        {data.counts.awaiting_me} set{data.counts.awaiting_me > 1 ? "s" : ""} of terms
                      </p>
                      <p className="text-xs text-content-soft">Review and accept, or send changes</p>
                    </div>
                    <ArrowRight className="size-4 shrink-0" style={{ color: "#7C3AED" }} />
                  </Card>
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* Collaboration counters — separate from audience analytics so the two
          kinds of number are not read as one set. */}
      {/* Each counter is a shortcut, not a decoration — the whole point of
          having them at the top is to get somewhere in one click. An icon and
          a real tint on every tile, not just the ones with a nonzero count: a
          row of four bare numbers with the same grey label reads as one
          undifferentiated block, which was the actual complaint. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Ongoing", value: data.counts.ongoing, href: "/dashboard/projects", icon: FolderKanban, fg: "text-brand", bg: "bg-brand-soft" },
          { label: "Completed", value: data.counts.completed, href: "/dashboard/projects", icon: BadgeCheck, fg: "text-ok", bg: "bg-ok-soft" },
          {
            label: "Needs you",
            value: needsMe,
            href: data.counts.pending_requests ? "/dashboard/requests" : "/dashboard/messages",
            icon: Handshake,
            fg: "text-warn",
            bg: "bg-warn-soft",
          },
          { label: "Awaiting them", value: data.counts.awaiting_them, href: "/dashboard/messages", icon: Clock, fg: "text-info", bg: "bg-info-soft" },
        ].map((c) => (
          <Link key={c.label} href={c.href}>
            <Card interactive className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", c.bg, c.fg)}>
                <c.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-lg font-extrabold tabular-nums text-content">{c.value}</div>
                <div className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                  {c.label}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── The funnel, on one line ─────────────────────────────────────── */}
      {/* Six steps, starting BEFORE a project exists: an inbound request is the
          real first step of a collaboration, and no stage-based view can show
          it because nothing has been created yet. The steps come from the API
          so this and the mobile strip can never draw different funnels. */}
      {pipeline.length > 0 && pipeline.some((s) => s.count > 0) && (
        <Reveal>
          <Card className="overflow-x-auto p-5 sm:p-6">
            {/* justify-between rather than a packed row: six tiles at a fixed
                min-width left in a "min-w-max" flex used to bunch together on
                anything wider than a phone, with the whole card's extra room
                sitting unused on the right. Spreading them across the card's
                actual width is what a wider container was FOR. */}
            <div className="flex w-full min-w-max items-center justify-between gap-2">
              {pipeline.map((step, i) => {
                const style = PIPELINE_STEP_STYLE[step.key] ?? PIPELINE_STEP_STYLE.requests;
                const Icon = style.icon;
                return (
                  <div key={step.key} className="flex items-center gap-2">
                    <Link
                      href={step.key === "requests" ? "/dashboard/requests" : "/dashboard/projects"}
                      className="flex min-w-[6.5rem] flex-col items-center gap-1.5 rounded-xl border px-4 py-3 transition-opacity hover:opacity-80"
                      style={
                        step.count > 0
                          ? { borderColor: `${style.color}40`, backgroundColor: `${style.color}14` }
                          : undefined
                      }
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: step.count > 0 ? style.color : "var(--surface-muted)",
                          color: step.count > 0 ? "#fff" : "var(--content-muted)",
                        }}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span
                        className="text-lg font-extrabold tabular-nums"
                        style={{ color: step.count > 0 ? style.color : "var(--content-muted)" }}
                      >
                        {step.count}
                      </span>
                      <span className="text-[0.6875rem] font-semibold text-content-muted">
                        {step.label}
                      </span>
                    </Link>
                    {i < pipeline.length - 1 && (
                      <ArrowRight className="size-4 shrink-0 text-content-muted" />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ── Money, and who is looking — side by side, not stacked ────────── */}
      {/* Two cards, not one four-way divided strip: settled/pending money and
          who's-looking/reach are different questions, and giving them each a
          full card is both what makes the money numbers big enough to read at
          a glance and what actually uses the width a wider page freed up. */}
      {(money || attention) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {money && (
            <Reveal>
              <Card className="flex h-full flex-col justify-center gap-5 p-5 sm:p-6">
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-content-muted">
                    {isCreator ? "Settled to you" : "Paid out"}
                  </p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-content">
                    {rupees(money.earned)}
                  </p>
                </div>
                {money.pending > 0 && (
                  <div className="flex items-center gap-3 rounded-xl bg-warn-soft px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/60 text-warn">
                      <CreditCard className="size-4" />
                    </span>
                    <div>
                      <p className="text-xl font-extrabold tabular-nums text-warn">
                        {rupees(money.pending)}
                      </p>
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                        {isCreator ? "Awaiting payment" : "Due to pay"}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            </Reveal>
          )}

          {attention && (
            <Reveal delay={0.05}>
              <Card className="flex h-full flex-col gap-4 p-5 sm:p-6">
                <div className="flex gap-6">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold tabular-nums text-content">
                        {compact(attention.profile_views) ?? attention.profile_views}
                      </span>
                      {attention.profile_views_delta_pct != null && (
                        <span
                          className={cn(
                            "text-xs font-bold",
                            attention.profile_views_delta_pct >= 0 ? "text-ok" : "text-danger",
                          )}
                        >
                          {attention.profile_views_delta_pct >= 0 ? "+" : "−"}
                          {Math.abs(attention.profile_views_delta_pct)}%
                        </span>
                      )}
                    </div>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                      Profile views · {attention.window_days}d
                    </p>
                  </div>
                  {isCreator && attention.business_viewers != null && (
                    <div>
                      <span className="text-2xl font-extrabold tabular-nums text-content">
                        {compact(attention.business_viewers) ?? attention.business_viewers}
                      </span>
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                        Brands who looked
                      </p>
                    </div>
                  )}
                </div>

                {/* Where the visitors went. Only drawn once somebody has
                    actually clicked something — an empty panel on a new
                    profile is a worse first impression than no panel. */}
                {isCreator && reach && reach.clicks > 0 && (
                  <div className="flex flex-col gap-2.5 border-t border-hairline pt-4">
                    <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                      Where visitors go · last {reach.window_days} days
                    </p>
                    {reach.channels.map((c) => (
                      <div key={c.link_type} className="flex items-center gap-3">
                        <PlatformMark platform={c.link_type} size={22} />
                        <span className="w-16 shrink-0 text-xs font-semibold text-content-soft">
                          {platformLabel(c.link_type)}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              backgroundColor: platformColor(c.link_type),
                              width: `${Math.max(
                                (c.clicks / Math.max(...reach.channels.map((x) => x.clicks), 1)) * 100,
                                4,
                              )}%`,
                            }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-content">
                          {c.clicks}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Reveal>
          )}
        </div>
      )}

      {/* ── Ongoing collaborations ──────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-content-muted">
            Ongoing collaborations
          </h2>
          <Link
            href="/dashboard/projects"
            className="text-xs font-semibold text-brand hover:underline"
          >
            All projects
          </Link>
        </div>

        {data.ongoing.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderKanban />}
              title="Nothing in flight"
              description={
                isCreator
                  ? "Accepted collaborations will appear here once terms are agreed."
                  : "Reach out to a creator to start your first collaboration."
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {data.ongoing.map((p) => {
              const style = DEAL_STATE_STYLE[dealStateOf(p.status)];
              return (
                <Reveal key={p.id}>
                  <Link href={`/dashboard/projects/${p.id}`}>
                    <Card
                      interactive
                      className={cn("flex items-center gap-3 p-4 transition-colors", style.surface)}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          style.chip,
                        )}
                      >
                        <FolderKanban className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-content">{p.title}</p>
                        <p className="truncate text-xs text-content-soft">
                          {p.partner ? `With ${p.partner}` : "Collaboration"}
                          {p.current_stage
                            ? ` · ${STAGE_LABELS[p.current_stage as Stage] ?? p.current_stage}`
                            : ""}
                        </p>
                      </div>
                      {p.budget != null && p.budget !== "" && (
                        <span className="hidden shrink-0 text-sm font-extrabold text-content sm:block">
                          ₹{Number(p.budget).toLocaleString("en-IN")}
                        </span>
                      )}
                      <Badge variant={style.variant} size="sm">
                        {style.label}
                      </Badge>
                    </Card>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>


      {/* Your public numbers and posts. Deliberately BELOW the collaborations:
          the grid is tall, and burying live work under it made the work the
          hardest thing on the page to reach. */}
      {(analytics.length > 0 || thumbedPosts.length > 0) && (
        <Reveal>
          <Card className="overflow-hidden p-0">
          {/* Audience analytics — the numbers brands judge you on. */}
          {analytics.length > 0 && (
            <div
              className={cn(
                "grid divide-x divide-hairline",
                analytics.length >= 5
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                  : analytics.length >= 4
                    ? "grid-cols-2 sm:grid-cols-4"
                    : "grid-cols-2",
              )}
            >
              {analytics.map((a) => (
                <div key={a.label} className="px-4 py-3">
                  <div className="text-lg font-extrabold text-content">{a.value}</div>
                  <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                    {a.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent posts, exactly the grid the public page shows. */}
          {thumbedPosts.length > 0 && (
            <div className="border-t border-hairline p-4 sm:p-5">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                  Recent posts
                </p>
                {social?.fetched_at && (
                  <span className="text-[0.6875rem] text-content-muted">
                    Updated {new Date(social.fetched_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {thumbedPosts.map((post) => (
                  <a
                    key={post.url}
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-hairline bg-surface-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.thumbUrl!}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {(post.views != null || post.likes != null) && (
                      <span className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[0.6875rem] font-semibold text-white">
                        {post.views != null && (
                          <span className="inline-flex items-center gap-1">
                            <Play className="size-3" /> {compact(post.views)}
                          </span>
                        )}
                        {post.likes != null && (
                          <span className="inline-flex items-center gap-1">
                            <Heart className="size-3" /> {compact(post.likes)}
                          </span>
                        )}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
          </Card>
        </Reveal>
      )}

      {/* YouTube uploads — the same grid the public profile shows, so a creator
          can see their channel through a brand's eyes without leaving the app. */}
      {isCreator && videos.length > 0 && (
        <Reveal>
          <Card className="p-4 sm:p-5">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                <PlaySquare className="size-3.5" /> Latest videos
              </p>
              {youtube?.fetched_at && (
                <span className="text-[0.6875rem] text-content-muted">
                  Updated {new Date(youtube.fetched_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <a
                  key={v.url}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1.5"
                >
                  <span className="relative block aspect-video overflow-hidden rounded-xl border border-hairline bg-surface-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbUrl!}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {v.views != null && (
                      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[0.6875rem] font-semibold text-white">
                        <Play className="size-3" /> {compact(v.views)}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold leading-snug text-content-soft">
                    {v.title}
                  </span>
                </a>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Audience split — self-reported, and labelled as such so it is never
          mistaken for platform-measured data. */}
      {isCreator && audience && (audience.locations.length > 0 || audience.ages.length > 0 || audience.genders.length > 0) && (
        <Reveal>
          <Card className="p-4 sm:p-5">
            <p className="mb-3 inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
              <Users className="size-3.5" /> Your audience
              <span className="font-medium normal-case tracking-normal text-content-muted">
                · as shown on your public profile
              </span>
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ["Top locations", audience.locations],
                ["Age range", audience.ages],
                ["Gender", audience.genders],
              ] as const)
                .filter(([, slices]) => slices.length > 0)
                .map(([label, slices]) => (
                  <div key={label}>
                    <p className="mb-2 text-xs font-bold text-content">{label}</p>
                    <div className="flex flex-col gap-1.5">
                      {slices.map((s) => (
                        <div key={s.label} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 truncate text-content-soft">{s.label}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <span
                              className="block h-full rounded-full bg-brand"
                              style={{ width: `${Math.min(100, s.pct)}%` }}
                            />
                          </span>
                          <span className="w-8 shrink-0 text-right font-bold tabular-nums text-content">
                            {s.pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Ratings earned on completed projects. Same source as the public page. */}
      {isCreator && reviews && (
        <Reveal>
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                <Star className="size-3.5" /> Brand ratings
              </p>
              <span className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold tabular-nums text-content">
                  {reviews.average?.toFixed(1) ?? "—"}
                </span>
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn(
                        "size-3.5",
                        n <= Math.round(reviews.average ?? 0)
                          ? "fill-warn text-warn"
                          : "text-content-muted",
                      )}
                    />
                  ))}
                </span>
                <span className="text-xs text-content-muted">
                  ({reviews.count})
                </span>
              </span>
            </div>
            {reviews.items.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {reviews.items.slice(0, 4).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-hairline bg-surface-muted p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-content">{r.reviewerName}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-warn">
                        {r.rating}/5
                      </span>
                    </div>
                    {r.comment && (
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-content-soft">
                        {r.comment}
                      </p>
                    )}
                    {r.createdAt && (
                      <p className="mt-1 truncate text-[0.6875rem] text-content-muted">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      )}

      {/* Delivered work — what completion actually left behind, for both roles. */}
      {data.completed?.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-content-muted">
              Completed work
            </h2>
            {isCreator && data.past_collaborations?.length > 0 && (
              <span className="text-xs text-content-muted">
                Shown on your public profile
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {data.completed.slice(0, 4).map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <Card interactive className="flex items-center gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-content">{p.title}</p>
                    <p className="truncate text-xs text-content-soft">
                      {p.partner ? `With ${p.partner}` : "Collaboration"}
                      {p.completed_at
                        ? ` · ${new Date(p.completed_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                  {p.budget != null && p.budget !== "" && (
                    <span className="hidden shrink-0 text-sm font-extrabold text-content sm:block">
                      ₹{Number(p.budget).toLocaleString("en-IN")}
                    </span>
                  )}
                  <Badge variant="success" size="sm">
                    Completed
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Brands the creator has actually delivered for — the wall on /c/. */}
      {isCreator && data.past_collaborations?.length > 0 && (
        <Reveal>
          <Card className="p-4 sm:p-5">
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
              Brands you&apos;ve worked with
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.past_collaborations.map((b) => (
                <Badge key={b} variant="outline" size="sm">
                  {b}
                </Badge>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Home is the summary; the numbers live one click away. */}
      <ButtonLink
        href="/dashboard"
        variant="surface"
        size="lg"
        className="self-start"
      >
        <BarChart3 /> Open full dashboard
      </ButtonLink>
    </div>
  );
}
