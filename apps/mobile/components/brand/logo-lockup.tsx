/**
 * The influnet lockup: the real mark artwork beside the wordmark, in the
 * proportions of the design system v2 lockup — mark 56, wordmark 44pt, gap 12.
 * The wordmark is outlines, not text — see ./wordmark for why — and still
 * follows light/dark.
 */
import { View } from 'react-native';
import { Logo } from './logo';
import { Wordmark } from './wordmark';

export function LogoLockup({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * (12 / 56) }} accessibilityRole="header" accessibilityLabel="influnet">
      <Logo size={size} />
      <Wordmark size={size * (44 / 56)} />
    </View>
  );
}
