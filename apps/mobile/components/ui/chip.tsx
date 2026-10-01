import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/** Selectable pill. Used for niches, languages, collab types, filters. */
export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 15,
          paddingVertical: 10,
          borderRadius: t.radii.pill,
          borderWidth: 1.5,
          borderColor: selected ? t.color.brand : t.color.hairline,
          backgroundColor: selected ? t.color.brandSoft : t.color.surfaceCard,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Txt variant="footnote" style={{ fontSize: 14, fontWeight: '600', color: selected ? t.color.brandStrong : t.color.content }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipWrap({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>{children}</View>
  );
}

/** Single-line scrolling chip rail — for quick filters above a list. */
export function ChipRail({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: t.spacing.sm,
        paddingHorizontal: t.spacing.screen,
        paddingVertical: t.spacing.sm,
        alignItems: 'center',
      }}
    >
      {children}
    </ScrollView>
  );
}
