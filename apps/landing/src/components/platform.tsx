"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Search, MessageSquare, KanbanSquare } from "lucide-react";

function DiscoveryVignette() {
  return (
    <div className="mt-6 flex flex-wrap gap-2" aria-hidden>
      {["Niche: Beauty", "City: Chennai", "Followers: 50K+", "Engagement: 4%+"].map(
        (chip) => (
          <span
            key={chip}
            className="rounded-full border border-line bg-paper px-3 py-1.5 font-mono text-[0.6875rem] text-ink-soft"
          >
            {chip}
          </span>
        ),
      )}
      <span className="rounded-full bg-ink px-3 py-1.5 font-mono text-[0.6875rem] text-paper">
        142 matches
      </span>
    </div>
  );
}

function WorkspaceVignette() {
  const cols = [
    { label: "Briefed", n: 4 },
    { label: "In production", n: 2 },
    { label: "Approved", n: 5 },
    { label: "Paid", n: 11 },
  ];
  return (
    <div className="mt-6 grid grid-cols-4 gap-2" aria-hidden>
      {cols.map((col) => (
        <div key={col.label} className="rounded-lg border border-line bg-paper p-2.5">
          <p className="truncate font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted">
            {col.label}
          </p>
          <p className="mt-1 font-display text-lg font-bold text-ink">{col.n}</p>
        </div>
      ))}
    </div>
  );
}

function MessagesVignette() {
  return (
    <div className="mt-6 rounded-lg border border-line bg-paper p-3" aria-hidden>
      <p className="border-b border-line pb-2 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted">
        Thread · Deal #0142 · ₹80,000 agreed
      </p>
      <div className="mt-2.5 flex flex-col gap-1.5 text-[0.75rem] leading-snug text-ink-soft">
        <span className="max-w-[80%] self-start rounded-lg rounded-bl-sm bg-card px-2.5 py-1.5 shadow-sm">
          First cut uploaded — draft 1 of reel 2
        </span>
        <span className="max-w-[80%] self-end rounded-lg rounded-br-sm bg-magenta-tint px-2.5 py-1.5 text-ink">
          Approved. Moving to payout ✓
        </span>
      </div>
    </div>
  );
}

function VerificationVignette() {
  const checks = ["Identity confirmed", "Platforms linked", "Reviewed by our team"];
  return (
    <div className="mt-6 flex flex-col gap-2" aria-hidden>
      {checks.map((check) => (
        <span
          key={check}
          className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-[0.8125rem] font-medium text-ink"
        >
          <BadgeCheck className="h-4 w-4 shrink-0 text-verified" />
          {check}
        </span>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    icon: Search,
    title: "Discovery that works like a database",
    body: "Stop scrolling hashtags. Query creators by niche, city, followers, and engagement — and get profiles you can actually compare.",
    vignette: <DiscoveryVignette />,
  },
  {
    icon: BadgeCheck,
    title: "A network you don't have to vet",
    body: "Every brand and creator account is reviewed by a human before it goes live. No bots, no burner brands, no fake reach.",
    vignette: <VerificationVignette />,
  },
  {
    icon: KanbanSquare,
    title: "Campaigns in one workspace",
    body: "Briefs, deliverables, approvals, and status move through one pipeline both sides can see.",
    vignette: <WorkspaceVignette />,
  },
  {
    icon: MessageSquare,
    title: "Messages tied to the deal",
    body: "Conversations live on the collaboration itself — with the agreed terms pinned right above them.",
    vignette: <MessagesVignette />,
  },
];

export default function Platform() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="platform" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="eyebrow mb-5">The platform</p>
        <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.015em] text-ink sm:text-5xl">
          Everything a deal needs, nothing it doesn&rsquo;t.
        </h2>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {FEATURES.map((feature, i) => (
          <motion.article
            key={feature.title}
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : (i % 2) * 0.1 }}
            className="flex flex-col rounded-2xl border border-line-strong bg-card p-6 transition-shadow hover:shadow-[0_16px_48px_-20px_rgba(23,20,29,0.18)] sm:p-8"
          >
            <feature.icon className="h-5 w-5 text-magenta" aria-hidden />
            <h3 className="mt-4 font-display text-[1.35rem] font-semibold leading-snug tracking-tight text-ink">
              {feature.title}
            </h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
              {feature.body}
            </p>
            <div className="mt-auto">{feature.vignette}</div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
