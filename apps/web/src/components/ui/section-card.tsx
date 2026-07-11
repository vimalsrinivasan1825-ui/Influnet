import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A panel with a titled header (eyebrow + title, optional right action) and a
 * padded body. Thin wrapper over Card for the common dashboard layout.
 */
function SectionCard({
  eyebrow,
  title,
  action,
  bodyClassName,
  className,
  children,
  ...props
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
} & React.ComponentProps<typeof Card>) {
  return (
    <Card className={cn("flex flex-col", className)} {...props}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">
                {eyebrow}
              </p>
            )}
            {title && (
              <h3 className="mt-0.5 text-[0.95rem] font-bold tracking-tight text-content">
                {title}
              </h3>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("flex-1 px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </Card>
  );
}

export { SectionCard };
