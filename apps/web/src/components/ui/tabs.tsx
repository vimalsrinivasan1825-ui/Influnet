"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control / tab bar. Controlled via `value` + `onValueChange`.
 * Purely presentational switch — panels are rendered by the caller.
 */
function SegmentedTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  size = "md",
  className,
}: {
  tabs: { value: T; label: React.ReactNode; count?: number }[];
  value: T;
  onValueChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-hairline bg-surface-muted p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active
                ? "bg-surface-card text-content shadow-[var(--shadow-card)]"
                : "text-content-soft hover:text-content",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums",
                  active
                    ? "bg-brand-soft text-brand-strong"
                    : "bg-surface-card text-content-muted",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedTabs };
