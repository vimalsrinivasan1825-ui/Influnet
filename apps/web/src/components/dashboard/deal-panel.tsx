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
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ProjectSummary {
  id: number;
  title: string;
  description?: string | null;
  budget?: number | string | null;
  advance_amount?: number | string | null;
  due_date?: string | null;
  status: string;
  current_stage?: string | null;
  created_by_user_id?: string | null;
  created_at?: string;
}

export interface ProposalSummary {
  id: string;
  title: string;
  description?: string | null;
  budget?: number | string | null;
  advance_amount?: number | string | null;
  due_date?: string | null;
  note?: string | null;
  review_note?: string | null;
  status: string;
  proposed_by: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

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
  /** Live projects with this partner, newest first — the working history. */
  projects: ProjectSummary[];
  /**
   * A project migration 069 created in 'pending_acceptance'. Not started work:
   * it is shown as pending terms until 071 converts it into a real proposal.
   */
  legacy_pending: ProjectSummary | null;
  /**
   * The most recent terms that were turned down, when nothing is pending.
   * Kept visible so a decline leaves a record instead of vanishing.
   */
  last_declined: ProposalSummary | null;
  /** Terms on the table. Not a project — it exists only in this conversation. */
  proposal: {
    id: string;
    title: string;
    description?: string | null;
    budget?: number | string | null;
    advance_amount?: number | string | null;
    due_date?: string | null;
    note?: string | null;
    status: string;
    proposed_by: string;
    created_at: string;
  } | null;
  viewer: {
    can_respond_to_request: boolean;
    can_cancel_request: boolean;
    can_propose: boolean;
    can_respond_to_proposal: boolean;
    can_withdraw_proposal: boolean;
    can_respond_to_legacy_pending: boolean;
    awaiting_me: boolean;
  };
}

// What the deal is actually doing right now, for the header chip. The collab
// request's own status ("accepted") only ever means "we agreed to talk", so it
// must never be shown as if it described the project.
const PROJECT_STATE: Record<string, { label: string; variant: 'success' | 'brand' | 'neutral' }> = {
  active: { label: 'Project ongoing', variant: 'brand' },
  completed: { label: 'Project completed', variant: 'success' },
  cancelled: { label: 'Project cancelled', variant: 'neutral' },
};

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
  const [prefill, setPrefill] = useState<ProposalSummary | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch<DealState>(`/api/conversations/${conversationId}/deal`);
    if (res.ok && res.data) setDeal(res.data);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    setComposing(false);
    setPrefill(null);
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

  const respondToProposal = async (action: "accept" | "decline" | "withdraw") => {
    const proposalId = deal?.proposal?.id;
    const legacyId = deal?.legacy_pending?.id;
    if (!proposalId && !legacyId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/conversations/${conversationId}/deal`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(proposalId ? { proposal_id: proposalId } : { legacy_project_id: legacyId }),
          action,
          ...(action === "decline" && declineNote.trim() ? { note: declineNote.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(res.error || "Could not respond to the terms");
      toast.success(
        action === "accept"
          ? "Project started — both sides agreed on the terms."
          : action === "withdraw"
            ? "Terms withdrawn."
            : "Terms declined. Keep talking here and propose new ones when you're ready.",
      );
      setDeclining(false);
      setDeclineNote("");
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

  const request = deal.request;
  const { proposal, viewer, partner } = deal;
  const projects = deal.projects ?? [];
  const legacyPending = deal.legacy_pending;
  const openProject = projects.find((p) => p.status !== "completed" && p.status !== "cancelled") ?? null;
  const pendingTerms = proposal ?? legacyPending;
  const declined = deal.last_declined;
  const iDeclined = declined?.resolved_by === deal.other_user_id ? false : true;
  // What became of the ORIGINAL request. Pending terms are a NEW deal and must
  // never restate the outcome of the one that started this relationship.
  // Once the request has produced projects, the projects list below says
  // everything the request card would — showing both just repeats the same
  // collaboration twice. Keep the card only while the request itself is still
  // the story: awaiting a decision, or nothing has come of it yet.
  const showRequestCard = request.status !== "accepted" || projects.length === 0;
  const requestOutcome =
    request.status !== "accepted"
      ? `Request ${request.status}`
      : openProject
        ? "Led to an ongoing project"
        : projects.length > 0
          ? "Completed"
          : "Request accepted";
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
        {openProject && PROJECT_STATE[openProject.status] && (
          <Badge variant={PROJECT_STATE[openProject.status].variant} size="sm" dot>
            {PROJECT_STATE[openProject.status].label}
          </Badge>
        )}
        {pendingTerms && (
          <Badge variant="warning" size="sm" dot>
            {projects.length > 0 ? "New terms awaiting approval" : "Terms awaiting approval"}
          </Badge>
        )}
        {!openProject && !pendingTerms && request.status === "accepted" && (
          <Badge variant="neutral" size="sm" dot>
            In discussion
          </Badge>
        )}
        {projects.length > 0 && (
          <span className="text-[0.6875rem] font-semibold text-content-muted">
            {projects.length} project{projects.length > 1 ? "s" : ""} together
          </span>
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
          {/* Business profiles are private — this link only resolves for a
              creator who actually has a request or project with the brand. It
              lives outside the request card so it stays reachable once that
              card is superseded by the projects list. */}
          {partner?.role === "business_owner" && partner.slug && (
            <Link
              href={`/b/${partner.slug}`}
              className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Building2 className="size-3" /> View brand profile
            </Link>
          )}

          {/* The originating request. Hidden once the projects list below
              supersedes it — see showRequestCard. */}
          {showRequestCard && (
          <div className="rounded-xl border border-hairline bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-content">{title}</p>
              <Badge
                variant={
                  request.status !== "accepted"
                    ? "neutral"
                    : projects.length > 0 && !openProject
                      ? "success"
                      : "brand"
                }
                size="sm"
              >
                {requestOutcome}
              </Badge>
            </div>
            {detail && <p className="mt-1 text-xs text-content-soft">{detail}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-soft">
              {money(request.budget) && (
                <span>
                  {projects.length > 0 ? "Originally asked for:" : "Opening budget:"}{" "}
                  <span className="font-bold text-content">{money(request.budget)}</span>
                </span>
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
          )}

          {/* Every project run with this partner — completed ones stay visible
              so the working history sits alongside the current deal. */}
          {projects.length > 0 && (
            <div className={cn("flex flex-col gap-1.5", showRequestCard && "mt-4")}>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                Projects with {partner?.name || "this partner"}
              </p>
              {projects.map((p) => {
                const state = PROJECT_STATE[p.status];
                const done = p.status === "completed";
                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/projects/${p.id}`}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                      done
                        ? "border-hairline bg-surface-muted hover:border-content-muted"
                        : "border-ok/30 bg-ok-soft hover:border-ok/60",
                    )}
                  >
                    <FolderKanban className={cn("size-4 shrink-0", done ? "text-content-muted" : "text-ok")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-content">{p.title}</span>
                      <span className="block text-xs text-content-soft">
                        {state?.label ?? p.status}
                        {money(p.budget) ? ` · ${money(p.budget)}` : ""}
                      </span>
                    </span>
                    {state && (
                      <Badge variant={state.variant} size="sm">
                        {done ? "Completed" : "Ongoing"}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Terms on the table. Deliberately NOT a project yet — nothing is
              created until the other side accepts. */}
          {pendingTerms && (
            <div className="mt-4 rounded-xl border border-warn/30 bg-warn-soft p-3">
              <div className="flex items-center gap-2">
                <Hourglass className="size-3.5 shrink-0 text-warn" />
                <p className="text-sm font-bold text-content">{pendingTerms.title}</p>
                <Badge variant="warning" size="sm">
                  {projects.length > 0 ? "New deal — not started" : "Not started — awaiting approval"}
                </Badge>
              </div>
              {pendingTerms.description && (
                <p className="mt-1 text-xs text-content-soft">{pendingTerms.description}</p>
              )}
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
                {money(pendingTerms.budget) && (
                  <div>
                    Budget <span className="font-bold text-content">{money(pendingTerms.budget)}</span>
                  </div>
                )}
                {money(pendingTerms.advance_amount) && (
                  <div>
                    Advance{" "}
                    <span className="font-bold text-content">{money(pendingTerms.advance_amount)}</span>
                  </div>
                )}
                {pendingTerms.due_date && (
                  <div>
                    Due <span className="font-bold text-content">{pendingTerms.due_date}</span>
                  </div>
                )}
              </dl>
              {proposal?.note && (
                <p className="mt-1.5 text-xs italic text-content-soft">“{proposal.note}”</p>
              )}

              {viewer.can_respond_to_proposal || viewer.can_respond_to_legacy_pending ? (
                declining ? (
                  <div className="mt-2.5 flex flex-col gap-2">
                    <Input
                      autoFocus
                      placeholder="What needs to change? (optional, but it helps)"
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      maxLength={2000}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="surface" disabled={busy} onClick={() => respondToProposal("decline")}>
                        <X /> Send decline
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="brand" disabled={busy} onClick={() => respondToProposal("accept")}>
                      <Check /> Accept & start project
                    </Button>
                    <Button size="sm" variant="surface" disabled={busy} onClick={() => setDeclining(true)}>
                      <X /> Decline & keep talking
                    </Button>
                  </div>
                )
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-content-muted">
                    Waiting on {partner?.name || "the other side"} to accept.
                  </p>
                  {viewer.can_withdraw_proposal && (
                    <Button size="sm" variant="surface" disabled={busy} onClick={() => respondToProposal("withdraw")}>
                      Withdraw
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* A decline is part of the negotiation, not the end of it. The
              refused terms stay on screen with the reason, and either side can
              open a fresh proposal pre-filled from them. */}
          {declined && !pendingTerms && (
            <div className="mt-4 rounded-xl border border-hairline bg-surface-muted p-3">
              <div className="flex flex-wrap items-center gap-2">
                <X className="size-3.5 shrink-0 text-content-muted" />
                <p className="text-sm font-bold text-content-soft line-through">{declined.title}</p>
                <Badge variant="neutral" size="sm">
                  {declined.status === "withdrawn" ? "Withdrawn" : "Declined"}
                </Badge>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                {money(declined.budget) && <div>Budget {money(declined.budget)}</div>}
                {money(declined.advance_amount) && <div>Advance {money(declined.advance_amount)}</div>}
                {declined.due_date && <div>Due {declined.due_date}</div>}
              </dl>
              {declined.review_note && (
                <p className="mt-1.5 text-xs italic text-content-soft">
                  Reason: “{declined.review_note}”
                </p>
              )}
              <p className="mt-1.5 text-xs text-content-muted">
                {declined.status === "withdrawn"
                  ? "These terms were withdrawn."
                  : iDeclined
                    ? "You turned these terms down. Talk it through below, then put new ones forward."
                    : `${partner?.name || "They"} turned these terms down. Talk it through below, then try again.`}
              </p>
              {viewer.can_propose && !composing && (
                <Button
                  size="sm"
                  variant="brand"
                  className="mt-2.5"
                  onClick={() => {
                    setPrefill(declined);
                    setComposing(true);
                  }}
                >
                  <FolderKanban /> Propose new terms
                </Button>
              )}
            </div>
          )}

          {viewer.can_propose && !composing && !declined && (
            <Button size="sm" variant="brand" className="mt-4" onClick={() => setComposing(true)}>
              <FolderKanban /> Create project
            </Button>
          )}

          {viewer.can_propose && composing && (
            <ProposalForm
              request={request}
              busy={busy}
              setBusy={setBusy}
              onCancel={() => {
                setComposing(false);
                setPrefill(null);
              }}
              conversationId={conversationId}
              prefill={prefill}
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
  conversationId,
  prefill,
  busy,
  setBusy,
  onCancel,
  onCreated,
}: {
  request: NonNullable<DealState["request"]>;
  conversationId: string;
  /** Terms that were turned down — start from those rather than a blank form. */
  prefill?: ProposalSummary | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(prefill?.title || request.message?.split("\n")[0] || "");
  const [description, setDescription] = useState(
    prefill?.description ??
      (request.message?.includes("\n") ? request.message.split("\n\n").slice(1).join("\n\n") : ""),
  );
  const [budget, setBudget] = useState(
    prefill?.budget != null ? String(prefill.budget) : request.budget != null ? String(request.budget) : "",
  );
  const [advance, setAdvance] = useState(prefill?.advance_amount != null ? String(prefill.advance_amount) : "");
  const [dueDate, setDueDate] = useState(prefill?.due_date || "");
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
      const res = await apiFetch<{ proposal_id: string }>(`/api/conversations/${conversationId}/deal`, {
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
      if (!res.ok) throw new Error(res.error || "Could not send the terms");
      toast.success("Terms sent — the project starts once the other side accepts.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand">
        {prefill ? "Revised terms" : "Proposed terms"}
      </p>
      <p className="mt-0.5 text-xs text-content-soft">
        {prefill
          ? "Adjusted from the terms that were turned down. Change what you agreed and send again."
          : "These go to the other side for approval — the project starts once they accept."}
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
          <div>
            <Label htmlFor="deal-budget">Total budget (₹)</Label>
            <Input
              id="deal-budget"
              type="number"
              min={0}
              placeholder="e.g. 30000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="deal-advance">Advance (₹)</Label>
            <Input
              id="deal-advance"
              type="number"
              min={0}
              placeholder="Optional"
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="deal-due">Due date</Label>
            <Input
              id="deal-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
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
