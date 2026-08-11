"use client";
import { toast } from "sonner";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, Check, Clock, Eye, RotateCcw, Rocket, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { STAGE_ACTOR, type Stage } from "@/lib/project-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PlanNudge } from "@/components/dashboard/plan-nudge";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/ui/tabs";
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
  const [view, setView] = useState<"active" | "deleted">("active");
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
        await fetchProjects(view);
      } catch (e) {
        console.error(e);
        setErrorMsg(e instanceof Error ? e.message : "Failed to initialize projects");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    setLoading(true);
    fetchProjects(view)
      .catch((e) => setErrorMsg(e instanceof Error ? e.message : "Failed to load projects"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const fetchProjects = async (which: "active" | "deleted" = view) => {
    const qs = which === "deleted" ? "?deleted=true" : "";
    const res = await apiFetch<{ projects: Project[] }>(`/api/projects${qs}`);
    if (!res.ok || !res.data) throw new Error(res.error || "Failed to load projects");
    setProjects(res.data.projects || []);
  };

  async function deleteProject(id: string) {
    if (!confirm("Remove this project from your list? It moves to Deleted Projects — nothing is lost.")) return;
    setUpdatingId(id);
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "delete_project" }),
      });
      if (!res.ok) throw new Error(res.error || "Could not delete this project");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUpdatingId(null);
    }
  }

  async function restoreProject(id: string) {
    setUpdatingId(id);
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "restore_project" }),
      });
      if (!res.ok) throw new Error(res.error || "Could not restore this project");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUpdatingId(null);
    }
  }

  // Live updates: the other side advancing a stage, signing off, completing or
  // cancelling a project repaints this list without a reload. Two filters
  // because a postgres_changes listener takes one filter and a project is
  // interesting from either end (owner and counterparty).
  //
  // Held off while an advance of our own is in flight so the optimistic
  // "Updating…" state isn't yanked out from under the button; the refetch is
  // retried, not dropped. A failed background refresh is swallowed on purpose —
  // the user asked for nothing, so a full-page error state would be wrong.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = updatingId !== null;
  }, [updatingId]);
  useRealtimeRefresh({
    channelName: "dashboard-projects-live",
    enabled: !!userId,
    watches: userId
      ? [
          {
            table: "campaign_projects",
            filters: [`owner_user_id=eq.${userId}`, `counterparty_user_id=eq.${userId}`],
          },
        ]
      : [],
    onChange: () => {
      void fetchProjects().catch((e) => console.error("[projects live refresh]", e));
    },
    shouldDefer: () => busyRef.current,
    // Backstop for the case where this page's own channel failed to subscribe
    // while the shell's notifications channel is still healthy. Same hook, so
    // it shares the debounce and the `shouldDefer` gate above instead of
    // double-fetching past them — a stage write produces both a
    // campaign_projects UPDATE and a notifications INSERT.
    notifyTypes: ["project_stage", "project_cancel"],
  });

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

      {/* Only renders when a free account is near or at its project cap, and
          stays quiet for days once dismissed. See plan-nudge.tsx. */}
      <PlanNudge />

      <SegmentedTabs
        value={view}
        onValueChange={setView}
        tabs={[
          { value: "active", label: "Active" },
          { value: "deleted", label: "Deleted Projects" },
        ]}
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Rocket />}
            title={view === "deleted" ? "Nothing deleted" : "No active campaigns yet"}
            description={
              view === "deleted"
                ? "Projects you or the other side remove show up here — nothing is ever lost."
                : "Accept a collaboration request to launch your first campaign workspace."
            }
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
            const isCancelled = state === "cancelled";
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
                    state === "cancelled" && "border-danger/30 bg-danger-soft/60",
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
                        </span>                              {!isCompleted && !isCancelled && myTurn && (
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
                      {view === "deleted" ? (
                        <Button
                          variant="surface"
                          size="sm"
                          disabled={updatingId === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreProject(p.id);
                          }}
                        >
                          <RotateCcw /> Restore
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete this project"
                          disabled={updatingId === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(p.id);
                          }}
                        >
                          <Trash2 className="size-4 text-content-muted" />
                        </Button>
                      )}
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
                          {view === "deleted" ? null : isCancelled ? (
                            <Badge variant="danger" size="md">
                              <Ban size={13} /> Cancelled
                            </Badge>
                          ) : isCompleted ? (
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
                            filled ? (state === "completed" ? "bg-ok" : state === "cancelled" ? "bg-danger" : "bg-brand") : "bg-hairline-strong",
                            active && "ring-2 ring-brand-soft",
                          )}
                        />
                      );
                    })}
                  </div>

                  {/* Current stage detail */}
                  <div                      className={cn(
                      "mt-1 rounded-xl border px-4 py-3",
                      state === "completed"
                        ? "border-ok/25 bg-ok-soft/60"
                        : state === "cancelled"
                        ? "border-danger/25 bg-danger-soft/60"
                        : "border-hairline bg-surface-muted",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-content">
                        Stage {stageIndex + 1}/{STAGES.length}:{" "}
                        <span className={state === "completed" ? "text-ok" : state === "cancelled" ? "text-danger" : "text-brand-strong"}>
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
