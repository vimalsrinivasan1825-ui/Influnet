/**
 * The face of a project: a roundel in a list, a full cover on its own screen.
 *
 * Both read their icon and colours from `lookForProject`, which classifies a
 * project from its title — see lib/project-icon.ts for why that is a
 * classification and not a hash.
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
  Clapperboard,
  Dumbbell,
  FolderKanban,
  Footprints,
  Gem,
  Plane,
  Shirt,
  Smartphone,
  Sofa,
  SprayCan,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { lookForProject, type ProjectCategory, type ProjectLook } from '@/lib/project-icon';
import { useTheme } from '@/lib/theme';
import { CoverArt } from '@/components/ui';

const CATEGORY_ICON: Record<ProjectCategory, LucideIcon> = {
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
  general: FolderKanban,
};

export function useProjectLook(title?: string | null, description?: string | null): ProjectLook {
  return lookForProject(title, description);
}

/** The square badge that fronts a project in a list. */
export function ProjectIcon({
  title,
  description,
  size = 56,
  look,
}: {
  title?: string | null;
  description?: string | null;
  size?: number;
  /** Pass a look already computed by the caller rather than recomputing it. */
  look?: ProjectLook;
}) {
  const t = useTheme();
  const resolved = look ?? lookForProject(title, description);
  const Icon = CATEGORY_ICON[resolved.category];

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
  description,
  height = 168,
  imageUrl,
  children,
}: {
  id: string;
  title?: string | null;
  description?: string | null;
  height?: number;
  /** Not in the schema yet — see the note at the top. */
  imageUrl?: string | null;
  /** Overlaid chrome, e.g. the status pill. */
  children?: React.ReactNode;
}) {
  const look = lookForProject(title, description);
  const Icon = CATEGORY_ICON[look.category];

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
