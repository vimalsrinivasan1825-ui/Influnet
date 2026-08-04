"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, ChevronDown, Loader2, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { VerifiedBadge, type VerificationStatus } from "@/components/ui/verified-badge";

interface BreakdownItem {
  label: string;
  met: boolean;
  weight: number;
}

interface StatusResponse {
  status: VerificationStatus;
  verified_badge: boolean;
  verified_at: string | null;
  auto_approve_threshold: number;
  latest_check: {
    status: string;
    ai_score: number | null;
    ai_reason: string | null;
    created_at: string;
    breakdown: BreakdownItem[] | null;
  } | null;
}

const BLURB: Record<VerificationStatus, string> = {
  unverified: "Run verification to earn a trust badge. We check your Instagram handle live — real followers, recent activity, and Instagram's own verified status. It runs in the background; you can keep using everything meanwhile.",
  pending: "Verification is running. This won't stop you using any feature.",
  in_review: "A reviewer is taking a look. No action needed — you have full access in the meantime.",
  verified: "Your account is verified. The badge is visible to businesses and creators you work with.",
  needs_more_info: "We need a bit more detail to verify you. Update your profile below, then re-run verification.",
  rejected: "We couldn't verify your account. Review your details and try again.",
};

export function VerificationPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = async () => {
    const res = await apiFetch<StatusResponse>("/api/verification");
    if (res.ok && res.data) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runVerification = async () => {
    setRunning(true);
    setError(null);
    try {
      // The failure branch used to be silent — no error, no toast, the button
      // just re-enabled with nothing to show for it, which reads as "nothing
      // happened" even when the run was rejected (rate limit, provider outage).
      const res = await apiFetch("/api/verification", { method: "POST" });
      if (res.ok) {
        await load();
      } else {
        setError(res.error || "Could not run verification — try again in a moment.");
      }
    } finally {
      setRunning(false);
    }
  };

  const status = data?.status ?? "unverified";
  const canRun = !running && ["unverified", "needs_more_info", "rejected", "verified"].includes(status);
  const isBusy = status === "pending" || status === "in_review";

  return (
    <SectionCard title="Verification">
      <div className="flex flex-col gap-4">
        <p className="-mt-1 text-xs text-content-muted">
          A trust badge shown to the people you collaborate with.
        </p>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            {status === "verified" ? <BadgeCheck className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            {loading ? (
              <span className="text-sm text-content-muted">Loading…</span>
            ) : (
              <>
                <VerifiedBadge status={status} showAll size="md" />
                <p className="mt-1.5 text-xs text-content-soft">{BLURB[status]}</p>
              </>
            )}
          </div>
        </div>

        {data?.latest_check && status !== "verified" && (
          <div className="rounded-lg bg-surface-muted">
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <div className="min-w-0 flex-1">
                {data.latest_check.ai_score != null && (
                  <p className="text-xs font-bold text-content">
                    Confidence score: {Math.round(data.latest_check.ai_score * 100)}%
                    <span className="ml-1 font-normal text-content-muted">
                      (needs {Math.round(data.auto_approve_threshold * 100)}% to auto-verify — below that, an admin reviews it)
                    </span>
                  </p>
                )}
                {data.latest_check.ai_reason && (
                  <p className="mt-0.5 text-xs text-content-muted">{data.latest_check.ai_reason}</p>
                )}
              </div>
              {data.latest_check.breakdown && (
                <ChevronDown className={`size-4 shrink-0 text-content-muted transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              )}
            </button>

            {detailsOpen && data.latest_check.breakdown && (
              <ul className="flex flex-col gap-1.5 border-t border-hairline px-3 py-2.5">
                {data.latest_check.breakdown.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-xs">
                    {item.met ? (
                      <Check className="size-3.5 shrink-0 text-ok" />
                    ) : (
                      <X className="size-3.5 shrink-0 text-danger" />
                    )}
                    <span className={item.met ? "text-content-soft" : "text-content"}>
                      {item.label}
                      {item.weight === 0 && !item.met && (
                        <span className="ml-1 font-semibold text-warn">— required</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="brand" size="sm" disabled={!canRun} onClick={runVerification}>
            {running ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {status === "verified" ? "Re-verify & Refresh Data" : isBusy ? "In progress…" : "Run verification"}
          </Button>
          {isBusy && <span className="text-xs text-content-muted">Runs in the background — nothing is blocked.</span>}
        </div>

        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      </div>
    </SectionCard>
  );
}
