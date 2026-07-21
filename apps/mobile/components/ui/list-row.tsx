/**
 * The workhorse of the app. Everything the web renders as a table row becomes
 * one of these: a tap target with a title, a supporting line, and somewhere to
 * put state on the right.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/**
 * How long each row waits behind the one above it. Small on purpose: a stagger
 * you consciously notice is a stagger that's too slow, and it must never delay
 * the last row of a long list past the point of feeling instant.
 */
const STAGGER_MS = 38;
const MAX_STAGGER_ROWS = 8;

export function ListRow({
  title,
  subtitle,
  left,
  right,
  below,
  onPress,
  showChevron = true,
  index,
  style,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  /** Full-width slot under the row — a progress bar, a chip rail, a preview. */
  below?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  /** Position in its list. Supplying it staggers the row's entrance. */
  index?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const interactive = !!onPress;

  const row = (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          backgroundColor: pressed && interactive ? t.color.surfaceMuted : t.color.surfaceCard,
          minHeight: 64,
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        {left}

        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="footnote" tone="muted" numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>

        {right}
        {interactive && showChevron ? (
          <ChevronRight size={18} color={t.color.contentMuted} />
        ) : null}
      </View>

      {below}
    </Pressable>
  );

  if (index === undefined) return row;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, MAX_STAGGER_ROWS) * STAGGER_MS)
        .duration(260)
        .withInitialValues({ transform: [{ translateY: 12 }] })}
    >
      {row}
    </Animated.View>
  );
}

/** Groups rows into one rounded card with hairlines between them. */
export function ListGroup({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surfaceCard,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.color.hairline,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
