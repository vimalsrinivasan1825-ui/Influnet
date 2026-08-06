/**
 * Silent, looping walkthrough of Instagram ownership verification.
 *
 * Mirrors apps/web/src/components/verification/verify-guide-animation.tsx beat
 * for beat — same ten steps, same timings, same idea ("the camera focuses
 * MEASURED element rects, not hand-tuned coordinates"). Port the beats and
 * comments together if either file changes; they are meant to stay in sync.
 *
 * Screens: Influnet (your link) → phone home screen → Instagram profile →
 * Edit profile → Bio → back to the home screen → Influnet → Verify → Verified.
 *
 * Reanimated model: one shared value `t` (ms into the loop) drives everything.
 * `useFrameCallback` advances it, like a rAF loop. Every position/opacity/scale
 * is a worklet reading `t` plus a handful of measured-rect shared values — nothing
 * re-renders React on each frame.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient, Stop, ClipPath, Circle, Rect as SvgRect, G } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { LOGO_SOURCE } from '@/components/brand/logo';

const TOTAL = 19_000;

export const GUIDE_STEPS: { t: number; label: string }[] = [
  { t: 0, label: 'Copy your profile link' },
  { t: 2700, label: 'Open Instagram' },
  { t: 4600, label: 'Go to your profile, then Edit profile' },
  { t: 6100, label: 'Paste the link into Links, then Done' },
  { t: 9500, label: 'Return to Influnet and tap Verify' },
  { t: 13_100, label: 'Verified — leave the link there' },
];

// NOTE: the captions above now teach the LINKS field, because a link in the
// bio text is not tappable on Instagram and so does the creator no good. The
// simulated screen below still animates its camera to the `bioRow` element —
// deliberately, for now: retargeting the choreography to the links row is
// storyboard work that was scoped out of the copy change. The verification
// itself reads the links field (see profileLinksToUsername on the server), so
// this is a cosmetic mismatch to close later, not a behavioural bug.

interface Rect { x: number; y: number; w: number; h: number }
const ZERO_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Ten years' worth of "why is my pointer 40px off" bugs, avoided once here. */
function useMeasuredRect(): [Rect, (e: LayoutChangeEvent) => void, React.RefObject<View | null>] {
  const ref = useRef<View>(null);
  const [rect, setRect] = useState<Rect>(ZERO_RECT);
  const onLayout = useCallback(() => {
    // onLayout fires with COORDINATES RELATIVE TO THE PARENT, which is useless
    // once views are nested several levels deep inside the camera rig.
    // measureInWindow gives absolute screen coordinates for both the target and
    // the (untransformed) container, so subtracting the two gives a stable
    // local position — the same trick the web version uses with
    // getBoundingClientRect, and for the same reason.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) setRect({ x, y, w, h });
      });
    });
  }, []);
  return [rect, onLayout, ref];
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// ── worklets ─────────────────────────────────────────────────────
function easeInOut(p: number): number {
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
function clamp01W(n: number): number {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function lerpW(t: number, t0: number, t1: number, a: number, b: number): number {
  'worklet';
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + (b - a) * easeInOut((t - t0) / (t1 - t0));
}
/** 0 outside the window, 1 inside, eased on both edges. */
function winW(t: number, a: number, b: number, c: number, d: number): number {
  'worklet';
  if (t < a) return 0;
  if (t < b) return easeOutW((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOutW((t - c) / (d - c));
  return 0;
}

export interface VerifyGuideAnimationProps {
  /** Display form of the creator's public link, e.g. "influnet.in/c/priya". */
  displayUrl: string;
  handle: string;
  name: string;
  playing?: boolean;
  /** 1 = real time. Slower reads more clearly on first watch. */
  speed?: number;
  onStep?: (index: number) => void;
}

export function VerifyGuideAnimation({
  displayUrl,
  handle,
  name,
  playing = true,
  speed = 0.6,
  onStep,
}: VerifyGuideAnimationProps) {
  const t0 = useTheme();
  const t = useSharedValue(0);
  const playingSV = useSharedValue(playing);
  const speedSV = useSharedValue(speed);
  // 0 until every target rect has been measured. See the note in the effect
  // that sets it: measuring must happen with the camera at identity.
  const ready = useSharedValue(0);
  useEffect(() => { playingSV.value = playing; }, [playing, playingSV]);
  useEffect(() => { speedSV.value = speed; }, [speed, speedSV]);

  const lastStep = useRef(-1);
  const reportStep = useCallback((t_: number) => {
    let idx = 0;
    for (let i = 0; i < GUIDE_STEPS.length; i++) if (t_ >= GUIDE_STEPS[i].t) idx = i;
    if (idx !== lastStep.current) { lastStep.current = idx; onStep?.(idx); }
  }, [onStep]);

  useFrameCallback((frame) => {
    if (!playingSV.value || ready.value === 0) return;
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 60);
    t.value = (t.value + dt * speedSV.value) % TOTAL;
    runOnJS(reportStep)(t.value);
  }, true);

  // ── measured layout ───────────────────────────────────────────
  const viewRef = useRef<View>(null);
  const [viewSize, setViewSize] = useState({ w: 320, h: 300 });
  const [phoneRect, onPhoneLayout, phoneRef] = useMeasuredRect();
  const [copyRect, onCopyLayout, copyRef] = useMeasuredRect();
  const [verifyRect, onVerifyLayout, verifyRef] = useMeasuredRect();
  const [linkCardRect, onLinkCardLayout, linkCardRef] = useMeasuredRect();
  const [igIconRect, onIgIconLayout, igIconRef] = useMeasuredRect();
  const [infIconRect, onInfIconLayout, infIconRef] = useMeasuredRect();
  const [igEditRect, onIgEditLayout, igEditRef] = useMeasuredRect();
  const [bioRowRect, onBioRowLayout, bioRowRef] = useMeasuredRect();
  const [igDoneRect, onIgDoneLayout, igDoneRef] = useMeasuredRect();

  // Absolute-window coordinates are meaningless once the camera starts moving,
  // so every measured rect is re-expressed relative to this (untransformed)
  // container's own window position — the effect below does the subtraction.
  const baseX = useRef(0);
  const baseY = useRef(0);

  const onContainerLayout = useCallback(() => {
    requestAnimationFrame(() => {
      viewRef.current?.measureInWindow((x, y, w, h) => {
        baseX.current = x; baseY.current = y;
        if (w > 0 && h > 0) setViewSize({ w, h });
      });
    });
  }, []);

  // Shared values the worklets actually read. Recomputed on the JS thread
  // whenever a measured rect changes, then pushed to the UI thread.
  const rCopy = useSharedValue(ZERO_RECT);
  const rVerify = useSharedValue(ZERO_RECT);
  const rLinkCard = useSharedValue(ZERO_RECT);
  const rIgIcon = useSharedValue(ZERO_RECT);
  const rInfIcon = useSharedValue(ZERO_RECT);
  const rIgEdit = useSharedValue(ZERO_RECT);
  const rBioRow = useSharedValue(ZERO_RECT);
  const rIgDone = useSharedValue(ZERO_RECT);
  const rPhone = useSharedValue(ZERO_RECT);
  const vw = useSharedValue(320);
  const vh = useSharedValue(300);

  useEffect(() => {
    const rel = (r: Rect): Rect => ({ x: r.x - baseX.current, y: r.y - baseY.current, w: r.w, h: r.h });
    rCopy.value = rel(copyRect);
    rVerify.value = rel(verifyRect);
    rLinkCard.value = rel(linkCardRect);
    rIgIcon.value = rel(igIconRect);
    rInfIcon.value = rel(infIconRect);
    rIgEdit.value = rel(igEditRect);
    rBioRow.value = rel(bioRowRect);
    rIgDone.value = rel(igDoneRect);
    rPhone.value = rel(phoneRect);
    vw.value = viewSize.w;
    vh.value = viewSize.h;

    // Web measures with the rig's transform forced to "none", then restores it
    // (see the web file's measure()). measureInWindow has no such escape: it
    // reports ON-SCREEN coords, so anything measured while the camera is live
    // comes back multiplied by whatever zoom was showing. Each rect resolves on
    // its own requestAnimationFrame, so the first few to land start the camera
    // moving and every later one is measured THROUGH it — a row measured at
    // 2.4x reports 2.4x its true size, and camFor's
    // `s = min(W/(r.w + pad*2), ...)` then collapses to 1. That is why the
    // bio-row and edit-profile shots stopped zooming while the wide shot, which
    // needs no zoom, still looked right.
    //
    // Holding the clock and the camera at identity until every rect is in is
    // the direct equivalent of web's reset: all measuring then happens at
    // scale 1, so every rect is true.
    if (
      [copyRect, verifyRect, linkCardRect, igIconRect, infIconRect,
       igEditRect, bioRowRect, igDoneRect, phoneRect].every((r) => r.w > 1 && r.h > 1)
    ) {
      ready.value = 1;
    }
  }, [copyRect, verifyRect, linkCardRect, igIconRect, infIconRect, igEditRect, bioRowRect, igDoneRect, phoneRect, viewSize]);

  // Fail-safe for the gate above. Requiring ALL nine rects means one that never
  // reports freezes the entire guide at frame 0 — which is exactly what shipped
  // when bioRowRef was left unattached: that rect could never be measured, the
  // `every` check could never pass, and the animation was completely static.
  // Never let measurement be load-bearing for playback: if anything is still
  // missing by now, run regardless. Worst case is the old behaviour where one
  // shot does not zoom, which beats a guide that does nothing at all.
  useEffect(() => {
    const id = setTimeout(() => { ready.value = 1; }, 1500);
    return () => clearTimeout(id);
  }, [ready]);

  // ── camera ───────────────────────────────────────────────────
  // Clamped against the DEVICE rect, not the viewport — a zoom that clamped to
  // the viewport dragged empty card background into shot beside a phone
  // narrower than the card. Same fix as the web version, same reason.
  const camFor = useCallback(function camForImpl(r: Rect, pad: number, maxZoom: number, bounds: Rect, W: number, H: number) {
    'worklet';
    // Mirrors the web version's `if (!r) return identity`. Measured rects start
    // as ZERO_RECT (w=1,h=1) until their async measureInWindow resolves — without
    // this guard the very first frames computed a real zoom from that phantom
    // 1x1 rect, which clamps to maxZoom centered on a single pixel: the huge
    // zoomed-in sliver stuck in the corner with everything else blank. ptrStyle
    // below already guards the same way (`r.w > 1 ? ... : off`); this just
    // brings the camera in line with it.
    if (r.w <= 1 || bounds.w <= 1) return { s: 1, x: 0, y: 0 };
    const s = Math.max(1, Math.min(maxZoom, Math.min(W / (r.w + pad * 2), H / (r.h + pad * 2))));
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let x = W / 2 - cx * s, y = H / 2 - cy * s;
    x = bounds.w * s >= W ? Math.min(-bounds.x * s, Math.max(W - (bounds.x + bounds.w) * s, x)) : W / 2 - (bounds.x + bounds.w / 2) * s;
    y = bounds.h * s >= H ? Math.min(-bounds.y * s, Math.max(H - (bounds.y + bounds.h) * s, y)) : H / 2 - (bounds.y + bounds.h / 2) * s;
    return { s, x, y };
  }, []);

  const camStyle = useAnimatedStyle(() => {
    // Identity while measuring, so every measureInWindow reads a true rect.
    if (ready.value === 0) {
      return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    }
    const W = vw.value, H = vh.value, P = rPhone.value;
    const wide = camFor(P, 8, 2.4, P, W, H);
    type K = [number, { s: number; x: number; y: number }];
    const keys: K[] = [
      [0, wide],
      [900, camFor(rLinkCard.value, 12, 2.0, P, W, H)],
      [2400, camFor(rLinkCard.value, 12, 2.0, P, W, H)],
      [2900, wide],
      [3300, camFor(rIgIcon.value, 30, 2.6, P, W, H)],
      [4150, camFor(rIgIcon.value, 30, 2.6, P, W, H)],
      [4600, wide],
      [5100, camFor(rIgEdit.value, 26, 2.4, P, W, H)],
      [5900, camFor(rIgEdit.value, 26, 2.4, P, W, H)],
      [6300, camFor(rBioRow.value, 20, 2.4, P, W, H)],
      [8500, camFor(rBioRow.value, 20, 2.4, P, W, H)],
      [8800, camFor(rIgDone.value, 36, 2.2, P, W, H)],
      [9300, wide],
      [9900, camFor(rInfIcon.value, 30, 2.6, P, W, H)],
      [10_700, camFor(rInfIcon.value, 30, 2.6, P, W, H)],
      [11_100, camFor(rVerify.value, 24, 2.0, P, W, H)],
      [12_800, camFor(rVerify.value, 24, 2.0, P, W, H)],
      [13_200, wide],
      [TOTAL, wide],
    ];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t.value >= keys[i][0] && t.value <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const span = b[0] - a[0];
    const p = span <= 0 ? 1 : easeInOut(clamp01W((t.value - a[0]) / span));
    const s = a[1].s + (b[1].s - a[1].s) * p;
    const x = a[1].x + (b[1].x - a[1].x) * p;
    const y = a[1].y + (b[1].y - a[1].y) * p;
    // camFor works in web's coordinate space, where the rig carries
    // `origin-top-left` and a local point cx therefore lands at cx*s + x.
    // RN has no such class and scales about the view's CENTRE, so the same
    // numbers put cx at cx*s + (W/2)(1-s) + x — every shot ended up
    // (W/2)(s-1) too far left. At the wide shot (s~1.06) that is only ~11pt,
    // but at a 2.6x zoom it is ~300pt: the subject slid off the left edge and
    // the right half of the card went empty. Re-express the top-left-origin
    // offset for a centre-origin transform; at s=1 both agree, so the wide
    // shot is unchanged.
    return {
      transform: [
        { translateX: x + (W / 2) * (s - 1) },
        { translateY: y + (H / 2) * (s - 1) },
        { scale: s },
      ],
    };
  });

  // ── pointer ──────────────────────────────────────────────────
  const ptrStyle = useAnimatedStyle(() => {
    const T = t.value;
    const W = vw.value, H = vh.value;
    const off = { x: W * 0.9, y: H + 60 };
    const ctr = (r: Rect) => (r.w > 1 ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : off);
    const copy = ctr(rCopy.value), igIcon = ctr(rIgIcon.value), igEdit = ctr(rIgEdit.value);
    const bio = ctr(rBioRow.value), done = ctr(rIgDone.value), infIcon = ctr(rInfIcon.value), verify = ctr(rVerify.value);
    const seg = (t0_: number, t1_: number, f: { x: number; y: number }, to: { x: number; y: number }) => ({
      x: lerpW(T, t0_, t1_, f.x, to.x), y: lerpW(T, t0_, t1_, f.y, to.y),
    });
    let pt = off;
    if (T < 1500) pt = seg(600, 1500, off, copy);
    else if (T < 2350) pt = copy;
    else if (T < 2700) pt = seg(2350, 2700, copy, off);
    else if (T < 3750) pt = seg(3150, 3750, off, igIcon);
    else if (T < 3950) pt = igIcon;
    else if (T < 4400) pt = off;
    else if (T < 5300) pt = seg(4700, 5300, off, igEdit);
    else if (T < 5700) pt = igEdit;
    else if (T < 6100) pt = off;
    else if (T < 6800) pt = seg(6300, 6800, off, bio);
    else if (T < 8500) pt = bio;
    else if (T < 8900) pt = seg(8500, 8900, bio, done);
    else if (T < 9150) pt = done;
    else if (T < 9600) pt = seg(9150, 9600, done, off);
    else if (T < 10_350) pt = seg(9800, 10_350, off, infIcon);
    else if (T < 10_550) pt = infIcon;
    else if (T < 11_200) pt = off;
    else if (T < 12_000) pt = seg(11_300, 12_000, off, verify);
    else if (T < 12_350) pt = verify;
    else pt = seg(12_350, 12_800, verify, off);

    const PRESS: [number, number][] = [[1500, 1760], [3750, 3950], [5300, 5540], [6800, 7040], [8900, 9140], [12_000, 12_250]];
    let press = 0;
    for (const [s0, s1] of PRESS) {
      if (T >= s0 && T <= s1) press = Math.sin(((T - s0) / (s1 - s0)) * Math.PI);
    }
    // The camera scale at this instant, recomputed cheaply just for the
    // counter-scale — a finger must not visually grow when the camera zooms in.
    const camS = interpolate(T, [0, 3300, 6300, 11_100, 19_000], [1, 2.6, 2.4, 2.0, 1], 'clamp');
    const inv = 1 / camS;
    const visible = T > 12_800 || (pt.x === off.x && pt.y === off.y) ? 0 : 1;
    return {
      opacity: visible,
      transform: [{ translateX: pt.x - 13.5 }, { translateY: pt.y - 13.5 }, { scale: (1 - press * 0.22) * inv }],
    };
  });

  // ── screens ──────────────────────────────────────────────────
  const infStyle = useAnimatedStyle(() => ({
    opacity: clamp01W(winW(t.value, 0, 0, 2600, 2900) + winW(t.value, 10_600, 10_900, 18_400, 18_900)),
  }));
  const homeStyle = useAnimatedStyle(() => ({
    opacity: clamp01W(winW(t.value, 2600, 2900, 3950, 4150) + winW(t.value, 9300, 9600, 10_500, 10_700)),
  }));
  const igpStyle = useAnimatedStyle(() => ({
    opacity: clamp01W(winW(t.value, 4150, 4400, 5700, 5900)),
  }));
  const igeStyle = useAnimatedStyle(() => ({
    opacity: clamp01W(winW(t.value, 5900, 6100, 9100, 9300)),
  }));

  const copyBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (t.value >= 1500 && t.value <= 1760 ? 0.05 : 0) }],
  }));
  const copyLabelColor = useAnimatedStyle(() => ({
    color: t.value >= 1700 && t.value < 2700 ? t0.color.ok : t0.color.content,
  }));
  const igEditStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (t.value >= 5300 && t.value <= 5540 ? 0.04 : 0) }],
  }));
  const igDoneStyle = useAnimatedStyle(() => ({
    opacity: t.value >= 8900 && t.value <= 9140 ? 0.4 : 1,
  }));
  const igIconTileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (t.value >= 3750 && t.value <= 3950 ? 0.1 : 0) }],
  }));
  const infIconTileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (t.value >= 10_350 && t.value <= 10_550 ? 0.1 : 0) }],
  }));

  const caretStyle = useAnimatedStyle(() => {
    const focused = t.value >= 7040 && t.value < 9140;
    return { opacity: focused && t.value < 8900 && Math.floor(t.value / 460) % 2 === 0 ? 1 : 0 };
  });
  const bioRowStyle = useAnimatedStyle(() => ({
    backgroundColor: t.value >= 7040 && t.value < 9140 ? 'rgba(0,149,246,0.09)' : 'transparent',
  }));
  const pasteStyle = useAnimatedStyle(() => {
    if (t.value >= 7500 && t.value < 9600) {
      const s = lerpW(t.value, 7500, 7800, 0, 1);
      return { opacity: s, transform: [{ translateY: (1 - s) * -4 }] };
    }
    return { opacity: t.value >= 9600 ? 1 : 0, transform: [{ translateY: 0 }] };
  });

  const verifyBtnStyle = useAnimatedStyle(() => ({
    opacity: t.value >= 12_250 && t.value < 13_100 ? 0.85 : 1,
    transform: [{ scale: 1 - (t.value >= 12_000 && t.value <= 12_250 ? 0.05 : 0) }],
  }));
  const doneStyle = useAnimatedStyle(() => ({
    opacity: clamp01W(winW(t.value, 13_100, 13_450, 18_400, 18_800)),
  }));
  const discStyle = useAnimatedStyle(() => {
    const pop = clamp01W(lerpW(t.value, 13_200, 13_850, 0, 1));
    const eased = easeBackW(pop);
    return { transform: [{ scale: 0.35 + eased * 0.65 }], opacity: clamp01W(eased * 1.5) };
  });
  const ring1Style = useAnimatedStyle(() => {
    const r = clamp01W((t.value - 13_500) / 1350);
    return { transform: [{ scale: 1 + r * 1.15 }], opacity: r > 0 && r < 1 ? (1 - r) * 0.5 : 0 };
  });
  const ring2Style = useAnimatedStyle(() => {
    const r = clamp01W((t.value - 13_950) / 1350);
    return { transform: [{ scale: 1 + r * 1.15 }], opacity: r > 0 && r < 1 ? (1 - r) * 0.5 : 0 };
  });

  // link "flies" from the card up toward the phone's status bar
  const chipStyle = useAnimatedStyle(() => {
    const a = clamp01W(winW(t.value, 1680, 1800, 2200, 2420));
    const from = rCopy.value.y, to = rPhone.value.y + 14;
    const camS = interpolate(t.value, [0, 3300, 19_000], [1, 2.6, 1], 'clamp');
    return {
      opacity: a,
      transform: [
        { translateX: rCopy.value.x + rCopy.value.w / 2 },
        { translateY: lerpW(t.value, 1720, 2420, from, to) },
        { scale: (1 / camS) * 0.9 },
      ],
    };
  });

  // ── render ───────────────────────────────────────────────────
  const c = t0.color;
  const rowK = { fontSize: 8, fontWeight: '700' as const, letterSpacing: 0.6, color: c.contentMuted, textTransform: 'uppercase' as const };

  return (
    <View
      ref={viewRef}
      onLayout={onContainerLayout}
      style={[styles.view, { backgroundColor: c.surfaceMuted, borderColor: c.hairline }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, camStyle]}>
        <View
          ref={phoneRef}
          onLayout={onPhoneLayout}
          style={[styles.phone, { backgroundColor: c.surface, borderColor: c.hairlineStrong }]}
        >
          {/* Influnet */}
          <Animated.View style={[StyleSheet.absoluteFill, infStyle, { backgroundColor: c.surface }]}>
            <View style={styles.statusRow}><Txt c={c.content}>9:41</Txt><Txt c={c.content}>▮▮ ⌁</Txt></View>
            <View style={{ paddingHorizontal: 12 }}>
              <View style={styles.navRow}>
                <View style={[styles.chev, { borderColor: c.contentSoft }]} />
                <Txt c={c.content} weight="700" size={12}>Verify your Instagram</Txt>
              </View>
              <View style={[styles.idRow, { backgroundColor: c.surfaceCard, borderColor: c.hairline }]}>
                <Avatar size={22} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt c={c.content} weight="700" size={10} numberOfLines={1}>{name}</Txt>
                  <Txt c={c.contentMuted} size={8.5} numberOfLines={1}>@{handle}</Txt>
                </View>
              </View>

              <View ref={linkCardRef} onLayout={onLinkCardLayout} style={[styles.linkCard, { backgroundColor: c.surfaceCard, borderColor: c.hairline }]}>
                <Txt style={rowK}>Your profile link</Txt>
                <View style={[styles.codeBox, { backgroundColor: c.surfaceMuted, borderColor: c.hairlineStrong }]}>
                  <Txt c={c.content} weight="600" size={9.5} center>{displayUrl}</Txt>
                </View>
                <Animated.View ref={copyRef} onLayout={onCopyLayout} style={[styles.miniBtn, copyBtnStyle, { backgroundColor: c.surfaceCard, borderColor: c.hairlineStrong, marginTop: 8 }]}>
                  <Animated.Text style={[{ fontSize: 10.5, fontWeight: '700' }, copyLabelColor]}>Copy link</Animated.Text>
                </Animated.View>
              </View>

              <Animated.View ref={verifyRef} onLayout={onVerifyLayout} style={[styles.miniBtn, verifyBtnStyle, { backgroundColor: c.brand, marginTop: 10 }]}>
                <Txt c="#fff" weight="700" size={10.5}>I&apos;ve added the link</Txt>
              </Animated.View>
            </View>

            <Animated.View style={[StyleSheet.absoluteFill, doneStyle, styles.doneWrap, { backgroundColor: c.surface }]}>
              <View style={{ width: 92, height: 92 }}>
                <Animated.View style={[StyleSheet.absoluteFill, ring1Style, styles.ring, { borderColor: c.verified }]} />
                <Animated.View style={[StyleSheet.absoluteFill, ring2Style, styles.ring, { borderColor: c.verified }]} />
                <Animated.View style={[StyleSheet.absoluteFill, discStyle, styles.discCenter]}>
                  <VerifiedMark size={92} color={c.verified} />
                </Animated.View>
              </View>
              <Txt c={c.content} weight="800" size={15} style={{ marginTop: 14 }}>Verified</Txt>
              <Txt c={c.contentSoft} size={10} center style={{ marginTop: 5, lineHeight: 15 }}>
                @{handle} is confirmed as yours.{'\n'}Keep the link in your links.
              </Txt>
            </Animated.View>
          </Animated.View>

          {/* Home screen */}
          <Animated.View style={[StyleSheet.absoluteFill, homeStyle]}>
            <View style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#6d5bd0' }]} />
            </View>
            <View style={styles.statusRow}><Txt c="rgba(255,255,255,.95)">9:41</Txt><Txt c="rgba(255,255,255,.95)">▮▮ ⌁</Txt></View>
            <View style={styles.iconGrid}>
              <AppTile label="Weather" bg="#3b9ee8" />
              <AppTile label="Notes" bg="#2fb384" />
              <AppTile label="Photos" bg="#e8a93b" />
              <AppTile label="Music" bg="#e0574f" />
              <View ref={igIconRef} onLayout={onIgIconLayout} style={styles.appTile}>
                <Animated.View style={[styles.tileSq, igIconTileStyle, { backgroundColor: '#c23c8f' }]}>
                  <View style={styles.igGlyphOuter}><View style={styles.igGlyphInner} /></View>
                </Animated.View>
                <Txt c="#fff" size={7.5} weight="600" style={styles.tileCap}>Instagram</Txt>
              </View>
              <View ref={infIconRef} onLayout={onInfIconLayout} style={styles.appTile}>
                <Animated.View style={[styles.tileSq, infIconTileStyle, { backgroundColor: '#fff' }]}>
                  <Image source={LOGO_SOURCE} style={{ width: 26, height: 26 }} contentFit="contain" />
                </Animated.View>
                <Txt c="#fff" size={7.5} weight="600" style={styles.tileCap}>Influnet</Txt>
              </View>
              <AppTile label="Calendar" bg="#8b6ee0" />
              <AppTile label="Settings" bg="#7c8a9c" />
            </View>
          </Animated.View>

          {/* Instagram profile */}
          <Animated.View style={[StyleSheet.absoluteFill, igpStyle, { backgroundColor: c.surfaceCard }]}>
            <View style={styles.statusRow}><Txt c={c.content}>9:41</Txt><Txt c={c.content}>▮▮ ⌁</Txt></View>
            <View style={[styles.igTopBar, { borderColor: c.hairline }]}>
              <Txt c={c.content} weight="800" size={11.5}>{handle}</Txt>
              <Txt c={c.contentSoft} size={13}>☰</Txt>
            </View>
            <View style={styles.igProfRow}>
              <View style={styles.igRing}><Avatar size={46} /></View>
              <View style={styles.igStats}>
                <IgStat n="248" label="posts" c={c} />
                <IgStat n="48.2K" label="followers" c={c} />
                <IgStat n="612" label="following" c={c} />
              </View>
            </View>
            <Txt c={c.content} size={9.5} style={{ paddingHorizontal: 12, lineHeight: 14 }}>
              <Txt c={c.content} weight="800" size={10}>{name}{'\n'}</Txt>Food &amp; travel creator
            </Txt>
            <View ref={igEditRef} onLayout={onIgEditLayout} style={[styles.igEditBtn, { backgroundColor: c.surfaceMuted, borderColor: c.hairlineStrong }]}>
              <Txt c={c.content} weight="700" size={10}>Edit profile</Txt>
            </View>
            <View style={styles.igGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={[styles.igGridTile, { backgroundColor: c.hairlineStrong }]} />
              ))}
            </View>
          </Animated.View>

          {/* Instagram edit profile */}
          <Animated.View style={[StyleSheet.absoluteFill, igeStyle, { backgroundColor: c.surfaceCard }]}>
            <View style={styles.statusRow}><Txt c={c.content}>9:41</Txt><Txt c={c.content}>▮▮ ⌁</Txt></View>
            <View style={[styles.igTopBar, { borderColor: c.hairline }]}>
              <Txt c={c.contentSoft} size={13}>✕</Txt>
              <Txt c={c.content} weight="800" size={11.5}>Edit profile</Txt>
              <Animated.View ref={igDoneRef} onLayout={onIgDoneLayout} style={igDoneStyle}>
                <Txt c="#0095f6" weight="800" size={11}>Done</Txt>
              </Animated.View>
            </View>
            <View style={styles.igEditAvatarRow}>
              <Avatar size={36} />
              <Txt c="#0095f6" weight="600" size={9}>Edit picture</Txt>
            </View>
            <View style={[styles.igeRow, { borderColor: c.hairline }]}><Txt style={rowK}>Name</Txt><Txt c={c.content} size={10.5} style={{ paddingTop: 2 }}>{name}</Txt></View>
            <View style={[styles.igeRow, { borderColor: c.hairline }]}><Txt style={rowK}>Username</Txt><Txt c={c.content} size={10.5} style={{ paddingTop: 2 }}>{handle}</Txt></View>
            <Animated.View ref={bioRowRef} onLayout={onBioRowLayout} style={[styles.igeRow, bioRowStyle, { borderColor: c.hairline }]}>
              <Txt style={rowK}>Bio</Txt>
              <Txt c={c.content} size={10.5} style={{ paddingTop: 2, lineHeight: 15 }}>
                Food &amp; travel creator, Chennai
              </Txt>
              <Animated.Text style={[{ fontSize: 9.5, color: '#0095f6' }, pasteStyle]}>{displayUrl}</Animated.Text>
              <Animated.View style={[styles.caret, caretStyle, { backgroundColor: '#0095f6' }]} />
            </Animated.View>
            <View style={[styles.igeRow, { borderColor: c.hairline }]}><Txt style={rowK}>Links</Txt><Txt c="#0095f6" size={10.5} style={{ paddingTop: 2 }}>Add link</Txt></View>
          </Animated.View>
        </View>

        <Animated.View pointerEvents="none" style={[styles.ptr, ptrStyle, { backgroundColor: 'rgba(15,23,42,.4)', borderColor: 'rgba(255,255,255,.62)' }]} />
        <Animated.View pointerEvents="none" style={[styles.chip, chipStyle, { backgroundColor: c.brand }]}>
          <Txt c="#fff" size={9} weight="600" numberOfLines={1}>{displayUrl}</Txt>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── small presentational bits ─────────────────────────────────────
function Txt({ c, size = 10, weight = '400', center, numberOfLines, style, children }: {
  c?: string; size?: number; weight?: '400' | '600' | '700' | '800'; center?: boolean;
  numberOfLines?: number; style?: TextStyle | TextStyle[]; children?: ReactNode;
}) {
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[{ color: c, fontSize: size, fontWeight: weight, textAlign: center ? 'center' : undefined }, style]}
    >
      {children}
    </RNText>
  );
}

function Avatar({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="av" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#fb9ec3" /><Stop offset="52%" stopColor="#c286f0" /><Stop offset="100%" stopColor="#7c9cf5" />
        </LinearGradient>
        <ClipPath id="avc"><Circle cx="32" cy="32" r="32" /></ClipPath>
      </Defs>
      <G clipPath="url(#avc)">
        <SvgRect width="64" height="64" fill="url(#av)" />
        <Circle cx="32" cy="25" r="11.5" fill="#fff" fillOpacity={0.92} />
        <Path d="M32 39c-11 0-19.5 6.6-21.5 16.4A32 32 0 0032 64a32 32 0 0021.5-8.6C51.5 45.6 43 39 32 39z" fill="#fff" fillOpacity={0.92} />
      </G>
    </Svg>
  );
}

/**
 * The SAME mark shown everywhere else in the product — lucide's `BadgeCheck`
 * outline, filled instead of stroked for a bigger hero moment. The earlier
 * version hand-drew a 12-point rosette from straight line segments; it was
 * asymmetric and never quite read as a circle. lucide's outline is built from
 * matched-radius arcs, so it's a true circular locus with crisp scalloped
 * edges — "fully circled," reliably, at any size.
 */
function VerifiedMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill={color}
      />
      <Path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AppTile({ label, bg }: { label: string; bg: string }) {
  return (
    <View style={styles.appTile}>
      <View style={[styles.tileSq, { backgroundColor: bg }]} />
      <RNText style={{ color: '#fff', fontSize: 7.5, fontWeight: '600', textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 3 }}>{label}</RNText>
    </View>
  );
}
function IgStat({ n, label, c }: { n: string; label: string; c: { content: string; contentSoft: string } }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <RNText style={{ fontSize: 12, fontWeight: '800', color: c.content }}>{n}</RNText>
      <RNText style={{ fontSize: 8.5, color: c.contentSoft }}>{label}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches web's `h-[330px]` exactly. Do not make this height dynamic: any
  // state-driven resize re-fires every onLayout, and those re-measurements run
  // WHILE the camera transform is live, so measureInWindow returns
  // camera-warped rects that feed straight back into the camera keyframes.
  view: { height: 330, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  phone: {
    // Web is `left:50%; top:50%; transform: translate(-50%,-50%) scale(0.7)`.
    // translate(-50%,-50%) is half the element's OWN layout box (240x420), so
    // the RN equivalent is -120/-210 — not -84/-147, which is half the
    // *post-scale* size (168x294) and left the phone 36pt right and 63pt low
    // of centre, hanging off the bottom of the card. RN scales about the
    // centre, so the margins must cancel the untransformed box, not the
    // scaled one.
    position: 'absolute', width: 240, height: 420, left: '50%', top: '50%',
    marginLeft: -120, marginTop: -210, transform: [{ scale: 0.7 }],
    borderRadius: 26, borderWidth: 1, overflow: 'hidden',
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, height: 26 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 28 },
  chev: { width: 7, height: 7, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }] },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, borderWidth: 1, padding: 8, marginTop: 4 },
  linkCard: { borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 8 },
  codeBox: { borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 8, paddingHorizontal: 6, marginTop: 6 },
  miniBtn: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  doneWrap: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  ring: { borderRadius: 999, borderWidth: 2 },
  discCenter: { alignItems: 'center', justifyContent: 'center' },
  iconGrid: { position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  appTile: { width: '21%', alignItems: 'center', gap: 4 },
  tileSq: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileCap: { textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 3 },
  igGlyphOuter: { width: 19, height: 19, borderRadius: 6, borderWidth: 2.2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  igGlyphInner: { width: 8, height: 8, borderRadius: 999, borderWidth: 2.2, borderColor: '#fff' },
  igTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30, paddingHorizontal: 12, borderBottomWidth: 1 },
  igProfRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  igRing: { borderRadius: 999 },
  igStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  igEditBtn: { marginHorizontal: 12, height: 27, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  igGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  igGridTile: { width: '33.3%', aspectRatio: 1 },
  igeRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  igEditAvatarRow: { alignItems: 'center', gap: 3, paddingVertical: 10 },
  caret: { width: 1.4, height: 11, marginLeft: 1 },
  ptr: {
    position: 'absolute', width: 27, height: 27, borderRadius: 999, borderWidth: 1.5,
    marginLeft: 0, marginTop: 0, zIndex: 40,
  },
  chip: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, zIndex: 45, maxWidth: 160 },
});
