/**
 * The influnet lockup: the real mark artwork beside the wordmark, set in Plus
 * Jakarta Sans Bold with the same tight tracking as dev.influnet.io. The
 * wordmark is live text in the app's own face rather than an image, so it is
 * crisp at any size and follows light/dark.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { Logo } from './logo';

export function LogoLockup({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }} accessibilityRole="header" accessibilityLabel="influnet">
      <Logo size={size} />
      <Txt style={{ fontSize: size * 0.82, lineHeight: size, fontWeight: '700', letterSpacing: -size * 0.02 }}>influnet</Txt>
    </View>
  );
}
