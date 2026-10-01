/**
 * The play-icon button that sits in the app header next to the bell. Opens the
 * full guide list at /guides.
 */

import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CirclePlay } from 'lucide-react-native';
import { GUIDES } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useGuides } from './use-guides';
import { isGuideVisible } from '@/lib/guide-visibility';

export function GuideLauncherButton({ size = 22 }: { size?: number }) {
  const t = useTheme();
  const router = useRouter();
  const seen = useGuides((s) => s.seen);
  const loaded = useGuides((s) => s.loaded);
  const hasUnseen = loaded && GUIDES.some((g) => isGuideVisible(g) && !seen.includes(g.id));

  return (
    <Pressable
      onPress={() => router.push('/guides' as Href)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Guides"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.color.surfaceCard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <CirclePlay size={size - 2} color={t.color.content} />
      {hasUnseen ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: t.color.brand,
            borderWidth: 1.5,
            borderColor: t.color.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}
