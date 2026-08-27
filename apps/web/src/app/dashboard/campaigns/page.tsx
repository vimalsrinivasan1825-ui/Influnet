"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Clock, MapPin, Megaphone, Plus, Sparkles,
  ExternalLink, Users, Tag,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
        <div className="flex flex-col gap-4">
          {filtered.map((c) => {
            const daysLeft = daysUntil(c.expires_at);
            const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
            return (
              <Card
                key={c.id}
                interactive
                onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                className="cursor-pointer p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
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
                    <h3 className="mt-1 text-lg font-extrabold tracking-tight text-content">
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-1 text-sm leading-relaxed text-content-soft line-clamp-2">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-content-muted">
                      {c.budget_min != null || c.budget_max != null ? (
                        <span className="flex items-center gap-1 font-semibold">
                          {formatBudget(c.budget_min, c.budget_max)}
                        </span>
                      ) : null}
                      {c.delivery_by && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          Delivery by {new Date(c.delivery_by).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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
                          {c.follower_min.toLocaleString()}+ followers
                        </span>
                      )}
                    </div>
                    {c.categories.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.categories.map((cat) => (
                          <span
                            key={cat}
                            className="rounded-md bg-surface-muted px-2 py-0.5 text-[0.625rem] font-semibold text-content-muted"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {daysLeft !== null && (
                      <span
                        className={cn(
                          "text-xs font-bold",
                          daysLeft <= 0
                            ? "text-danger"
                            : isClosingSoon
                            ? "text-warn"
                            : "text-content-muted",
                        )}
                      >
                        {daysLeft <= 0
                          ? "Expired"
                          : daysLeft === 1
                          ? "1 day left"
                          : `${daysLeft} days left`}
                      </span>
                    )}
                    {c.platforms.length > 0 && (
                      <div className="flex gap-1">
                        {c.platforms.slice(0, 3).map((p) => (
                          <span
                            key={p}
                            className="rounded-md bg-brand-soft px-2 py-0.5 text-[0.625rem] font-bold text-brand-strong"
                          >
                            {p}
                          </span>
                        ))}
                        {c.platforms.length > 3 && (
                          <span className="text-[0.625rem] text-content-muted">
                            +{c.platforms.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <Button variant="surface" size="sm">
                      View <ExternalLink size={12} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
