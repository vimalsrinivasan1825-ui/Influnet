/**
 * Guide player math — pure, platform-agnostic.
 *
 * The WEB player (`apps/web/src/components/guides/guide-player.tsx`) imports
 * these directly. The MOBILE player re-declares the small hot-path helpers as
 * Reanimated worklets, structurally identical, and this file is the reference —
 * exactly the arrangement the two `verify-guide-animation.tsx` files already use.
 * Change one, change the other.
 *
 * Everything derives from one number: `t`, ms into the loop.
 */

import type { GuideScript } from './types';
import { timeline } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Cam {
  s: number;
  x: number;
  y: number;
}
export interface ViewSize {
  w: number;
  h: number;
}

// ── scalar helpers ───────────────────────────────────────────────
export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);

export const easeBack = (p: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

/** Eased interpolation from `a`→`b` as `t` crosses [`t0`,`t1`]. */
export function lerp(
  t: number,
  t0: number,
  t1: number,
  a: number,
  b: number,
  ease: (p: number) => number = easeInOut,
): number {
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + (b - a) * ease((t - t0) / (t1 - t0));
}

/** 0 outside [a,d], 1 inside [b,c], eased on both edges. */
export function win(t: number, a: number, b: number, c: number, d: number): number {
  if (t < a) return 0;
  if (t < b) return easeOut((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOut((t - c) / (d - c));
  return 0;
}

// ── camera ───────────────────────────────────────────────────────
/**
 * Frame `r` inside the view, clamped so nothing outside `bounds` (the phone
 * device rect) is dragged into shot. Mirrors `camFor` in both
 * verify-guide-animation.tsx files.
 */
export function camFor(
  r: Rect | null,
  view: ViewSize,
  pad: number,
  maxZoom: number,
  bounds: Rect | null,
): Cam {
  if (!r || r.w <= 1) return { s: 1, x: 0, y: 0 };
  const s = Math.max(
    1,
    Math.min(maxZoom, Math.min(view.w / (r.w + pad * 2), view.h / (r.h + pad * 2))),
  );
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let x = view.w / 2 - cx * s;
  let y = view.h / 2 - cy * s;
  const b = bounds ?? { x: 0, y: 0, w: view.w, h: view.h };
  x =
    b.w * s >= view.w
      ? Math.min(-b.x * s, Math.max(view.w - (b.x + b.w) * s, x))
      : view.w / 2 - (b.x + b.w / 2) * s;
  y =
    b.h * s >= view.h
      ? Math.min(-b.y * s, Math.max(view.h - (b.y + b.h) * s, y))
      : view.h / 2 - (b.y + b.h / 2) * s;
  return { s, x, y };
}

export type CamKey = [number, Cam];

/** How long the camera takes to travel to a new beat's framing. */
const travelMs = (beatMs: number): number => Math.min(600, beatMs * 0.4);

/**
 * Build the camera keyframe track for a whole script from measured rects.
 * `rects` maps target id → measured Rect (in the view's local space);
 * `phone` is the device rect used as the clamp bounds and the `wide` framing.
 */
export function buildCameraKeys(
  script: GuideScript,
  rects: Record<string, Rect | null>,
  view: ViewSize,
  phone: Rect | null,
): CamKey[] {
  const { starts, total } = timeline(script);
  // The wide shot is the phone at rest: scale 1, centred. camFor can't express
  // it (it clamps scale to >= 1, and the phone is taller than the stage, so it
  // would zoom in and crop the bottom). The phone is already centred by CSS, so
  // any residual offset is a measurement rounding error — centre on it exactly.
  const wide: Cam = phone
    ? { s: 1, x: view.w / 2 - (phone.x + phone.w / 2), y: view.h / 2 - (phone.y + phone.h / 2) }
    : { s: 1, x: 0, y: 0 };
  const camOf = (focus: string | undefined, zoom: number | undefined): Cam => {
    if (!focus || focus === 'wide') return wide;
    return camFor(rects[focus] ?? null, view, 18, zoom ?? 2.4, phone);
  };

  const keys: CamKey[] = [];
  let prev: Cam = wide;
  let prevFocus: string | undefined = 'wide';
  script.beats.forEach((b, i) => {
    const focus = b.focus ?? prevFocus;
    const target = camOf(focus, b.zoom);
    const s0 = starts[i];
    if (i === 0) {
      keys.push([0, target]);
    } else {
      keys.push([s0, prev]);
      keys.push([Math.min(s0 + travelMs(b.ms), starts[i + 1] ?? total), target]);
    }
    prev = target;
    prevFocus = focus;
  });
  keys.push([total, prev]);
  return keys;
}

/** Sample the camera track at `t` (eased between bracketing keys). */
export function sampleCamera(keys: CamKey[], t: number): Cam {
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
  const p = span <= 0 ? 1 : easeInOut(clamp01((t - a[0]) / span));
  return {
    s: a[1].s + (b[1].s - a[1].s) * p,
    x: a[1].x + (b[1].x - a[1].x) * p,
    y: a[1].y + (b[1].y - a[1].y) * p,
  };
}

// ── screens ──────────────────────────────────────────────────────
const FADE = 260;

/**
 * Opacity of a mounted screen at `t`. Consecutive beats on the same screen are
 * merged into one continuous run; each run fades in over `FADE` before it starts
 * and out over `FADE` after it ends, so adjacent different screens cross-fade.
 */
export function screenOpacityAt(script: GuideScript, screen: string, t: number): number {
  const { starts, total } = timeline(script);
  let o = 0;
  let i = 0;
  while (i < script.beats.length) {
    if (script.beats[i].screen !== screen) {
      i++;
      continue;
    }
    const runStart = starts[i];
    let j = i;
    while (j + 1 < script.beats.length && script.beats[j + 1].screen === screen) j++;
    const runEnd = starts[j + 1] ?? total;
    o = Math.max(o, win(t, runStart - FADE, runStart, runEnd, runEnd + FADE));
    i = j + 1;
  }
  return clamp01(o);
}

// ── pointer ──────────────────────────────────────────────────────
export interface PointerState {
  x: number;
  y: number;
  visible: boolean;
  /** 0..1 press depth (finger sinks on tap). */
  press: number;
  /** 0..1 ring expansion, <0 when no ring. */
  ring: number;
}

const OFFSCREEN = (view: ViewSize) => ({ x: view.w * 0.9, y: view.h + 60 });

export function pointerAt(
  script: GuideScript,
  rects: Record<string, Rect | null>,
  view: ViewSize,
  t: number,
): PointerState {
  const { starts, total } = timeline(script);
  const off = OFFSCREEN(view);
  const ctr = (id: string): { x: number; y: number } => {
    const r = rects[id];
    return r && r.w > 1 ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : off;
  };

  let idx = 0;
  for (let i = 0; i < script.beats.length; i++) if (t >= starts[i]) idx = i;
  const b = script.beats[idx];
  const s0 = starts[idx];
  const s1 = starts[idx + 1] ?? total;
  const d = s1 - s0;

  if (!b?.tap) return { x: off.x, y: off.y, visible: false, press: 0, ring: -1 };

  const target = ctr(b.tap);
  const arrive = s0 + d * 0.12;
  const land = s0 + d * 0.42;
  const pressStart = s0 + d * 0.46;
  const pressEnd = s0 + d * 0.6;
  const leave = s0 + d * 0.62;
  const gone = s0 + d * 0.8;

  let pt: { x: number; y: number };
  if (t < land) pt = { x: lerp(t, arrive, land, off.x, target.x), y: lerp(t, arrive, land, off.y, target.y) };
  else if (t < leave) pt = target;
  else pt = { x: lerp(t, leave, gone, target.x, off.x), y: lerp(t, leave, gone, target.y, off.y) };

  let press = 0;
  let ring = -1;
  if (t >= pressStart && t <= pressEnd + 340) {
    if (t <= pressEnd) press = Math.sin(((t - pressStart) / (pressEnd - pressStart)) * Math.PI);
    ring = clamp01((t - pressStart) / 500);
  }
  const visible = t >= arrive && t < gone;
  return { x: pt.x, y: pt.y, visible, press, ring };
}

// ── typed fields / flags / celebration ───────────────────────────
/** target id → the substring of its `type` text visible at `t`. */
export function typedTextAt(script: GuideScript, t: number): Record<string, string> {
  const { starts, total } = timeline(script);
  const out: Record<string, string> = {};
  script.beats.forEach((b, i) => {
    if (!b.type) return;
    const key = b.tap ?? b.focus;
    if (!key || key === 'wide') return;
    const s0 = starts[i];
    const s1 = starts[i + 1] ?? total;
    const typeStart = s0 + (s1 - s0) * 0.35;
    const typeEnd = s0 + (s1 - s0) * 0.8;
    if (t < s0) return;
    const p = clamp01((t - typeStart) / Math.max(1, typeEnd - typeStart));
    out[key] = b.type.slice(0, Math.round(p * b.type.length));
  });
  return out;
}

/** The target to visually "flag" at `t`, if any. */
export function flaggedTargetAt(script: GuideScript, t: number): string | null {
  const { starts, total } = timeline(script);
  for (let i = 0; i < script.beats.length; i++) {
    const b = script.beats[i];
    if (!b.flag) continue;
    const s0 = starts[i];
    const s1 = starts[i + 1] ?? total;
    if (t >= s0 && t < s1) return (b.focus && b.focus !== 'wide' ? b.focus : b.tap) ?? null;
  }
  return null;
}

/** 0 before the celebrate beat, ramps to 1 over ~700ms after it starts. */
export function celebrateAt(script: GuideScript, t: number): number {
  const { starts } = timeline(script);
  const i = script.beats.findIndex((b) => b.celebrate);
  if (i < 0) return 0;
  return clamp01((t - starts[i]) / 700);
}

/** Index of the currently active caption step (for the modal strip). */
export function stepIndexAt(steps: { at: number }[], t: number): number {
  let idx = 0;
  for (let i = 0; i < steps.length; i++) if (t >= steps[i].at) idx = i;
  return idx;
}
