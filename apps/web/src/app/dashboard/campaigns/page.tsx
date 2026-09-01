"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, MapPin, Megaphone, Plus, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CoverArt } from "@/components/ui/cover-art";
import { PlatformMark } from "@/components/dashboard/platform-mark";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  title: string;
  description: string;
  deliverables: string;
  platforms: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  starts_on: string | null;
  delivery_by: string | null;
  applications_close_at: string | null;
  follower_min: number | null;
  follower_max: number | null;
  categories: string[];
  location: string | null;
  status: string;
  published_at: string;
  expires_at: string;
  created_at: string;
  business_user?: { id: string; name: string | null } | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBudget(min: number | null, max: number | null): string {
  if (min != null && max != null && min !== max) {
    return `₹${min.toLocaleString()} – ₹${max.toLocaleString()}`;
  }
  if (min != null) return `From ₹${min.toLocaleString()}`;
  if (max != null) return `Up to ₹${max.toLocaleString()}`;
  return "Negotiable";
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "closing_soon">("newest");
  // A brand's draft never appears on the live board — before "mine", a
  // business owner had no way to find it again once they navigated away from
  // the page they created it on.
  const [view, setView] = useState<"browse" | "mine">("browse");

  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: profile } = await sb
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (profile) setRole((profile as any).role);
        }
        await fetchCampaigns();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [sort, categoryFilter, view]);

  const fetchCampaigns = async () => {
    const params = new URLSearchParams({ sort });
    if (categoryFilter) params.set("category", categoryFilter);
    if (view === "mine") params.set("mine", "true");
    const res = await apiFetch<{ campaigns: Campaign[] }>(
      `/api/campaigns?${params}`,
    );
    if (res.ok && res.data) {
      setCampaigns(res.data.campaigns || []);
    }
  };

  const filtered = campaigns.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.categories.some((cat) => cat.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Campaigns"
          subtitle="Browse open opportunities or manage your published campaigns."
        />
        {role === "business_owner" && (
          <Button variant="brand" size="sm" onClick={() => router.push("/dashboard/campaigns/new")}>
            <Plus /> New campaign
          </Button>
        )}
      </div>

      {role === "business_owner" && (
        <div className="flex gap-1">
          {(["browse", "mine"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                view === v ? "bg-brand text-white" : "bg-surface-muted text-content-muted hover:text-content",
              )}
            >
              {v === "browse" ? "Browse" : "My campaigns"}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-64"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-hairline bg-surface-card px-3 py-2 text-sm font-medium text-content"
        >
          <option value="">All categories</option>
          <option value="fashion">Fashion</option>
          <option value="beauty">Beauty</option>
          <option value="tech">Tech</option>
          <option value="food">Food</option>
          <option value="travel">Travel</option>
          <option value="fitness">Fitness</option>
          <option value="lifestyle">Lifestyle</option>
          <option value="gaming">Gaming</option>
        </select>
        <div className="flex gap-1">
          {(["newest", "closing_soon"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                sort === s
                  ? "bg-brand text-white"
                  : "bg-surface-muted text-content-muted hover:text-content",
              )}
            >
              {s === "newest" ? "Newest" : "Closing soon"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="No campaigns found"
            description={
              search || categoryFilter
                ? "Try adjusting your filters."
                : view === "mine"
                  ? "You haven't created a campaign yet."
                  : "No live campaigns right now. Check back soon!"
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const daysLeft = daysUntil(c.expires_at);
            const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
            const primaryPlatform = c.platforms[0] || "other";
            return (
              <Card
                key={c.id}
                interactive
                onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                className="flex cursor-pointer flex-col overflow-hidden p-0"
              >
                {/* Generated cover, seeded on the campaign id — the same art it
                    wears on Home and on its own page. No image column exists. */}
                <CoverArt seed={c.id} className="h-24 w-full">
                  <PlatformMark platform={primaryPlatform} size={40} />
                  {daysLeft !== null && (
                    <span
                      className={cn(
                        "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[0.625rem] font-bold backdrop-blur",
                        daysLeft <= 0
                          ? "bg-danger/90 text-white"
                          : isClosingSoon
                            ? "bg-warn/90 text-white"
                            : "bg-black/35 text-white",
                      )}
                    >
                      {daysLeft <= 0
                        ? "Expired"
                        : daysLeft === 1
                          ? "1 day left"
                          : `${daysLeft} days left`}
                    </span>
                  )}
                </CoverArt>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
                      {c.business_user?.name || "Brand"}
                    </span>
                    {isClosingSoon && (
                      <Badge variant="warning" size="sm">
                        <Clock size={10} /> Closing soon
                      </Badge>
                    )}
                    {view === "mine" && c.status !== "live" && (
                      <Badge variant="neutral" size="sm">{c.status}</Badge>
                    )}
                  </div>

                  <h3 className="line-clamp-1 text-base font-extrabold tracking-tight text-content">
                    {c.title}
                  </h3>

                  {c.description && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-content-soft">
                      {c.description}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-content-muted">
                    {(c.budget_min != null || c.budget_max != null) && (
                      <span className="font-semibold text-content-soft">
                        {formatBudget(c.budget_min, c.budget_max)}
                      </span>
                    )}
                    {c.delivery_by && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(c.delivery_by).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {c.location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {c.location}
                      </span>
                    )}
                    {c.follower_min != null && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {c.follower_min.toLocaleString()}+
                      </span>
                    )}
                  </div>

                  {c.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.categories.slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="rounded-md bg-surface-muted px-2 py-0.5 text-[0.625rem] font-semibold text-content-muted"
                        >
                          {cat}
                        </span>
                      ))}
                      {c.categories.length > 3 && (
                        <span className="text-[0.625rem] text-content-muted">
                          +{c.categories.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
