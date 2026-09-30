import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A headline number: counts, rupees, percentages.
 *
 * Digits are tabular so a column of figures lines up and a value that ticks
 * over does not shift its neighbours, and a leading currency sign is set
 * smaller and muted so the amount — not the symbol — is what the eye lands
 * on. Anything that is not a plain string (a node, a skeleton) passes
 * through untouched.
 */
const CURRENCY = /^([₹$€£])\s?(.+)$/;

function Figure({ value, className }: { value: React.ReactNode; className?: string }) {
  const match = typeof value === "string" ? value.match(CURRENCY) : null;
  return (
    <span className={cn("tabular-nums", className)}>
      {match ? (
        <>
          <span className="mr-[0.08em] align-[0.28em] text-[0.62em] font-medium text-content-muted">{match[1]}</span>
          {match[2]}
        </>
      ) : (
        value
      )}
    </span>
  );
}

export { Figure };
