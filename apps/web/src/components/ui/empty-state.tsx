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
        <div className="ds-dots mb-4 flex size-14 items-center justify-center rounded-2xl border border-hairline bg-surface-muted text-content-muted [&_svg]:size-6">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-content">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-content-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
