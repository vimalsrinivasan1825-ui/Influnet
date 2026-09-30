import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Empty / zero-data state: an icon in a dotted frame, a short line of
 * direction, and an optional call to action. Never a dead end.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-hairline bg-surface-card text-content-muted shadow-[var(--shadow-card)] [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-content">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-content-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
