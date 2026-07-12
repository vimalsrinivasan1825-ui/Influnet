"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

const REVIEW_STEPS = [
  { label: "Application received", state: "done" },
  { label: "Identity & platform check", state: "done" },
  { label: "Human review", state: "active" },
  { label: "Account approved", state: "next" },
];

export default function Trust() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="trust" className="border-y border-line bg-paper-deep/50">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div>
          <p className="eyebrow mb-5">Trust</p>
          <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[2.6rem]">
            Every account is reviewed by a person before it goes live.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
            Influencer marketing runs on trust, so we don&rsquo;t automate it
            away. Brands are verified as real businesses. Creators are verified
            as real people with real audiences. Reviews typically complete
            within 1–2 business days.
          </p>
          <p className="mt-6 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-verified">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Reviewed · Verified · Accountable
          </p>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-line-strong bg-card p-6 shadow-[0_12px_40px_-16px_rgba(23,20,29,0.12)] sm:p-8"
        >
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
            Account review · Lumé Skincare
          </p>
          <ol className="mt-6 flex flex-col">
            {REVIEW_STEPS.map((step, i) => (
              <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0">
                {i < REVIEW_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[9px] top-6 h-full w-px bg-line"
                  />
                )}
                <span
                  className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border text-[0.55rem] font-bold ${
                    step.state === "done"
                      ? "border-verified bg-verified text-white"
                      : step.state === "active"
                        ? "border-magenta bg-magenta-tint text-magenta"
                        : "border-line-strong bg-paper text-muted"
                  }`}
                >
                  {step.state === "done" ? "✓" : ""}
                  {step.state === "active" && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-magenta" />
                  )}
                </span>
                <div className="flex flex-1 items-baseline justify-between gap-3">
                  <span
                    className={`text-[0.9375rem] font-medium ${
                      step.state === "next" ? "text-muted" : "text-ink"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted">
                    {step.state === "done"
                      ? "Complete"
                      : step.state === "active"
                        ? "In progress"
                        : "Pending"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </motion.div>
      </div>
    </section>
  );
}
