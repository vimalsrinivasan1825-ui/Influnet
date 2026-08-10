import * as React from "react";
import { BadgeCheck, Clock, ShieldAlert, ShieldQuestion, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "in_review"
  | "verified"
  | "rejected"
  | "needs_more_info";

const CONFIG: Record<
  VerificationStatus,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"]; Icon: React.ElementType }
> = {
  verified: { label: "Verified", variant: "success", Icon: BadgeCheck },
  pending: { label: "Verification in progress", variant: "neutral", Icon: Clock },
  in_review: { label: "Under review", variant: "info", Icon: Clock },
  needs_more_info: { label: "Action needed", variant: "warning", Icon: ShieldQuestion },
  rejected: { label: "Not verified", variant: "neutral", Icon: ShieldAlert },
  unverified: { label: "Unverified", variant: "neutral", Icon: ShieldQuestion },
};

/**
 * Trust badge. In `compact` mode (default) it renders ONLY when verified — the
 * common case for cards, headers, and public profiles where absence of a badge
 * is the "not verified" signal. Pass `showAll` to render every state (used in
 * the profile status panel).
 *
 * ── `pro` ────────────────────────────────────────────────────────────────
 * A Pro subscriber's verified mark renders in gold with a soft glow. Two
 * things this deliberately does NOT do:
 *
 *   • It never upgrades an unverified account. Pro is a purchase; verification
 *     is a claim Influnet has checked. Letting money produce a verification
 *     mark would make the badge mean "paid" instead of "confirmed", which is
 *     precisely the trust signal the whole verification pipeline exists to
 *     protect (see migration 083, where creators could self-award it).
 *   • It never renders when paid plans are switched off. `pro` must be driven
 *     from the server's `subscriptionsEnabled` — a gold badge in a deployment
 *     with no paid tier is a badge for a product that does not exist.
 */
export function VerifiedBadge({
  status,
  size = "sm",
  showAll = false,
  pro = false,
  className,
}: {
  status: VerificationStatus | null | undefined;
  size?: "sm" | "md";
  showAll?: boolean;
  /** Render the gold Pro treatment. Only ever true for a VERIFIED Pro subscriber. */
  pro?: boolean;
  className?: string;
}) {
  const s = (status ?? "unverified") as VerificationStatus;
  if (!showAll && s !== "verified") return null;
  const { label, variant, Icon } = CONFIG[s] ?? CONFIG.unverified;

  // Gold applies to the verified state only — see the note above.
  const isPro = pro && s === "verified";

  return (
    <Badge
      variant={isPro ? "pro" : variant}
      size={size}
      className={cn(className)}
      title={isPro ? "Verified · Influnet Pro" : undefined}
    >
      <Icon /> {label}
      {isPro && (
        <>
          {/* Decorative: the gold and the glow already carry the meaning for
              sighted users, and "Verified Pro" is announced once via the
              visually-hidden text rather than twice. */}
          <Sparkles aria-hidden className="opacity-80" />
          <span className="sr-only"> — Influnet Pro subscriber</span>
        </>
      )}
    </Badge>
  );
}
