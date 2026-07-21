import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Numeral, Txt } from './text';

/** Half-width metric tile. Two per row is the whole layout system for stats. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  onPress,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  onPress?: () => void;
}) {
  const t = useTheme();

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: '45%',
        backgroundColor: t.color.surfaceCard,
        borderRadius: t.radii.lg,
        borderWidth: 1,
        borderColor: t.color.hairline,
        padding: t.spacing.lg,
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="footnote" tone="muted" numberOfLines={1}>
          {label}
        </Txt>
        {icon}
      </View>
      <Numeral>{value}</Numeral>
      {hint ? (
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </Pressable>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>{children}</View>
  );
}
