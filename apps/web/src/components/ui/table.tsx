import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Table primitives for admin/data views. The wrapper scrolls horizontally on
 * small screens so the page body never does.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "border-b border-hairline text-left [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:text-[0.6875rem] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-content-muted",
        className,
      )}
      {...props}
    />
  );
}

function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn(
        "[&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_tr]:border-b [&_tr]:border-hairline [&_tr:last-child]:border-0",
        className,
      )}
      {...props}
    />
  );
}

function TRow({
  className,
  interactive,
  ...props
}: React.ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Table, THead, TBody, TRow };
