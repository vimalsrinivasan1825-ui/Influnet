/**
 * The launch animation.
 *
 * White ground, the real pink mark — the same pairing as the app icon and the
 * native splash, so the handover from the OS screen to this one is invisible;
 * the logo simply starts moving.
 *
 * The mark arrives on a spring and the wordmark rises under it. It used to
 * assemble node-by-node from redrawn SVG geometry, which was a nicer beat but
 * meant the splash showed a logo that wasn't quite the logo. Using the real
 * artwork is worth more than the extra motion.
 *
 * ── The long wait ────────────────────────────────────────────────────────
 * A cold start on a slow connection can leave the splash on screen for 10–20s
 * (JS parse + session read + /api/profile). After the intro settles it would
 * just be a static logo — which reads as frozen. So once the splash has been
 * up for LOADER_AFTER ms *and the app still isn't ready*, a loading row fades
 * in (three pulsing dots + a line of text) and the mark starts breathing. A
 * fast launch never sees any of it.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { palette } from '@influnet/tokens';
import { Txt } from '@/components/ui';
import { Logo } from './logo';

const MARK_SIZE = 124;

/**
 * Beat map, in ms from mount.
 *
 * HOLD_UNTIL is a floor, not a timer: the splash never exits before this, and
 * never exits after the app is ready either — whichever is later wins. Roughly
 * two seconds end to end, which is long enough to read as an intro and short
 * enough not to feel like a delay.
 *
 * LOADER_AFTER is when the "still working" affordance appears — comfortably
 * past a normal launch, so only a genuinely slow one shows it.
 */
const WORDMARK_IN = 260;
const HOLD_UNTIL = 1800;
const LOADER_AFTER = 2400;
const MAX_HOLD = 14000;
const FADE_MS = 320;

/** One breathing dot. Staggered by `delay` so the three read as a wave. */
function Dot({ progress, delay }: { progress: SharedValue<number>; delay: number }) {
  const style = useAnimatedStyle(() => {
    // progress 0..1 fades the whole row in; then each dot pulses on its own loop.
    return { opacity: progress.value };
  });
  const pulse = useSharedValue(0.3);
  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [pulse, delay]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.75 }));

  return (
    <Animated.View style={style}>
      <Animated.View style={[styles.dot, pulseStyle]} />
    </Animated.View>
  );
}

export function BrandSplash({
  canExit,
  onDone,
}: {
  /**
   * Gate on the app actually being ready. The animation is a floor on how long
   * the splash shows, never a ceiling — fading out on a timer while the session
   * is still loading would just hand over to a spinner.
   */
  canExit: boolean;
  onDone: () => void;
}) {
  // Respect the OS "reduce motion" switch: same mark, same timing budget, no
  // travel. An animated logo is decoration, and decoration is exactly what that
  // setting is asking us to drop.
  const reduced = useReducedMotion();

  const mark: SharedValue<number> = useSharedValue(reduced ? 1 : 0);
  const wordmark: SharedValue<number> = useSharedValue(reduced ? 1 : 0);
  const screen: SharedValue<number> = useSharedValue(1);
  const loader: SharedValue<number> = useSharedValue(0);
  const breathe: SharedValue<number> = useSharedValue(1);

  const mountedAt = useRef(Date.now());
  const exiting = useRef(false);

  useEffect(() => {
    if (reduced) return;
    // A plain fade. The mark does not scale, spring or bounce — a logo that
    // moves draws attention to the wait instead of covering it.
    mark.value = withTiming(1, { duration: 260 });
    wordmark.value = withDelay(WORDMARK_IN, withTiming(1, { duration: 320 }));
  }, [mark, wordmark, reduced]);

  // The "still working" affordance — only if we're not ready by LOADER_AFTER.
  useEffect(() => {
    if (canExit) return; // ready in time — never show it
    const t = setTimeout(() => {
      if (exiting.current) return;
      loader.value = withTiming(1, { duration: 300 });
      if (!reduced) {
        breathe.value = withRepeat(
          withSequence(
            withTiming(1.035, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
        );
      }
    }, LOADER_AFTER);
    return () => clearTimeout(t);
  }, [canExit, loader, breathe, reduced]);

  // Hard ceiling: whatever the app is doing, the splash hands over after
  // MAX_HOLD. The entry gate (app/index.tsx) has its own spinner AND a
  // recovery / "sign out" escape — a stuck splash has neither, so a genuinely
  // wedged launch is far better off there.
  const [forceExit, setForceExit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceExit(true), MAX_HOLD);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if ((!canExit && !forceExit) || exiting.current) return;
    exiting.current = true;

    // Let the animation finish if the session came back faster than it plays.
    const floor = reduced ? 400 : HOLD_UNTIL;
    const remaining = Math.max(0, floor - (Date.now() - mountedAt.current));

    screen.value = withDelay(
      remaining,
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
  }, [canExit, forceExit, screen, reduced, onDone]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screen.value }));

  // Opacity in, then a slow breathing scale once the wait gets long.
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: breathe.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 12 }],
  }));

  const loaderStyle = useAnimatedStyle(() => ({ opacity: loader.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.screen, screenStyle]}
    >
      <View style={styles.stack}>
        <Animated.View style={markStyle}>
          <Logo size={MARK_SIZE} />
        </Animated.View>

        <Animated.View style={wordmarkStyle}>
          <Txt variant="title2" style={styles.wordmark}>
            Influnet
          </Txt>
        </Animated.View>
      </View>

      <Animated.View style={[styles.loader, loaderStyle]}>
        <View style={styles.dots}>
          <Dot progress={loader} delay={0} />
          <Dot progress={loader} delay={140} />
          <Dot progress={loader} delay={280} />
        </View>
        <Txt variant="footnote" tone="muted" style={styles.loaderText}>
          Getting things ready…
        </Txt>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    gap: 16,
  },
  wordmark: {
    letterSpacing: -0.4,
  },
  loader: {
    position: 'absolute',
    bottom: 96,
    alignItems: 'center',
    gap: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.verified,
  },
  loaderText: {
    letterSpacing: 0.2,
  },
});
