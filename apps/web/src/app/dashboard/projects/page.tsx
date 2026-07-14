"use client";

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
import { Reveal, Stagger } from "@/components/ui/motion";
import { KanbanCard } from "@/components/dashboard/views/kanban-card";
import { cn } from "@/lib/utils";

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
  { key: "final_payment", label: "Payment", desc: "Final invoice and payment settlement." },
  { key: "project_completed", label: "Completed", desc: "Campaign successfully completed." },
];

const KANBAN_COLUMNS = [
  { id: "pitched", label: "Pitched & Planning", stages: ["collaboration_started", "project_discussion", "advance_payment", "content_planning"] },
  { id: "creating", label: "Creating Content", stages: ["content_confirmation", "shooting_in_progress", "editing_in_progress"] },
  { id: "review", label: "In Review", stages: ["sent_for_review", "revisions"] },
  { id: "completed", label: "Completed", stages: ["final_approval", "final_payment", "project_completed"] },
];

interface Project {
  id: string;
  title: string;
  description?: string | null;
  budget?: number | string | null;
  current_stage: string;
  updated_at: string;
  owner_user_id: string;
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
      alert(e instanceof Error ? e.message : "Something went wrong");
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
        <div className="flex flex-1 gap-6 overflow-x-auto pb-4 snap-x snap-mandatory lg:snap-none">
          {KANBAN_COLUMNS.map((col, colIdx) => {
            const columnProjects = projects.filter((p) => col.stages.includes(p.current_stage));
            
            return (
              <div key={col.id} className="flex min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col gap-3 rounded-2xl bg-surface-muted p-3">
                <div className="flex items-center justify-between px-2 pt-1">
                  <h3 className="text-sm font-bold text-content">{col.label}</h3>
                  <span className="flex size-5 items-center justify-center rounded-full bg-white text-[0.625rem] font-bold text-content-muted shadow-sm">
                    {columnProjects.length}
                  </span>
                </div>
                
                <div className="flex flex-col gap-3 overflow-y-auto">
                  {columnProjects.map((p) => {
                    const isOwner = p.owner_user_id === userId;
                    const counterparty = isOwner ? p.counterparty : p.owner;
                    const stageIndex = STAGES.findIndex((s) => s.key === p.current_stage);
                    const isCompleted = p.current_stage === "completed" || stageIndex === STAGES.length - 1;
                    const userRole = isOwner ? "business" : "creator";
                    const actor = STAGE_ACTOR[p.current_stage as Stage] || "either";
                    const myTurn = actor === "either" || actor === userRole;

                    return (
                      <KanbanCard
                        key={p.id}
                        id={p.id}
                        title={p.title}
                        counterpartyName={counterparty?.name || "Partner"}
                        counterpartyRole={counterparty?.role === "influencer" ? "Creator" : "Brand"}
                        stageKey={p.current_stage}
                        budget={p.budget}
                        myTurn={myTurn}
                        isCompleted={isCompleted}
                        onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
