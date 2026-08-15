'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * The reply gap.
 *
 * Two curves diverging over a fortnight of outreach: the creators a brand has
 * contacted, against the few who ever answer. The shaded area between them
 * widens every day, and that area is the pitch.
 *
 * NOTE ON THE NUMBERS: these are illustrative of the problem Influnet solves,
 * not measured from our own data. Before this page goes public, either back
 * them with a citation or relabel the panel as an example.
 */

/** Creators contacted, cumulative, out of a 100-name list. */
const CONTACTED = [0, 14, 27, 39, 49, 58, 66, 73, 79, 84, 89, 93, 96, 98, 100];
/** Of those, the ones who have written back. */
const REPLIED = [0, 3, 5.5, 7.5, 9.5, 11, 12.5, 13.8, 15, 16, 17, 17.8, 18.5, 19.3, 20];

const DAYS = CONTACTED.length - 1;

const VB_W = 560;
const VB_H = 320;
const PAD = { top: 26, right: 22, bottom: 42, left: 44 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

const xAt = (day: number) => PAD.left + (day / DAYS) * PLOT_W;
const yAt = (n: number) => PAD.top + (1 - n / 100) * PLOT_H;

type Pt = readonly [number, number];

/** Smooth cubic through points, with horizontal control handles (no overshoot). */
function smooth(pts: Pt[], startCommand: 'M' | 'L' = 'M'): string {
  let d = `${startCommand} ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

const toPts = (values: number[]): Pt[] => values.map((v, i) => [xAt(i), yAt(v)] as const);

export default function ReplyGapChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const contactedPath = useMemo(() => smooth(toPts(CONTACTED)), []);
  const repliedPath = useMemo(() => smooth(toPts(REPLIED)), []);

  /** Out along the contacted curve, back along the replied curve. */
  const areaPath = useMemo(() => {
    const back = smooth([...toPts(REPLIED)].reverse(), 'L');
    return `${contactedPath} ${back} Z`;
  }, [contactedPath]);

  const day = active ?? DAYS;
  const contacted = CONTACTED[day];
  const replied = REPLIED[day];
  const silent = contacted - replied;
  const fmt = (n: number) => (n % 1 ? n.toFixed(1) : String(n));

  function dayFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const xInVb = ((clientX - r.left) / r.width) * VB_W;
    const t = (xInVb - PAD.left) / PLOT_W;
    return Math.max(0, Math.min(DAYS, Math.round(t * DAYS)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (active ?? DAYS) + (e.key === 'ArrowRight' ? 1 : -1);
      setActive(Math.max(0, Math.min(DAYS, next)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  }

  return (
    <figure className="m-0 w-full">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(23,20,29,0.04),0_18px_44px_-26px_rgba(23,20,29,0.25)] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">A fortnight of outreach</div>
            <div className="mt-1 text-[0.95rem] font-semibold tracking-tight text-[var(--ink)]">
              100 creators contacted. 20 ever answer.
            </div>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-1.5 pt-0.5 sm:flex">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              <span className="h-0 w-4 border-t-2 border-dashed border-[var(--ink)]" />
              Contacted
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              <span className="h-0.5 w-4 rounded-full bg-[var(--magenta)]" />
              Replied
            </span>
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full cursor-crosshair touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--magenta)] focus-visible:ring-offset-2"
          role="img"
          tabIndex={0}
          aria-label={`Over ${DAYS} days, 100 creators are contacted and only ${REPLIED[DAYS]} reply. Use the arrow keys to read individual days.`}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => {
            const d = dayFromClientX(e.clientX);
            if (d !== null) setActive(d);
          }}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id="reply-gap-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--magenta)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--magenta)" stopOpacity="0.02" />
            </linearGradient>
            <clipPath id="reply-gap-wipe">
              <rect x="0" y="0" width={VB_W} height={VB_H} className="chart-wipe" />
            </clipPath>
          </defs>

          {[0, 25, 50, 75, 100].map((n) => (
            <g key={n}>
              <line
                x1={PAD.left}
                y1={yAt(n)}
                x2={VB_W - PAD.right}
                y2={yAt(n)}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 9}
                y={yAt(n) + 3.5}
                textAnchor="end"
                fill="var(--muted)"
                className="font-mono"
                style={{ fontSize: 10 }}
              >
                {n}
              </text>
            </g>
          ))}

          <g clipPath="url(#reply-gap-wipe)">
            <path d={areaPath} fill="url(#reply-gap-fill)" />
            <path
              d={contactedPath}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="1.75"
              strokeDasharray="5 4"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d={repliedPath}
              fill="none"
              stroke="var(--magenta)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>

          {/* Gap annotation — hides while the reader is scrubbing */}
          <g
            className="transition-opacity duration-200"
            style={{ opacity: active === null ? 1 : 0 }}
          >
            <text
              x={xAt(9.2)}
              y={yAt(52)}
              textAnchor="middle"
              fill="var(--magenta-deep)"
              className="font-mono"
              style={{ fontSize: 10.5, letterSpacing: '0.12em' }}
            >
              THE REPLY GAP
            </text>
            <text
              x={xAt(9.2)}
              y={yAt(52) + 18}
              textAnchor="middle"
              fill="var(--ink-soft)"
              style={{ fontSize: 12 }}
            >
              80 of every 100 never answer
            </text>
          </g>

          {active !== null && (
            <g>
              <line
                x1={xAt(day)}
                y1={PAD.top - 4}
                x2={xAt(day)}
                y2={VB_H - PAD.bottom}
                stroke="var(--line-strong)"
                strokeWidth="1"
              />
              <circle cx={xAt(day)} cy={yAt(contacted)} r="4" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
              <circle cx={xAt(day)} cy={yAt(replied)} r="4.5" fill="var(--magenta)" stroke="var(--card)" strokeWidth="2" />
            </g>
          )}

          <line
            x1={PAD.left}
            y1={VB_H - PAD.bottom}
            x2={VB_W - PAD.right}
            y2={VB_H - PAD.bottom}
            stroke="var(--line-strong)"
            strokeWidth="1"
          />
          {[0, 2, 4, 6, 8, 10, 12, 14].map((d) => (
            <text
              key={d}
              x={xAt(d)}
              y={VB_H - PAD.bottom + 16}
              textAnchor="middle"
              fill="var(--muted)"
              className="font-mono"
              style={{ fontSize: 10 }}
            >
              {d}
            </text>
          ))}
          <text
            x={PAD.left + PLOT_W / 2}
            y={VB_H - 6}
            textAnchor="middle"
            fill="var(--muted)"
            className="font-mono"
            style={{ fontSize: 9.5, letterSpacing: '0.12em' }}
          >
            DAYS AFTER YOU START REACHING OUT
          </text>
        </svg>

        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)]">
          <div className="bg-[var(--paper)] px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.11em] text-[var(--muted)]">
              {active === null ? 'By day 14' : `Day ${day}`}
            </div>
            <div className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[var(--ink)]">
              {fmt(contacted)}
              <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">contacted</span>
            </div>
          </div>
          <div className="bg-[var(--paper)] px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.11em] text-[var(--muted)]">
              Replied
            </div>
            <div className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[var(--magenta-deep)]">
              {fmt(replied)}
            </div>
          </div>
          <div className="bg-[var(--paper)] px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.11em] text-[var(--muted)]">
              Still silent
            </div>
            <div className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[var(--ink)]">
              {fmt(silent)}
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        Drag across the chart to read any day
      </figcaption>
    </figure>
  );
}
