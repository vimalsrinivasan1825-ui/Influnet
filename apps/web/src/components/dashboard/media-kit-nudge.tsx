"use client";

// Dismissible nudge on the creator dashboard prompting them to fill the
// media-kit fields that aren't collected at signup (kept light on purpose):
// pricing, past collaborations, audience insights. Hidden once complete or
// dismissed. Self-fetches /api/profile so it doesn't touch the dashboard
// data pipeline.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface ProfileShape {
  role?: string;
  pricing_min?: number | null;
  pricing_max?: number | null;
  past_collaborations?: unknown[] | null;
  audience_demographics?: {
    locations?: unknown[];
    age?: unknown[];
    gender?: unknown[];
  } | null;
  // Undefined until migration 077 is applied — see the fallback below.
  mediakit_nudge_dismissed_at?: string | null;
}

const DISMISS_KEY = "influnet_mediakit_nudge_dismissed";

function missingBits(p: ProfileShape): string[] {
  const missing: string[] = [];
  if (p.pricing_min == null && p.pricing_max == null) missing.push("your rates");
  const collabs = Array.isArray(p.past_collaborations) ? p.past_collaborations : [];
  if (collabs.length === 0) missing.push("past collaborations");
  const ad = p.audience_demographics || {};
  const hasAudience =
    (ad.locations?.length ?? 0) > 0 || (ad.age?.length ?? 0) > 0 || (ad.gender?.length ?? 0) > 0;
  if (!hasAudience) missing.push("audience insights");
  return missing;
}

export function MediaKitNudge() {
  const [missing, setMissing] = useState<string[] | null>(null);
  // Starts dismissed; the fetch below is the only thing that can un-hide it,
  // so there's no flash of the nudge before the account's real state is known.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ profile: ProfileShape }>("/api/profile");
      if (!res.ok || res.data?.profile?.role !== "influencer") return;

      const profile = res.data.profile;
      // The account remembers this once migration 077 is applied. Until then,
      // fall back to the old per-browser flag rather than showing the nudge
      // to someone who already dismissed it (on this browser, at least).
      const accountDismissed =
        profile.mediakit_nudge_dismissed_at !== undefined
          ? profile.mediakit_nudge_dismissed_at != null
          : localStorage.getItem(DISMISS_KEY) === "1";
      if (accountDismissed) return;

      setDismissed(false);
      setMissing(missingBits(profile));
    })();
  }, []);

  if (dismissed || !missing || missing.length === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    // Best-effort — if migration 077 isn't applied yet this 404s/no-ops
    // server-side and the localStorage flag above is what carries it.
    void apiFetch("/api/profile/mediakit-nudge", { method: "POST" });
  };

  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3.5">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
        <Sparkles className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-content">Complete your media kit</p>
        <p className="mt-0.5 text-sm leading-relaxed text-content-soft">
          Add {list} so brands see the full picture when they view your profile.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-strong"
        >
          Add details <ArrowRight className="size-4" />
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
