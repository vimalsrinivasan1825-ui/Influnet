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
