"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { links } from "@/lib/site";

export default function Cta() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center sm:px-12 lg:py-20"
      >
        {/* ruled ledger lines, barely there */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 39px, #fff 39px 40px)",
          }}
        />

        <p className="relative font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-white/50">
          Early access · Free for creators
        </p>
        <h2 className="relative mx-auto mt-5 max-w-2xl font-display text-3xl font-bold leading-[1.08] tracking-[-0.015em] text-white sm:text-5xl">
          Put your next deal on the record.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">
          Join the brands and creators building India&rsquo;s creator economy
          on something sturdier than a chat thread.
        </p>

        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3.5">
          <a
            href={links.signupBusiness}
            className="group inline-flex items-center gap-2 rounded-full bg-magenta px-7 py-3.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-magenta-deep"
          >
            Find creators
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>
          <a
            href={links.signupInfluencer}
            className="inline-flex items-center rounded-full border border-white/25 px-7 py-3.5 text-[0.9375rem] font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/5"
          >
            Join as a creator
          </a>
        </div>
      </motion.div>
    </section>
  );
}
