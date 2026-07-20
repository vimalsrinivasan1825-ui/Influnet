import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/** Deterministic initials so a missing photo still reads as a person. */
function initialsOf(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({
  uri,
  name,
  size = 44,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const t = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.color.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
          accessibilityLabel={name ? `${name}'s photo` : undefined}
        />
      ) : (
        <Txt
          style={{
            color: t.color.brand,
            fontSize: size * 0.36,
            fontWeight: '600',
          }}
        >
          {initialsOf(name)}
        </Txt>
      )}
    </View>
  );
}
