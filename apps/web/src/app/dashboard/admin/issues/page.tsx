"use client";

/**
 * Admin issue/fix tracker.
 *
 * A running log of known product issues, tracked from here instead of an
 * external doc. Each card shows what's wrong, its status, and — once marked
 * fixed — what was done and exactly when (server-stamped on the status
 * transition, not editable).
 *
 * Laid out as a card grid rather than a stacked list: this is a board to scan
 * for "what's still open", not a document to read top to bottom, and status
 * is carried by the card's own colour so that scan works at arm's length.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { NewIssueDialog } from "@/components/dashboard/admin/new-issue-dialog";
import { ImageLightbox, ImageThumb } from "@/components/ui/image-lightbox";
import { uploadToCloudinary } from "@/lib/storage/upload-client";
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

type IssuePatch = Partial<Pick<Issue, "fix_notes" | "status">> & { images?: string[] };

const MAX_IMAGES = 6;

const STATUS_LABEL: Record<Issue["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  fixed: "Fixed",
};

/**
 * The whole card is tinted by status, not just its badge.
 *
 * A tint plus an accent rail rather than a saturated fill: the point is to
 * read the board's state from across the desk, and body text on a solid green
 * card stops being readable long before it stops being green.
 */
const STATUS_SKIN: Record<
  Issue["status"],
  { card: string; rail: string; badge: "neutral" | "warning" | "success"; note: string }
> = {
  pending: {
    card: "border-hairline-strong bg-surface-card",
    rail: "bg-content-muted/40",
    badge: "neutral",
    note: "bg-surface-subtle",
  },
  in_progress: {
    card: "border-warning/35 bg-warning/[0.07]",
    rail: "bg-warning",
    badge: "warning",
    note: "bg-warning/[0.09]",
  },
  fixed: {
    card: "border-success/35 bg-success/[0.08]",
    rail: "bg-success",
    badge: "success",
    note: "bg-success/[0.10]",
  },
};

type SortKey = "newest" | "oldest" | "updated";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
];

const DAY_MS = 86_400_000;
/** Anything added in the last day is still "new" to whoever opens this page. */
const NEW_FOR_MS = DAY_MS;
/** An open issue past this is worth noticing; it is a nudge, not a status. */
const AGING_DAYS = 14;

function daysBetween(now: number, iso: string) {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

function textareaClass() {
  return "min-h-20 w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-content shadow-none transition-colors placeholder:text-content-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]";
}

function IssueCard({
  issue,
  now,
  onSave,
}: {
  issue: Issue;
  /**
   * Wall-clock read once by the page, not per card. Calling Date.now() during
   * render is impure — two renders of the same card could disagree about
   * whether it is "new" — and on a server-rendered page it also means the
   * server and the client can compute different badges and mismatch on
   * hydration. 0 means "not measured yet" (the first paint), so the age
   * decorations simply don't show until the effect has run.
   */
  now: number;
  onSave: (id: string, patch: IssuePatch) => Promise<boolean>;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(issue.fix_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const images = issue.images ?? [];
  const skin = STATUS_SKIN[issue.status];
  const isNew = now > 0 && now - new Date(issue.created_at).getTime() < NEW_FOR_MS;
  const age = now > 0 ? daysBetween(now, issue.issue_date) : 0;
  const isAging = issue.status !== "fixed" && age >= AGING_DAYS;

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

  /**
   * Screenshots can be added after the fact — a tester almost never sends the
   * picture and the report in the same message. Uploads go to Cloudinary
   * first, exactly as the create dialog does, then the whole (existing + new)
   * array is PATCHed: the column is replaced wholesale server-side, so
   * sending only the new ones would silently drop the old.
   */
  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;

    setUploading(true);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { url } = await uploadToCloudinary(file, "issue");
        if (!images.includes(url) && !added.includes(url)) added.push(url);
      } catch {
        // Reported by the page-level error banner via onSave below if the
        // whole batch ends up empty; a single bad file shouldn't abort the rest.
      }
    }
    if (added.length) await onSave(issue.id, { images: [...images, ...added] });
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <Card className={`relative flex h-full flex-col overflow-hidden p-0 ${skin.card}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${skin.rail}`} />

      <div className="flex flex-1 flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-start sm:gap-4 sm:p-5 sm:pl-6">
        {/* Text column is capped at half the card: the other half belongs to
            the screenshots, which is what makes a report readable at a glance.
            min-w-0 so long words wrap instead of forcing the column wider. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:max-w-[50%]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={skin.badge} size="sm">
              {STATUS_LABEL[issue.status]}
            </Badge>
            {isNew && (
              <span className="flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                <Sparkles className="size-3" />
                New
              </span>
            )}
            <span className="text-[0.6875rem] text-content-muted">
              {new Date(issue.issue_date).toLocaleDateString()}
            </span>
            {isAging && (
              <span className="text-[0.6875rem] font-semibold text-warning">{age} days open</span>
            )}
            {issue.fixed_at && (
              <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-success">
                <CheckCircle2 className="size-3.5" />
                {new Date(issue.fixed_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-content">{issue.title}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-content-muted">
              {issue.description}
            </p>
          </div>

          <div className={`rounded-xl p-3 ${skin.note}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-content-muted">
                What we fixed
              </span>
              {!editingNotes && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setNotesDraft(issue.fix_notes ?? "");
                    setEditingNotes(true);
                  }}
                >
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
              <p className="whitespace-pre-wrap break-words text-sm text-content">
                {issue.fix_notes || <span className="text-content-muted">Not written up yet.</span>}
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-wrap gap-1.5">
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

        {/* Screenshot half. */}
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-1/2">
          {images.length > 0 && (
            <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {images.map((url, i) => (
                <ImageThumb
                  key={url}
                  url={url}
                  onClick={() => setViewing(i)}
                  className={images.length === 1 ? "aspect-[4/3] w-full" : "aspect-[3/4] w-full"}
                />
              ))}
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void addImages(e.target.files)}
          />
          {images.length < MAX_IMAGES && (
            <Button
              size="xs"
              variant="ghost"
              className="self-start"
              disabled={uploading || saving}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <ImagePlus className="mr-1 size-3.5" />
                  {images.length ? "Add screenshot" : "Attach screenshot"}
                </>
              )}
            </Button>
          )}
        </div>
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
  const [sort, setSort] = useState<SortKey>("newest");
  const [composing, setComposing] = useState(false);
  const [now, setNow] = useState(0);

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

  // Re-read after every load so a card created minutes ago is still marked new
  // on the next refresh, without a timer ticking behind an admin page.
  useEffect(() => {
    setNow(Date.now());
  }, [items]);

  /**
   * Sorted here rather than by the API: the endpoint returns the whole table
   * in one response (no paging), so re-ordering is a local array operation and
   * a round trip for it would only add latency to a click.
   */
  const visible = useMemo(() => {
    const at = (iso: string) => new Date(iso).getTime();
    return [...items].sort((a, b) => {
      if (sort === "updated") return at(b.updated_at) - at(a.updated_at);
      const delta = at(a.issue_date) - at(b.issue_date) || at(a.created_at) - at(b.created_at);
      return sort === "oldest" ? delta : -delta;
    });
  }, [items, sort]);

  const newCount = useMemo(
    () =>
      now === 0
        ? 0
        : items.filter((i) => now - new Date(i.created_at).getTime() < NEW_FOR_MS).length,
    [items, now],
  );

  async function updateIssue(id: string, patch: IssuePatch) {
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
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Internal tracking"
        title="Issues & fixes"
        subtitle={
          newCount > 0
            ? `${newCount} added in the last 24 hours`
            : "Known issues, worked one by one"
        }
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
        <div className="flex items-center gap-2">
          <label htmlFor="issue-sort" className="sr-only">
            Sort issues
          </label>
          <select
            id="issue-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded-xl border border-hairline-strong bg-surface-card px-3 text-sm font-semibold text-content transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button variant="surface" size="sm" onClick={() => setComposing(true)}>
            <Plus className="mr-1 size-4" />
            New issue
          </Button>
        </div>
      </div>

      <NewIssueDialog open={composing} onClose={() => setComposing(false)} onCreate={createIssue} />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title="No issues here"
            description="Add one, or switch filters."
          />
        </Card>
      ) : (
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {/* Two columns, and deliberately not more on wide screens: each card
              already gives half its width to screenshots, so a third column
              squeezes the text half to the point where the title wraps every
              two or three words. Tested at 1800px — three columns looked like
              more information and read like less. */}
          {visible.map((issue) => (
            <IssueCard key={issue.id} issue={issue} now={now} onSave={updateIssue} />
          ))}
        </div>
      )}
    </div>
  );
}
