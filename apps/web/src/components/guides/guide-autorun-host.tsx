"use client";

/**
 * Contextual auto-run. The first time this device lands on a section that has a
 * guide, a small card slides in bottom-right: "New here? See how this works."
 * Showing it marks the guide seen, so it is strictly once per section — no
 * nagging. `prefers-reduced-motion` suppresses the auto-card (the launcher
 * still works).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CirclePlay, X } from "lucide-react";
import { guidesForRoute } from "@influnet/core";
import type { UserRole } from "@/types";
import { useGuides } from "./use-guides";

const APPEAR_DELAY = 1200;

export function GuideAutoRunHost({ role }: { role?: UserRole | null }) {
  const pathname = usePathname();
  const { openId, hasSeen, markSeen, open } = useGuides();
  const [candidate, setCandidate] = useState<{ id: string; title: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCandidate(null);
    if (timer.current) clearTimeout(timer.current);

    // Admins and the modal being open both mean: don't interrupt.
    if (!pathname || role === "admin") return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const menuRole = (role ?? null) as Exclude<UserRole, "admin"> | null;
    const guide = guidesForRoute(pathname, menuRole)[0];
    if (!guide || hasSeen(guide.id)) return;

    timer.current = setTimeout(() => {
      // Re-check: the user may have opened something in the meantime.
      if (useGuides.getState().openId) return;
      if (useGuides.getState().hasSeen(guide.id)) return;
      markSeen(guide.id);
      setCandidate({ id: guide.id, title: guide.title });
    }, APPEAR_DELAY);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, role, hasSeen, markSeen]);

  // Hide the card whenever a modal opens.
  useEffect(() => {
    if (openId) setCandidate(null);
  }, [openId]);

  if (!candidate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[110] w-72 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
        <button
          type="button"
          onClick={() => {
            open(candidate.id, "autorun");
            setCandidate(null);
          }}
          className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-muted"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong">
            <CirclePlay className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8rem] font-bold text-content">New here?</span>
            <span className="block truncate text-xs text-content-muted">
              See how “{candidate.title}” works
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCandidate(null)}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded-lg p-1 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
