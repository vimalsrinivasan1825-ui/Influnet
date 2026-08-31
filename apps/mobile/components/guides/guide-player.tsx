/**
 * The mobile guide player — Reanimated mirror of
 * apps/web/src/components/guides/guide-player.tsx.
 *
 * Same shared `GuideScript` from @influnet/core drives both. Here the frame
 * loop is `useFrameCallback` advancing one shared value `t` (ms into the loop);
 * every camera move, finger tap and cross-fade is a worklet reading `t` plus a
 * handful of measured-rect / precomputed-window shared values. Nothing
 * re-renders React per frame.
 *
 * The worklet helpers below are structurally identical to
 * `packages/core/src/guides/runtime.ts` — that file is the reference. The
 * measurement dance (measureInWindow minus the container's own window origin,
 * a `ready` gate, a 1.5s fail-safe, centre-origin transform correction) is
 * lifted from the original verify-guide-animation.tsx and carries the same
 * hard-won comments.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  buildCameraKeys,
  captionSteps,
  screensOf,
  timeline,
  type CamKey,
  type GuideScript,
  type Rect as CoreRect,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { GuideRuntimeCtx, type GuideRuntime, type GuideRect } from './runtime-context';
import { GuideScreen, type GuideContext } from './screens';

const PHONE_W = 240;
const PHONE_H = 420;
const PHONE_SCALE = 0.7;
const STAGE_H = 340;
const FADE = 260;

type Rect = GuideRect;
const ZERO: Rect = { x: 0, y: 0, w: 1, h: 1 };

// ── worklets (mirror of runtime.ts) ──────────────────────────────
function clamp01W(n: number): number {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function easeInOutW(p: number): number {
  'worklet';
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
function easeOutW(p: number): number {
  'worklet';
  return 1 - Math.pow(1 - p, 3);
}
function easeBackW(p: number): number {
  'worklet';
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}
function lerpW(t: number, t0: number, t1: number, a: number, b: number): number {
  'worklet';
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + (b - a) * easeInOutW((t - t0) / (t1 - t0));
}
function winW(t: number, a: number, b: number, c: number, d: number): number {
  'worklet';
  if (t < a) return 0;
  if (t < b) return easeOutW((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOutW((t - c) / (d - c));
  return 0;
}
function sampleCamW(keys: CamKey[], t: number): { s: number; x: number; y: number } {
  'worklet';
  if (!keys.length) return { s: 1, x: 0, y: 0 };
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i][0] && t <= keys[i + 1][0]) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const span = b[0] - a[0];
  const p = span <= 0 ? 1 : easeInOutW(clamp01W((t - a[0]) / span));
  return {
    s: a[1].s + (b[1].s - a[1].s) * p,
    x: a[1].x + (b[1].x - a[1].x) * p,
    y: a[1].y + (b[1].y - a[1].y) * p,
  };
}

export interface GuidePlayerProps {
  script: GuideScript;
  context: GuideContext;
  playing?: boolean;
  speed?: number;
  onStep?: (index: number) => void;
}

export function GuidePlayer({ script, context, playing = true, speed = 0.75, onStep }: GuidePlayerProps) {
  const th = useTheme();

  const t = useSharedValue(0);
  const ready = useSharedValue(0);
  const flagKey = useSharedValue('');
  const playingSV = useSharedValue(playing);
  const speedSV = useSharedValue(speed);
  useEffect(() => { playingSV.value = playing; }, [playing, playingSV]);
  useEffect(() => { speedSV.value = speed; }, [speed, speedSV]);

  const screens = useMemo(() => screensOf(script), [script]);
  const steps = useMemo(() => captionSteps(script), [script]);
  const { starts, total } = useMemo(() => timeline(script), [script]);

  // Precomputed, script-only tracks --------------------------------
  const screenRuns = useMemo(() => {
    // For each screen: merged runs of consecutive same-screen beats → [on, off].
    const map: Record<string, [number, number][]> = {};
    let i = 0;
    while (i < script.beats.length) {
      const s = script.beats[i].screen;
      const runStart = starts[i];
      let j = i;
      while (j + 1 < script.beats.length && script.beats[j + 1].screen === s) j++;
      const runEnd = starts[j + 1] ?? total;
      (map[s] ??= []).push([runStart, runEnd]);
      i = j + 1;
    }
    return map;
  }, [script, starts, total]);

  const typed = useMemo(() => {
    const out: Record<string, { start: number; end: number; text: string }> = {};
    script.beats.forEach((b, i) => {
      if (!b.type) return;
      const key = b.tap ?? (b.focus && b.focus !== 'wide' ? b.focus : undefined);
      if (!key) return;
      const s0 = starts[i];
      const s1 = starts[i + 1] ?? total;
      out[key] = { start: s0 + (s1 - s0) * 0.35, end: s0 + (s1 - s0) * 0.8, text: b.type };
    });
    return out;
  }, [script, starts, total]);

  const pointerBeats = useMemo(
    () =>
      script.beats.map((b, i) => ({
        tap: b.tap ?? '',
        s0: starts[i],
        s1: starts[i + 1] ?? total,
      })),
    [script, starts, total],
  );

  const celebrateStart = useMemo(() => {
    const i = script.beats.findIndex((b) => b.celebrate);
    return i < 0 ? -1 : starts[i];
  }, [script, starts]);

  // ── measurement ────────────────────────────────────────────────
  const stageRef = useRef<View>(null);
  const base = useRef({ x: 0, y: 0 });
  const [stage, setStage] = useState({ w: 320, h: STAGE_H });
  const rectsJS = useRef<Record<string, Rect>>({});
  const rectsSV = useSharedValue<Record<string, Rect>>({});
  const phoneRect = useRef<Rect>(ZERO);
  const camKeys = useSharedValue<CamKey[]>([]);
  const targetIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of script.beats) {
      if (b.focus && b.focus !== 'wide') s.add(b.focus);
      if (b.tap) s.add(b.tap);
    }
    return [...s];
  }, [script]);

  const rebuild = useCallback(() => {
    const view = { w: stage.w, h: stage.h };
    const phone = phoneRect.current.w > 1 ? phoneRect.current : null;
    const rects: Record<string, CoreRect | null> = {};
    for (const id of targetIds) rects[id] = rectsJS.current[id] ?? null;
    camKeys.value = buildCameraKeys(script, rects, view, phone);
    rectsSV.value = { ...rectsJS.current };
    if (targetIds.every((id) => rectsJS.current[id]?.w) && phone) ready.value = 1;
  }, [script, stage.w, stage.h, targetIds, camKeys, rectsSV, ready]);

  const register = useCallback(
    (id: string, rect: Rect | null) => {
      if (!rect) return;
      const local = { x: rect.x - base.current.x, y: rect.y - base.current.y, w: rect.w, h: rect.h };
      const prev = rectsJS.current[id];
      if (prev && Math.abs(prev.x - local.x) < 0.5 && Math.abs(prev.y - local.y) < 0.5) return;
      rectsJS.current[id] = local;
      rebuild();
    },
    [rebuild],
  );

  const onStageLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      requestAnimationFrame(() => {
        stageRef.current?.measureInWindow((x, y, w, h) => {
          base.current = { x, y };
          if (w > 0 && h > 0) setStage({ w, h });
        });
      });
    },
    [],
  );

  const onPhoneLayout = useCallback(() => {
    requestAnimationFrame(() => {
      // measured via the stage: same base subtraction as targets
      stageRef.current?.measureInWindow((sx, sy) => {
        // phone is centred by layout; derive its rect from known size + scale
        const w = PHONE_W * PHONE_SCALE;
        const h = PHONE_H * PHONE_SCALE;
        phoneRect.current = { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
        rebuild();
      });
    });
  }, [rebuild, stage.w, stage.h]);

  // Fail-safe: never let measurement freeze playback (see the original file).
  useEffect(() => {
    const id = setTimeout(() => {
      if (phoneRect.current.w <= 1) {
        const w = PHONE_W * PHONE_SCALE;
        const h = PHONE_H * PHONE_SCALE;
        phoneRect.current = { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
        rebuild();
      }
      ready.value = 1;
    }, 1500);
    return () => clearTimeout(id);
  }, [ready, rebuild, stage.w, stage.h]);

  // reset on script change
  useEffect(() => {
    t.value = 0;
    ready.value = 0;
    rectsJS.current = {};
    lastStep.current = -1;
  }, [script, t, ready]);

  // ── frame loop ─────────────────────────────────────────────────
  const lastStep = useRef(-1);
  const reportStep = useCallback(
    (ms: number) => {
      let idx = 0;
      for (let i = 0; i < steps.length; i++) if (ms >= steps[i].at) idx = i;
      if (idx !== lastStep.current) {
        lastStep.current = idx;
        onStep?.(idx);
      }
    },
    [steps, onStep],
  );

  useFrameCallback((frame) => {
    if (!playingSV.value || ready.value === 0) return;
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 60);
    t.value = (t.value + dt * speedSV.value) % total;
    flagKey.value = flagAtW(script, t.value, starts, total);
    runOnJS(reportStep)(t.value);
  }, true);

  // ── camera ─────────────────────────────────────────────────────
  const camStyle = useAnimatedStyle(() => {
    if (ready.value === 0 || !camKeys.value.length) {
      return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    }
    const c = sampleCamW(camKeys.value, t.value);
    const W = stage.w;
    const H = stage.h;
    // RN scales about the view centre; runtime.ts works in a top-left-origin
    // space. Re-express (see the original file's long note).
    return {
      transform: [
        { translateX: c.x + (W / 2) * (c.s - 1) },
        { translateY: c.y + (H / 2) * (c.s - 1) },
        { scale: c.s },
      ],
    };
  });

  // ── pointer ────────────────────────────────────────────────────
  const ptrStyle = useAnimatedStyle(() => {
    const T = t.value;
    const W = stage.w;
    const H = stage.h;
    const off = { x: W * 0.9, y: H + 60 };
    let idx = 0;
    for (let i = 0; i < pointerBeats.length; i++) if (T >= pointerBeats[i].s0) idx = i;
    const b = pointerBeats[idx];
    if (!b || !b.tap) return { opacity: 0, transform: [{ translateX: off.x }, { translateY: off.y }, { scale: 1 }] };
    const r = rectsSV.value[b.tap];
    const target = r && r.w > 1 ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : off;
    const d = b.s1 - b.s0;
    const arrive = b.s0 + d * 0.12;
    const land = b.s0 + d * 0.42;
    const pressStart = b.s0 + d * 0.46;
    const pressEnd = b.s0 + d * 0.6;
    const leave = b.s0 + d * 0.62;
    const gone = b.s0 + d * 0.8;
    let pt;
    if (T < land) pt = { x: lerpW(T, arrive, land, off.x, target.x), y: lerpW(T, arrive, land, off.y, target.y) };
    else if (T < leave) pt = target;
    else pt = { x: lerpW(T, leave, gone, target.x, off.x), y: lerpW(T, leave, gone, target.y, off.y) };
    let press = 0;
    if (T >= pressStart && T <= pressEnd) press = Math.sin(((T - pressStart) / (pressEnd - pressStart)) * Math.PI);
    const camS = camKeys.value.length ? sampleCamW(camKeys.value, T).s : 1;
    const inv = 1 / camS;
    const visible = T >= arrive && T < gone ? 1 : 0;
    return {
      opacity: visible,
      transform: [
        { translateX: pt.x - 13.5 },
        { translateY: pt.y - 13.5 },
        { scale: (1 - press * 0.22) * inv },
      ],
    };
  });

  // ── celebration ────────────────────────────────────────────────
  const celStyle = useAnimatedStyle(() => {
    if (celebrateStart < 0) return { opacity: 0 };
    return { opacity: clamp01W((t.value - celebrateStart) / 700) };
  });
  const celDiscStyle = useAnimatedStyle(() => {
    if (celebrateStart < 0) return { transform: [{ scale: 0.4 }] };
    const p = clamp01W((t.value - celebrateStart) / 700);
    return { transform: [{ scale: 0.4 + easeBackW(p) * 0.6 }] };
  });

  const runtime: GuideRuntime = { t, ready, flagKey, register, typed };

  return (
    <GuideRuntimeCtx.Provider value={runtime}>
      <View
        ref={stageRef}
        onLayout={onStageLayout}
        style={[styles.stage, { backgroundColor: th.color.surfaceMuted, borderColor: th.color.hairline }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, camStyle]}>
          <View
            onLayout={onPhoneLayout}
            style={[
              styles.phone,
              { backgroundColor: th.color.surface, borderColor: th.color.hairlineStrong },
            ]}
          >
            {screens.map((id) => (
              <ScreenLayer key={id} screen={id} runs={screenRuns[id] ?? []} t={t}>
                <GuideScreen id={id} ctx={context} />
              </ScreenLayer>
            ))}
          </View>

          <Animated.View
            pointerEvents="none"
            style={[styles.ptr, ptrStyle, { borderColor: 'rgba(255,255,255,.62)' }]}
          />
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.celWrap, celStyle, { backgroundColor: th.color.surface + 'c8' }]}
        >
          <Animated.View style={[styles.celDisc, celDiscStyle, { backgroundColor: th.color.brand }]}>
            <View style={styles.celTickH} />
            <View style={styles.celTickV} />
          </Animated.View>
        </Animated.View>
      </View>
    </GuideRuntimeCtx.Provider>
  );
}

/** One mounted screen — its opacity is the union of its merged run windows. */
function ScreenLayer({
  screen,
  runs,
  t,
  children,
}: {
  screen: string;
  runs: [number, number][];
  t: SharedValue<number>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    let o = 0;
    for (let i = 0; i < runs.length; i++) {
      const [on, off] = runs[i];
      o = Math.max(o, winW(t.value, on - FADE, on, off, off + FADE));
    }
    return { opacity: o };
  });
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/** Currently-flagged target at `ms`, as a worklet (mirror of flaggedTargetAt). */
function flagAtW(script: GuideScript, ms: number, starts: number[], total: number): string {
  'worklet';
  for (let i = 0; i < script.beats.length; i++) {
    const b = script.beats[i];
    if (!b.flag) continue;
    const s0 = starts[i];
    const s1 = starts[i + 1] ?? total;
    if (ms >= s0 && ms < s1) {
      if (b.focus && b.focus !== 'wide') return b.focus;
      if (b.tap) return b.tap;
      return '';
    }
  }
  return '';
}

const styles = StyleSheet.create({
  stage: { height: STAGE_H, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  phone: {
    position: 'absolute',
    width: PHONE_W,
    height: PHONE_H,
    left: '50%',
    top: '50%',
    marginLeft: -PHONE_W / 2,
    marginTop: -PHONE_H / 2,
    transform: [{ scale: PHONE_SCALE }],
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ptr: {
    position: 'absolute',
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(15,23,42,.4)',
    zIndex: 40,
  },
  celWrap: { alignItems: 'center', justifyContent: 'center' },
  celDisc: {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celTickH: {
    position: 'absolute',
    width: 26,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }, { translateX: -6 }, { translateY: 6 }],
  },
  celTickV: {
    position: 'absolute',
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }, { translateX: -13 }, { translateY: 1 }],
  },
});
