"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck } from "lucide-react";

const DM_BUBBLES = [
  { text: "hey! loved ur reels, collab?", side: "left" as const },
  { text: "sure 😊 what's the budget?", side: "right" as const },
  { text: "will confirm with team… also can u do 5 posts not 3", side: "left" as const },
  { text: "wait, which price was final?", side: "right" as const },
  { text: "payment next week pakka 🙏", side: "left" as const },
];

const RECORD_ROWS = [
  { label: "Parties", value: "Lumé Skincare × Priya Sharma" },
  { label: "Deliverables", value: "3 reels + 1 story" },
  { label: "Terms", value: "₹80,000 · usage 90 days" },
  { label: "Status", value: "Settled", settled: true },
];

export default function Problem() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="eyebrow mb-5">The problem</p>
        <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.015em] text-ink sm:text-5xl">
          Deals shouldn&rsquo;t live in DMs.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">
          Scope changes in voice notes. Prices renegotiated at midnight.
          Payments that arrive &ldquo;next week.&rdquo; When a collaboration
          lives across five chat apps, nobody can prove what was agreed.
        </p>
      </div>

      <div className="mt-14 grid items-stretch gap-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
        {/* The DM mess */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl border border-dashed border-line-strong bg-paper-deep/40 p-6 sm:p-8"
        >
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
            Today · Somewhere across 5 apps
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {DM_BUBBLES.map((bubble, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-snug ${
                  bubble.side === "left"
                    ? "self-start rounded-bl-sm bg-card text-ink-soft shadow-sm"
                    : "self-end rounded-br-sm bg-line/70 text-ink-soft"
                }`}
                style={{ transform: `rotate(${i % 2 === 0 ? -0.6 : 0.6}deg)` }}
              >
                {bubble.text}
              </div>
            ))}
          </div>
          <p className="mt-6 inline-block rounded-md border border-amber/30 bg-amber-tint px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-amber">
            No record · No proof · No recourse
          </p>
        </motion.div>

        {/* Connector */}
        <div className="hidden items-center lg:flex" aria-hidden>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-card text-ink">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>

        {/* The record */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: reduceMotion ? 0 : 0.15 }}
          className="rounded-2xl border border-line-strong bg-card p-6 shadow-[0_12px_40px_-16px_rgba(23,20,29,0.12)] sm:p-8"
        >
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-verified">
            On Influnet · One deal record
          </p>
          <dl className="mt-6">
            {RECORD_ROWS.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-b-0"
              >
                <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
                  {row.label}
                </dt>
                <dd className="text-right text-sm font-semibold text-ink">
                  {row.settled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-verified-tint px-2.5 py-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em] text-verified">
                      <BadgeCheck className="h-3 w-3" aria-hidden />
                      {row.value}
                    </span>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Terms, deliverables, approvals, and payment status — agreed once,
            visible to both sides, permanently on the record.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
