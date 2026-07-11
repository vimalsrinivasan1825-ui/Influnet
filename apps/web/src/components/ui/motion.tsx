"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * CSS-only entrance animations. Content is styled to its final state and
 * only the animation moves it in, so it is always visible even without JS
 * and respects prefers-reduced-motion (handled in globals.css).
 */
function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
  ...props
}: {
  as?: React.ElementType;
  delay?: number;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn("ds-rise", className)}
      style={{ ["--ds-delay" as string]: `${delay}s`, ...props.style }}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * Staggers direct children by cloning each with an increasing reveal delay,
 * so the children themselves animate in place (grid/flex layout preserved).
 */
function Stagger({
  children,
  step = 0.06,
  start = 0,
  className,
  ...props
}: {
  children: React.ReactNode;
  step?: number;
  start?: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  let i = 0;
  return (
    <div className={className} {...props}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        const idx = i++;
        const el = child as React.ReactElement<{
          className?: string;
          style?: React.CSSProperties;
        }>;
        return React.cloneElement(el, {
          className: cn("ds-rise", el.props.className),
          style: {
            ["--ds-delay" as string]: `${start + idx * step}s`,
            ...el.props.style,
          },
        });
      })}
    </div>
  );
}

export { Reveal, Stagger };
