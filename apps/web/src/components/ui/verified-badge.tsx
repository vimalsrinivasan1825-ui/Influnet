import * as React from "react";
import { BadgeCheck, Clock, ShieldAlert, ShieldQuestion } from "lucide-react";
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
 */
export function VerifiedBadge({
  status,
  size = "sm",
  showAll = false,
  className,
}: {
  status: VerificationStatus | null | undefined;
  size?: "sm" | "md";
  showAll?: boolean;
  className?: string;
}) {
  const s = (status ?? "unverified") as VerificationStatus;
  if (!showAll && s !== "verified") return null;
  const { label, variant, Icon } = CONFIG[s] ?? CONFIG.unverified;
  return (
    <Badge variant={variant} size={size} className={cn(className)}>
      <Icon /> {label}
    </Badge>
  );
}
