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
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
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
 */
const WORDMARK_IN = 260;
const HOLD_UNTIL = 1800;
const FADE_MS = 320;

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

  const mountedAt = useRef(Date.now());
  const exiting = useRef(false);

  useEffect(() => {
    if (reduced) return;
    // A plain fade. The mark does not scale, spring or bounce — a logo that
    // moves draws attention to the wait instead of covering it.
    mark.value = withTiming(1, { duration: 260 });
    wordmark.value = withDelay(WORDMARK_IN, withTiming(1, { duration: 320 }));
  }, [mark, wordmark, reduced]);

  useEffect(() => {
    if (!canExit || exiting.current) return;
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
  }, [canExit, screen, reduced, onDone]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screen.value }));

  // Opacity only — the mark holds its size the whole way in.
  const markStyle = useAnimatedStyle(() => ({ opacity: mark.value }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 12 }],
  }));

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
});
