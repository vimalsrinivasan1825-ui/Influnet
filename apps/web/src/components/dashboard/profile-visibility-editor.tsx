"use client";

/**
 * Three switches that decide what a visitor sees on /c/[username]: the
 * scraped Instagram grid, the scraped YouTube list, and the curated Portfolio
 * section. Everything else on the profile (stats, audience, reviews, "Work
 * with me") is unaffected — these three are content sections, not numbers.
 *
 * Always PATCHes the full 3-key object, never a partial one: the column is
 * JSONB and a write replaces the whole value, so sending only the key that
 * changed would silently re-show whatever this component's copy hadn't loaded
 * yet. See packages/core/src/profile-visibility.ts.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PROFILE_SECTIONS,
  PROFILE_SECTION_LABELS,
  isSectionVisible,
  type ProfileSectionVisibility,
} from "@influnet/core";
import { apiFetch } from "@/lib/api-client";
import { SectionCard } from "@/components/ui/section-card";
import { Switch } from "@/components/ui/switch";

const SECTION_HINT: Record<string, string> = {
  instagram_posts: "The grid of your recent Instagram posts.",
  youtube_videos: "Your latest uploads from YouTube.",
  portfolio: "The work you've chosen and added yourself.",
};

export function ProfileVisibilityEditor({
  initial,
}: {
  /** Undefined = migration 088 not applied yet; the card renders nothing rather than a broken control. */
  initial: ProfileSectionVisibility | undefined;
}) {
  const [visibility, setVisibility] = useState<ProfileSectionVisibility>(initial ?? {});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setVisibility(initial);
  }, [initial]);

  if (initial === undefined) return null;

  async function setSection(key: (typeof PROFILE_SECTIONS)[number], next: boolean) {
    const nextVisibility = { ...visibility, [key]: next };
    setVisibility(nextVisibility); // optimistic
    setSaving(key);

    const res = await apiFetch("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ profile_section_visibility: nextVisibility }),
    });

    setSaving(null);
    if (!res.ok) {
      setVisibility(visibility); // revert
      toast.error(res.error || "Could not save that.");
    }
  }

  return (
    <SectionCard title="What shows on your public profile">
      <div className="flex flex-col gap-4">
        <p className="-mt-1 text-sm text-content-muted">
          Turn a section off and it disappears from your public page — nothing is deleted,
          and switching it back on brings it straight back.
        </p>

        <ul className="flex flex-col divide-y divide-border">
          {PROFILE_SECTIONS.map((key) => {
            const on = isSectionVisible(visibility, key);
            return (
              <li key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{PROFILE_SECTION_LABELS[key]}</p>
                  <p className="text-xs text-content-muted">{SECTION_HINT[key]}</p>
                </div>
                <Switch
                  checked={on}
                  disabled={saving === key}
                  onCheckedChange={(next) => setSection(key, next)}
                  label={`${on ? "Hide" : "Show"} ${PROFILE_SECTION_LABELS[key].toLowerCase()} on your public profile`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
