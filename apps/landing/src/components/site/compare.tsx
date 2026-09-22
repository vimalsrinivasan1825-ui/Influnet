'use client';

import { useRef } from 'react';
import { Check, Minus, X } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

/** true = yes, false = no, 'some' = partly / by hand. */
export type Cell = boolean | 'some';
export type CompareRow = { label: string; cells: Cell[] };

type Props = {
  eyebrow: string;
  title: string;
  body: string;
  /** First column is always Influnet; these are the alternatives after it. */
  others: string[];
  rows: CompareRow[];
};

function Mark({ v, hero }: { v: Cell; hero?: boolean }) {
  if (v === true)
    return (
      <span
        data-cmp-mark
        className={`flex h-8 w-8 items-center justify-center rounded-full ${hero ? 'bg-brand text-white' : 'bg-verified-tint text-[#0b7a55]'}`}
      >
        <Check className="h-4 w-4" strokeWidth={3} aria-label="Yes" />
      </span>
    );
  if (v === 'some')
    return (
      <span data-cmp-mark className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-tint text-amber">
        <Minus className="h-4 w-4" strokeWidth={3} aria-label="Partly, by hand" />
      </span>
    );
  return (
    <span data-cmp-mark className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
      <X className="h-4 w-4" strokeWidth={2.6} aria-label="No" />
    </span>
  );
}

// An Apple-style comparison: our column is lit, the alternatives are not.
export default function Compare({ eyebrow, title, body, others, rows }: Props) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const heading = new SplitText(q('[data-cmp-title]'), { type: 'lines', mask: 'lines' });
      const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-cmp-table]')[0], start: 'top 75%' } });
      tl.from(heading.lines, { yPercent: 105, duration: 1, ease: 'expo.out', stagger: 0.08 })
        .from(q('[data-cmp-hero]'), { y: 60, autoAlpha: 0, scale: 0.96, duration: 1, ease: 'expo.out' }, 0.2)
        .from(q('[data-cmp-row]'), { x: -30, autoAlpha: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07 }, 0.35)
        .from(q('[data-cmp-mark]'), { scale: 0, duration: 0.45, ease: 'back.out(3)', stagger: 0.025 }, 0.6);
      gsap.to(q('[data-cmp-glow]'), { opacity: 0.55, scale: 1.08, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    },
    { scope: root },
  );

  const cols = `minmax(150px,1.4fr) repeat(${others.length + 1}, minmax(92px,1fr))`;

  return (
    <section ref={root} className="bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 sm:px-8">
        <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ {eyebrow} ]</div>
          <h2 data-cmp-title className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            {title}
          </h2>
          <p className="max-w-[560px] text-lg leading-relaxed text-ink-soft">{body}</p>
        </div>

        <div data-cmp-table className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="relative min-w-[640px]" role="table" aria-label={title}>
            {/* The lit column sits behind the grid, spanning every row. */}
            <div
              className="pointer-events-none absolute inset-y-0 grid w-full"
              style={{ gridTemplateColumns: cols }}
              aria-hidden
            >
              <span />
              <span data-cmp-hero className="relative -my-3 rounded-[28px] bg-night shadow-[0_40px_80px_-30px_rgba(255,7,142,.55)]">
                <span data-cmp-glow className="absolute inset-x-6 -top-6 h-24 rounded-full bg-brand opacity-30 blur-3xl" />
              </span>
            </div>

            <div role="row" className="relative grid items-end gap-0 pb-4" style={{ gridTemplateColumns: cols }}>
              <span role="columnheader">
                <span className="sr-only">Feature</span>
              </span>
              <span role="columnheader" className="flex flex-col items-center gap-2 px-2 pt-6 text-center text-white">
                <span className="rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                  Built for this
                </span>
                <span className="flex items-center gap-1.5 font-display text-lg font-bold">
                  <LogoMark size={18} /> influnet
                </span>
              </span>
              {others.map((o) => (
                <span key={o} role="columnheader" className="px-2 text-center text-sm font-semibold text-ink-soft">
                  {o}
                </span>
              ))}
            </div>

            {rows.map((r) => (
              <div
                key={r.label}
                role="row"
                data-cmp-row
                className="relative grid items-center border-t border-line"
                style={{ gridTemplateColumns: cols }}
              >
                <span role="rowheader" className="py-4 pr-4 text-[15px] font-semibold sm:text-base">
                  {r.label}
                </span>
                {r.cells.map((c, i) => (
                  <span key={i} role="cell" className="flex justify-center py-4">
                    <Mark v={c} hero={i === 0} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-sm text-ink-soft">
          <span className="inline-flex translate-y-0.5 items-center">
            <Minus className="mr-1 h-3.5 w-3.5 text-amber" strokeWidth={3} aria-hidden />
          </span>
          means possible, but by hand and hard to track.
        </p>
      </div>
    </section>
  );
}
