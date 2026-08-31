"use client";

/**
 * The play-icon launcher in the dashboard header. Opens a searchable menu of
 * every guide, grouped by category, with a dot on the ones this device hasn't
 * watched yet.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePlay, Search } from "lucide-react";
import { CATEGORY_LABEL, guidesForMenu, timeline } from "@influnet/core";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";
import { useGuides } from "./use-guides";

export function GuideLauncher({ role }: { role?: UserRole | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { seen, open: openGuide } = useGuides();

  const menuRole = role === "admin" ? null : (role ?? null);
  const sections = useMemo(() => guidesForMenu(menuRole), [menuRole]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        guides: s.guides.filter(
          (g) => g.title.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.guides.length > 0);
  }, [sections, query]);

  const unseenCount = useMemo(
    () => sections.flatMap((s) => s.guides).filter((g) => !seen.includes(g.id)).length,
    [sections, seen],
  );

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Guides"
        className={cn(
          "relative rounded-xl p-2.5 transition-colors",
          open
            ? "bg-surface-muted text-content"
            : "text-content-soft hover:bg-surface-muted hover:text-content",
        )}
      >
        <CirclePlay className="size-5" />
        {unseenCount > 0 && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-surface-card" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
          <div className="border-b border-hairline p-3">
            <p className="text-sm font-bold text-content">How things work</p>
            <p className="mt-0.5 text-xs text-content-muted">
              Short walkthroughs — the interface does the talking.
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-2.5 py-1.5">
              <Search className="size-3.5 text-content-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guides…"
                className="w-full bg-transparent text-xs text-content outline-none placeholder:text-content-muted"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-content-muted">No guide matches that.</p>
            )}
            {filtered.map((section) => (
              <div key={section.category} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[0.625rem] font-bold uppercase tracking-wide text-content-muted">
                  {CATEGORY_LABEL[section.category]}
                </p>
                {section.guides.map((g) => {
                  const secs = Math.round(timeline(g).total / 1000);
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        openGuide(g.id, "launcher");
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-muted"
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
                        <CirclePlay className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[0.8rem] font-semibold text-content">{g.title}</span>
                          {!seen.includes(g.id) && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
                        </span>
                        <span className="block truncate text-[0.7rem] text-content-muted">{g.blurb}</span>
                      </span>
                      <span className="mt-0.5 shrink-0 text-[0.625rem] font-semibold text-content-muted">
                        {secs}s
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
