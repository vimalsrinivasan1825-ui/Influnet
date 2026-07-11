import { cn } from "@/lib/utils";

/** Loading placeholder with a shimmer sweep. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "ds-shimmer rounded-md bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
