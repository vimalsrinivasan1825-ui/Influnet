/**
 * Loading, empty and error states.
 *
 * These get first-class treatment because they're most of what a user sees on
 * a slow network — and an empty screen is an invitation to act, not an apology.
 */
import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';
import { Button } from './button';

/**
 * A placeholder block with a light sweep across it.
 *
 * A sweep rather than the old whole-block opacity pulse: a pulse reads as
 * "blinking", a sweep reads as "arriving" — it has a direction, and every
 * block on the screen sweeps in step because they all mount in the same
 * frame and run the same clock.
 *
 * `tone` lets a block sit on something other than a white card — the brand
 * tint for placeholders standing in for a pink hero, for instance.
 */
export function Skeleton({
  height = 16,
  width = '100%',
  radius,
  tone,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  /** Base colour of the block. Defaults to the hairline grey. */
  tone?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const sweep: SharedValue<number> = useSharedValue(0);
  const boxW = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    sweep.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }),
        withDelay(250, withTiming(1, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [sweep, reduced]);

  const band = useAnimatedStyle(() => {
    const w = boxW.value;
    const bw = Math.max(80, w * 0.6);
    return { width: bw, transform: [{ translateX: -bw + sweep.value * (w + bw) }] };
  });

  const highlight = t.scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)';

  return (
    <View
      onLayout={(e) => {
        boxW.value = e.nativeEvent.layout.width;
      }}
      style={[
        {
          height,
          width,
          borderRadius: radius ?? t.radii.sm,
          backgroundColor: tone ?? t.color.hairline,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {reduced ? null : (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0 }, band]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={highlight} stopOpacity={0} />
                <Stop offset="0.5" stopColor={highlight} stopOpacity={1} />
                <Stop offset="1" stopColor={highlight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
      )}
    </View>
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
