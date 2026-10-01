/**
 * The launch animation — the landing site's logo sting, rebuilt for the app.
 *
 * Intro (≈1.2s): the four spokes draw out from the ring, the ring closes, the
 * nodes pop, and the "influnet" wordmark rises under the mark.
 * Exit (≈1.3s): the wordmark lifts away, the camera dives into the big pink
 * node until it fills the screen, and the pink collapses to a point to reveal
 * the first screen — the same move as apps/landing/src/components/gate/
 * page-intro.tsx, so the app and the website open the same way.
 *
 * White ground, matching the native splash (app.json), so the OS → JS
 * hand-off is invisible: the mark simply starts drawing.
 *
 * Geometry is the landing's own redraw of the mark (logo-mark.tsx: ring at
 * 752,520; nodes; spokes starting at the ring's outer edge) — it has to be
 * vector to draw itself, and it is the version the website animates.
 *
 * ── The long wait ────────────────────────────────────────────────────────
 * A cold start on a slow connection can hold the splash for 10–20s. Once it
 * has been up LOADER_AFTER ms and the app still isn't ready, a "Getting
 * things ready…" line fades in and the four nodes pulse in turn. A fast launch
 * never sees it. MAX_HOLD hands over to the entry gate regardless.
 *
 * Reduce Motion: the finished mark and wordmark, then a plain fade.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { Txt } from '@/components/ui';

const PINK = '#ff078e';
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// viewBox 430 150 690 720 — see apps/landing/src/components/brand/logo-mark.tsx
const VB = { x: 430, y: 150, w: 690, h: 720 };
const RING = { cx: 752, cy: 520, r: 96 };
const NODES = [
  { cx: 960, cy: 246, r: 87 },
  { cx: 525, cy: 396, r: 76 },
  { cx: 1013, cy: 617, r: 80 },
  { cx: 566, cy: 774, r: 84 },
];
const SPOKES = NODES.map((n) => {
  const dx = n.cx - RING.cx;
  const dy = n.cy - RING.cy;
  const len = Math.hypot(dx, dy);
  const x1 = RING.cx + (dx / len) * 118;
  const y1 = RING.cy + (dy / len) * 118;
  return { x1, y1, x2: n.cx, y2: n.cy, len: Math.hypot(n.cx - x1, n.cy - y1) };
});
const RING_LEN = 2 * Math.PI * RING.r;

const MARK = 128;
const MARK_H = MARK * (VB.h / VB.w);
// The big top-right node, as a fraction of the mark box — where the camera dives.
const DIVE = { x: (NODES[0].cx - VB.x) / VB.w, y: (NODES[0].cy - VB.y) / VB.h };

const HOLD_UNTIL = 1500;
const LOADER_AFTER = 2400;
const MAX_HOLD = 14000;

function Spoke({ i, draw }: { i: number; draw: SharedValue<number> }) {
  const s = SPOKES[i];
  const props = useAnimatedProps(() => {
    const p = Math.min(1, Math.max(0, (draw.value - i * 0.06) / 0.55));
    return { strokeDashoffset: s.len * (1 - p) };
  });
  return (
    <AnimatedLine
      x1={s.x1}
      y1={s.y1}
      x2={s.x2}
      y2={s.y2}
      stroke={PINK}
      strokeWidth={44}
      strokeLinecap="round"
      strokeDasharray={[s.len, s.len]}
      animatedProps={props}
    />
  );
}

function Node({ i, pop, pulse }: { i: number; pop: SharedValue<number>; pulse: SharedValue<number> }) {
  const n = NODES[i];
  const props = useAnimatedProps(() => {
    const p = Math.min(1, Math.max(0, (pop.value - i * 0.12) / 0.5));
    // Overshoot a touch, like back.out — nodes land, they don't fade in.
    const overshoot = p < 1 ? Math.sin(p * Math.PI) * 0.18 : 0;
    // Long wait: each node takes its turn to swell, clockwise.
    const turn = (pulse.value * 4 - [0, 3, 1, 2][i] + 4) % 4;
    const swell = pulse.value > 0 && turn < 1 ? Math.sin(turn * Math.PI) * 0.12 : 0;
    return { r: n.r * (p + overshoot + swell) };
  });
  return <AnimatedCircle cx={n.cx} cy={n.cy} fill={PINK} animatedProps={props} />;
}

export function BrandSplash({
  canExit,
  onDone,
}: {
  /** The app is ready. The intro is a floor on time shown, never a ceiling. */
  canExit: boolean;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const draw = useSharedValue(reduced ? 1 : 0);
  const ring = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const word = useSharedValue(reduced ? 1 : 0);
  const dive = useSharedValue(0);
  const cover = useSharedValue(0);
  const collapse = useSharedValue(0);
  const fade = useSharedValue(1);
  const loader = useSharedValue(0);
  const pulse = useSharedValue(0);

  const mountedAt = useRef(Date.now());
  const exiting = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.cubic);
    draw.value = withDelay(120, withTiming(1, { duration: 620, easing: ease }));
    ring.value = withDelay(150, withTiming(1, { duration: 700, easing: ease }));
    pop.value = withDelay(420, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    word.value = withDelay(720, withTiming(1, { duration: 620, easing: Easing.out(Easing.exp) }));
  }, [draw, ring, pop, word, reduced]);

  // The "still working" affordance — only if not ready by LOADER_AFTER.
  useEffect(() => {
    if (canExit) return;
    const timer = setTimeout(() => {
      if (exiting.current) return;
      loader.value = withTiming(1, { duration: 300 });
      if (!reduced) pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1);
    }, LOADER_AFTER);
    return () => clearTimeout(timer);
  }, [canExit, loader, pulse, reduced]);

  const [forceExit, setForceExit] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setForceExit(true), MAX_HOLD);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if ((!canExit && !forceExit) || exiting.current) return;
    exiting.current = true;
    const remaining = Math.max(0, (reduced ? 300 : HOLD_UNTIL) - (Date.now() - mountedAt.current));
    const finish = () => onDone();

    if (reduced) {
      fade.value = withDelay(remaining, withTiming(0, { duration: 280 }, (ok) => ok && runOnJS(finish)()));
      return;
    }

    pulse.value = 0;
    loader.value = withDelay(remaining, withTiming(0, { duration: 160 }));
    // Wordmark lifts away, then the camera dives into the pink node.
    word.value = withDelay(remaining, withTiming(2, { duration: 320, easing: Easing.in(Easing.cubic) }));
    dive.value = withDelay(
      remaining + 220,
      withTiming(1, { duration: 720, easing: Easing.in(Easing.exp) }, (ok) => {
        if (!ok) return;
        cover.value = 1;
        collapse.value = withTiming(1, { duration: 620, easing: Easing.inOut(Easing.exp) }, (done) => done && runOnJS(finish)());
      }),
    );
  }, [canExit, forceExit, reduced, onDone, word, dive, cover, collapse, fade, loader, pulse]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * (1 - ring.value) }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: cover.value ? 0 : 1,
    transform: [{ scale: 1 + dive.value * 46 }],
  }));
  const wordStyle = useAnimatedStyle(() => {
    const v = word.value;
    // 0→1 rises in from below; 1→2 lifts out upward.
    const y = v <= 1 ? (1 - v) * 26 : -(v - 1) * 30;
    const o = v <= 1 ? v : 2 - v;
    return { opacity: o, transform: [{ translateY: y }] };
  });
  const screenStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    backgroundColor: cover.value ? 'transparent' : '#ffffff',
  }));
  const diag = Math.hypot(width, height);
  const coverStyle = useAnimatedStyle(() => ({
    opacity: cover.value,
    transform: [{ scale: 1 - collapse.value }],
  }));
  const loaderStyle = useAnimatedStyle(() => ({ opacity: loader.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.screen, screenStyle]}>
      <View style={styles.stack}>
        <Animated.View
          style={[
            { width: MARK, height: MARK_H, transformOrigin: [MARK * DIVE.x, MARK_H * DIVE.y, 0] },
            markStyle,
          ]}
        >
          <Svg width={MARK} height={MARK_H} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} accessibilityLabel="influnet">
            {SPOKES.map((_, i) => (
              <Spoke key={i} i={i} draw={draw} />
            ))}
            {NODES.map((_, i) => (
              <Node key={i} i={i} pop={pop} pulse={pulse} />
            ))}
            <AnimatedCircle
              cx={RING.cx}
              cy={RING.cy}
              r={RING.r}
              fill="none"
              stroke={PINK}
              strokeWidth={44}
              strokeDasharray={[RING_LEN, RING_LEN]}
              animatedProps={ringProps}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={wordStyle}>
          <Txt style={{ fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -1, color: '#111114' }}>influnet</Txt>
        </Animated.View>
      </View>

      {/* The dive ends with the screen fully pink; this circle then shrinks to
          a point and the first screen is revealed around it. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: diag,
            height: diag,
            borderRadius: diag / 2,
            left: (width - diag) / 2,
            top: (height - diag) / 2,
            backgroundColor: PINK,
          },
          coverStyle,
        ]}
      />

      <Animated.View style={[styles.loader, loaderStyle]}>
        <Txt variant="footnote" tone="muted" style={{ letterSpacing: 0.2 }}>
          Getting things ready…
        </Txt>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    gap: 18,
    marginBottom: 40,
  },
  loader: {
    position: 'absolute',
    bottom: 96,
    alignItems: 'center',
  },
});
