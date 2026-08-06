"use client";

/**
 * "Add other handles" — the optional platforms, collapsed behind their own
 * logos until someone asks for one.
 *
 * Signup used to render five handle fields at once, which made a step whose
 * only requirement is Instagram look like five requirements. Four of them are
 * optional and most creators fill none, so they start as a row of brand marks:
 * click YouTube and the YouTube field appears, click again (while empty) and it
 * folds away.
 *
 * A field holding a handle never collapses. The value is still submitted, and a
 * hidden input that reaches the server is how someone signs up with a handle
 * they can no longer see or correct.
 *
 * The mobile signup has the same section (apps/mobile/components/
 * social-disclosure.tsx) — same rules, same copy.
 */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { SOCIAL_MARKS, type SocialMarkName } from "@/components/icons/social";
import { cn } from "@/lib/utils";

export interface SocialDisclosureItem {
  platform: SocialMarkName;
  label: string;
  /** True when the field currently holds a handle — keeps it from collapsing. */
  filled: boolean;
  body: React.ReactNode;
}

export function SocialDisclosure({
  items,
  title = "Add other handles",
  subtitle,
}: {
  items: SocialDisclosureItem[];
  title?: string;
  subtitle?: string;
}) {
  // Anything that already has a value opens on mount, so stepping back through
  // the wizard shows what was typed rather than an innocent-looking chip row.
  const [opened, setOpened] = useState<SocialMarkName[]>(() =>
    items.filter((i) => i.filled).map((i) => i.platform),
  );

  const toggle = (item: SocialDisclosureItem) =>
    setOpened((prev) => {
      if (!prev.includes(item.platform)) return [...prev, item.platform];
      if (item.filled) return prev;
      return prev.filter((p) => p !== item.platform);
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-muted/40 p-3">
      <div>
        <p className="text-sm font-bold text-content">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-content-muted">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const open = opened.includes(item.platform);
          const Mark = SOCIAL_MARKS[item.platform];
          return (
            <button
              key={item.platform}
              type="button"
              onClick={() => toggle(item)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Add"} ${item.label}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                item.filled
                  ? "border-emerald-500/40 bg-emerald-500/5 text-content"
                  : open
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-hairline bg-surface text-content-soft hover:border-content-muted",
              )}
            >
              <Mark size={16} />
              {item.label}
              {item.filled ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Plus className={cn("size-3.5 transition-transform", open && "rotate-45")} />
              )}
            </button>
          );
        })}
      </div>

      {items.some((item) => opened.includes(item.platform)) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items
            .filter((item) => opened.includes(item.platform))
            .map((item) => (
              <div key={item.platform}>{item.body}</div>
            ))}
        </div>
      )}
    </div>
  );
}
