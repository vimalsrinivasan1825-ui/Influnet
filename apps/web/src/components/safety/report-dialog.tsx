"use client";

/**
 * Report or block someone, from wherever you meet them.
 *
 * App Store 1.2 and Google's UGC policy want reporting reachable at the place
 * the content is, not only from a project. This one dialog is used on creator
 * profiles, business profiles, campaign pages and collaboration requests; the
 * project page keeps its own older copy of the same UI (same words, same API).
 *
 * The report is ABOUT a person (`reportedId`). `context` says where it was made
 * so a moderator knows what to look at (migration 163); the server checks the
 * campaign / request id really belongs to that person. "Also block" is offered
 * in the same step, as on the project page. The mobile twin is
 * apps/mobile/components/report-sheet.tsx.
 */

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Flag, Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReportContext =
  | { kind: "profile" }
  | { kind: "campaign"; campaignId: string }
  | { kind: "request"; requestId: string };

const REASONS = ["scam", "harassment", "spam", "fake", "other"] as const;
type Reason = (typeof REASONS)[number];

export function ReportDialog({
  open,
  onClose,
  reportedId,
  reportedName,
  context,
}: {
  open: boolean;
  onClose: () => void;
  reportedId: string;
  reportedName: string;
  context: ReportContext;
}) {
  const [reason, setReason] = useState<Reason>("scam");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const close = () => {
    setDone(false);
    setDetails("");
    setAlsoBlock(false);
    onClose();
  };

  async function submit() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          reported_id: reportedId,
          reason,
          details: details.trim() || undefined,
          context: context.kind,
          ...(context.kind === "campaign" ? { campaign_id: context.campaignId } : {}),
          ...(context.kind === "request" ? { collab_request_id: context.requestId } : {}),
        }),
      });
      if (!res.ok) {
        toast.error(res.error || "Could not submit the report.");
        return;
      }
      if (alsoBlock) {
        const blockRes = await apiFetch("/api/blocks", {
          method: "POST",
          body: JSON.stringify({ blocked_id: reportedId }),
        });
        // The report already went through — don't lose that over the block
        // failing separately (e.g. a rate limit). Say so and let them retry.
        if (!blockRes.ok) toast.error(blockRes.error || "Report sent, but blocking failed — try again from Settings.");
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${reportedName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="truncate text-lg font-extrabold text-content">Report {reportedName}</h3>
          <button type="button" onClick={close} className="text-content-muted hover:text-content" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 size={32} className="text-ok" />
            <p className="text-sm font-semibold text-content">Thanks — our team will review this report.</p>
            <Button variant="surface" size="sm" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-content-muted">Reports are private and sent to the Influnet team for review.</p>
            <div>
              <Label>Reason</Label>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={reason === r}
                    onClick={() => setReason(r)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors",
                      reason === r ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-content-muted hover:text-content",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened?" rows={3} maxLength={2000} />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline-strong bg-surface-muted px-3.5 py-3 text-sm">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="mt-0.5 size-4 accent-danger" />
              <span>
                <span className="font-semibold text-content">Also block {reportedName}</span>
                <span className="block text-xs text-content-muted">
                  They won&rsquo;t be able to message you or send new requests. Manage this later in Settings.
                </span>
              </span>
            </label>
            <Button variant="destructive" className="w-full" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Flag />} Submit report
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A flag button that opens the dialog. `variant`:
 *   icon     — a compact icon button for a toolbar or card corner
 *   link     — a quiet text link ("Report or block") for the bottom of a page
 *   floating — a small fixed pill, for pages with no toolbar (public profiles)
 */
export function ReportButton({
  reportedId,
  reportedName,
  context,
  variant = "icon",
  className,
}: {
  reportedId: string;
  reportedName: string;
  context: ReportContext;
  variant?: "icon" | "link" | "floating";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          variant="surface"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={`Report or block ${reportedName}`}
          title="Report or block"
          className={cn("shrink-0", className)}
        >
          <Flag size={14} />
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold text-content-muted hover:text-danger",
            variant === "floating" &&
              "fixed bottom-4 left-4 z-40 rounded-full border border-hairline-strong bg-surface/95 px-3 py-2 shadow-lg backdrop-blur",
            className,
          )}
        >
          <Flag size={13} /> Report or block
        </button>
      )}
      <ReportDialog open={open} onClose={() => setOpen(false)} reportedId={reportedId} reportedName={reportedName} context={context} />
    </>
  );
}
