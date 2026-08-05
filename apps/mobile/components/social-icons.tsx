/**
 * Platform marks for the social fields — the real brand logos, bundled as
 * local assets (apps/mobile/assets/social/) rather than fetched at runtime.
 *
 * Each is a full-color mark (Instagram's gradient, YouTube's red, Facebook's
 * blue, X's black), so unlike the rest of the icon set they don't take a
 * `color` prop — recoloring a brand's own logo isn't a choice this app gets
 * to make. `size` still applies; it's the one dimension a layout legitimately
 * needs to control.
 */
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
}

export function InstagramIcon({ size = 18 }: IconProps) {
  return (
    <Image
      source={require('../assets/social/instagram.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Instagram"
    />
  );
}

export function YoutubeIcon({ size = 18 }: IconProps) {
  return (
    <Image
      source={require('../assets/social/youtube.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="YouTube"
    />
  );
}

export function XIcon({ size = 18 }: IconProps) {
  return (
    <Image
      source={require('../assets/social/x.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="X (Twitter)"
    />
  );
}

export function FacebookIcon({ size = 18 }: IconProps) {
  return (
    <Image
      source={require('../assets/social/facebook.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Facebook"
    />
  );
}

/**
 * Snapchat — vector rather than a PNG like its four neighbours, deliberately:
 * a new binary asset has to ship in a native build, and an `eas update` to a
 * phone that already has the old binary would render a missing image. Drawn
 * with react-native-svg (already a dependency), it arrives with the JS bundle.
 *
 * The ghost sits on Snapchat's yellow because a white ghost alone disappears
 * against a light input row.
 */
export function SnapchatIcon({ size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Snapchat">
      <Rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#FFFC00" />
      <Path
        d="M12 4.2c-2.6 0-4.35 1.9-4.35 4.42 0 .78.04 1.5.04 1.9-.4.31-1.03.16-1.5 0-.4-.15-.79.16-.71.55.12.63.71 1.18 1.58 1.5.16.05.2.16.16.31-.28.95-1.58 1.58-2.53 1.74-.32.05-.47.4-.32.67.4.71 1.58.95 2.37 1.07.12.4.24.79.47.95.4.28 1.11.08 1.82.04.71-.04 1.5.43 2.05.83.47.35 1.18.35 1.66 0 .55-.4 1.34-.87 2.05-.83.71.04 1.42.24 1.82-.04.24-.16.36-.55.47-.95.79-.12 1.97-.36 2.37-1.07.16-.28 0-.63-.32-.67-.95-.16-2.25-.79-2.53-1.74-.04-.16 0-.26.16-.32.87-.32 1.46-.87 1.58-1.5.08-.39-.32-.7-.71-.55-.47.16-1.11.31-1.5 0 0-.4.04-1.11.04-1.9C16.35 6.1 14.6 4.2 12 4.2z"
        fill="#FFFFFF"
        stroke="#000000"
        strokeOpacity={0.12}
        strokeWidth={0.4}
      />
    </Svg>
  );
}

/** Platform key → icon, so screens can render by name without a switch. */
export const SOCIAL_ICONS = {
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  twitter: XIcon,
  facebook: FacebookIcon,
  snapchat: SnapchatIcon,
} as const;

export type SocialIconName = keyof typeof SOCIAL_ICONS;
