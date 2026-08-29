/**
 * The face of a project: a roundel in a list, a full cover on its own screen.
 *
 * Both read their icon and colours from `lookForProject`, which classifies a
 * project from its title, falling back to one of several neutral looks chosen
 * by the project's id — see lib/project-icon.ts for why it works that way, and
 * why the description is deliberately not part of it.
 *
 * ── THE HERO IS GENERATED, AND WILL STAY THAT WAY ─────────────────────
 *
 * `campaign_projects` has no image column, so `imageUrl` below is always
 * undefined today. It is wired through anyway, because the day an upload lands
 * this is the only file that needs to know: the photo takes the hero and the
 * classified icon stays as the badge on the card below it, which is the
 * arrangement that survives both cases.
 *
 * Until then the hero is the same wash-and-blobs generator the campaign cards
 * use, seeded on the project id, in the category's own saturated pair. That
 * matters more than it sounds: a placeholder that is obviously ARTWORK reads as
 * a design decision, while a grey box with a broken-image glyph reads as a
 * failure, and users blame the app for the second one.
 */
import { View } from 'react-native';
import { Image } from 'expo-image';
import {
  Boxes,
  Briefcase,
  ClipboardList,
  Clapperboard,
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
} from 'lucide-react-native';
import { lookForProject, type ProjectGlyph, type ProjectLook } from '@/lib/project-icon';
import { useTheme } from '@/lib/theme';
import { CoverArt } from '@/components/ui';

/**
 * Keyed on the look's `glyph`, not its category: a classified project's glyph
 * IS its category, while an unclassified one gets a subject-free glyph chosen
 * separately from its colour. See lib/project-icon.ts.
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

export function useProjectLook(title?: string | null, seed?: string | null): ProjectLook {
  return lookForProject(title, seed);
}

/** The square badge that fronts a project in a list. */
export function ProjectIcon({
  title,
  /**
   * The project's id. Only decides WHICH neutral look an unclassifiable title
   * gets — see lib/project-icon.ts. Always pass it; omitting it collapses
   * every unmatched project back onto the one slate folder.
   */
  seed,
  size = 56,
  look,
}: {
  title?: string | null;
  seed?: string | null;
  size?: number;
  /** Pass a look already computed by the caller rather than recomputing it. */
  look?: ProjectLook;
}) {
  const t = useTheme();
  const resolved = look ?? lookForProject(title, seed);
  const Icon = GLYPH_ICON[resolved.glyph];

  return (
    <View
      style={{
        width: size,
        height: size,
        // Squircle rather than a circle: a circle is a person in this app, and
        // a project is not a person. The shape is the first thing that says
        // which kind of thing you are looking at.
        borderRadius: Math.round(size * 0.26),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: resolved.bg,
      }}
    >
      <Icon size={Math.round(size * 0.46)} color={resolved.fg} strokeWidth={1.8} />
    </View>
  );
}

/** The banner at the top of a project's own screen. */
export function ProjectHero({
  id,
  title,
  height = 168,
  imageUrl,
  children,
}: {
  id: string;
  title?: string | null;
  height?: number;
  /** Not in the schema yet — see the note at the top. */
  imageUrl?: string | null;
  /** Overlaid chrome, e.g. the status pill. */
  children?: React.ReactNode;
}) {
  // The id doubles as the neutral-look seed and as the cover-art seed.
  const look = lookForProject(title, id);
  const Icon = GLYPH_ICON[look.glyph];

  if (imageUrl) {
    return (
      <View style={{ height, backgroundColor: look.bg }}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height }}
          contentFit="cover"
          transition={180}
        />
        {children}
      </View>
    );
  }

  return (
    // Seeded on the project id, so the same project wears the same artwork
    // every time it is opened rather than shuffling on each render.
    <CoverArt seed={id} width={430} height={height} style={{ width: '100%' }} colors={look.cover}>
      <Icon size={54} color="rgba(255,255,255,0.9)" strokeWidth={1.4} />
      {children}
    </CoverArt>
  );
}
