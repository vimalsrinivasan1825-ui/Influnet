import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-surface-muted text-content-soft",
        brand: "bg-brand-soft text-brand-strong",
        success: "bg-ok-soft text-ok",
        warning: "bg-warn-soft text-warn",
        info: "bg-info-soft text-info",
        danger: "bg-danger-soft text-danger",
        outline: "border border-hairline-strong text-content-soft",
        solid: "bg-brand text-white",
        // Ownership-verification trust mark — fixed brand pink, deliberately
        // distinct from the generic "success" green used for unrelated
        // positive states (payments, approvals, etc.) and from `brand`
        // (which recolors per role/theme). A verified badge should read as
        // "Influnet confirmed this," not blend into ordinary UI chrome.
        verified: "bg-[#FFE4F3] text-[#FF0B8D]",
        // Pro subscriber's verified mark. A warm gold gradient with a soft
        // outer glow, deliberately the only place in the UI that glows — the
        // whole value of a paid badge is that it is instantly distinguishable
        // from the free one, and a colour change alone is not, especially
        // beside the pink `verified` mark at small sizes.
        //
        // The glow is a box-shadow rather than a filter: `filter: drop-shadow`
        // on a badge creates a containing block that breaks `position: sticky`
        // ancestors, which is a genuinely horrible bug to track down later.
        pro: [
          "bg-gradient-to-r from-[#F7E7BE] via-[#F3D890] to-[#E8BE5C]",
          "text-[#6B4A05]",
          "shadow-[0_0_0_1px_rgba(200,150,40,0.35),0_0_10px_-1px_rgba(232,190,92,0.85)]",
          "dark:from-[#5A4410] dark:via-[#6E5417] dark:to-[#8A6A1D]",
          "dark:text-[#FBEBC4]",
          "dark:shadow-[0_0_0_1px_rgba(232,190,92,0.45),0_0_12px_-2px_rgba(232,190,92,0.55)]",
        ].join(" "),
      },
      size: {
        sm: "px-2 py-0.5 text-[0.625rem]",
        md: "px-2.5 py-1 text-[0.6875rem]",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

/** Maps a free-text status string to a badge variant. */
export function statusVariant(
  status: string,
): VariantProps<typeof badgeVariants>["variant"] {
  const s = status.toLowerCase();
  if (/(complete|approved|active|paid|settled|accepted|verified|live)/.test(s))
    return "success";
  if (/(progress|running|ongoing)/.test(s)) return "info";
  if (/(pending|review|awaiting|proposal|invited)/.test(s)) return "warning";
  if (/(declined|rejected|cancel|failed|expired)/.test(s)) return "danger";
  return "neutral";
}

function Badge({
  className,
  variant,
  size,
  dot,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      )}
      {props.children}
    </span>
  );
}

export { Badge, badgeVariants };
