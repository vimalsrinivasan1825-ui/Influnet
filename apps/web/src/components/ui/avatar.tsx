"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
} as const;

/**
 * Avatar with graceful fallback: shows the image when it loads,
 * otherwise a branded gradient monogram from the name.
 */
function Avatar({
  name,
  src,
  size = "md",
  square,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizeMap;
  square?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
  const showImg = src && !broken;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold text-white select-none",
        square ? "rounded-xl" : "rounded-full",
        sizeMap[size],
        className,
      )}
      style={
        showImg
          ? undefined
          : {
              backgroundImage:
                "linear-gradient(135deg, var(--brand), var(--brand-2))",
            }
      }
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ?? ""}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

/** Overlapping avatar cluster (e.g. campaign participants). */
function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name?: string | null; src?: string | null }[];
  max?: number;
  size?: keyof typeof sizeMap;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <Avatar
          key={i}
          name={p.name}
          src={p.src}
          size={size}
          className="ring-2 ring-surface-card"
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "relative inline-flex items-center justify-center rounded-full bg-surface-muted font-bold text-content-soft ring-2 ring-surface-card",
            sizeMap[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export { Avatar, AvatarStack };
