import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page title block: optional eyebrow, title, subtitle, and a
 * right-aligned actions slot. Wraps gracefully on narrow screens.
 */
function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      {/* No gradient icon tile: a coloured, glowing square beside every title
          was the loudest generated-UI tell on the page. The icon, when given,
          sits small and muted in the label line above the title. */}
      <div className="min-w-0">
        {(eyebrow || icon) && (
          <p className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-content-muted [&_svg]:size-3.5">
            {icon}
            {eyebrow}
          </p>
        )}
        <h1 className="truncate text-[1.375rem] font-semibold tracking-[-0.02em] text-content sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-content-soft">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };
