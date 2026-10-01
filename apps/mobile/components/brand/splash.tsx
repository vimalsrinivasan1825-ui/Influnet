/**
 * The launch screen — the native splash, carried on until the app is ready.
 *
 * ── Why it starts as a still logo ─────────────────────────────────────────
 * The OS splash (app.json → expo-splash-screen) draws assets/logo-mark.png,
 * 124pt wide, dead centre on white. This screen's first frame is the SAME
 * bitmap at the SAME size and place, so the hand-off from native to JS is
 * invisible. The previous version redrew the mark as SVG geometry above
 * centre and started it empty: the logo vanished, then re-drew itself
 * somewhere else, in a pink that wasn't the artwork's. One logo, one source —
 * see components/brand/logo.tsx.
 *
 * ── Why the lockup waits for the font ─────────────────────────────────────
 * The wordmark is outlines (components/brand/wordmark.tsx), so it needs no
 * font. The status line under it is text, and rendered before expo-font has
 * registered Plus Jakarta Sans, React Native silently falls back to the system
 * face — the "different font while loading" people saw on a cold start. So
 * the lockup forms, and anything with text shows, only once `fontsReady`; the
 * bundled fonts register in a few hundred ms, well inside the time the logo is
 * on screen anyway.
 *
 * ── Sequence ──────────────────────────────────────────────────────────────
 *   1. Still mark (matches the OS splash).
 *   2. Fonts in → the mark eases left and shrinks into the horizontal
 *      lockup, the wordmark slides out from behind it, and a progress bar
 *      with a live status line fades in underneath.
 *   3. While loading → the bar tracks real milestones (session, profile,
 *      home data — see lib/use-boot-progress.ts) and creeps between them,
 *      so it is never frozen. The status line says what is happening.
 *   4. Ready → the bar completes, the lockup steps back, a pink disc grows
 *      out of the big node to fill the screen and collapses back into it,
 *      revealing the first screen — already loaded, not a skeleton.
 *
 * Reduce Motion: the finished lockup and bar, then a plain fade.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Txt } from '@/components/ui';
import { LOGO_SOURCE } from './logo';
import { Wordmark, WORDMARK_EM } from './wordmark';

// Design system v2.
const LOGO_PINK = '#FF0B8D';
const PINK_TINT = '#FFE6F3';
const INK = '#111114';
const MUTED = '#6E6E79';

/** The native splash's imageWidth (app.json). Must stay in step with it. */
const NATIVE_MARK = 124;
/** The mark's size in the finished lockup. */
const MARK = 58;
const GAP = 14;
const WORD_SIZE = 44;
const WORD_W = WORD_SIZE * WORDMARK_EM.width;
const WORD_H = WORD_SIZE * WORDMARK_EM.height;

/**
 * The big top-right node, as a fraction of logo-mark.png (measured from the
 * artwork: centre ≈ 376,92 of 512, radius ≈ 56). Where the exit dives.
 */
const NODE = { x: 0.735, y: 0.18, r: 0.11 };

const BAR_W = 168;

/** Earliest the exit may start — long enough to see the lockup form. */
const HOLD_UNTIL = 1000;
/** Hand over regardless. The entry gate then shows the same lockup. */
const MAX_HOLD = 14000;

export function BrandSplash({
  canExit,
  fontsReady,
  progress,
  status,
  onReady,
  onDone,
}: {
  /** The app is ready. The intro is a floor on time shown, never a ceiling. */
  canExit: boolean;
  /** Plus Jakarta Sans is registered — nothing with text renders before. */
  fontsReady: boolean;
  /** 0–1, the last milestone reached. The bar creeps on between them. */
  progress: number;
  /** One short line saying what is happening right now. */
  status: string;
  /** The mark has painted — the moment the OS splash can be dropped. */
  onReady: () => void;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();

  const lockupW = MARK + GAP + WORD_W;
  const lockupLeft = (W - lockupW) / 2;
  // Where the mark's centre ends up, relative to where the OS splash put it.
  const markDx = lockupLeft + MARK / 2 - W / 2;
  const markScale = MARK / NATIVE_MARK;

  // The big node's position on screen once the lockup has formed.
  const nodeX = lockupLeft + NODE.x * MARK;
  const nodeY = H / 2 - MARK / 2 + NODE.y * MARK;
  const nodeR = NODE.r * MARK;
  // A disc centred on the node that reaches the farthest corner.
  const discR = Math.hypot(Math.max(nodeX, W - nodeX), Math.max(nodeY, H - nodeY)) + 4;

  const form = useSharedValue(reduced ? 1 : 0); // 0 still mark → 1 lockup
  const chrome = useSharedValue(reduced ? 1 : 0); // bar + status opacity
  const bar = useSharedValue(0);
  const statusFade = useSharedValue(1);
  const back = useSharedValue(0); // lockup steps back on exit
  const disc = useSharedValue(0); // 0 → 1 the pink grows out of the node
  const covered = useSharedValue(0);
  const collapse = useSharedValue(0);
  const fade = useSharedValue(1);

  const mountedAt = useRef(Date.now());
  const exiting = useRef(false);
  /** When the lockup finishes forming — the exit never starts before it. */
  const formedAt = useRef<number | null>(null);

  // 2. Form the lockup once there is a font for the status line under it.
  useEffect(() => {
    if (!fontsReady || reduced || formedAt.current !== null) return;
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    formedAt.current = Date.now() + 720;
    form.value = withDelay(80, withTiming(1, { duration: 640, easing: ease }));
    chrome.value = withDelay(320, withTiming(1, { duration: 420 }));
  }, [fontsReady, reduced, form, chrome]);

  // 3. The bar: reach the milestone, then keep creeping toward the next one so
  // a slow step reads as "working", never as "stuck". Never moves backwards.
  useEffect(() => {
    if (exiting.current) return;
    const target = Math.max(progress, bar.value);
    const creepTo = Math.min(0.94, target + (1 - target) * 0.45);
    cancelAnimation(bar);
    bar.value = withSequence(
      withTiming(target, { duration: 420, easing: Easing.out(Easing.cubic) }),
      withTiming(creepTo, { duration: 9000, easing: Easing.out(Easing.quad) }),
    );
  }, [progress, bar]);

  // Status line: cross-fade rather than snap from one sentence to the next.
  const [shown, setShown] = useState(status);
  useEffect(() => {
    if (status === shown) return;
    statusFade.value = withTiming(0, { duration: 140 }, (ok) => {
      if (ok) runOnJS(setShown)(status);
    });
  }, [status, shown, statusFade]);
  useEffect(() => {
    statusFade.value = withTiming(1, { duration: 200 });
  }, [shown, statusFade]);

  const [forceExit, setForceExit] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setForceExit(true), MAX_HOLD);
    return () => clearTimeout(timer);
  }, []);

  // 4. Exit.
  useEffect(() => {
    if ((!canExit && !forceExit) || exiting.current) return;
    // The lockup has to have formed (fonts in) before it can step back.
    if (!fontsReady && !forceExit) return;
    exiting.current = true;
    const now = Date.now();
    const remaining = Math.max(
      0,
      (reduced ? 300 : HOLD_UNTIL) - (now - mountedAt.current),
      reduced ? 0 : (formedAt.current ?? 0) - now,
    );
    const finish = () => onDone();

    cancelAnimation(bar);
    bar.value = withDelay(remaining, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));

    if (reduced) {
      fade.value = withDelay(remaining + 260, withTiming(0, { duration: 260 }, (ok) => ok && runOnJS(finish)()));
      return;
    }

    const start = remaining + 260;
    // A forced exit before the lockup ever started forming: form it quickly
    // now rather than diving out of a still mark.
    if (formedAt.current === null) {
      formedAt.current = now;
      form.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
    chrome.value = withDelay(start, withTiming(0, { duration: 180 }));
    back.value = withDelay(start, withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }));
    disc.value = withDelay(
      start + 80,
      withTiming(1, { duration: 460, easing: Easing.in(Easing.cubic) }, (ok) => {
        if (!ok) return;
        covered.value = 1;
        collapse.value = withTiming(1, { duration: 420, easing: Easing.inOut(Easing.cubic) }, (done) => {
          if (done) runOnJS(finish)();
        });
      }),
    );
  }, [canExit, forceExit, fontsReady, reduced, onDone, bar, fade, form, chrome, back, disc, covered, collapse]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    backgroundColor: covered.value ? 'transparent' : '#ffffff',
  }));

  const markStyle = useAnimatedStyle(() => {
    const f = form.value;
    return {
      opacity: covered.value ? 0 : 1,
      transform: [
        { translateX: markDx * f },
        { scale: (1 - (1 - markScale) * f) * (1 + back.value * 0.12) },
      ],
    };
  });

  const wordStyle = useAnimatedStyle(() => {
    // The wordmark slides out from behind the mark, a beat after it moves.
    const p = Math.min(1, Math.max(0, (form.value - 0.25) / 0.75));
    return {
      opacity: covered.value ? 0 : p * (1 - back.value),
      transform: [{ translateX: (1 - p) * -18 }],
    };
  });

  const chromeStyle = useAnimatedStyle(() => ({ opacity: covered.value ? 0 : chrome.value }));
  const barFill = useAnimatedStyle(() => ({ width: BAR_W * bar.value }));
  const statusStyle = useAnimatedStyle(() => ({ opacity: statusFade.value }));

  const discStyle = useAnimatedStyle(() => {
    const grow = nodeR / discR + (1 - nodeR / discR) * disc.value;
    return {
      opacity: disc.value > 0 ? 1 : 0,
      transform: [{ scale: grow * (1 - collapse.value) }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, screenStyle]}>
      {/* The mark: starts exactly where the OS splash drew it. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: W / 2 - NATIVE_MARK / 2,
            top: H / 2 - NATIVE_MARK / 2,
            width: NATIVE_MARK,
            height: NATIVE_MARK,
          },
          markStyle,
        ]}
      >
        <Image
          source={LOGO_SOURCE}
          style={{ width: NATIVE_MARK, height: NATIVE_MARK }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          accessibilityLabel="influnet"
          onDisplay={onReady}
          onError={onReady}
        />
      </Animated.View>

      {/* Wordmark. Hidden (opacity 0) until the lockup forms. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: lockupLeft + MARK + GAP,
            top: H / 2 - WORD_H / 2,
          },
          wordStyle,
        ]}
      >
        <Wordmark size={WORD_SIZE} color={INK} />
      </Animated.View>

      {/* Progress + status. Same reasoning: text only once the face is in. */}
      {fontsReady ? (
        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, top: H / 2 + 64, alignItems: 'center', gap: 14 }, chromeStyle]}
          accessibilityRole="progressbar"
          accessibilityLabel={shown}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.fill, barFill]} />
          </View>
          <Animated.View style={statusStyle}>
            <Txt style={{ fontSize: 13.5, lineHeight: 18, fontWeight: '500', color: MUTED, letterSpacing: 0.1 }}>
              {shown}
            </Txt>
          </Animated.View>
        </Animated.View>
      ) : null}

      {/* Exit: grows out of the big node until the screen is pink, then
          collapses back into it with the first screen revealed around it. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: nodeX - discR,
            top: nodeY - discR,
            width: discR * 2,
            height: discR * 2,
            borderRadius: discR,
            backgroundColor: LOGO_PINK,
          },
          discStyle,
        ]}
      />
    </Animated.View>
  );
}

/**
 * The resting state of the splash, static: lockup, an indeterminate bar and a
 * status line. For the rare wait AFTER the splash has handed over (account
 * switch, repairing a half-finished signup, the 14s safety exit), so that
 * reads as the same loading screen continuing — not a second, different one
 * with a bare system spinner.
 */
export function BootScreen({ status }: { status: string }) {
  const reduced = useReducedMotion();
  const { height: H } = useWindowDimensions();
  // Laid out against its own box rather than flex-centred, so the lockup and
  // bar sit exactly where the splash left them.
  const [h, setH] = useState(H);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const loop = () => {
      sweep.value = 0;
      sweep.value = withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }, (ok) => {
        if (ok) runOnJS(loop)();
      });
    };
    loop();
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);

  const SEG = BAR_W * 0.38;
  const segStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -SEG + sweep.value * (BAR_W + SEG) }],
  }));

  return (
    <View
      style={styles.boot}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      accessibilityRole="progressbar"
      accessibilityLabel={status}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: h / 2 - MARK / 2, height: MARK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: GAP }}>
        <Image source={LOGO_SOURCE} style={{ width: MARK, height: MARK }} contentFit="contain" cachePolicy="memory-disk" transition={0} />
        <Wordmark size={WORD_SIZE} color={INK} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: h / 2 + 64, alignItems: 'center', gap: 14 }}>
        <View style={styles.track}>
          {reduced ? (
            <View style={[styles.fill, { width: BAR_W * 0.5 }]} />
          ) : (
            <Animated.View style={[styles.fill, { width: SEG }, segStyle]} />
          )}
        </View>
        <Txt style={{ fontSize: 13.5, lineHeight: 18, fontWeight: '500', color: MUTED, letterSpacing: 0.1 }}>{status}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: BAR_W,
    height: 4,
    borderRadius: 2,
    backgroundColor: PINK_TINT,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: LOGO_PINK,
  },
  boot: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
