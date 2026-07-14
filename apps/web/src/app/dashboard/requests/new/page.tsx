"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Rocket, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface CreatorPreview {
  name: string;
  username?: string;
  headline?: string;
  avatar_url?: string | null;
}

export default function NewRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toUserId = searchParams.get("to");

  const [roleLoading, setRoleLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorPreview | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(true);
  const [form, setForm] = useState({ title: "", budget: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [alreadySent, setAlreadySent] = useState(false);

  // Guard: business_owner only
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: profile } = await sb
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      const role = (profile as any)?.role;
      if (role !== "business_owner" && role !== "admin") {
        router.replace("/dashboard");
        return;
      }
      setRoleLoading(false);

      // If no ?to= param, bounce back
      if (!toUserId) { router.replace("/dashboard"); return; }

      // Check if a pending request already exists
      const collabRes = await apiFetch<{ collabs: { from_user_id: string; to_user_id: string; status: string }[] }>(
        "/api/collabs"
      );
      if (collabRes.ok && collabRes.data) {
        const myId = session.user.id;
        const alreadyPending = collabRes.data.collabs.some(
          (c) => c.from_user_id === myId && c.to_user_id === toUserId && c.status === "pending"
        );
        if (alreadyPending) setAlreadySent(true);
      }
    })();
  }, [router, toUserId]);

  // Fetch creator preview
  useEffect(() => {
    if (!toUserId) return;
    (async () => {
      setCreatorLoading(true);
      try {
        const res = await apiFetch<{ results: { user_id: string; profile?: { name: string }; username?: string; headline?: string; avatar_url?: string | null }[] }>(
          `/api/discover?id=${toUserId}`
        );
        const target = res.data?.results?.[0];
        if (target) {
          setCreator({
            name: target.profile?.name || "Creator",
            username: target.username,
            headline: target.headline,
            avatar_url: target.avatar_url ?? null,
          });
        }
      } catch {
        // silently fail — user can still send the request without the preview
      } finally {
        setCreatorLoading(false);
      }
    })();
  }, [toUserId]);

  const handleChange = useCallback(
    (field: keyof typeof form) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        setError("");
      },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Please enter a project title."); return; }

    const budgetNum = form.budget ? Number(form.budget.replace(/[^0-9.]/g, "")) : null;
    if (form.budget && (!budgetNum || budgetNum <= 0)) {
      setError("Budget must be a positive number.");
      return;
    }

    setSubmitting(true);
    setError("");

    const res = await apiFetch("/api/collabs", {
      method: "POST",
      body: JSON.stringify({
        to_user_id: toUserId,
        project_title: form.title,
        project_description: form.message,
        budget: budgetNum,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        setAlreadySent(true);
        setSubmitting(false);
        return;
      }
      setError(res.error || "Failed to send request. Please try again.");
      setSubmitting(false);
      return;
    }

    router.replace("/dashboard/requests");
  };

  if (roleLoading) {
    return (
      <div className="mx-auto max-w-lg p-4 sm:p-6">
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (alreadySent) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Request already sent"
          subtitle="You already have a pending collaboration request with this creator."
        />
        <Button variant="surface" onClick={() => router.replace("/dashboard/requests")}>
          <ArrowLeft className="size-4" /> View my requests
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex size-8 shrink-0 items-center justify-center rounded-xl text-content-soft transition hover:bg-surface-raised hover:text-content"
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <PageHeader
          title="Send collaboration request"
          subtitle="Fill in the details below to reach out to this creator."
        />
      </div>

      {/* Creator preview card */}
      <Card className="flex items-center gap-3 p-4">
        {creatorLoading ? (
          <>
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </>
        ) : creator ? (
          <>
            <Avatar name={creator.name} src={creator.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-content">{creator.name}</p>
              {creator.username && (
                <p className="text-xs text-content-soft">@{creator.username}</p>
              )}
              {creator.headline && (
                <p className="mt-0.5 truncate text-xs text-content-soft">{creator.headline}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-content-soft">Loading creator…</p>
        )}
      </Card>

      {/* Request form */}
      <Card className="p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" id="collab-request-form">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="req-title">Project / campaign title *</Label>
            <Input
              id="req-title"
              placeholder="e.g. Summer launch campaign"
              value={form.title}
              onChange={handleChange("title")}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="req-budget">Budget (₹) — optional</Label>
            <Input
              id="req-budget"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 25000"
              value={form.budget}
              onChange={handleChange("budget")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="req-message">Message — optional</Label>
            <Textarea
              id="req-message"
              rows={4}
              placeholder="Tell the creator about your brand, goals, and what you'd like them to do…"
              value={form.message}
              onChange={handleChange("message")}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="brand"
              disabled={submitting}
              className="flex-1"
              id="send-collab-request-btn"
            >
              {submitting ? (
                <Rocket className="size-4 animate-pulse" />
              ) : (
                <Send className="size-4" />
              )}
              {submitting ? "Sending…" : "Send request"}
            </Button>
            <Button
              type="button"
              variant="surface"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
