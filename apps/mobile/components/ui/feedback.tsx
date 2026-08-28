/**
 * Loading, empty and error states.
 *
 * These get first-class treatment because they're most of what a user sees on
 * a slow network — and an empty screen is an invitation to act, not an apology.
 */
import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';
import { Button } from './button';

export function Skeleton({
  height = 16,
  width = '100%',
  radius,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const pulse: SharedValue<number> = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radius ?? t.radii.sm,
          backgroundColor: t.color.hairline,
        },
        animated,
        style,
      ]}
    />
  );
}

/**
 * Card-shaped placeholder used while a list loads.
 *
 * Carries the same elevation as a real `Card`, deliberately. A skeleton that
 * sits flat and is replaced by a card that lifts makes the whole screen appear
 * to pop upward the moment data lands — the loading state has to occupy the
 * same visual plane as the thing it stands in for, not just the same box.
 */
export function SkeletonCard() {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surfaceCard,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: 'transparent',
          padding: t.spacing.lg,
          gap: t.spacing.sm,
        },
        t.shadows.card,
      ]}
    >
      <Skeleton height={18} width="55%" />
      <Skeleton height={13} width="80%" />
      <Skeleton height={13} width="35%" />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: t.spacing['4xl'],
        paddingHorizontal: t.spacing.xl,
        gap: t.spacing.sm,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.color.brandSoft,
            marginBottom: t.spacing.xs,
          }}
        >
          {icon}
        </View>
      ) : null}
      <Txt variant="title3" center>
        {title}
      </Txt>
      {body ? (
        <Txt variant="callout" tone="muted" center>
          {body}
        </Txt>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          inline
          size="md"
          style={{ marginTop: t.spacing.md }}
        />
      ) : null}
    </View>
  );
}

/**
 * Failure state. Says what happened and gives the one action that fixes it —
 * never a bare "Something went wrong".
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      title="That didn't load"
      body={message}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
