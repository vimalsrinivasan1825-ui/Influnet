'use client';

import { motion } from 'framer-motion';
import ReplyGapChart from './reply-gap-chart';

/**
 * The case for Influnet, stated as evidence before the product shows up.
 *
 * NOTE ON THE NUMBERS: illustrative of the problem, not measured from our own
 * data. They need either a citation or an "example" label before launch.
 */

/** Of the replies that do arrive, when they land. */
const LATENCY = [
  { window: 'Within a day', share: 31, note: 'The keen ones' },
  { window: 'Day 2', share: 26, note: 'After a nudge' },
  { window: 'Day 3–4', share: 22, note: 'Deal is already cooling' },
  { window: 'Day 5 or later', share: 21, note: 'Usually too late to brief' },
];

export default function ReplyGap() {
  return (
    <section className="border-y border-[var(--line)] bg-[var(--paper)] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <p className="eyebrow">Why collaborations stall</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] text-balance sm:text-4xl lg:text-[2.9rem]">
            Reaching out is the easy part
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg">
            A brand works through a list of a hundred creators. Four in five never
            answer at all — and of the ones who do, most arrive after the window
            where a campaign could still be briefed properly.
          </p>
        </motion.div>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          {/* Latency breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <p className="eyebrow">When the replies actually land</p>

            <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full">
              {LATENCY.map((row, i) => (
                <div
                  key={row.window}
                  className="h-full"
                  style={{
                    width: `${row.share}%`,
                    background: 'var(--magenta)',
                    opacity: 1 - i * 0.22,
                  }}
                />
              ))}
            </div>

            <dl className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {LATENCY.map((row, i) => (
                <div key={row.window} className="flex items-baseline gap-4 py-3.5">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--magenta)', opacity: 1 - i * 0.22 }}
                    aria-hidden="true"
                  />
                  <dt className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {row.window}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">{row.note}</span>
                  </dt>
                  <dd className="font-mono text-sm tabular-nums text-[var(--ink)]">
                    {row.share}%
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              Share of the replies received, not of everyone contacted.
            </p>

            <div className="mt-8 rounded-lg border-l-2 border-[var(--magenta)] bg-[var(--magenta-tint)] px-5 py-4">
              <p className="text-sm leading-relaxed text-[var(--ink)]">
                <strong className="font-semibold">This is the part Influnet fixes.</strong>{' '}
                A creator who has verified their account and agreed terms in writing has
                already answered — so the deal starts at the point most outreach never
                reaches.
              </p>
            </div>
          </motion.div>

          {/* The chart */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <ReplyGapChart />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
