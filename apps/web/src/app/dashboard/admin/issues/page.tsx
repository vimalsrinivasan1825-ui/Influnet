"use client";

/**
 * Admin issue/fix tracker.
 *
 * A running log of known product issues, tracked from here instead of an
 * external doc. Each card shows what's wrong, its status, and — once marked
 * fixed — what was done and exactly when (server-stamped on the status
 * transition, not editable).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { NewIssueDialog } from "@/components/dashboard/admin/new-issue-dialog";
import { ImageLightbox, ImageThumb } from "@/components/ui/image-lightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/ui/tabs";

interface Issue {
  id: string;
  title: string;
  description: string;
  fix_notes: string | null;
  status: "pending" | "in_progress" | "fixed";
  issue_date: string;
  fixed_at: string | null;
  images: string[] | null;
  created_at: string;
  updated_at: string;
}

const STATUS_VARIANT: Record<Issue["status"], "neutral" | "warning" | "success"> = {
  pending: "neutral",
  in_progress: "warning",
  fixed: "success",
};

const STATUS_LABEL: Record<Issue["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  fixed: "Fixed",
};

function textareaClass() {
  return "min-h-20 w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-content shadow-none transition-colors placeholder:text-content-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]";
}

function IssueCard({
  issue,
  onSave,
}: {
  issue: Issue;
  onSave: (id: string, patch: Partial<Pick<Issue, "fix_notes" | "status">>) => Promise<boolean>;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(issue.fix_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  const images = issue.images ?? [];

  async function saveNotes() {
    setSaving(true);
    const ok = await onSave(issue.id, { fix_notes: notesDraft });
    setSaving(false);
    if (ok) setEditingNotes(false);
  }

  async function setStatus(status: Issue["status"]) {
    setSaving(true);
    await onSave(issue.id, { status });
    setSaving(false);
  }

  return (
    <Card className="p-4 sm:p-5">
      {/* Two columns from sm up: the report reads down the left, screenshots
          stack in the right-hand gutter that was previously empty. Below sm
          they fall back to one column, thumbnails in a row. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[issue.status]} size="sm">
          {STATUS_LABEL[issue.status]}
        </Badge>
        <span className="text-[0.6875rem] text-content-muted">
          Reported {new Date(issue.issue_date).toLocaleDateString()}
        </span>
        {issue.fixed_at && (
          <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-success">
            <CheckCircle2 className="size-3.5" />
            Fixed {new Date(issue.fixed_at).toLocaleString()}
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-content">{issue.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-content-muted">
          {issue.description}
        </p>
      </div>

      <div className="rounded-xl bg-surface-subtle p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-content-muted">
            What we fixed
          </span>
          {!editingNotes && (
            <Button size="xs" variant="ghost" onClick={() => { setNotesDraft(issue.fix_notes ?? ""); setEditingNotes(true); }}>
              Edit
            </Button>
          )}
        </div>
        {editingNotes ? (
          <div className="flex flex-col gap-2">
            <textarea
              className={textareaClass()}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="What was changed to fix this…"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="xs" onClick={saveNotes} disabled={saving}>
                {saving && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditingNotes(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-content">
            {issue.fix_notes || <span className="text-content-muted">Not written up yet.</span>}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {issue.status !== "pending" && (
          <Button size="xs" variant="surface" onClick={() => setStatus("pending")} disabled={saving}>
            Mark pending
          </Button>
        )}
        {issue.status !== "in_progress" && (
          <Button size="xs" variant="surface" onClick={() => setStatus("in_progress")} disabled={saving}>
            Mark in progress
          </Button>
        )}
        {issue.status !== "fixed" && (
          <Button size="xs" variant="brand" onClick={() => setStatus("fixed")} disabled={saving}>
            Mark fixed
          </Button>
        )}
      </div>
      </div>

        {images.length > 0 && (
          <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:w-40 sm:flex-col">
            {images.map((url, i) => (
              <ImageThumb
                key={url}
                url={url}
                onClick={() => setViewing(i)}
                className="size-24 sm:h-36 sm:w-full"
              />
            ))}
          </div>
        )}
      </div>

      <ImageLightbox
        images={images}
        index={viewing}
        onClose={() => setViewing(null)}
        onIndexChange={setViewing}
      />
    </Card>
  );
}

export default function AdminIssuesPage() {
  const [items, setItems] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "fixed">("all");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async (which: string) => {
    setLoading(true);
    const qs = which === "all" ? "" : `?status=${which}`;
    const res = await apiFetch<{ issues: Issue[] }>(`/api/admin/issues${qs}`);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load issues");
    } else {
      setError("");
      setItems(res.data.issues || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function updateIssue(id: string, patch: Partial<Pick<Issue, "fix_notes" | "status">>) {
    const res = await apiFetch<{ issue: Issue }>("/api/admin/issues", {
      method: "PATCH",
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok || !res.data) {
      setError(res.error || "Could not update this issue");
      return false;
    }
    setError("");
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? res.data!.issue : it));
      return filter === "all" || res.data!.issue.status === filter
        ? next
        : next.filter((it) => it.id !== id);
    });
    return true;
  }

  async function createIssue(input: { title: string; description: string; images: string[] }) {
    const res = await apiFetch<{ issue: Issue }>("/api/admin/issues", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res.ok || !res.data) {
      setError(res.error || "Could not create issue");
      return false;
    }
    setError("");
    if (filter === "all" || filter === "pending") {
      setItems((prev) => [res.data!.issue, ...prev]);
    }
    return true;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Internal tracking"
        title="Issues & fixes"
        subtitle="Known issues, worked one by one"
        icon={<ClipboardList />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={filter}
          onValueChange={setFilter}
          tabs={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In progress" },
            { value: "fixed", label: "Fixed" },
          ]}
        />
        <Button variant="surface" size="sm" onClick={() => setComposing(true)}>
          <Plus className="mr-1 size-4" />
          New issue
        </Button>
      </div>

      <NewIssueDialog
        open={composing}
        onClose={() => setComposing(false)}
        onCreate={createIssue}
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
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title="No issues here"
            description="Add one, or switch filters."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onSave={updateIssue} />
          ))}
        </div>
      )}
    </div>
  );
}
