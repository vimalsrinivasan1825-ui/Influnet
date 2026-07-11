import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "warning" | "info" | "neutral";

const toneMap: Record<Tone, { icon: string; ring: string }> = {
  brand: { icon: "bg-brand-soft text-brand", ring: "before:bg-brand" },
  success: { icon: "bg-ok-soft text-ok", ring: "before:bg-ok" },
  warning: { icon: "bg-warn-soft text-warn", ring: "before:bg-warn" },
  info: { icon: "bg-info-soft text-info", ring: "before:bg-info" },
  neutral: { icon: "bg-surface-muted text-content-soft", ring: "before:bg-content-muted" },
};

/**
 * KPI tile: label, value, optional icon, delta chip, and a hint line.
 * A thin colored rail on the left encodes the tone.
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
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
  const t = toneMap[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-hairline bg-surface-card p-4 shadow-[var(--shadow-card)] sm:p-5",
        "before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:content-['']",
        t.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-content-muted">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-xl [&_svg]:size-4",
              t.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-extrabold leading-none tracking-tight text-content">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 text-xs font-bold",
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
      {hint && (
        <p className="mt-1 text-xs font-medium text-content-muted">{hint}</p>
      )}
    </div>
  );
}

export { StatCard };
