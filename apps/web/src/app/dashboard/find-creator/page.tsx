"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, ChevronDown, Link2, Loader2, MapPin, Search, UserRoundSearch } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { resolveLookupUsername } from "@/lib/search-query";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import EditorialProfile, {
  type EditorialProfileProps,
} from "@/components/public-profile/editorial/editorial-profile";
import type { UserRole } from "@/types";

/**
 * Reach a creator you already know.
 *
 * ── Why this is not a search box ──────────────────────────────────────────
 * Influnet deliberately does not publish a browsable roster of creators. This
 * resolves ONE username, or a pasted profile link, to ONE creator — and
 * answers "no creator with that username" for everything else. There are no
 * suggestions, no partial matches and no results-as-you-type, and all three
 * omissions are the feature rather than an unfinished state.
 *
 * That shape is why the lookup runs on SUBMIT rather than on keystroke. A box
 * that answers while you type teaches people to explore it, which is a
 * directory by another name; one that answers when you ask teaches them to
 * arrive with a username, which is the intended flow.
 *
 * `resolveLookupUsername` is the same resolver the API uses, called here only
 * to explain a bad input BEFORE spending a request on it — the server resolves
 * independently and is the one that decides.
 *
 * ── The card and the profile below it ─────────────────────────────────────
 * A hit loads the creator's public profile payload (/api/creators/<username>,
 * the same view model as their public page) ONCE. The card is a summary of
 * it, and "View profile" renders the full profile inline beneath the card —
 * on this page, not in an overlay — from that same payload. Loading it counts
 * as a profile view for the creator, which is what a brand looking a creator
 * up by name is.
 */
type Result = {
  user_id: string;
  username: string;
  headline: string | null;
  verified_badge?: boolean;
  profile: { name: string; location: string | null };
};

/** What /api/creators/[username] returns — the props the profile needs. */
type CreatorPayload = Pick<
  EditorialProfileProps,
  "data" | "layout" | "isOwner" | "isPro" | "ctaHref" | "ctaLabel" | "collaborationStats"
>;

type Outcome =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; creator: Result }
  | { kind: "missing"; username: string }
  | { kind: "unparseable" }
  | { kind: "error" };

type ProfileState =
  | { status: "loading" }
  | { status: "error" }
  | ({ status: "ready" } & CreatorPayload);

const AVAILABILITY = {
  open: { label: "Open to work", variant: "success" },
  limited: { label: "Limited availability", variant: "warning" },
  paused: { label: "Not taking work", variant: "neutral" },
} as const;

export default function FindCreatorPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setRoleLoading(false);
        return;
      }
      // `role` is one of the few columns `authenticated` holds a grant on —
      // naming any other here would fail the whole statement with 42501.
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      setRole(((data as { role: UserRole } | null)?.role) ?? null);
      setRoleLoading(false);
    })();
  }, []);

  const foundUsername = outcome.kind === "found" ? outcome.creator.username : null;

  useEffect(() => {
    if (!foundUsername) return;
    let cancelled = false;
    setProfile({ status: "loading" });
    void (async () => {
      const res = await apiFetch<CreatorPayload>(
        `/api/creators/${encodeURIComponent(foundUsername)}`,
      );
      if (cancelled) return;
      setProfile(res.ok && res.data ? { status: "ready", ...res.data } : { status: "error" });
    })();
    return () => {
      cancelled = true;
    };
  }, [foundUsername]);

  // Bring the profile into view when it opens — it renders below the fold.
  useEffect(() => {
    if (showProfile) profileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showProfile]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const username = resolveLookupUsername(term);
    if (!username) {
      setOutcome({ kind: "unparseable" });
      return;
    }
    setShowProfile(false);
    setOutcome({ kind: "searching" });
    const res = await apiFetch<{ results: Result[] }>(
      `/api/discover?q=${encodeURIComponent(username)}`,
    );
    if (!res.ok) {
      setOutcome({ kind: "error" });
      return;
    }
    const creator = res.data?.results?.[0];
    setOutcome(creator ? { kind: "found", creator } : { kind: "missing", username });
  }

  if (roleLoading) return null;

  if (role !== "business_owner") {
    return (
      <div className="space-y-5">
        <PageHeader title="Find creator" icon={<UserRoundSearch className="size-5" />} />
        <EmptyState
          title="For business accounts"
          description="Looking a creator up is something brands do. Your account collaborates through requests and projects instead."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-5 pt-2 sm:pt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-muted text-content-soft">
            <UserRoundSearch className="size-5" />
          </span>
          <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-content sm:text-2xl">
            Find creator
          </h1>
          <p className="mt-1 text-sm text-content-soft">
            Enter a creator&rsquo;s username or paste their Influnet profile link.
          </p>
        </div>

        <Card className="p-4 sm:p-5">
          <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
            <InputGroup icon={<AtSign className="size-4" />} className="flex-1">
              <Input
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
                  setShowProfile(false);
                }}
                placeholder="username or influnet.io/username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Creator username or profile link"
                className="h-11"
              />
            </InputGroup>
            <Button
              type="submit"
              size="xl"
              className="h-11"
              disabled={!term.trim() || outcome.kind === "searching"}
            >
              <Search className="size-4" />
              {outcome.kind === "searching" ? "Looking up…" : "Look up"}
            </Button>
          </form>

          <p className="mt-3 text-center text-xs text-content-muted">
            <Link2 className="mr-1.5 inline size-3.5 align-[-3px]" aria-hidden />
            An exact lookup — it finds the one creator with that username, and does not suggest others.
          </p>
        </Card>

        {outcome.kind === "unparseable" && (
          <Notice>
            That is not a username or an Influnet profile link. Try{" "}
            <span className="font-medium text-content">theirusername</span> or{" "}
            <span className="font-medium text-content">influnet.io/theirusername</span>.
          </Notice>
        )}

        {outcome.kind === "missing" && (
          <Notice>
            No creator with the username{" "}
            <span className="font-medium text-content">@{outcome.username}</span>.
            Check the spelling, or ask them for their profile link.
          </Notice>
        )}

        {outcome.kind === "error" && (
          <Notice>We could not complete that lookup. Try again in a moment.</Notice>
        )}

        {outcome.kind === "found" && (
          <CreatorCard
            creator={outcome.creator}
            profile={profile}
            showProfile={showProfile}
            onToggleProfile={() => setShowProfile((v) => !v)}
          />
        )}
      </div>

      {outcome.kind === "found" && showProfile && (
        <section
          ref={profileRef}
          aria-label={`${outcome.creator.profile.name}'s public profile`}
          className="w-full scroll-mt-24 overflow-hidden rounded-2xl border border-hairline bg-surface-card"
        >
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
            <p className="min-w-0 truncate text-sm text-content-soft">
              Public profile ·{" "}
              <span className="font-medium text-content">@{outcome.creator.username}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowProfile(false)}>
              Hide
            </Button>
          </div>

          {profile.status === "loading" && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-content-muted" />
            </div>
          )}
          {profile.status === "error" && (
            <p className="px-5 py-16 text-center text-sm text-content-muted">
              Couldn&rsquo;t load this profile. It may no longer exist.
            </p>
          )}
          {profile.status === "ready" && (
            <EditorialProfile
              data={profile.data}
              layout={profile.layout}
              isOwner={profile.isOwner}
              isPro={profile.isPro}
              ctaHref={profile.ctaHref}
              ctaLabel={profile.ctaLabel}
              collaborationStats={profile.collaborationStats}
              inline
            />
          )}
        </section>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-5 text-center">
      <p className="text-sm text-content-soft">{children}</p>
    </Card>
  );
}

/**
 * The summary a brand decides on before opening the full profile. Name,
 * handle and location come from the lookup itself, so the card is useful the
 * moment the lookup answers; photo, niches, stats and availability fill in
 * from the profile payload as it arrives.
 */
function CreatorCard({
  creator,
  profile,
  showProfile,
  onToggleProfile,
}: {
  creator: Result;
  profile: ProfileState;
  showProfile: boolean;
  onToggleProfile: () => void;
}) {
  const data = profile.status === "ready" ? profile.data : null;
  const name = data?.name ?? creator.profile.name;
  const location = data?.location ?? creator.profile.location;
  const tagline = data?.tagline || creator.headline;
  const verified = data?.isVerified ?? creator.verified_badge ?? false;
  const availability = data?.availability ? AVAILABILITY[data.availability] : null;
  // A zero reads as a verdict on the creator, not as "not connected yet".
  const stats = (data?.heroStats ?? [])
    .filter((s) => s.value && !/^[0₹\s.,]+$/.test(s.value))
    .slice(0, 3);
  const niches = (data?.niches ?? []).slice(0, 4);

  // The profile payload already decided the right next step for THIS brand —
  // a pending request or an existing project changes it — so use its answer.
  const ctaHref =
    profile.status === "ready" ? profile.ctaHref : `/dashboard/requests/new?to=${creator.user_id}`;
  const ctaLabel =
    profile.status === "ready"
      ? profile.ctaLabel === "Work with me"
        ? "Send a request"
        : profile.ctaLabel
      : "Send a request";

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-16 bg-gradient-to-r from-brand-soft via-surface-muted to-surface-muted sm:h-20" />
      <div className="-mt-10 flex flex-col items-center px-5 pb-6 text-center sm:-mt-12">
        <div className="rounded-full bg-surface-card p-1">
          <Avatar
            name={name}
            src={data?.avatarUrl}
            size="xl"
            className="size-20 text-2xl sm:size-24"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-content">{name}</h2>
          {verified && <VerifiedBadge status="verified" pro={profile.status === "ready" && !!profile.isPro} />}
        </div>

        <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 text-sm text-content-muted">
          <span>@{creator.username}</span>
          {location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {location}
            </span>
          )}
        </p>

        {tagline && (
          <p className="mt-3 line-clamp-2 max-w-md text-sm text-content-soft">{tagline}</p>
        )}

        {(niches.length > 0 || availability) && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {availability && <Badge variant={availability.variant}>{availability.label}</Badge>}
            {niches.map((n) => (
              <Badge key={n} variant="outline">
                {n}
              </Badge>
            ))}
          </div>
        )}

        {profile.status === "loading" && (
          <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )}
        {stats.length > 0 && (
          <dl
            className="mt-5 grid w-full max-w-sm gap-2"
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
          >
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-muted px-2 py-2.5">
                <dd className="text-base font-semibold text-content">{s.value}</dd>
                <dt className="truncate text-[0.6875rem] text-content-muted">{s.label}</dt>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <Button size="xl" className="flex-1" onClick={onToggleProfile} aria-expanded={showProfile}>
            {showProfile ? "Hide profile" : "View profile"}
            <ChevronDown
              className={`size-4 transition-transform ${showProfile ? "rotate-180" : ""}`}
            />
          </Button>
          <ButtonLink href={ctaHref} variant="outline" size="xl" className="flex-1">
            {ctaLabel}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
