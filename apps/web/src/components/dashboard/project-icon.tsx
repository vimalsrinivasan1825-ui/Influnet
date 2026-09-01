"use client";

/**
 * The face of a project — a coloured roundel carrying a glyph that says what
 * the work IS, classified from the title. `campaign_projects` has no image
 * column, so without this a list of projects is three lines of grey type
 * repeated and every row looks the same.
 *
 * The classifier lives in `@/lib/project-icon` and is a verbatim mirror of the
 * mobile copy, so a project wears the same icon on web and on the phone. See
 * that file for why it reads the title and not the description, and why the
 * unmatched fallback is a 36-cell grid rather than one shared folder.
 *
 * Always pass BOTH `title` and `seed` (the project id). The list and the
 * project's own page must feed the classifier identically or the same project
 * shows two different faces one click apart.
 */

import * as React from "react";
import {
  Boxes,
  Briefcase,
  Clapperboard,
  ClipboardList,
  Dumbbell,
  FolderKanban,
  Footprints,
  Gem,
  Megaphone,
  Plane,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { lookForProject, type ProjectGlyph, type ProjectLook } from "@/lib/project-icon";
import { cn } from "@/lib/utils";

/**
 * Keyed on the look's `glyph`, not its category: a classified project's glyph
 * IS its category, while an unclassified one gets a subject-free glyph chosen
 * independently of its colour. See lib/project-icon.ts.
 */
const GLYPH_ICON: Record<ProjectGlyph, LucideIcon> = {
  video: Clapperboard,
  beauty: SprayCan,
  fashion: Shirt,
  footwear: Footprints,
  food: UtensilsCrossed,
  travel: Plane,
  tech: Smartphone,
  fitness: Dumbbell,
  jewellery: Gem,
  home: Sofa,
  // The neutral glyphs — each means "a piece of work" and nothing narrower.
  general: FolderKanban,
  briefcase: Briefcase,
  clipboard: ClipboardList,
  crate: Boxes,
  megaphone: Megaphone,
  spark: Sparkles,
};

export function ProjectIcon({
  title,
  seed,
  size = 44,
  look,
  className,
}: {
  title?: string | null;
  /** The project's id. Decides which neutral look an unclassifiable title gets. */
  seed?: string | null;
  size?: number;
  /** Pass a look already computed by the caller rather than recomputing it. */
  look?: ProjectLook;
  className?: string;
}) {
  const resolved = look ?? lookForProject(title, seed);
  const Icon = GLYPH_ICON[resolved.glyph];

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        // A squircle, not a circle: a circle is a person in this app, and a
        // project is not a person. The shape is the first cue for which kind
        // of thing you are looking at.
        borderRadius: Math.round(size * 0.26),
        backgroundColor: resolved.bg,
      }}
    >
      <Icon size={Math.round(size * 0.46)} color={resolved.fg} strokeWidth={1.8} />
    </span>
  );
}
