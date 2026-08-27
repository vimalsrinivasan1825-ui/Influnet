"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, X, Megaphone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";

interface Campaign {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  business_user?: { id: string; name: string | null } | null;
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    const res = await apiFetch<{ campaigns: Campaign[] }>("/api/admin/campaigns?status=pending_review");
    if (res.ok && res.data) {
      setCampaigns(res.data.campaigns || []);
    }
    setLoading(false);
  };

  const handleAction = async (id: string, action: "approve" | "reject" | "remove", reason?: string) => {
    setActing(id);
    try {
      const res = await apiFetch<{ campaign: Campaign }>(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        toast.success(`Campaign ${action}d`);
      } else {
        toast.error(res.error || `Failed to ${action} campaign`);
      }
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <Skeleton className="h-7 w-48" />
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Campaign moderation"
        subtitle="Review campaigns before they go live."
      />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="All caught up"
            description="No campaigns pending review."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand">
                      {c.business_user?.name || "Unknown brand"}
                    </span>
                    <Badge variant="warning" size="sm">Pending review</Badge>
                  </div>
                  <h3 className="mt-1 text-lg font-extrabold text-content">{c.title}</h3>
                  {c.description && (
                    <p className="mt-1 text-sm text-content-soft line-clamp-3">{c.description}</p>
                  )}
                  <span className="mt-2 block text-xs text-content-muted">
                    Submitted {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="brand"
                      size="sm"
                      disabled={acting === c.id}
                      onClick={() => handleAction(c.id, "approve")}
                    >
                      {acting === c.id ? <Loader2 className="animate-spin" /> : <Check />} Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={acting === c.id}
                      onClick={() => {
                        if (rejectReason) {
                          handleAction(c.id, "reject", rejectReason);
                        } else {
                          handleAction(c.id, "reject");
                        }
                      }}
                    >
                      <X /> Reject
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Rejection reason (optional)…"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
