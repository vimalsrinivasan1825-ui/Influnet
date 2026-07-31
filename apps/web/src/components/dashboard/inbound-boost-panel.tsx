"use client";

// Shown while a creator has no incoming pitches. Discover is business-only —
// creators can't reach out themselves, so an empty Requests page previously
// just said "wait." This tells them concretely what raises their odds of
// being found and pitched, with live progress instead of a dead end.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, Circle, DollarSign, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ProfileShape {
  role?: string;
  verified_badge?: boolean;
  pricing_min?: number | null;
  pricing_max?: number | null;
  past_collaborations?: unknown[] | null;
  audience_demographics?: {
    locations?: unknown[];
    age?: unknown[];
    gender?: unknown[];
  } | null;
  bio?: string | null;
}

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

function buildChecklist(p: ProfileShape): ChecklistItem[] {
  const ad = p.audience_demographics || {};
  const hasAudience =
    (ad.locations?.length ?? 0) > 0 || (ad.age?.length ?? 0) > 0 || (ad.gender?.length ?? 0) > 0;
  const hasCollabs = Array.isArray(p.past_collaborations) && p.past_collaborations.length > 0;

  return [
    { key: "verified", label: "Get your verified badge", done: !!p.verified_badge, href: "/dashboard/settings" },
    {
      key: "rates",
      label: "Set your rates",
      done: p.pricing_min != null || p.pricing_max != null,
      href: "/dashboard/settings",
    },
    {
      key: "mediakit",
      label: "Complete your media kit",
      done: hasAudience && hasCollabs,
      href: "/dashboard/settings",
    },
    { key: "bio", label: "Write a bio", done: !!p.bio, href: "/dashboard/settings" },
  ];
}

export function InboundBoostPanel() {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ profile: ProfileShape }>("/api/profile");
      if (res.ok && res.data?.profile?.role === "influencer") {
        setItems(buildChecklist(res.data.profile));
      }
    })();
  }, []);

  if (!items) return null;
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null; // Nothing left to suggest.

  return (
    <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface-muted p-4 text-left">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-brand">
        <Sparkles className="size-3.5" /> Raise your odds of being pitched
      </p>
      <p className="mt-1 text-xs text-content-muted">
        Brands can't message you first — but a complete profile is what gets you found.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                item.done ? "text-content-muted" : "font-semibold text-content hover:bg-surface-card",
              )}
            >
              {item.done ? (
                <Check className="size-4 shrink-0 text-ok" />
              ) : item.key === "verified" ? (
                <BadgeCheck className="size-4 shrink-0 text-content-muted" />
              ) : item.key === "rates" ? (
                <DollarSign className="size-4 shrink-0 text-content-muted" />
              ) : (
                <Circle className="size-4 shrink-0 text-content-muted" />
              )}
              <span className={cn(item.done && "line-through")}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
