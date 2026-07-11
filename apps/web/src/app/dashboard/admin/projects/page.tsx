"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CalendarDays, FolderKanban, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_LABELS: Record<string, string> = {
  collaboration_started: "Started",
  project_discussion: "Discussion",
  advance_payment: "Deposit",
  content_planning: "Planning",
  content_confirmation: "Approved",
  shooting_in_progress: "Shooting",
  editing_in_progress: "Editing",
  sent_for_review: "Review",
  revisions: "Revisions",
  final_approval: "Final OK",
  final_payment: "Payment",
  project_completed: "Completed",
};

interface AdminProject {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  budget?: number | string | null;
  created_at: string;
  owner?: { name?: string | null } | null;
  counterparty?: { name?: string | null } | null;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await apiFetch<{ projects: AdminProject[] }>("/api/admin/projects");
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to fetch projects");
      setProjects(res.data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDeleteProject = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      const res = await apiFetch("/api/admin/projects", {
        method: "DELETE",
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to delete");
      setConfirmDelete(null);
      await fetchProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = projects.filter(
    (p) =>
      !search ||
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.owner?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.counterparty?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Admin"
        title="Campaign projects"
        subtitle={`${projects.length} total — view or remove any project.`}
        icon={<FolderKanban />}
        actions={
          <InputGroup icon={<Search />} className="w-full sm:w-64">
            <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
        }
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
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderKanban />} title="No projects found" description="No campaign projects match your search." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => {
            const stageLabel = STAGE_LABELS[p.current_stage] || p.current_stage;
            const isActive = p.status === "active";
            return (
              <Card key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={p.title} size="md" square />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-content">{p.title}</span>
                      <Badge variant={isActive ? "info" : "neutral"} size="sm">
                        {isActive ? "Active" : p.status}
                      </Badge>
                      <Badge variant="brand" size="sm">
                        {stageLabel}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-content-soft">
                      <span>{p.owner?.name || "Unknown"} (Brand)</span>
                      <ArrowLeftRight className="size-3 text-content-muted" />
                      <span>{p.counterparty?.name || "Unknown"} (Creator)</span>
                      {p.budget != null && p.budget !== "" && (
                        <span className="font-semibold text-content">₹{Number(p.budget).toLocaleString()}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end lg:self-center">
                  {confirmDelete === p.id ? (
                    <>
                      <Button size="sm" variant="destructive" disabled={deletingId === p.id} onClick={() => handleDeleteProject(p.id)}>
                        {deletingId === p.id ? "…" : "Confirm delete"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(p.id)}>
                      <Trash2 /> Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
