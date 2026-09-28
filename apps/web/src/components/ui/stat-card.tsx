import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/ui/figure";

type Tone = "brand" | "success" | "warning" | "info" | "neutral";

/**
 * A single headline metric.
 *
 * Deliberately plain: a label, the number, an optional delta and hint. The
 * coloured edge bar and tinted icon chip it used to carry told the reader
 * nothing (the tone was chosen per tile for variety, not meaning) and were
 * most of why a row of these looked generated. `tone` is still accepted so
 * existing callers compile; it no longer paints the tile.
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: { value: string; direction: "up" | "down" };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-hairline bg-surface-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start gap-1.5 text-content-muted">
        {icon && <span className="mt-[0.2rem] flex shrink-0 [&_svg]:size-3.5">{icon}</span>}
        <p className="text-[0.8125rem] font-medium leading-snug text-content-soft">{label}</p>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <Figure
          value={value}
          className="text-[1.625rem] font-semibold leading-none tracking-[-0.02em] text-content"
        />
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              delta.direction === "up" ? "text-ok" : "text-danger",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-content-muted">{hint}</p>}
    </div>
  );
}

export { StatCard };
