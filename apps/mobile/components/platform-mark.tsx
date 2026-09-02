/**
 * A small, real, brand mark for one of the destinations a profile link can
 * point at — the React Native twin of apps/web's
 * `components/dashboard/platform-mark.tsx`.
 *
 * Home's reach breakdown used to draw every channel as a grey lucide outline
 * next to a grey bar, so Instagram and "a website someone typed in" read as the
 * same row with different words.
 *
 * ── THE REAL LOGOS, NOT APPROXIMATIONS ────────────────────────────────
 *
 * Instagram, YouTube, Facebook, X and Snapchat now render their OFFICIAL marks
 * from components/social-icons.tsx (the PNGs in assets/social/, plus Snapchat's
 * vector). This file used to redraw each of them as a white glyph inside a
 * flat-coloured roundel — a hand-approximation of somebody else's logo, which
 * is both wrong to do and visibly not the thing users recognise. Instagram in
 * particular is a gradient in real life and was being flattened to one pink.
 *
 * NOTE those PNGs are binary assets, so they only reach a phone in a NATIVE
 * build — an `eas update` to an already-installed binary renders a missing
 * image. That is the trade the founder accepted on 2026-09-02: real logos from
 * the next build onward.
 *
 * The roundel survives for the cases that are not brands and have no official
 * mark — LinkedIn (no bundled asset), a plain website, a generic link — because
 * those still need a uniform shape to sit beside the real ones in a list.
 */
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  FacebookIcon,
  InstagramIcon,
  SnapchatIcon,
  XIcon,
  YoutubeIcon,
} from '@/components/social-icons';

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

/**
 * Platforms whose official mark we bundle. These bypass the roundel entirely —
 * the logo IS the mark, at full colour, exactly as its owner draws it.
 */
const OFFICIAL: Partial<Record<PlatformKey, (p: { size?: number }) => React.ReactElement>> = {
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  twitter: XIcon,
  snapchat: SnapchatIcon,
};

/** The fallback glyph, for the keys with no official mark of their own. */
function Glyph({ platform, size }: { platform: PlatformKey; size: number }) {
  const ink = '#FFFFFF';

  switch (platform) {
    case 'linkedin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M6.9 8.4H3.6V20h3.3V8.4zM5.3 3.5a1.9 1.9 0 1 0 0 3.9 1.9 1.9 0 0 0 0-3.9zM20.4 20h-3.3v-6.3c0-1.5-.5-2.5-1.9-2.5-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20H10s.1-10.6 0-11.6h3.3v1.6c.4-.7 1.2-1.7 3-1.7 2.2 0 3.9 1.4 3.9 4.5V20z"
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

  // The official mark, at full colour and full size. No roundel: a brand's own
  // logo already carries its identity, and boxing it in our tint undoes that.
  const Official = OFFICIAL[key];
  if (Official) return <Official size={size} />;

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
