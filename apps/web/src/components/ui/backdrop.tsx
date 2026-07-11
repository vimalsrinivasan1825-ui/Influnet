import { cn } from "@/lib/utils";

/**
 * Ambient backdrops for hero/banner surfaces. Purely decorative and
 * pointer-transparent, they sit behind content with `absolute inset-0`.
 */
function AuroraBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        className="absolute -left-16 -top-24 size-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)" }}
      />
      <div
        className="absolute -right-10 top-0 size-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-2), transparent 70%)" }}
      />
    </div>
  );
}

function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
        backgroundSize: "34px 34px",
      }}
    />
  );
}

export { AuroraBackdrop, GridBackdrop };
