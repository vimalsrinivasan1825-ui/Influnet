"use client";

/**
 * The guide player — one engine, every walkthrough.
 *
 * Generalised from the original `verify-guide-animation.tsx`: same ideas, now
 * data-driven. It takes a `GuideScript` (a flat list of beats from
 * `@influnet/core`), mounts the mock screens the script uses inside a stylised
 * phone, and derives every camera move, finger tap and cross-fade from one
 * number `t` (ms into the loop).
 *
 * DESIGN NOTES worth keeping (inherited, still true):
 *
 *  - Everything is a function of `t`. The rAF loop writes styles directly on
 *    refs; nothing calls setState per frame, or the dashboard behind it would
 *    re-render 60×/s.
 *  - The camera frames MEASURED element rects, never hand-tuned coordinates.
 *    Targets are measured with the camera at identity, cached, re-measured on
 *    resize. The mobile mirror does the same with measureInWindow.
 *  - The pointer lives inside the camera rig and is counter-scaled, so a 2.5×
 *    zoom doesn't inflate the finger.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildCameraKeys,
  captionSteps,
  sampleCamera,
  screenOpacityAt,
  screensOf,
  pointerAt,
  typedTextAt,
  flaggedTargetAt,
  celebrateAt,
  stepIndexAt,
  timeline,
  type CamKey,
  type GuideScript,
  type Rect,
} from "@influnet/core";
import { SCREENS, type GuideContext } from "./screens";

export interface GuidePlayerProps {
  script: GuideScript;
  context: GuideContext;
  playing?: boolean;
  /** 1 = real time. 0.7 reads more clearly on first watch. */
  speed?: number;
  /** Fired when the loop crosses into a new caption step. */
  onStep?: (index: number) => void;
  /** Height of the stage. Phone is scaled to fit. */
  height?: number;
}

const PHONE_W = 240;
const PHONE_H = 420;
const PHONE_SCALE = 0.7;

export function GuidePlayer({
  script,
  context,
  playing = true,
  speed = 0.75,
  onStep,
  height = 340,
}: GuidePlayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);

  const RECTS = useRef<Record<string, Rect | null>>({});
  const VIEW = useRef({ w: 320, h: height });
  const KEYS = useRef<CamKey[]>([]);
  const now = useRef(0);
  const stepRef = useRef(-1);
  const playRef = useRef(playing);
  const speedRef = useRef(speed);

  // Stable per script — these feed effect/callback dep arrays, so a fresh array
  // each render would thrash the rAF loop (and keep resetting `now` to 0).
  const total = useMemo(() => timeline(script).total, [script]);
  const steps = useMemo(() => captionSteps(script), [script]);
  const screens = useMemo(() => screensOf(script), [script]);

  useEffect(() => {
    playRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  /** Measure every tagged target with the camera at identity. */
  const measure = useCallback(() => {
    const v = view.current;
    const c = cam.current;
    if (!v || !c) return;
    const prevT = c.style.transform;
    c.style.transform = "none";

    const vb = v.getBoundingClientRect();
    VIEW.current = { w: vb.width, h: vb.height };

    // Force every mounted screen visible so its children have layout, then restore.
    const wraps = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-screen]") ?? []);
    const saved = wraps.map((w) => [w, w.style.opacity] as const);
    wraps.forEach((w) => (w.style.opacity = "1"));

    const rect = (el: HTMLElement | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - vb.left, y: r.top - vb.top, w: r.width, h: r.height };
    };

    const out: Record<string, Rect | null> = {};
    root.current?.querySelectorAll<HTMLElement>("[data-el]").forEach((el) => {
      const id = el.getAttribute("data-el");
      if (id) out[id] = rect(el);
    });
    out.__phone = rect(phone.current);
    RECTS.current = out;

    saved.forEach(([w, o]) => (w.style.opacity = o));
    c.style.transform = prevT;

    KEYS.current = buildCameraKeys(script, RECTS.current, VIEW.current, RECTS.current.__phone ?? null);
  }, [script]);

  const render = useCallback(
    (t: number) => {
      const keys = KEYS.current;
      if (!keys.length) return;
      const V = VIEW.current;

      // camera
      const c = sampleCamera(keys, t);
      if (cam.current) cam.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
      const inv = 1 / c.s;

      // screens
      for (const s of screens) {
        const el = root.current?.querySelector<HTMLElement>(`[data-screen="${s}"]`);
        if (el) el.style.opacity = String(screenOpacityAt(script, s, t));
      }

      // typed fields
      const typed = typedTextAt(script, t);
      root.current?.querySelectorAll<HTMLElement>("[data-fill]").forEach((el) => {
        const id = el.getAttribute("data-fill");
        if (id && id in typed) el.textContent = typed[id];
      });

      // flag (a "look here" tint on the focused target)
      const flag = flaggedTargetAt(script, t);
      root.current?.querySelectorAll<HTMLElement>("[data-el]").forEach((el) => {
        const on = !!flag && el.getAttribute("data-el") === flag;
        el.style.boxShadow = on
          ? "0 0 0 2px var(--brand), 0 6px 20px -6px var(--brand-ring)"
          : "";
        el.style.borderRadius = on ? "10px" : "";
      });

      // pointer
      const p = pointerAt(script, RECTS.current, V, t);
      const setStyle = (id: string, css: Partial<CSSStyleDeclaration>) => {
        const el = root.current?.querySelector<HTMLElement>(`[data-layer="${id}"]`);
        if (el) Object.assign(el.style, css);
      };
      setStyle("ptr", {
        transform: `translate(${p.x}px, ${p.y}px) scale(${(1 - p.press * 0.22) * inv})`,
        opacity: p.visible ? "1" : "0",
      });
      if (p.ring >= 0 && p.ring < 1) {
        setStyle("ring", {
          transform: `translate(${p.x}px, ${p.y}px) scale(${(1 + p.ring * 1.9) * inv})`,
          opacity: String((1 - p.ring) * 0.7),
        });
      } else {
        setStyle("ring", { opacity: "0" });
      }

      // celebration
      const cel = celebrateAt(script, t);
      setStyle("celebrate", { opacity: String(cel) });
      const disc = root.current?.querySelector<HTMLElement>('[data-layer="celebrate-disc"]');
      if (disc) disc.style.transform = `scale(${0.4 + cel * 0.6})`;

      // step callback
      const idx = stepIndexAt(steps, t);
      if (idx !== stepRef.current) {
        stepRef.current = idx;
        onStep?.(idx);
      }
    },
    [script, screens, steps, onStep],
  );

  useEffect(() => {
    // Reset when the script changes.
    now.current = 0;
    stepRef.current = -1;
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
        now.current = (now.current + dt * speedRef.current) % total;
        render(now.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let pending = false;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        measure();
        render(now.current);
      });
    });
    if (view.current) ro.observe(view.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure, render, total]);

  const layer = "absolute z-40 -ml-[13.5px] -mt-[13.5px] size-[27px] rounded-full pointer-events-none";

  return (
    <div ref={root} className="relative">
      <div
        ref={view}
        className="relative overflow-hidden rounded-xl border border-hairline"
        style={{
          height,
          background:
            "radial-gradient(120% 90% at 50% 0%, var(--surface-muted), color-mix(in srgb, var(--brand) 7%, var(--surface-muted)))",
        }}
      >
        <div ref={cam} className="absolute inset-0 origin-top-left will-change-transform">
          <div
            ref={phone}
            className="absolute overflow-hidden rounded-[26px] border border-hairline-strong bg-surface shadow-lg"
            style={{
              width: PHONE_W,
              height: PHONE_H,
              left: "50%",
              top: "50%",
              transform: `translate(-50%,-50%) scale(${PHONE_SCALE})`,
            }}
          >
            {screens.map((id) => {
              const Screen = SCREENS[id];
              return (
                <div
                  key={id}
                  data-screen={id}
                  className="absolute inset-0 bg-surface"
                  style={{ opacity: 0 }}
                >
                  <Screen ctx={context} />
                </div>
              );
            })}
          </div>

          {/* pointer + press ring */}
          <span
            data-layer="ring"
            className={`${layer} border-2 opacity-0`}
            style={{ borderColor: "var(--brand)", zIndex: 39 }}
          />
          <span
            data-layer="ptr"
            className={layer}
            style={{
              background: "radial-gradient(circle at 34% 30%, rgba(15,23,42,.46), rgba(15,23,42,.3))",
              border: "1.5px solid rgba(255,255,255,.62)",
              boxShadow: "0 4px 14px rgba(0,0,0,.3)",
              opacity: 0,
            }}
          />
        </div>

        {/* celebration burst — outside the camera rig so it's always centred */}
        <div
          data-layer="celebrate"
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0"
          style={{ background: "color-mix(in srgb, var(--surface) 78%, transparent)" }}
        >
          <div
            data-layer="celebrate-disc"
            className="flex size-20 items-center justify-center rounded-full"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-10">
              <path
                d="m5 13 4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
