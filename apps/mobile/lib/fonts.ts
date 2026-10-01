/**
 * The app's one typeface: Plus Jakarta Sans — the face the influnet wordmark
 * is set in, and the web dashboard's font. Every screen, the logo and the
 * public profile share it, so nothing reads as pasted in from elsewhere.
 *
 * React Native can't synthesise weights for a custom font: each weight is its
 * own registered family, and asking for `fontWeight: '700'` on the regular
 * family either does nothing (Android) or fakes a bold (iOS). So text never
 * sets a weight directly — `fontFor()` turns the weight a style asked for into
 * the matching family, and the weight itself is dropped.
 *
 * The files ship as JS assets (@expo-google-fonts), loaded by expo-font, which
 * is already in the native binary — so a font change reaches phones over the
 * air, no store build needed.
 */
import type { TextStyle } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

export const FONT_ASSETS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

const BY_WEIGHT: Record<string, keyof typeof FONT_ASSETS> = {
  '100': 'PlusJakartaSans_400Regular',
  '200': 'PlusJakartaSans_400Regular',
  '300': 'PlusJakartaSans_400Regular',
  '400': 'PlusJakartaSans_400Regular',
  normal: 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  bold: 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
  '900': 'PlusJakartaSans_800ExtraBold',
};

/** The registered family for a weight. Unknown or missing weights read as regular. */
export function fontFor(weight?: TextStyle['fontWeight']): string {
  return BY_WEIGHT[String(weight ?? '400')] ?? 'PlusJakartaSans_400Regular';
}

/**
 * Resolve a flattened text style to the right family. Leaves an explicit
 * fontFamily alone (monospace receipts, icon fonts) and strips fontWeight
 * so Android doesn't fall back to the system face.
 */
export function withFont<T extends TextStyle>(style: T): T {
  if (style.fontFamily) return style;
  const { fontWeight, ...rest } = style;
  return { ...rest, fontFamily: fontFor(fontWeight) } as T;
}
