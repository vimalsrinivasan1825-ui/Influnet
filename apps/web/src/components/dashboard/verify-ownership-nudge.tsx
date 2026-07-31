"use client";

// Dismissible nudge on the creator dashboard prompting them to prove they own
// their Instagram handle (the bio-code handshake — see
// api/verification/ownership/route.ts and migration 058). Modeled on
// media-kit-nudge.tsx: self-fetches so it doesn't touch the dashboard data
// pipeline, and starts dismissed so there's no flash before real state is
// known.
//
// Unlike the media-kit nudge, dismissal here is a 7-day SNOOZE, not
// permanent — ownership verification gates auto-approval (verification.ts)
// and the business-facing trust signal (search_influencers, deal route), so
// staying unverified has real cost to the creator.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, X, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface ProfileShape {
  role?: string;
  instagram_handle?: string | null;
  // Undefined until migration 085 is applied — see the fallback below.
  ownership_nudge_dismissed_at?: string | null;
}

interface ClaimStatus {
  status?: "none" | "pending" | "verified" | "expired" | "revoked";
}

const DISMISS_KEY = "influnet_ownership_nudge_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozedRecently(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const dismissedAt = new Date(iso).getTime();
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < SNOOZE_MS;
}

export function VerifyOwnershipNudge({ onVisibilityChange }: { onVisibilityChange?: (visible: boolean) => void }) {
  const [state, setState] = useState<"loading" | "hidden" | "none" | "pending">("loading");

  useEffect(() => {
    (async () => {
      const profileRes = await apiFetch<{ profile: ProfileShape }>("/api/profile");
      const profile = profileRes.ok ? profileRes.data?.profile : undefined;
      if (!profile || profile.role !== "influencer" || !profile.instagram_handle) {
        setState("hidden");
        return;
      }

      const accountDismissedAt =
        profile.ownership_nudge_dismissed_at !== undefined
          ? profile.ownership_nudge_dismissed_at
          : localStorage.getItem(DISMISS_KEY);
      if (snoozedRecently(accountDismissedAt)) {
        setState("hidden");
        return;
      }

      const claimRes = await apiFetch<ClaimStatus>(
        `/api/verification/ownership?platform=instagram&handle=${encodeURIComponent(profile.instagram_handle)}`,
      );
      const status = claimRes.ok ? claimRes.data?.status : undefined;
      if (status === "verified") {
        setState("hidden");
        return;
      }
      setState(status === "pending" ? "pending" : "none");
    })();
  }, []);

  useEffect(() => {
    onVisibilityChange?.(state === "none" || state === "pending");
  }, [state, onVisibilityChange]);

  if (state === "loading" || state === "hidden") return null;

  const dismiss = () => {
    const now = new Date().toISOString();
    setState("hidden");
    try {
      localStorage.setItem(DISMISS_KEY, now);
    } catch {
      /* ignore */
    }
    // Best-effort — if migration 085 isn't applied yet this 404s/no-ops
    // server-side and the localStorage flag above is what carries it.
    void apiFetch("/api/profile/ownership-nudge", { method: "POST" });
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3.5">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
        <BadgeCheck className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-content">
          {state === "pending" ? "Finish verifying your Instagram" : "Verify your Instagram"}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-content-soft">
          {state === "pending"
            ? "Your verification code is still active — confirm it to unlock the verified badge."
            : "Verified creators get more requests. Takes about a minute."}
        </p>
        <Link
          href="/dashboard/settings#instagram-ownership"
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-strong"
        >
          {state === "pending" ? "Finish verifying" : "Verify now"} <ArrowRight className="size-4" />
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-black/5 hover:text-content"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
