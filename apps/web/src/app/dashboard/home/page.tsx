"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FolderKanban,
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
import { Reveal } from "@/components/ui/motion";
import { dealStateOf, DEAL_STATE_STYLE } from "@/lib/project-status";
import { STAGE_LABELS, type Stage } from "@/lib/project-lifecycle";
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
}

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
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
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
                {data.profile.verified && <VerifiedBadge status={data.profile.verification_status} size="sm" />}
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

      {/* Collaboration counters — separate from audience analytics so the two
          kinds of number are not read as one set. */}
      {/* Each counter is a shortcut, not a decoration — the whole point of
          having them at the top is to get somewhere in one click. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Ongoing", value: data.counts.ongoing, href: "/dashboard/projects", tone: "brand" },
          { label: "Completed", value: data.counts.completed, href: "/dashboard/projects", tone: "ok" },
          {
            label: "Needs you",
            value: needsMe,
            href: data.counts.pending_requests ? "/dashboard/requests" : "/dashboard/messages",
            tone: "warn",
          },
          { label: "Awaiting them", value: data.counts.awaiting_them, href: "/dashboard/messages", tone: "muted" },
        ].map((c) => (
          <Link key={c.label} href={c.href}>
            <Card
              interactive
              className={cn(
                "cursor-pointer px-4 py-3 transition-colors",
                c.value > 0 && c.tone === "brand" && "border-brand/25 bg-brand-soft/40",
                c.value > 0 && c.tone === "ok" && "border-ok/25 bg-ok-soft/50",
                c.value > 0 && c.tone === "warn" && "border-warn/30 bg-warn-soft",
              )}
            >
              <div className="text-lg font-extrabold text-content">{c.value}</div>
              <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-content-muted">
                {c.label}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Anything waiting on a decision ──────────────────────────────── */}
      {needsMe > 0 && (
        <Reveal>
          <Card className="flex flex-col gap-3 border-warn/30 bg-warn-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
                <Inbox className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-content">
                  {needsMe} thing{needsMe > 1 ? "s" : ""} waiting on you
                </p>
                <p className="text-xs text-content-soft">
                  {[
                    data.counts.pending_requests
                      ? `${data.counts.pending_requests} collaboration request${data.counts.pending_requests > 1 ? "s" : ""}`
                      : null,
                    data.counts.awaiting_me
                      ? `${data.counts.awaiting_me} set${data.counts.awaiting_me > 1 ? "s" : ""} of terms to review`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <ButtonLink
              href={data.counts.pending_requests ? "/dashboard/requests" : "/dashboard/messages"}
              variant="brand"
              size="sm"
            >
              Review <ArrowRight />
            </ButtonLink>
          </Card>
        </Reveal>
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
        href={isCreator ? "/dashboard/influencer" : "/dashboard"}
        variant="surface"
        size="lg"
        className="self-start"
      >
        <BarChart3 /> Open full dashboard
      </ButtonLink>
    </div>
  );
}
