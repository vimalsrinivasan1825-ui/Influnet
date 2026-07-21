/**
 * The Influnet mark.
 *
 * This is the real artwork — apps/web/public/influet_logo.png, cropped to the
 * mark's bounding box and squared off as assets/logo-mark.png so it sits flush
 * in a badge. An earlier version of this file redrew the mark as SVG geometry;
 * it was close but not the same logo, and its pink came from the design token
 * (#ee3e96) rather than the artwork's own (#ff068e). One logo, one source.
 *
 * Consequence worth knowing: a bitmap can't be re-tinted, so the mark is always
 * its own pink. That's correct for a logo — it should not take the role accent.
 */
import { Image } from 'expo-image';

const MARK = require('../../assets/logo-mark.png');

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <Image
      source={MARK}
      style={{ width: size, height: size }}
      contentFit="contain"
      // The mark is on every auth screen and the splash; decoding it once and
      // keeping it in memory avoids a visible pop on each navigation.
      cachePolicy="memory-disk"
      transition={0}
      accessibilityLabel="Influnet"
    />
  );
}

export { MARK as LOGO_SOURCE };
