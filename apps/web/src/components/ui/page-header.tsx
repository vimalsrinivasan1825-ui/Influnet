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
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_6px_16px_-6px_var(--brand-ring)] [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate text-xl font-extrabold tracking-tight text-content sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-content-soft">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };
