/**
 * A single-choice row: a title, an optional hint, and a check on the right.
 * For short lists where each option deserves a line (price tiers, industries)
 * — a cloud of chips makes them read as tags rather than as a decision.
 */
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

export function OptionRow({
  title,
  hint,
  selected,
  onPress,
}: {
  title: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: t.color.surfaceCard,
        borderWidth: 2,
        borderColor: selected ? t.color.content : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" style={{ fontWeight: '700' }}>{title}</Txt>
        {hint ? <Txt variant="footnote" tone="muted">{hint}</Txt> : null}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: selected ? t.color.content : t.color.hairlineStrong,
          backgroundColor: selected ? t.color.content : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={14} color={t.color.white} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
