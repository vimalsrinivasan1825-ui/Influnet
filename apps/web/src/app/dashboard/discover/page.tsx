"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, Globe, MapPin, Rocket, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { NICHES } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

type DiscoverResult = {
  user_id: string;
  username?: string;
  bio?: string;
  niche?: string[];
  instagram_handle?: string;
  youtube_handle?: string;
  headline?: string;
  company_name?: string;
  industry?: string;
  tagline?: string;
  website?: string;
  profile?: { id: string; name: string; location?: string };
};

type ModalState = { open: boolean; targetId: string; targetName: string };

function DiscoverContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>({ open: false, targetId: "", targetName: "" });
  const [form, setForm] = useState({ title: "", budget: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileErr } = await sb
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profileErr || !profile) {
          router.replace("/login");
          return;
        }

        const r = (profile as any).role;
        if (r !== "business_owner" && r !== "admin") {
          router.replace("/dashboard/influencer");
          return;
        }

        setRoleLoading(false);
      } catch (e) {
        console.error("Error checking role:", e);
        router.replace("/dashboard");
      }
    };
    checkUserRole();
  }, [router]);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [niche, setNiche] = useState(searchParams.get("niche") || "");
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (niche) params.set("niche", niche);
      if (location.trim()) params.set("location", location.trim());
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [query, niche, location],
  );

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      const params = buildParams(cursor);
      const res = await apiFetch<{ userRole: string; results: DiscoverResult[]; nextCursor: string | null }>(
        `/api/discover?${params.toString()}`,
      );
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to fetch results");
      return res.data;
    },
    [buildParams],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const urlParams = buildParams();
        const requestId = searchParams.get("request");
        if (requestId) urlParams.set("request", requestId);
        const qs = urlParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

        const data = await fetchPage();
        setUserRole(data.userRole);
        setResults(data.results);
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch results");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, niche, location]);


  // Redirect stale ?request= links (old deep-link format) to the new dedicated page
  useEffect(() => {
    const requestId = searchParams.get("request");
    if (requestId) {
      router.replace(`/dashboard/requests/new?to=${requestId}`);
    }
  }, [searchParams, router]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(nextCursor);
      setResults((prev) => [...prev, ...data.results]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const openModal = (targetId: string, targetName: string) => {
    setForm({ title: "", budget: "", message: "" });
    setModal({ open: true, targetId, targetName });
  };

  const closeModal = () => {
    setModal({ open: false, targetId: "", targetName: "" });
    router.replace("/dashboard");
  };

  const sendRequest = async () => {
    if (!form.title.trim()) {
      setError("Please enter a project title.");
      return;
    }
    const budgetNum = form.budget ? Number(form.budget.replace(/[^0-9.]/g, "")) : null;
    if (form.budget && (!budgetNum || budgetNum <= 0)) {
      setError("Budget must be a positive number.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/collabs", {
        method: "POST",
        body: JSON.stringify({
          to_user_id: modal.targetId,
          project_title: form.title,
          project_description: form.message,
          budget: budgetNum,
        }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setSentIds((prev) => new Set(prev).add(modal.targetId));
          closeModal();
          return;
        }
        throw new Error(res.error || "Failed to send request");
      }
      setSentIds((prev) => new Set(prev).add(modal.targetId));
      setModal({ open: false, targetId: "", targetName: "" });
      router.replace("/dashboard/requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSubmitting(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const isCreatorView = userRole === "business_owner";
  const hasFilters = !!(query.trim() || niche || location.trim());

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title={isCreatorView ? "Discover creators" : "Discover brands"}
        subtitle={
          isCreatorView
            ? "Find the right creator for your next campaign."
            : "Connect with brands looking for collaborations."
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2.5">
          <InputGroup icon={<Search />} className="min-w-[16rem] flex-1 sm:max-w-md">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isCreatorView ? "Search by name, username, or bio…" : "Search brands by name or tagline…"}
            />
          </InputGroup>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="w-full sm:w-52"
          />
        </div>

        {isCreatorView && (
          <div className="flex flex-wrap gap-2">
            {NICHES.map((n) => {
              const active = niche === n;
              return (
                <button
                  key={n}
                  onClick={() => setNiche(active ? "" : n)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-hairline-strong bg-surface-card text-content-soft hover:border-content-muted hover:text-content",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <div className="px-6 py-10 text-center text-sm font-semibold text-danger">{error}</div>
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search />}
            title={hasFilters ? "No matches for these filters" : "No one found yet"}
            description={
              hasFilters
                ? "Try a different search or clear the filters."
                : isCreatorView
                  ? "Creators will appear here once they join."
                  : "Brands will appear here once they join."
            }
            action={
              hasFilters ? (
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setNiche("");
                    setLocation("");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((item) => {
              const name = isCreatorView
                ? item.profile?.name || "Creator"
                : item.company_name || item.profile?.name || "Business";
              const subtitle = isCreatorView
                ? (item.niche as string[] | undefined)?.slice(0, 2).join(" · ") || "Creator"
                : item.industry || "Brand";
              const description = isCreatorView ? item.headline || item.bio : item.tagline || item.company_name;
              const isSent = sentIds.has(item.user_id);

              return (
                <Reveal key={item.user_id}>
                  <Card interactive className="flex h-full flex-col p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} size="lg" square />
                      <div className="min-w-0">
                        <p className="truncate text-[0.95rem] font-bold text-content">{name}</p>
                        <p className="truncate text-xs text-content-muted">{subtitle}</p>
                      </div>
                    </div>

                    {description && (
                      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-content-soft">
                        {description}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.username && (
                        <Badge variant="brand" size="sm">@{item.username}</Badge>
                      )}
                      {item.instagram_handle && (
                        <Badge variant="brand" size="sm">
                          IG @{item.instagram_handle.replace("@", "")}
                        </Badge>
                      )}
                      {item.youtube_handle && (
                        <Badge variant="danger" size="sm">
                          YT @{item.youtube_handle.replace("@", "")}
                        </Badge>
                      )}
                      {item.website && (
                        <Badge variant="info" size="sm">
                          <Globe /> Website
                        </Badge>
                      )}
                      {item.profile?.location && (
                        <Badge variant="neutral" size="sm">
                          <MapPin /> {item.profile.location}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-4">
                      {isCreatorView ? (
                        isSent ? (
                          <Badge variant="success" size="md" className="w-full justify-center py-2">
                            <Check /> Request sent
                          </Badge>
                        ) : (
                          <Button
                            variant="brand"
                            className="w-full"
                            onClick={() => openModal(item.user_id, name)}
                          >
                            Collaborate
                          </Button>
                        )
                      ) : (
                        <div className="rounded-xl border border-dashed border-hairline-strong bg-surface-muted py-2 text-center text-xs font-semibold text-content-soft">
                          Verified brand partner
                        </div>
                      )}
                    </div>
                  </Card>
                </Reveal>
              );
            })}
          </div>

          {nextCursor && (
            <div className="text-center">
              <Button variant="surface" size="xl" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Collaborate modal */}
      {modal.open && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-[999] flex items-center justify-center bg-content/45 p-4 backdrop-blur-sm"
        >
          <Card
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-6 shadow-[var(--shadow-pop)]"
          >
            <h2 className="text-lg font-extrabold tracking-tight text-content">
              Collaborate with {modal.targetName}
            </h2>
            <p className="mt-1 text-sm text-content-soft">
              Fill in the details — they&rsquo;ll be notified instantly.
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <Label>Project title *</Label>
                <Input
                  placeholder="e.g. Summer collection launch"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Budget (₹)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 25000"
                  value={form.budget}
                  onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  rows={4}
                  placeholder="Describe your vision, deliverables, or any questions…"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}

            <div className="mt-5 flex gap-3">
              <Button variant="surface" size="xl" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button variant="brand" size="xl" className="flex-[2]" onClick={sendRequest} disabled={submitting}>
                {submitting ? "Sending…" : (<><Rocket /> Send request</>)}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      }
    >
      <DiscoverContent />
    </React.Suspense>
  );
}
