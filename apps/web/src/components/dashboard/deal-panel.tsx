"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ChevronDown,
  FolderKanban,
  Handshake,
  Hourglass,
  Loader2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DealState {
  other_user_id: string | null;
  partner: { id: string; name?: string | null; role?: string | null; slug?: string | null } | null;
  request: {
    id: string;
    from_user_id: string;
    to_user_id: string;
    status: string;
    message?: string | null;
    budget?: number | string | null;
    created_at: string;
  } | null;
  project: {
    id: number;
    title: string;
    description?: string | null;
    budget?: number | string | null;
    advance_amount?: number | string | null;
    due_date?: string | null;
    status: string;
    current_stage?: string | null;
    created_by_user_id?: string | null;
    proposal_note?: string | null;
  } | null;
  viewer: {
    can_respond_to_request: boolean;
    can_cancel_request: boolean;
    can_create_project: boolean;
    can_respond_to_project: boolean;
    awaiting_me: boolean;
  };
}

const money = (v: unknown) =>
  v == null || v === "" ? null : `₹${Number(v).toLocaleString("en-IN")}`;

/**
 * The deal card that sits above a conversation.
 *
 * It carries the negotiation from "a request landed" all the way to "the
 * project is live", so the two parties never have to leave the chat to move
 * things forward:
 *
 *   pending request  → accept / decline right here
 *   accepted         → talk it through, then either side proposes the project
 *   proposed         → the other side accepts the terms (or declines to keep talking)
 *   active           → a link through to the project workspace
 */
export function DealPanel({
  conversationId,
  onProjectCreated,
}: {
  conversationId: string;
  onProjectCreated?: () => void;
}) {
  const [deal, setDeal] = useState<DealState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch<DealState>(`/api/conversations/${conversationId}/deal`);
    if (res.ok && res.data) setDeal(res.data);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    setComposing(false);
    load();
  }, [load]);

  const respondToRequest = async (status: "accepted" | "declined" | "cancelled") => {
    if (!deal?.request) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/collabs", {
        method: "PATCH",
        body: JSON.stringify({ id: deal.request.id, status }),
      });
      if (!res.ok) throw new Error(res.error || "Could not update the request");
      toast.success(
        status === "accepted"
          ? "Request accepted — agree on the terms here, then create the project."
          : `Request ${status}.`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const respondToProject = async (accept: boolean) => {
    if (!deal?.project) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${deal.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: accept ? "accept_proposal" : "decline_proposal" }),
      });
      if (!res.ok) throw new Error(res.error || "Could not respond to the proposal");
      toast.success(
        accept
          ? "Project started — both sides agreed on the terms."
          : "Terms declined. Keep talking here and propose new ones when you're ready.",
      );
      await load();
      onProjectCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-card px-4 py-3 text-xs font-semibold text-content-muted">
        <Loader2 className="size-3.5 animate-spin" /> Loading deal…
      </div>
    );
  }

  if (!deal?.request) return null;

  const { request, project, viewer, partner } = deal;
  const title = request.message?.split("\n")[0] || "Collaboration request";
  const detail = request.message?.includes("\n")
    ? request.message.split("\n\n").slice(1).join(" ")
    : null;

  return (
    <div className="border-b border-hairline bg-surface-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 pb-1.5 pt-3 text-left"
      >
        <Handshake className="size-3.5 shrink-0 text-brand" />
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand">
          The deal
        </span>
        {project?.status === "pending_acceptance" && (
          <Badge variant="warning" size="sm" dot>
            Awaiting acceptance
          </Badge>
        )}
        {project?.status === "active" && (
          <Badge variant="success" size="sm" dot>
            Project active
          </Badge>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 text-content-muted transition-transform",
            !expanded && "-rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3.5">
          {/* The originating request — always visible, so both sides can see
              what was actually asked for while they negotiate. */}
          <div className="rounded-xl border border-hairline bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-content">{title}</p>
              <Badge
                variant={
                  request.status === "accepted"
                    ? "success"
                    : request.status === "pending"
                      ? "warning"
                      : "neutral"
                }
                size="sm"
              >
                {request.status}
              </Badge>
            </div>
            {detail && <p className="mt-1 text-xs text-content-soft">{detail}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-soft">
              {money(request.budget) && (
                <span>
                  Opening budget:{" "}
                  <span className="font-bold text-content">{money(request.budget)}</span>
                </span>
              )}
              {/* Business profiles are private — this link only resolves for a
                  creator who actually has a request or project with the brand. */}
              {partner?.role === "business_owner" && partner.slug && (
                <Link
                  href={`/b/${partner.slug}`}
                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  <Building2 className="size-3" /> View brand profile
                </Link>
              )}
            </div>

            {viewer.can_respond_to_request && (
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="brand" disabled={busy} onClick={() => respondToRequest("accepted")}>
                  <Check /> Accept & talk
                </Button>
                <Button size="sm" variant="surface" disabled={busy} onClick={() => respondToRequest("declined")}>
                  Decline
                </Button>
              </div>
            )}
            {viewer.can_cancel_request && (
              <p className="mt-2 text-xs font-semibold text-content-muted">
                Waiting for the creator to accept.
              </p>
            )}
          </div>

          {/* Proposed project — the terms one side put forward after talking. */}
          {project && project.status === "pending_acceptance" && (
            <div className="mt-2.5 rounded-xl border border-warn/30 bg-warn-soft p-3">
              <div className="flex items-center gap-2">
                <Hourglass className="size-3.5 shrink-0 text-warn" />
                <p className="text-sm font-bold text-content">{project.title}</p>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
                {money(project.budget) && (
                  <div>
                    Budget <span className="font-bold text-content">{money(project.budget)}</span>
                  </div>
                )}
                {money(project.advance_amount) && (
                  <div>
                    Advance{" "}
                    <span className="font-bold text-content">{money(project.advance_amount)}</span>
                  </div>
                )}
                {project.due_date && (
                  <div>
                    Due <span className="font-bold text-content">{project.due_date}</span>
                  </div>
                )}
              </dl>
              {project.proposal_note && (
                <p className="mt-1.5 text-xs italic text-content-soft">“{project.proposal_note}”</p>
              )}

              {viewer.can_respond_to_project ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="brand" disabled={busy} onClick={() => respondToProject(true)}>
                    <Check /> Accept & start project
                  </Button>
                  <Button size="sm" variant="surface" disabled={busy} onClick={() => respondToProject(false)}>
                    <X /> Decline & keep talking
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-xs font-semibold text-content-muted">
                  Sent for approval — waiting on {partner?.name || "the other side"}.
                </p>
              )}
            </div>
          )}

          {/* Live project — hand off to the stage pipeline. */}
          {project && project.status !== "pending_acceptance" && (
            <Link
              href={`/dashboard/projects/${project.id}`}
              className="mt-2.5 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft px-3 py-2.5 transition-colors hover:border-ok/60"
            >
              <FolderKanban className="size-4 shrink-0 text-ok" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-content">{project.title}</span>
                <span className="block text-xs text-content-soft">Open the project workspace</span>
              </span>
            </Link>
          )}

          {/* Both sides agreed to talk and no project exists yet — either of
              them can now put the negotiated terms forward. */}
          {viewer.can_create_project && !composing && (
            <Button size="sm" variant="brand" className="mt-2.5" onClick={() => setComposing(true)}>
              <FolderKanban /> Create project
            </Button>
          )}

          {viewer.can_create_project && composing && (
            <ProposalForm
              request={request}
              busy={busy}
              setBusy={setBusy}
              onCancel={() => setComposing(false)}
              onCreated={async () => {
                setComposing(false);
                await load();
                onProjectCreated?.();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The terms form. Pre-filled from the original request so the common case —
 * "we agreed on what they asked for" — is a single click, while the negotiated
 * budget / advance / due date can all be overridden.
 */
function ProposalForm({
  request,
  busy,
  setBusy,
  onCancel,
  onCreated,
}: {
  request: NonNullable<DealState["request"]>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(request.message?.split("\n")[0] || "");
  const [description, setDescription] = useState(
    request.message?.includes("\n") ? request.message.split("\n\n").slice(1).join("\n\n") : "",
  );
  const [budget, setBudget] = useState(request.budget != null ? String(request.budget) : "");
  const [advance, setAdvance] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Give the project a title.");
      return;
    }
    if (advance && budget && Number(advance) > Number(budget)) {
      toast.error("The advance can’t be more than the total budget.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ project_id: number }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          collab_request_id: request.id,
          title: title.trim(),
          description,
          ...(budget ? { budget: Number(budget) } : {}),
          ...(advance ? { advance_amount: Number(advance) } : {}),
          ...(dueDate ? { due_date: dueDate } : {}),
          ...(note ? { note } : {}),
        }),
      });
      if (!res.ok) throw new Error(res.error || "Could not create the project");
      toast.success("Terms sent — the project starts once the other side accepts.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2.5 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand">Proposed terms</p>
      <p className="mt-0.5 text-xs text-content-soft">
        These go to the other side for approval — the project starts once they accept.
      </p>

      <div className="mt-2.5 flex flex-col gap-2">
        <Input
          placeholder="Project title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <Textarea
          placeholder="What's being delivered?"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input
            type="number"
            min={0}
            placeholder="Budget (₹)"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            placeholder="Advance (₹)"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
          />
          <Input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <Input
          placeholder="Note to the other side (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button size="sm" variant="brand" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Send for approval
        </Button>
        <Button size="sm" variant="surface" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
