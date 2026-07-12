"use client";

import { motion, useReducedMotion } from "framer-motion";

const BRAND_STEPS = [
  {
    n: "01",
    title: "Post your campaign",
    body: "Set the brief, budget, and deliverables once. No more re-typing terms into every chat.",
  },
  {
    n: "02",
    title: "Match with verified creators",
    body: "Filter 8M+ creators by niche, city, and reach. Every profile is human-reviewed before it can pitch you.",
  },
  {
    n: "03",
    title: "Run the deal in one workspace",
    body: "Terms, content approvals, messages, and payment status live on the deal — not in your inbox.",
  },
];

const CREATOR_STEPS = [
  {
    n: "01",
    title: "Build your verified profile",
    body: "Link your platforms, set your niches and rates. Verification puts you in front of serious brands only.",
  },
  {
    n: "02",
    title: "Receive briefs worth reading",
    body: "Brands come with budgets and deliverables already written down. Accept, negotiate, or pass.",
  },
  {
    n: "03",
    title: "Deliver and keep the record",
    body: "Every settled deal becomes portfolio proof: real campaigns, real terms, really paid.",
  },
];

function StepRail({
  label,
  steps,
  accent,
}: {
  label: string;
  steps: typeof BRAND_STEPS;
  accent?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <p
        className={`font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] ${
          accent ? "text-magenta" : "text-verified"
        }`}
      >
        {label}
      </p>
      <ol className="mt-6 flex flex-col gap-8">
        {steps.map((step, i) => (
          <motion.li
            key={step.n}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : i * 0.1 }}
            className="flex gap-5"
          >
            <span className="font-mono text-sm font-medium text-muted">
              {step.n}
            </span>
            <div>
              <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="eyebrow mb-5">How it works</p>
          <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.015em] text-ink sm:text-5xl">
            Two sides. One pipeline.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            Brands and creators see the same deal, at the same time, in the
            same place. Here&rsquo;s what that looks like from each side.
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_1px_1fr] lg:gap-14">
          <StepRail label="For brands" steps={BRAND_STEPS} accent />
          <div className="hidden bg-line lg:block" aria-hidden />
          <StepRail label="For creators" steps={CREATOR_STEPS} />
        </div>
      </div>
    </section>
  );
}
