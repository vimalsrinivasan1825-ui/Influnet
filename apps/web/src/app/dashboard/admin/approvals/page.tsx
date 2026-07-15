"use client";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Check, CheckCircle2, Clock, MapPin, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationQueue } from "@/components/dashboard/admin/verification-queue";

interface BusinessUser {
  user_id: string;
  company_name: string;
  industry: string;
  business_type: string | null;
  approval_status: string;
  created_at: string;
  gst_number: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  marketing_budget: string | null;
  profile: { id: string; name: string; email: string; phone: string | null; location: string | null };
}

export default function AdminApprovalsPage() {
  const [businesses, setBusinesses] = useState<BusinessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    try {
      const res = await apiFetch<{ businesses: BusinessUser[] }>("/api/admin/businesses");
      if (res.ok && res.data) setBusinesses(res.data.businesses || []);
      else setError(res.error || "Failed to fetch businesses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch businesses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const handleApproval = async (userId: string, status: "approved" | "rejected") => {
    setActionId(userId);
    try {
      const res = await apiFetch("/api/admin/businesses", {
        method: "PATCH",
        body: JSON.stringify({ user_id: userId, approval_status: status }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to update");
      await fetchBusinesses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActionId(null);
    }
  };

  const pending = businesses.filter((b) => b.approval_status === "pending_review");
  const reviewed = businesses.filter((b) => b.approval_status !== "pending_review");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Trust & approvals"
        title="Account approvals"
        subtitle="Resolve verification escalations and approve business registrations."
        icon={<Building2 />}
      />

      <VerificationQueue />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-warn">
                <Clock className="size-3.5" /> Pending review
              </span>
              <Badge variant="warning" size="sm">
                {pending.length}
              </Badge>
            </div>
            {pending.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CheckCircle2 />}
                  title="All caught up"
                  description="There are no pending approvals right now."
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((b) => (
                  <BusinessRow key={b.user_id} b={b} acting={actionId === b.user_id} onAction={handleApproval} />
                ))}
              </div>
            )}
          </section>

          {reviewed.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-content-muted">
                  <CheckCircle2 className="size-3.5" /> Previously reviewed
                </span>
                <Badge variant="neutral" size="sm">
                  {reviewed.length}
                </Badge>
              </div>
              <div className="flex flex-col gap-2.5">
                {reviewed.map((b) => (
                  <BusinessRow key={b.user_id} b={b} acting={actionId === b.user_id} onAction={handleApproval} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function BusinessRow({
  b,
  acting,
  onAction,
}: {
  b: BusinessUser;
  acting: boolean;
  onAction: (userId: string, status: "approved" | "rejected") => void;
}) {
  const isPending = b.approval_status === "pending_review";
  const isApproved = b.approval_status === "approved";

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 gap-3">
        <Avatar name={b.company_name} size="md" square />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-content">
              {b.company_name || "Unnamed company"}
            </span>
            <Badge variant={isPending ? "warning" : isApproved ? "success" : "danger"} size="sm">
              {isPending ? "Pending" : isApproved ? "Approved" : "Rejected"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-content-soft">
            <span>{b.profile?.name || "No name"}</span>
            <span>{b.profile?.email}</span>
            {b.industry && <span>{b.industry}</span>}
            {b.city && b.state && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {b.city}, {b.state}
              </span>
            )}
          </div>
        </div>
      </div>

      {isPending && (
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          <Button
            size="sm"
            className="bg-ok text-white hover:bg-ok/90"
            disabled={acting}
            onClick={() => onAction(b.user_id, "approved")}
          >
            <Check /> {acting ? "…" : "Approve"}
          </Button>
          <Button
            variant="surface"
            size="sm"
            className="text-danger"
            disabled={acting}
            onClick={() => onAction(b.user_id, "rejected")}
          >
            <X /> Reject
          </Button>
        </div>
      )}
    </Card>
  );
}
