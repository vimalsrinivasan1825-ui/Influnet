"use client";

/**
 * Product feedback board.
 *
 * Separate from Reports on purpose: reports are a safety workflow with
 * consequences for an account, feedback is a product signal. Mixing them means
 * a harassment report queues behind a feature request.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lightbulb, MessageSquareHeart, Star } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/ui/tabs";

interface Feedback {
  id: string;
  kind: string;
  message: string;
  rating: number | null;
  surface: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  user: { id: string; name: string; role: string } | null;
}

const KIND_VARIANT: Record<string, "brand" | "danger" | "success" | "warning"> = {
  idea: "brand",
  bug: "danger",
  praise: "success",
  confusion: "warning",
};

const NEXT_STATUS = ["new", "triaged", "planned", "shipped", "declined"] as const;

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "triaged" | "planned">("all");

  const load = useCallback(async (which: string) => {
    setLoading(true);
    const qs = which === "all" ? "" : `?status=${which}`;
    const res = await apiFetch<{ feedback: Feedback[] }>(`/api/admin/feedback${qs}`);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load feedback");
    } else {
      setError("");
      setItems(res.data.feedback || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function setStatus(id: string, status: string) {
    const res = await apiFetch("/api/admin/feedback", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      setError(res.error || "Could not update this feedback");
      return;
    }
    setItems((prev) =>
      filter === "all"
        ? prev.map((f) => (f.id === id ? { ...f, status } : f))
        : prev.filter((f) => f.id !== id),
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Voice of the customer"
        title="Feedback"
        subtitle="What users say about the product itself"
        icon={<MessageSquareHeart />}
      />

      <SegmentedTabs
        value={filter}
        onValueChange={setFilter}
        tabs={[
          { value: "all", label: "All" },
          { value: "new", label: "New" },
          { value: "triaged", label: "Triaged" },
          { value: "planned", label: "Planned" },
        ]}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lightbulb />}
            title="No feedback yet"
            description="Feedback submitted from the app appears here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((f) => (
            <Card key={f.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={KIND_VARIANT[f.kind] ?? "neutral"} size="sm">
                  {f.kind}
                </Badge>
                <Badge variant="outline" size="sm">
                  {f.status}
                </Badge>
                {f.rating != null && (
                  <span className="flex items-center gap-0.5 text-xs font-bold text-warn">
                    <Star className="size-3.5 fill-current" />
                    {f.rating}/5
                  </span>
                )}
                {f.surface && (
                  <span className="text-[0.6875rem] text-content-muted">{f.surface}</span>
                )}
                <span className="ml-auto text-[0.6875rem] text-content-muted">
                  {new Date(f.created_at).toLocaleDateString()}
                </span>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                {f.message}
              </p>

              <p className="text-xs text-content-muted">
                {f.user?.name ?? "Deleted user"}
                {f.user?.role ? ` · ${f.user.role}` : ""}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {NEXT_STATUS.filter((s) => s !== f.status).map((s) => (
                  <Button
                    key={s}
                    size="xs"
                    variant="surface"
                    onClick={() => setStatus(f.id, s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
