import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Numeral, Txt } from './text';

/** Half-width metric tile. Two per row is the whole layout system for stats. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  delta,
  onPress,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  /**
   * Percentage change against the previous equivalent period.
   *
   * Null and undefined both mean "no delta", and both are correct in different
   * situations — null when there was no baseline to compare against, undefined
   * when this metric has no period at all. Neither renders as 0%, because a
   * figure with nothing behind it presented as flat is a claim we can't make.
   */
  delta?: number | null;
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

      {delta != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {delta >= 0 ? (
            <ArrowUpRight size={12} color={t.color.ok} />
          ) : (
            <ArrowDownRight size={12} color={t.color.danger} />
          )}
          <Txt
            variant="caption"
            style={{ fontWeight: '600', color: delta >= 0 ? t.color.ok : t.color.danger }}
          >
            {Math.abs(delta)}%
          </Txt>
          {hint ? (
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {hint}
            </Txt>
          ) : null}
        </View>
      ) : hint ? (
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
