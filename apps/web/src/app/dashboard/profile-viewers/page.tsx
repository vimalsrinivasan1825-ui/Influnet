"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Lock, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/lib/hooks/use-entitlements";

interface Viewer {
  businessId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  viewCount: number;
  lastViewedAt: string;
}

interface Payload {
  viewers: Viewer[];
  total: number;
  shown: number;
  locked: number;
}

function timeAgo(iso: string): string {
  const d = Date.now() - Date.parse(iso);
  const days = Math.floor(d / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export default function ProfileViewersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const { isPro } = useEntitlements();

  useEffect(() => {
    void (async () => {
      const res = await apiFetch<Payload>("/api/profile/viewers");
      if (res.ok && res.data) setData(res.data);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Who viewed your profile"
        subtitle="Brands that opened your profile, most recent first."
      />

      {loading ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !data || data.total === 0 ? (
        <EmptyState
          icon={<Eye className="size-6" />}
          title="No profile views yet"
          description="When a brand opens your profile, they'll show up here."
        />
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {data.viewers.map((v) => (
            <Card key={v.businessId} className="flex items-center gap-3 p-3">
              <Avatar name={v.name} src={v.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-content">
                  {v.name ?? "A brand"}
                </p>
                <p className="truncate text-xs text-content-muted">
                  {v.username ? `@${v.username} · ` : ""}
                  {timeAgo(v.lastViewedAt)}
                  {v.viewCount > 1 ? ` · viewed ${v.viewCount}×` : ""}
                </p>
              </div>
              {v.username && (
                <Link
                  href={`/${v.username}`}
                  className="shrink-0 text-xs font-semibold text-brand hover:underline"
                >
                  View
                </Link>
              )}
            </Card>
          ))}

          {data.locked > 0 && (
            <Card className="flex items-center gap-3 border-dashed p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-content-muted">
                <Lock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-content">
                  {data.locked} more {data.locked === 1 ? "brand" : "brands"} viewed your profile
                </p>
                <p className="text-xs text-content-muted">
                  Free shows your {data.shown} most recent viewers. Upgrade to see everyone.
                </p>
              </div>
              {!isPro && (
                <Link
                  href="/dashboard/billing"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-[#E0A526] to-[#C98C13] px-3 py-1.5 text-xs font-bold text-white"
                >
                  <Sparkles className="size-3" /> Upgrade
                </Link>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
