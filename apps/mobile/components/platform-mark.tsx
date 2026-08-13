/**
 * A small, real, brand-colored glyph for one of the destinations a profile link
 * can point at — the React Native twin of apps/web's
 * `components/dashboard/platform-mark.tsx`.
 *
 * Home's reach breakdown used to draw every channel as a grey lucide outline
 * next to a grey bar, so Instagram and "a website someone typed in" read as the
 * same row with different words. Web fixed that with colored roundels; this is
 * the same table of colors and the same glyph shapes, so the two apps cannot
 * describe the same channel differently.
 *
 * Drawn with react-native-svg rather than added as PNG assets, deliberately, for
 * the reason spelled out on SnapchatIcon in components/social-icons.tsx: a new
 * binary asset only reaches a phone through a native build, so an `eas update`
 * to an already-installed binary would render a missing image. Vectors arrive
 * with the JS bundle.
 *
 * `social-icons.tsx` still owns the *official* full-color marks used in the
 * social input rows, where recoloring a brand's own logo isn't ours to do. This
 * file is for the opposite case: a uniform roundel, sized for a data row, where
 * consistency of shape is what makes a list scannable.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type PlatformKey =
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'twitter'
  | 'snapchat'
  | 'linkedin'
  | 'website'
  | 'profile'
  | 'other';

const PLATFORM_META: Record<PlatformKey, { bg: string; label: string }> = {
  // Instagram's mark is a gradient in real life; a flat approximation of its
  // warmest mid-tone reads correctly at 20pt without needing a gradient def.
  instagram: { bg: '#D6249F', label: 'Instagram' },
  youtube: { bg: '#FF0000', label: 'YouTube' },
  facebook: { bg: '#1877F2', label: 'Facebook' },
  twitter: { bg: '#000000', label: 'X' },
  snapchat: { bg: '#FFFC00', label: 'Snapchat' },
  linkedin: { bg: '#0A66C2', label: 'LinkedIn' },
  website: { bg: '#475569', label: 'Website' },
  profile: { bg: '#475569', label: 'Profile' },
  other: { bg: '#94A3B8', label: 'Other' },
};

function keyOf(platform: string): PlatformKey {
  return (platform as PlatformKey) in PLATFORM_META ? (platform as PlatformKey) : 'other';
}

function Glyph({ platform, size }: { platform: PlatformKey; size: number }) {
  // Snapchat's yellow is the one roundel a white glyph disappears against.
  const ink = platform === 'snapchat' ? '#000000' : '#FFFFFF';

  switch (platform) {
    case 'instagram':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3.5} y={3.5} width={17} height={17} rx={5} fill="none" stroke={ink} strokeWidth={2} />
          <Circle cx={12} cy={12} r={4} fill="none" stroke={ink} strokeWidth={2} />
          <Circle cx={17.6} cy={6.4} r={1.1} fill={ink} />
        </Svg>
      );
    case 'youtube':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M8 5v14l11-7z" fill={ink} />
        </Svg>
      );
    case 'facebook':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M13.5 21v-7.6h2.6l.4-3h-3v-1.9c0-.9.2-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.5V21h3.1z"
            fill={ink}
          />
        </Svg>
      );
    case 'linkedin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M6.9 8.4H3.6V20h3.3V8.4zM5.3 3.5a1.9 1.9 0 1 0 0 3.9 1.9 1.9 0 0 0 0-3.9zM20.4 20h-3.3v-6.3c0-1.5-.5-2.5-1.9-2.5-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20H10s.1-10.6 0-11.6h3.3v1.6c.4-.7 1.2-1.7 3-1.7 2.2 0 3.9 1.4 3.9 4.5V20z"
            fill={ink}
          />
        </Svg>
      );
    case 'twitter':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.9L4.5 22H1.4l8.1-9.3L1 2h7l4.9 6.3zm-1.2 18h1.9L7.4 4H5.4z" fill={ink} />
        </Svg>
      );
    case 'snapchat':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 3c2.9 0 4.6 2.1 4.6 4.9 0 1 .1 1.9.2 2.5.6.2 1.4.1 1.9-.2.3-.1.7 0 .8.4.1.4-.1.7-.4.9-.4.2-1 .5-1.7.7.1.6.5 1.1 1.4 1.6.3.2.4.6.2.9-.4.6-1.3.9-2.5 1-.1.4-.3.9-.8 1-.6.2-1.4-.1-2.2-.1-.8 0-1.3.6-2.4.6s-1.6-.6-2.4-.6c-.8 0-1.6.3-2.2.1-.5-.1-.7-.6-.8-1-1.2-.1-2.1-.4-2.5-1-.2-.3-.1-.7.2-.9.9-.5 1.3-1 1.4-1.6-.7-.2-1.3-.5-1.7-.7-.3-.2-.5-.5-.4-.9.1-.4.5-.5.8-.4.5.3 1.3.4 1.9.2.1-.6.2-1.5.2-2.5C7.4 5.1 9.1 3 12 3z"
            fill={ink}
          />
        </Svg>
      );
    case 'website':
    case 'profile':
      // A globe, drawn rather than imported: lucide's stroke weight is tuned for
      // 24pt on a light surface and goes muddy at 11pt reversed out of a roundel.
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} fill="none" stroke={ink} strokeWidth={2} />
          <Path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" fill="none" stroke={ink} strokeWidth={2} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"
            fill="none"
            stroke={ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}

/** The colored roundel — reach breakdowns, and anywhere a channel needs identifying at a glance. */
export function PlatformMark({
  platform,
  size = 24,
  glyphSize,
}: {
  platform: string;
  size?: number;
  glyphSize?: number;
}) {
  const key = keyOf(platform);
  return (
    <View
      accessibilityLabel={PLATFORM_META[key].label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: PLATFORM_META[key].bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Glyph platform={key} size={glyphSize ?? Math.round(size * 0.58)} />
    </View>
  );
}

export function platformLabel(platform: string): string {
  return PLATFORM_META[keyOf(platform)].label;
}

export function platformColor(platform: string): string {
  return PLATFORM_META[keyOf(platform)].bg;
}
