/**
 * Motion primitives.
 *
 * Three rules this file exists to enforce, because they are the difference
 * between animation that makes an app feel fast and animation that makes it
 * feel slow:
 *
 *  1. **Entrances are staggered, not simultaneous.** Ten cards fading in
 *     together is one event and reads as a lurch. The same ten at 45ms apart
 *     read as the screen assembling itself, and the eye follows the order —
 *     which is why `index` here is deliberately the same order the sections are
 *     ranked in on Home.
 *  2. **Nothing animates for longer than ~350ms.** Past that the user is
 *     waiting on the animation rather than the data.
 *  3. **Entrances play once, on mount.** Re-running them on every refetch is
 *     what turns a pull-to-refresh into a screen that appears to reload from
 *     scratch.
 *
 * Everything runs on the UI thread via Reanimated, so a scroll during the
 * entrance does not drop it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/** Shared easing: quick out of the gate, gentle into place. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Fade-and-rise entrance.
 *
 * `index` staggers the start. It is capped so a long list does not end with
 * cards arriving a second and a half after the first — past the cap everything
 * remaining shares the last slot, which is invisible to the eye and keeps the
 * screen's total settle time bounded no matter how many rows there are.
 */
export function Appear({
  children,
  index = 0,
  distance = 14,
  style,
}: {
  children: ReactNode;
  index?: number;
  /** How far it travels. Small on purpose — a long slide reads as sluggish. */
  distance?: number;
  style?: ViewStyle;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Capped at 8 slots: past ~360ms of stagger the later cards arrive after
    // the user has already started scrolling, and a card fading in under a
    // moving finger reads as a glitch rather than as polish.
    const delay = Math.min(index, 8) * 45;
    progress.value = withDelay(delay, withTiming(1, { duration: 320, easing: EASE }));
  }, [progress, index]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/**
 * Press feedback that scales instead of dimming.
 *
 * Opacity-on-press is the RN default and it is the weakest possible signal on a
 * white card: 0.9 opacity against a white background is very nearly nothing. A
 * 2% scale-down is felt rather than seen, which is what press feedback is for.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.975,
  ...rest
}: PressableProps & { children: ReactNode; style?: ViewStyle; scaleTo?: number }) {
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - pressed.value * (1 - scaleTo) },
    ],
  }));

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPressIn={() => {
          pressed.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, { damping: 20, stiffness: 300 });
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Count a figure up from zero on first render.
 *
 * Deliberately a JS rAF loop and not a Reanimated shared value: animating text
 * *content* (rather than a style) on the UI thread needs the
 * animated-TextInput trick, which costs a native input per tile and cannot
 * carry our own number formatting. Six tiles ticking for 700ms is nothing, and
 * this way the value passing through the formatter is a real JS number.
 *
 * It runs ONCE per mount, and only upward from zero. A number that re-animates
 * every time the screen refetches is a number nobody can read, and one that
 * animates *down* when a count drops reads as an error.
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    // Already animated once: track the real value directly from then on.
    if (done.current) {
      setValue(target);
      return;
    }
    if (target <= 0) {
      setValue(target);
      done.current = true;
      return;
    }

    let frame = 0;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      // Ease-out cubic: most of the distance early, so the number is legible
      // for most of the animation rather than blurring past.
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        done.current = true;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/**
 * Wrapper that gives a bare `View` the same entrance as `Appear` without a
 * layout node of its own — useful inside flex rows where an extra View would
 * change the layout.
 */
export function AppearRow({ children, index }: { children: ReactNode; index?: number }) {
  return (
    <Appear index={index} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
    </Appear>
  );
}
