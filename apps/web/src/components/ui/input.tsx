import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text input. An optional leading icon slot is supported by wrapping in
 * <InputGroup>. Base styles are also applied globally in globals.css, so this
 * mainly adds sizing, focus ring, and invalid states in a controllable way.
 */
function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-10 w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 text-sm text-content shadow-none transition-colors",
        "placeholder:text-content-muted",
        "focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}

/** Wrap an Input with a leading icon that sits inside the field. */
function InputGroup({
  icon,
  children,
  className,
}: {
  icon: React.ReactNode;
  children: React.ReactElement<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted [&_svg]:size-4">
        {icon}
      </span>
      {React.cloneElement(children, {
        className: cn("pl-10", children.props.className),
      })}
    </div>
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-content transition-colors",
        "placeholder:text-content-muted",
        "focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full appearance-none rounded-xl border border-hairline-strong bg-surface-card bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-3.5 pr-9 text-sm text-content transition-colors",
        "focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-content-soft",
        className,
      )}
      {...props}
    />
  );
}

export { Input, InputGroup, Textarea, Select, Label };
