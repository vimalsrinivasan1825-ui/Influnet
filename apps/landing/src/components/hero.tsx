import { ArrowRight, BadgeCheck } from "lucide-react";
import { links } from "@/lib/site";

const LEDGER_ROWS = [
  {
    time: "09:12",
    title: "Brief received",
    detail: "Summer Glow launch · 3 reels + 1 story",
    value: "Lumé Skincare",
  },
  {
    time: "09:40",
    title: "Creator matched",
    detail: "Priya Sharma · 412K followers · Chennai",
    value: "Verified",
    verified: true,
  },
  {
    time: "11:05",
    title: "Terms agreed",
    detail: "Usage rights 90 days · 2 revisions",
    value: "₹80,000",
  },
  {
    time: "D+6",
    title: "Content approved",
    detail: "First cut accepted, no revisions",
    value: "3 / 3 files",
  },
  {
    time: "D+7",
    title: "Payout released",
    detail: "Recorded to both parties",
    value: "Settled",
    settled: true,
  },
];

function LedgerCard() {
  return (
    <div className="relative">
      {/* ruled-paper backdrop */}
      <div
        aria-hidden
        className="absolute -inset-x-10 -inset-y-8 -z-10 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 31px, var(--line) 31px 32px)",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, transparent 75%)",
        }}
      />

      <div
        className="anim-rise overflow-hidden rounded-2xl border border-line-strong bg-card shadow-[0_1px_2px_rgba(23,20,29,0.04),0_16px_48px_-16px_rgba(23,20,29,0.14)]"
        style={{ "--d": "0.15s" } as React.CSSProperties}
      >
        <div className="flex items-center justify-between border-b border-line bg-paper-deep/60 px-5 py-3.5">
          <span className="font-mono text-[0.6875rem] font-medium tracking-[0.12em] text-ink-soft">
            DEAL #0142 — LUMÉ × PRIYA
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] font-medium tracking-[0.14em] text-verified">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-verified" />
            </span>
            LIVE
          </span>
        </div>

        <ol className="px-5 py-2">
          {LEDGER_ROWS.map((row, i) => (
            <li
              key={row.title}
              className="anim-write flex items-baseline gap-4 border-b border-line py-3.5 last:border-b-0"
              style={{ "--d": `${0.5 + i * 0.35}s` } as React.CSSProperties}
            >
              <span className="w-10 shrink-0 font-mono text-[0.6875rem] text-muted">
                {row.time}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">
                  {row.title}
                </span>
                <span className="block truncate text-[0.8125rem] leading-relaxed text-muted">
                  {row.detail}
                </span>
              </span>
              <span className="shrink-0">
                {row.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-verified-tint px-2.5 py-1 font-mono text-[0.625rem] font-medium tracking-[0.08em] text-verified">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                    VERIFIED
                  </span>
                ) : row.settled ? (
                  <span className="inline-flex items-center rounded-full bg-verified px-2.5 py-1 font-mono text-[0.625rem] font-medium tracking-[0.08em] text-white">
                    SETTLED
                  </span>
                ) : (
                  <span className="font-mono text-[0.8125rem] font-medium text-ink">
                    {row.value}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p
        className="anim-rise mt-4 text-center font-mono text-[0.6875rem] tracking-[0.1em] text-muted"
        style={{ "--d": "2.4s" } as React.CSSProperties}
      >
        ONE DEAL · FIVE ENTRIES · NOTHING LOST IN DMS
      </p>
    </div>
  );
}

export default function Hero() {
  const delay = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div>
          <p className="anim-rise eyebrow mb-6" style={delay(0)}>
            The collaboration OS · Built for India
          </p>

          <h1
            className="anim-rise font-display text-[2.6rem] font-bold leading-[1.04] tracking-[-0.02em] text-ink sm:text-6xl lg:text-[4.1rem]"
            style={delay(0.08)}
          >
            Run creator deals like a{" "}
            <span className="relative whitespace-nowrap">
              business
              <svg
                aria-hidden
                viewBox="0 0 220 12"
                className="absolute -bottom-1.5 left-0 h-[0.18em] w-full text-magenta"
                preserveAspectRatio="none"
              >
                <path
                  d="M3 9 C60 3, 160 3, 217 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            , not a DM thread.
          </h1>

          <p
            className="anim-rise mt-6 max-w-lg text-lg leading-relaxed text-ink-soft"
            style={delay(0.16)}
          >
            Influnet is where brands and verified creators find each other,
            agree terms, and deliver campaigns — with every step of the deal on
            the record.
          </p>

          <div
            className="anim-rise mt-9 flex flex-wrap items-center gap-3.5"
            style={delay(0.24)}
          >
            <a
              href={links.signupBusiness}
              className="group inline-flex items-center gap-2 rounded-full bg-magenta px-6.5 py-3.5 text-[0.9375rem] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(238,62,150,0.55)] transition-all hover:bg-magenta-deep"
            >
              Find creators
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </a>
            <a
              href={links.signupInfluencer}
              className="inline-flex items-center rounded-full border border-line-strong bg-card px-6.5 py-3.5 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-ink/30 hover:bg-paper-deep"
            >
              Join as a creator
            </a>
          </div>

          <p
            className="anim-rise mt-7 font-mono text-xs tracking-[0.06em] text-muted"
            style={delay(0.32)}
          >
            Free in early access — every account human-reviewed.
          </p>
        </div>

        <LedgerCard />
      </div>
    </section>
  );
}
