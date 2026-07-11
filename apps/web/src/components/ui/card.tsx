import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Surface card — the base container for every dashboard panel.
 * `interactive` adds a hover lift for clickable cards.
 */
function Card({
  className,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-2xl border border-hairline bg-surface-card text-content shadow-[var(--shadow-card)]",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-[var(--shadow-raised)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6",
        className,
      )}
      {...props}
    />
  );
}

/** Uppercase mono-ish eyebrow used above panel titles. */
function CardEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-[0.95rem] font-bold leading-tight tracking-tight text-content",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("mt-1 text-sm leading-relaxed text-content-soft", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 py-5 sm:px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3 border-t border-hairline px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardEyebrow,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
