"use client";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Clock, Eye, Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { STAGE_ACTOR, type Stage } from "@/lib/project-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { dealStateOf } from "@/lib/project-status";

const STAGES = [
  { key: "collaboration_started", label: "Started", desc: "Collaboration initiated between brand and creator." },
  { key: "project_discussion", label: "Discussion", desc: "Discussing terms, requirements, and deliverables." },
  { key: "advance_payment", label: "Deposit", desc: "Advance payment / deposit processing." },
  { key: "content_planning", label: "Planning", desc: "Scripting, storyboarding, and planning the concept." },
  { key: "content_confirmation", label: "Concept approved", desc: "Concept and script approved by the brand." },
  { key: "shooting_in_progress", label: "Shooting", desc: "Creator is filming and shooting content." },
  { key: "editing_in_progress", label: "Editing", desc: "Post-production and content editing." },
  { key: "sent_for_review", label: "Review", desc: "Draft submitted for brand review and feedback." },
  { key: "revisions", label: "Revisions", desc: "Making requested edits and revisions." },
  { key: "final_approval", label: "Approved", desc: "Content approved for publication." },
  { key: "final_payment", label: "Payment", desc: "Final invoice and payment settlement." },
  { key: "project_completed", label: "Completed", desc: "Campaign successfully completed." },
];

interface Project {
  id: string;
  title: string;
  description?: string | null;
  budget?: number | string | null;
  current_stage: string;
  status?: string | null;
  updated_at: string;
  owner_user_id: string;
  created_by_user_id?: string | null;
  owner?: { name?: string | null; role?: string } | null;
  counterparty?: { name?: string | null; role?: string } | null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const {
          data: { user },
          error: authErr,
        } = await sb.auth.getUser();
        if (authErr) throw authErr;
        if (user) setUserId(user.id);
        await fetchProjects();
      } catch (e) {
        console.error(e);
        setErrorMsg(e instanceof Error ? e.message : "Failed to initialize projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchProjects = async () => {
    const res = await apiFetch<{ projects: Project[] }>("/api/projects");
    if (!res.ok || !res.data) throw new Error(res.error || "Failed to load projects");
    setProjects(res.data.projects || []);
  };

  const handleAdvanceStage = async (projectId: string, currentStage: string) => {
    const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
    if (currentIndex === -1 || currentIndex === STAGES.length - 1) return;
    const nextStage = STAGES[currentIndex + 1].key;

    setUpdatingId(projectId);
    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "advance",
          stage_key: nextStage,
        }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to update stage");
      await fetchProjects();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Campaign projects"
        subtitle="Track deliverables and pipeline progress, stage by stage."
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Rocket />}
            title="No active campaigns yet"
            description="Accept a collaboration request to launch your first campaign workspace."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((p) => {
            const isOwner = p.owner_user_id === userId;
            const counterparty = isOwner ? p.counterparty : p.owner;
            const stageIndex = STAGES.findIndex((s) => s.key === p.current_stage);
            const currentStage = STAGES[stageIndex] || STAGES[0];
            const isCompleted = p.current_stage === "completed" || stageIndex === STAGES.length - 1;
            // Colour the whole card by its state, not just the badge, so a
            // finished project reads as finished at a glance.
            const state = dealStateOf(isCompleted ? "completed" : p.status);
            const isAdvancing = updatingId === p.id;
            const userRole: "business" | "creator" = isOwner ? "business" : "creator";
            const actor = STAGE_ACTOR[p.current_stage as Stage] || "either";
            const myTurn = actor === "either" || actor === userRole;
            // 'sent_for_review' needs a choice (revisions vs approve), so send the
            // user into the project to decide rather than blindly advancing.
            const isFork = p.current_stage === "sent_for_review";

            return (
              <Reveal key={p.id}>
                <Card
                  interactive
                  onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                  className={cn(
                    "cursor-pointer p-5 sm:p-6",
                    state === "completed" && "border-ok/30 bg-ok-soft/40",
                    state === "cancelled" && "border-hairline bg-surface-muted/60",
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
                          {isOwner ? "Client portal" : "Creator portal"}
                        </span>
                        <span className="text-content-muted">·</span>
                        <span className="text-sm font-semibold text-content-soft">
                          With {counterparty?.name || "Partner"} (
                          {counterparty?.role === "influencer" ? "Creator" : "Brand"})
                        </span>
                        {!isCompleted && myTurn && (
                          <>
                            <span className="text-content-muted">·</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand-strong">
                              Your turn
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-1.5 text-lg font-extrabold tracking-tight text-content">
                        {p.title}
                      </h3>
                      {p.description && (
                        <p className="mt-1.5 text-sm leading-relaxed text-content-soft">
                          {p.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      {p.budget != null && p.budget !== "" && (
                        <div className="text-right">
                          <div className="text-[0.625rem] font-bold uppercase tracking-wide text-content-muted">
                            Budget
                          </div>
                          <div className="text-lg font-extrabold text-content">
                            ₹{Number(p.budget).toLocaleString()}
                          </div>
                        </div>
                      )}
                      {isCompleted ? (
                        <Badge variant="success" size="md">
                          <Check /> Completed
                        </Badge>
                      ) : isFork ? (
                        <Button
                          variant="brand"
                          size="lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/projects/${p.id}`);
                          }}
                        >
                          <Eye /> Review draft
                        </Button>
                      ) : myTurn ? (
                        <Button
                          variant="brand"
                          size="lg"
                          disabled={isAdvancing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceStage(p.id, p.current_stage);
                          }}
                        >
                          {isAdvancing ? "Updating…" : "Advance stage"}
                          <ArrowRight />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-xl bg-surface-muted px-3 py-2.5 text-xs font-semibold text-content-muted">
                          <Clock className="size-3.5 shrink-0" />
                          Waiting on {counterparty?.name || (userRole === "business" ? "the creator" : "the brand")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage progress — a segmented meter that always fits the card
                      width (no horizontal scroll). The textual "Stage X/12" below
                      carries the detail. */}
                  <div
                    className="mt-5 flex items-center gap-1"
                    role="progressbar"
                    aria-valuenow={stageIndex + 1}
                    aria-valuemin={1}
                    aria-valuemax={STAGES.length}
                    aria-label={`Stage ${stageIndex + 1} of ${STAGES.length}: ${currentStage.label}`}
                  >
                    {STAGES.map((s, idx) => {
                      const filled = idx <= stageIndex;
                      const active = idx === stageIndex && !isCompleted;
                      return (
                        <span
                          key={s.key}
                          title={s.label}
                          className={cn(
                            "h-1.5 flex-1 rounded-full transition-colors",
                            filled ? (state === "completed" ? "bg-ok" : "bg-brand") : "bg-hairline-strong",
                            active && "ring-2 ring-brand-soft",
                          )}
                        />
                      );
                    })}
                  </div>

                  {/* Current stage detail */}
                  <div
                    className={cn(
                      "mt-1 rounded-xl border px-4 py-3",
                      state === "completed"
                        ? "border-ok/25 bg-ok-soft/60"
                        : "border-hairline bg-surface-muted",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-content">
                        Stage {stageIndex + 1}/{STAGES.length}:{" "}
                        <span className={state === "completed" ? "text-ok" : "text-brand-strong"}>
                          {currentStage.label}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-content-muted">
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-content-soft">
                      {currentStage.desc}
                    </p>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
