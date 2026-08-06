"use client";

/**
 * Silent, looping walkthrough of Instagram ownership verification.
 *
 * Copy your profile link → home screen → open Instagram → Edit profile → paste
 * into the bio → back to Influnet → Verify → verified. No captions inside the
 * frame; the interface does the explaining, and one line underneath names the
 * current step.
 *
 * DESIGN NOTES worth keeping:
 *
 *  - The whole animation is ONE number (`t`, ms into the loop). Every position,
 *    opacity and camera move is derived from it. That is deliberate: it is the
 *    model Reanimated uses, so apps/mobile can mirror this file rather than
 *    reimplement it.
 *
 *  - The camera focuses MEASURED element rects, not hand-tuned coordinates. It
 *    reads the real layout via getBoundingClientRect with the camera at
 *    identity, caches that, and re-measures on resize. Hand-tuned numbers were
 *    wrong at every size that wasn't the one they were tuned at.
 *
 *  - The pointer lives INSIDE the camera rig so it tracks whatever it is
 *    pointing at, and is counter-scaled so a 2.6x zoom doesn't inflate it.
 *
 * Nothing here is React-state-per-frame: the rAF loop writes styles directly on
 * refs. Sixty setState calls a second would re-render the dashboard behind it.
 */

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";

const TOTAL = 19_000;

/** Ten beats, in ms. Exported so the modal can label the current step. */
export const GUIDE_STEPS: { t: number; label: string }[] = [
  { t: 0, label: "Copy your profile link" },
  { t: 2700, label: "Open Instagram" },
  { t: 4600, label: "Go to your profile, then Edit profile" },
  { t: 6100, label: "Paste the link into Links, then Done" },
  { t: 9500, label: "Return to Influnet and tap Verify" },
  { t: 13_100, label: "Verified — leave the link there" },
];

// NOTE: the captions above now teach the LINKS field, because a link in the
// bio text is not tappable on Instagram and so does the creator no good. The
// simulated screen below still animates its camera to the `bioRow` element —
// deliberately, for now: retargeting the choreography to the links row is
// storyboard work that was scoped out of the copy change. The verification
// itself reads the links field (see profileLinksToUsername), so this is a
// cosmetic mismatch to close later, not a behavioural bug.

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeBack = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

function lerp(t: number, t0: number, t1: number, a: number, b: number, ease = easeInOut) {
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + (b - a) * ease((t - t0) / (t1 - t0));
}
/** 0 outside the window, 1 inside, eased on both edges. */
function win(t: number, a: number, b: number, c: number, d: number) {
  if (t < a) return 0;
  if (t < b) return easeOut((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOut((t - c) / (d - c));
  return 0;
}

interface Rect { x: number; y: number; w: number; h: number }
interface Cam { s: number; x: number; y: number }

export interface VerifyGuideAnimationProps {
  /** Display form of the creator's public link, e.g. "influnet.in/c/priya". */
  displayUrl: string;
  /** Instagram handle, without the @. */
  handle: string;
  /** Full name shown on the mock profile rows. */
  name: string;
  playing?: boolean;
  /** 1 = real time. 0.5 reads more clearly on first watch. */
  speed?: number;
  /** Fired when the loop crosses into a new step, so the caption can follow. */
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
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);

  const R = useRef<Record<string, Rect | null>>({});
  const VIEW = useRef({ w: 320, h: 300 });
  const CAM = useRef<[number, Cam][]>([]);
  const now = useRef(0);
  const stepRef = useRef(-1);
  const playRef = useRef(playing);
  const speedRef = useRef(speed);

  useEffect(() => { playRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const q = useCallback((id: string) => root.current?.querySelector<HTMLElement>(`[data-el="${id}"]`) ?? null, []);

  /** Measure every target with the camera at identity, in the view's local space. */
  const measure = useCallback(() => {
    const v = view.current, c = cam.current;
    if (!v || !c) return;
    const prev = c.style.transform;
    c.style.transform = "none";
    const vb = v.getBoundingClientRect();
    VIEW.current = { w: vb.width, h: vb.height };

    // Screens must be laid out to be measurable; force them visible, then restore.
    const ids = ["sInf", "sHome", "sIgP", "sIgE"];
    const saved = ids.map((id) => [id, q(id)?.style.opacity ?? ""] as const);
    ids.forEach((id) => { const n = q(id); if (n) n.style.opacity = "1"; });

    const rect = (id: string): Rect | null => {
      const n = q(id);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.left - vb.left, y: r.top - vb.top, w: r.width, h: r.height };
    };
    R.current = {
      copy: rect("copyBtn"), verify: rect("verifyBtn"), linkCard: rect("linkCard"),
      igIcon: rect("igIcon"), infIcon: rect("infIcon"), igEdit: rect("igEdit"),
      bioRow: rect("bioRow"), igDone: rect("igDone"), phone: rect("phone"),
    };

    saved.forEach(([id, o]) => { const n = q(id); if (n) n.style.opacity = o; });
    c.style.transform = prev;

    // Rebuild the keyframes against the fresh measurements.
    const V = VIEW.current;
    const camFor = (r: Rect | null, pad: number, maxZoom: number, bounds: Rect | null): Cam => {
      if (!r) return { s: 1, x: 0, y: 0 };
      const s = Math.max(1, Math.min(maxZoom, Math.min(V.w / (r.w + pad * 2), V.h / (r.h + pad * 2))));
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      let x = V.w / 2 - cx * s, y = V.h / 2 - cy * s;
      const b = bounds ?? { x: 0, y: 0, w: V.w, h: V.h };
      // Clamp against the DEVICE, not the viewport — otherwise a zoom drags
      // empty card background into shot beside a phone narrower than the card.
      x = b.w * s >= V.w ? Math.min(-b.x * s, Math.max(V.w - (b.x + b.w) * s, x)) : V.w / 2 - (b.x + b.w / 2) * s;
      y = b.h * s >= V.h ? Math.min(-b.y * s, Math.max(V.h - (b.y + b.h) * s, y)) : V.h / 2 - (b.y + b.h / 2) * s;
      return { s, x, y };
    };
    const P = R.current.phone;
    const WIDE = camFor(P, 8, 2.4, P);
    CAM.current = [
      [0, WIDE],
      [900, camFor(R.current.linkCard, 12, 2.0, P)],
      [2400, camFor(R.current.linkCard, 12, 2.0, P)],
      [2900, WIDE],
      [3300, camFor(R.current.igIcon, 30, 2.6, P)],
      [4150, camFor(R.current.igIcon, 30, 2.6, P)],
      [4600, WIDE],
      [5100, camFor(R.current.igEdit, 26, 2.4, P)],
      [5900, camFor(R.current.igEdit, 26, 2.4, P)],
      [6300, camFor(R.current.bioRow, 20, 2.4, P)],
      [8500, camFor(R.current.bioRow, 20, 2.4, P)],
      [8800, camFor(R.current.igDone, 36, 2.2, P)],
      [9300, WIDE],
      [9900, camFor(R.current.infIcon, 30, 2.6, P)],
      [10_700, camFor(R.current.infIcon, 30, 2.6, P)],
      [11_100, camFor(R.current.verify, 24, 2.0, P)],
      [12_800, camFor(R.current.verify, 24, 2.0, P)],
      [13_200, WIDE],
      [TOTAL, WIDE],
    ];
  }, [q]);

  const render = useCallback((t: number) => {
    const keys = CAM.current;
    if (!keys.length) return;

    // camera
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const span = b[0] - a[0];
    const p = span <= 0 ? 1 : easeInOut(clamp01((t - a[0]) / span));
    const c: Cam = {
      s: a[1].s + (b[1].s - a[1].s) * p,
      x: a[1].x + (b[1].x - a[1].x) * p,
      y: a[1].y + (b[1].y - a[1].y) * p,
    };
    if (cam.current) cam.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;

    const set = (id: string, prop: string, val: string) => {
      const n = q(id);
      if (n) n.style.setProperty(prop, val);
    };

    // which screen is on
    const infOn = win(t, 0, 0, 2600, 2900) + win(t, 10_600, 10_900, 18_400, 18_900);
    const homeOn = win(t, 2600, 2900, 3950, 4150) + win(t, 9300, 9600, 10_500, 10_700);
    const igpOn = win(t, 4150, 4400, 5700, 5900);
    const igeOn = win(t, 5900, 6100, 9100, 9300);
    set("sInf", "opacity", String(clamp01(infOn)));
    set("sHome", "opacity", String(clamp01(homeOn)));
    set("sIgP", "opacity", String(clamp01(igpOn)));
    set("sIgE", "opacity", String(clamp01(igeOn)));

    // the tapped icon expands into the app
    const openIg = clamp01((t - 3950) / 200);
    set("sIgP", "transform", openIg > 0 && openIg < 1 ? `scale(${0.55 + openIg * 0.45})` : "none");

    // pointer — targets are measured rect centres
    const V = VIEW.current;
    const off = { x: V.w * 0.9, y: V.h + 60 };
    const ctr = (r: Rect | null) => (r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : off);
    const T = {
      copy: ctr(R.current.copy), igIcon: ctr(R.current.igIcon), igEdit: ctr(R.current.igEdit),
      bio: ctr(R.current.bioRow), done: ctr(R.current.igDone),
      infIcon: ctr(R.current.infIcon), verify: ctr(R.current.verify),
    };
    const seg = (t0: number, t1: number, f: { x: number; y: number }, to: { x: number; y: number }) => ({
      x: lerp(t, t0, t1, f.x, to.x), y: lerp(t, t0, t1, f.y, to.y),
    });
    let pt = off;
    if (t < 1500) pt = seg(600, 1500, off, T.copy);
    else if (t < 2350) pt = T.copy;
    else if (t < 2700) pt = seg(2350, 2700, T.copy, off);
    else if (t < 3750) pt = seg(3150, 3750, off, T.igIcon);
    else if (t < 3950) pt = T.igIcon;
    else if (t < 4400) pt = off;
    else if (t < 5300) pt = seg(4700, 5300, off, T.igEdit);
    else if (t < 5700) pt = T.igEdit;
    else if (t < 6100) pt = off;
    else if (t < 6800) pt = seg(6300, 6800, off, T.bio);
    else if (t < 8500) pt = T.bio;
    else if (t < 8900) pt = seg(8500, 8900, T.bio, T.done);
    else if (t < 9150) pt = T.done;
    else if (t < 9600) pt = seg(9150, 9600, T.done, off);
    else if (t < 10_350) pt = seg(9800, 10_350, off, T.infIcon);
    else if (t < 10_550) pt = T.infIcon;
    else if (t < 11_200) pt = off;
    else if (t < 12_000) pt = seg(11_300, 12_000, off, T.verify);
    else if (t < 12_350) pt = T.verify;
    else pt = seg(12_350, 12_800, T.verify, off);

    const PRESS: [number, number][] = [
      [1500, 1760], [3750, 3950], [5300, 5540], [6800, 7040], [8900, 9140], [12_000, 12_250],
    ];
    let press = 0, ringP = -1;
    for (const [s0, s1] of PRESS) {
      if (t >= s0 && t <= s1 + 340) {
        if (t <= s1) press = Math.sin(((t - s0) / (s1 - s0)) * Math.PI);
        ringP = clamp01((t - s0) / 500);
      }
    }
    const inv = 1 / c.s; // counter-scale: the finger must not grow with the zoom
    set("ptr", "transform", `translate(${pt.x}px, ${pt.y}px) scale(${(1 - press * 0.22) * inv})`);
    set("ptr", "opacity", t > 12_800 || pt === off ? "0" : "1");
    if (ringP >= 0 && ringP < 1) {
      set("ptrRing", "transform", `translate(${pt.x}px, ${pt.y}px) scale(${(1 + ringP * 1.9) * inv})`);
      set("ptrRing", "opacity", String((1 - ringP) * 0.7));
    } else set("ptrRing", "opacity", "0");

    // control states
    const copied = t >= 1700 && t < 2700;
    const copyLabel = q("copyLabel");
    if (copyLabel) copyLabel.textContent = copied ? "Copied ✓" : "Copy link";
    set("copyBtn", "color", copied ? "var(--ok)" : "");
    set("copyBtn", "border-color", copied ? "var(--ok)" : "");
    set("copyBtn", "transform", `scale(${1 - (t >= 1500 && t <= 1760 ? 0.05 : 0)})`);
    set("igEdit", "transform", `scale(${1 - (t >= 5300 && t <= 5540 ? 0.04 : 0)})`);
    set("igDone", "opacity", t >= 8900 && t <= 9140 ? "0.4" : "1");
    set("igIconTile", "transform", `scale(${1 - (t >= 3750 && t <= 3950 ? 0.1 : 0)})`);
    set("infIconTile", "transform", `scale(${1 - (t >= 10_350 && t <= 10_550 ? 0.1 : 0)})`);

    // the link flies out of the card toward the status bar
    const chipA = win(t, 1680, 1800, 2200, 2420);
    set("chip", "opacity", String(chipA));
    if (chipA > 0 && R.current.copy) {
      const from = R.current.copy.y;
      const to = (R.current.phone?.y ?? 0) + 14;
      set("chip", "transform",
        `translate(${R.current.copy.x + R.current.copy.w / 2}px, ${lerp(t, 1720, 2420, from, to)}px) scale(${inv * 0.9})`);
    }

    // bio focus → caret → paste
    const focused = t >= 7040 && t < 9140;
    set("bioRow", "background", focused ? "color-mix(in srgb, var(--ig-blue, #0095f6) 9%, transparent)" : "");
    set("caret", "opacity", focused && t < 8900 && Math.floor(t / 460) % 2 === 0 ? "1" : "0");
    const paste = q("paste");
    if (paste) {
      if (t >= 7500 && t < 9600) {
        const s = lerp(t, 7500, 7800, 0, 1, easeOut);
        paste.style.opacity = String(s);
        paste.style.transform = `translateY(${(1 - s) * -4}px)`;
        paste.style.display = "";
      } else if (t >= 9600) {
        paste.style.opacity = "1"; paste.style.transform = "none"; paste.style.display = "";
      } else {
        paste.style.display = "none";
      }
    }

    // verify → ~1s spinner → verified
    const checking = t >= 12_250 && t < 13_100;
    const vLabel = q("verifyLabel");
    if (vLabel) vLabel.textContent = checking ? "Checking your profile…" : "I've added the link";
    set("verifyBtn", "opacity", checking ? "0.85" : "1");
    set("verifyBtn", "transform", `scale(${1 - (t >= 12_000 && t <= 12_250 ? 0.05 : 0)})`);

    const doneA = win(t, 13_100, 13_450, 18_400, 18_800);
    set("done", "opacity", String(doneA));
    const pop = lerp(t, 13_200, 13_850, 0, 1, easeBack);
    set("disc", "transform", `scale(${0.35 + pop * 0.65})`);
    set("disc", "opacity", String(clamp01(pop * 1.5)));
    ([["ring1", 13_500], ["ring2", 13_950]] as const).forEach(([id, delay]) => {
      const r = clamp01((t - delay) / 1350);
      set(id, "transform", `scale(${1 + r * 1.15})`);
      set(id, "opacity", String(r > 0 && r < 1 ? (1 - r) * 0.5 : 0));
    });

    // step callback
    let idx = 0;
    for (let i = 0; i < GUIDE_STEPS.length; i++) if (t >= GUIDE_STEPS[i].t) idx = i;
    if (idx !== stepRef.current) { stepRef.current = idx; onStep?.(idx); }
  }, [onStep, q]);

  useEffect(() => {
    measure();
    render(0);
    let raf = 0;
    let last: number | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = (ts: number) => {
      if (last === null) last = ts;
      const dt = Math.min(ts - last, 60);
      last = ts;
      if (playRef.current && !reduced) {
        now.current = (now.current + dt * speedRef.current) % TOTAL;
        render(now.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // The card's real size isn't known until layout settles (fonts, flex, the
    // modal opening). Measuring only once froze the camera at the wrong zoom.
    let pending = false;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; measure(); render(now.current); });
    });
    if (view.current) ro.observe(view.current);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [measure, render]);

  // ── mock content ───────────────────────────────────────────────
  const ptr = "absolute z-40 -ml-[13.5px] -mt-[13.5px] size-[27px] rounded-full pointer-events-none";
  const rowK = "text-[8px] font-bold uppercase tracking-[0.07em] text-content-muted";

  return (
    <div ref={root} className="relative">
      <div
        ref={view}
        className="relative h-[330px] overflow-hidden rounded-xl border border-hairline"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, var(--surface-muted), color-mix(in srgb, var(--brand) 7%, var(--surface-muted)))" }}
      >
        <div ref={cam} className="absolute inset-0 origin-top-left will-change-transform">
          {/* mini phone */}
          <div
            ref={phone}
            data-el="phone"
            className="absolute h-[420px] w-[240px] overflow-hidden rounded-[26px] border border-hairline-strong bg-surface shadow-lg"
            style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%) scale(0.7)" }}
          >
            {/* ── Influnet ── */}
            <div data-el="sInf" className="absolute inset-0 bg-surface">
              <div className="flex h-[26px] items-center justify-between px-3 pt-1.5 text-[9px] font-semibold text-content opacity-80">
                <span>9:41</span><span>▮▮ ⌁</span>
              </div>
              <div className="px-3">
                <div className="flex h-7 items-center gap-1.5 text-[12px] font-bold text-content">
                  <span className="size-[7px] rotate-45 border-b-2 border-l-2 border-content-soft" />
                  Verify your Instagram
                </div>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-surface-card p-2">
                  <Avatar size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-bold text-content">{name}</span>
                    <span className="block truncate text-[8.5px] text-content-muted">@{handle}</span>
                  </span>
                </div>

                <div data-el="linkCard" className="mt-2 rounded-xl border border-hairline bg-surface-card p-2.5">
                  <div className={rowK}>Your profile link</div>
                  <div className="mt-1.5 break-all rounded-lg border border-dashed border-hairline-strong bg-surface-muted px-1.5 py-2 text-center font-mono text-[9.5px] font-semibold text-content">
                    {displayUrl}
                  </div>
                  <div
                    data-el="copyBtn"
                    className="mt-2 flex h-[30px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-[10.5px] font-bold text-content"
                  >
                    <span data-el="copyLabel">Copy link</span>
                  </div>
                </div>

                <div data-el="verifyBtn" className="mt-2.5 flex h-[30px] items-center justify-center rounded-lg bg-brand text-[10.5px] font-bold text-white">
                  <span data-el="verifyLabel">I&apos;ve added the link</span>
                </div>
              </div>

              <div data-el="done" className="absolute inset-0 flex flex-col items-center justify-center bg-surface p-4 opacity-0">
                <div className="relative size-[92px]">
                  <span data-el="ring1" className="absolute inset-0 rounded-full border-2" style={{ borderColor: "var(--verified, #ff0b8d)" }} />
                  <span data-el="ring2" className="absolute inset-0 rounded-full border-2" style={{ borderColor: "var(--verified, #ff0b8d)" }} />
                  <span data-el="disc" className="absolute inset-0 flex items-center justify-center"><VerifiedMark size={92} /></span>
                </div>
                <div className="mt-3.5 text-[15px] font-extrabold text-content">Verified</div>
                <div className="mt-1 text-center text-[10px] leading-relaxed text-content-soft">
                  @{handle} is confirmed as yours.<br />Keep the link in your links.
                </div>
              </div>
            </div>

            {/* ── home screen ── */}
            <div data-el="sHome" className="absolute inset-0 opacity-0">
              <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#6d5bd0,#b06ab3 55%,#e88b6a)" }} />
              <div className="relative flex h-[26px] items-center justify-between px-3 pt-1.5 text-[9px] font-semibold text-white/95">
                <span>9:41</span><span>▮▮ ⌁</span>
              </div>
              <div className="absolute left-4 right-4 top-11 grid grid-cols-4 gap-x-3 gap-y-4">
                <AppIcon label="Weather" bg="linear-gradient(150deg,#5ac8fa,#007aff)" />
                <AppIcon label="Notes" bg="linear-gradient(150deg,#34d399,#059669)" />
                <AppIcon label="Photos" bg="linear-gradient(150deg,#fbbf24,#f59e0b)" />
                <AppIcon label="Music" bg="linear-gradient(150deg,#f87171,#dc2626)" />
                <span data-el="igIcon" className="flex flex-col items-center gap-1">
                  <span
                    data-el="igIconTile"
                    className="flex size-10 items-center justify-center rounded-[11px] shadow-md"
                    style={{ background: "conic-gradient(from 210deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)" }}
                  >
                    <span className="relative block size-[19px] rounded-md border-[2.2px] border-white">
                      <span className="absolute inset-[3.5px] block rounded-full border-[2.2px] border-white" />
                    </span>
                  </span>
                  <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">Instagram</span>
                </span>
                <span data-el="infIcon" className="flex flex-col items-center gap-1">
                  {/* The real app icon: the Influnet mark on white, not a letter tile. */}
                  <span data-el="infIconTile" className="flex size-10 items-center justify-center rounded-[11px] bg-white shadow-md">
                    <Image src="/influet_logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
                  </span>
                  <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">Influnet</span>
                </span>
                <AppIcon label="Calendar" bg="linear-gradient(150deg,#a78bfa,#7c3aed)" />
                <AppIcon label="Settings" bg="linear-gradient(150deg,#94a3b8,#475569)" />
              </div>
            </div>

            {/* ── Instagram profile ── */}
            <div data-el="sIgP" className="absolute inset-0 bg-surface-card opacity-0">
              <div className="flex h-[26px] items-center justify-between px-3 pt-1.5 text-[9px] font-semibold text-content opacity-80">
                <span>9:41</span><span>▮▮ ⌁</span>
              </div>
              <div className="flex h-[30px] items-center justify-between border-b border-hairline px-3">
                <span className="text-[11.5px] font-extrabold text-content">{handle}</span>
                <span className="text-[13px] text-content-soft">☰</span>
              </div>
              <div className="flex items-center gap-3.5 px-3 pb-2 pt-3">
                <span className="rounded-full p-0.5" style={{ background: "conic-gradient(from 210deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)" }}>
                  <span className="block rounded-full border-2 border-surface-card"><Avatar size={46} /></span>
                </span>
                <span className="flex flex-1 justify-around text-center">
                  <span><b className="block text-[12px] font-extrabold text-content">248</b><span className="text-[8.5px] text-content-soft">posts</span></span>
                  <span><b className="block text-[12px] font-extrabold text-content">48.2K</b><span className="text-[8.5px] text-content-soft">followers</span></span>
                  <span><b className="block text-[12px] font-extrabold text-content">612</b><span className="text-[8.5px] text-content-soft">following</span></span>
                </span>
              </div>
              <div className="px-3 pb-2 text-[9.5px] leading-relaxed text-content">
                <span className="block text-[10px] font-extrabold">{name}</span>Food &amp; travel creator
              </div>
              <div data-el="igEdit" className="mx-3 flex h-[27px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-muted text-[10px] font-bold text-content">
                Edit profile
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="block aspect-square" style={{ background: "linear-gradient(150deg,var(--hairline-strong),var(--surface-muted))" }} />
                ))}
              </div>
            </div>

            {/* ── Instagram edit profile ── */}
            <div data-el="sIgE" className="absolute inset-0 bg-surface-card opacity-0">
              <div className="flex h-[26px] items-center justify-between px-3 pt-1.5 text-[9px] font-semibold text-content opacity-80">
                <span>9:41</span><span>▮▮ ⌁</span>
              </div>
              <div className="flex h-[30px] items-center justify-between border-b border-hairline px-3">
                <span className="text-[13px] text-content-soft">✕</span>
                <span className="text-[11.5px] font-extrabold text-content">Edit profile</span>
                <span data-el="igDone" className="text-[11px] font-extrabold" style={{ color: "#0095f6" }}>Done</span>
              </div>
              <div className="flex flex-col items-center gap-1 py-2.5">
                <Avatar size={36} />
                <span className="text-[9px] font-semibold" style={{ color: "#0095f6" }}>Edit picture</span>
              </div>
              <div className="border-b border-hairline px-3 py-2"><div className={rowK}>Name</div><div className="pt-0.5 text-[10.5px] text-content">{name}</div></div>
              <div className="border-b border-hairline px-3 py-2"><div className={rowK}>Username</div><div className="pt-0.5 text-[10.5px] text-content">{handle}</div></div>
              <div data-el="bioRow" className="border-b border-hairline px-3 py-2">
                <div className={rowK}>Bio</div>
                <div className="break-all pt-0.5 text-[10.5px] leading-relaxed text-content">
                  Food &amp; travel creator, Chennai
                  <span data-el="paste" className="block font-mono text-[9.5px]" style={{ color: "#0095f6", display: "none" }}>{displayUrl}</span>
                  <span data-el="caret" className="ml-px inline-block h-[11px] w-px align-[-2px] opacity-0" style={{ background: "#0095f6" }} />
                </div>
              </div>
              <div className="border-b border-hairline px-3 py-2"><div className={rowK}>Links</div><div className="pt-0.5 text-[10.5px]" style={{ color: "#0095f6" }}>Add link</div></div>
            </div>
          </div>

          <span data-el="ptrRing" className={`${ptr} border-2 opacity-0`} style={{ borderColor: "var(--brand)", zIndex: 39 }} />
          <span
            data-el="ptr"
            className={ptr}
            style={{
              background: "radial-gradient(circle at 34% 30%, rgba(15,23,42,.46), rgba(15,23,42,.3))",
              border: "1.5px solid rgba(255,255,255,.62)",
              boxShadow: "0 4px 14px rgba(0,0,0,.3)",
            }}
          />
          <span
            data-el="chip"
            className="pointer-events-none absolute z-[45] -ml-[46px] -mt-[10px] whitespace-nowrap rounded-md bg-brand px-2 py-1 font-mono text-[9px] font-semibold text-white opacity-0"
          >
            {displayUrl}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Default profile image — a designed avatar, never an empty grey disc. */
function Avatar({ size }: { size: number }) {
  const id = `vg-av-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="block shrink-0 rounded-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb9ec3" /><stop offset="52%" stopColor="#c286f0" /><stop offset="100%" stopColor="#7c9cf5" />
        </linearGradient>
        <clipPath id={`${id}-c`}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect width="64" height="64" fill={`url(#${id})`} />
        <circle cx="32" cy="25" r="11.5" fill="#fff" fillOpacity=".92" />
        <path d="M32 39c-11 0-19.5 6.6-21.5 16.4A32 32 0 0032 64a32 32 0 0021.5-8.6C51.5 45.6 43 39 32 39z" fill="#fff" fillOpacity=".92" />
      </g>
    </svg>
  );
}

/**
 * The SAME mark shown everywhere else in the product — lucide's `BadgeCheck`
 * outline (components/ui/verified-badge.tsx), filled instead of stroked for a
 * bigger hero moment. An earlier version hand-drew a 12-point rosette from
 * straight line segments; it was asymmetric and never quite read as a circle.
 * lucide's outline is built from matched-radius arcs, so it's a true circular
 * locus with crisp scalloped edges — "fully circled," reliably, at any size.
 */
function VerifiedMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="block">
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="var(--verified, #ff0b8d)"
      />
      <path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppIcon({ label, bg }: { label: string; bg: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="size-10 rounded-[11px] shadow-md" style={{ background: bg }} />
      <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">{label}</span>
    </span>
  );
}
