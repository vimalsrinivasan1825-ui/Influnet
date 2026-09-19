'use client';

import { useRef } from 'react';
import { BadgeCheck, FileSignature, ShieldCheck, type LucideIcon } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { onGateReady } from '@/components/motion/use-gate-ready';
import { SIGNUP_URL } from '@/components/site/links';

// Sample campaigns the centre card cycles through.
const CAMPAIGNS = [
  { brand: 'M', brandBg: '#e4d3c0', name: 'Diwali gifting', niche: 'Lifestyle', deliverables: '3 Reels', budget: '₹25,000', city: 'Chennai', apps: 18 },
  { brand: 'K', brandBg: '#dcead9', name: 'Monsoon skincare drop', niche: 'Beauty', deliverables: '2 Reels', budget: '₹40,000', city: 'Kochi', apps: 24 },
  { brand: 'U', brandBg: '#d3dcef', name: 'Café opening week', niche: 'Food', deliverables: '1 Reel + 2 Stories', budget: '₹15,000', city: 'Bengaluru', apps: 12 },
];

// Creators orbiting the campaign. Angles in degrees on each ring.
const OUTER = [
  { i: 'N', bg: '#f3dfe8', fg: '#9e1f62', a: 10, v: true },
  { i: 'A', bg: '#fde7c8', fg: '#8a4b08', a: 62 },
  { i: 'P', bg: '#d6ecf3', fg: '#1d5b73', a: 118, v: true },
  { i: 'K', bg: '#dcefdc', fg: '#1f6b35', a: 172 },
  { i: 'S', bg: '#ece0f3', fg: '#5b2a86', a: 228, v: true },
  { i: 'D', bg: '#fbe3d3', fg: '#8a3a12', a: 290 },
];
const INNER = [
  { i: 'R', bg: '#e2e8f7', fg: '#2f3e66', a: 40, v: true },
  { i: 'M', bg: '#f7e6f0', fg: '#8c1d5e', a: 160 },
  { i: 'V', bg: '#e6f3ea', fg: '#1f6b35', a: 270, v: true },
];

const PILLS: { label: string; icon: LucideIcon; color: string; pos: string }[] = [
  { label: 'Verified creators', icon: BadgeCheck, color: '#3ddc97', pos: 'left-[2%] top-[10%]' },
  { label: 'Written terms', icon: FileSignature, color: '#ffc46b', pos: 'right-[0%] top-[46%]' },
  { label: 'Payment gates', icon: ShieldCheck, color: '#5eead4', pos: 'left-[6%] bottom-[8%]' },
];

const R_OUT = 258;
const R_IN = 188;
const C = 300; // orbit box is 600×600

function Bubble({ b, r }: { b: (typeof OUTER)[number]; r: number }) {
  const rad = (b.a * Math.PI) / 180;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: C + r * Math.cos(rad), top: C + r * Math.sin(rad) }}
    >
      <div data-upright>
        <div
          data-bubble
          className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-night font-display text-lg font-extrabold shadow-[0_10px_30px_-8px_rgba(0,0,0,.6)]"
          style={{ background: b.bg, color: b.fg }}
        >
          {b.i}
          {b.v && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-night bg-[#3ddc97] text-night">
              <BadgeCheck className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard() {
  return (
    <div className="w-[min(100%,360px)] rounded-[28px] bg-card p-5 text-ink shadow-[0_40px_100px_-30px_rgba(255,7,142,.5)]">
      <div className="grid">
        {CAMPAIGNS.map((c, i) => (
          <div key={c.name} data-campaign={i} className="flex flex-col gap-4 [grid-area:1/1]" aria-hidden={i > 0}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl font-display text-lg font-extrabold" style={{ background: c.brandBg }}>
                {c.brand}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Open campaign</span>
                <span className="truncate text-[17px] font-bold">{c.name}</span>
              </div>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-verified-tint px-2.5 py-1 text-xs font-bold text-[#0b7a55]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0e9f6e]" />
                Live
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Niche', c.niche],
                ['Deliverables', c.deliverables],
                ['Budget', c.budget],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-paper-deep p-2.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">{k}</span>
                  <span className="text-[13px] font-bold leading-tight">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
        <div className="flex flex-col">
          <span className="text-xs text-ink-soft">Applications</span>
          <span className="font-display text-2xl font-bold">
            <span data-apps>0</span>
          </span>
        </div>
        <div data-stack className="flex -space-x-2">
          {OUTER.slice(0, 5).map((b) => (
            <span
              key={b.i}
              data-stack-face
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-extrabold"
              style={{ background: b.bg, color: b.fg }}
            >
              {b.i}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BrandHero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reveal = () => gsap.set(q('[data-reveal]'), { visibility: 'visible' });
      const layers = q('[data-campaign]');
      const apps = q('[data-apps]');
      const setApps = (n: number) => apps.forEach((a) => (a.textContent = String(n)));

      if (prefersReducedMotion()) {
        gsap.set(layers.slice(1), { autoAlpha: 0 });
        setApps(CAMPAIGNS[0].apps);
        reveal();
        return;
      }

      const title = new SplitText(q('[data-hero-title]'), { type: 'lines', mask: 'lines', linesClass: 'pb-1' });
      const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
      intro
        .from(q('[data-hero-glow]'), { scale: 0.4, autoAlpha: 0, duration: 2 }, 0)
        .from(q('[data-hero-eyebrow]'), { y: 14, autoAlpha: 0, duration: 0.8 }, 0.1)
        .from(title.lines, { yPercent: 105, duration: 1.2, stagger: 0.09 }, 0.15)
        .from(q('[data-hero-sub]'), { y: 24, autoAlpha: 0, duration: 1 }, 0.5)
        .from(q('[data-hero-cta] > *'), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.6)
        .from(q('[data-ring]'), { scale: 0.6, autoAlpha: 0, duration: 1.4, stagger: 0.12 }, 0.3)
        .from(q('[data-card]'), { y: 60, scale: 0.86, filter: 'blur(14px)', autoAlpha: 0, duration: 1.4 }, 0.4)
        .from(q('[data-bubble]'), { scale: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.05 }, 0.9)
        .from(q('[data-pill]'), { y: 20, scale: 0.8, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.8)', stagger: 0.1 }, 1.2);

      // The rings turn slowly; each face counter-rotates so it stays upright.
      const spinOut = gsap.to(q('[data-orbit="out"]'), { rotation: 360, duration: 90, ease: 'none', repeat: -1 });
      const spinIn = gsap.to(q('[data-orbit="in"]'), { rotation: -360, duration: 70, ease: 'none', repeat: -1 });
      const upright = [
        gsap.to(q('[data-orbit="out"] [data-upright]'), { rotation: -360, duration: 90, ease: 'none', repeat: -1 }),
        gsap.to(q('[data-orbit="in"] [data-upright]'), { rotation: 360, duration: 70, ease: 'none', repeat: -1 }),
      ];
      q('[data-pill-bob]').forEach((el, i) => {
        gsap.to(el, { y: i % 2 ? 10 : -10, duration: 3 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      });

      // Applications fly in from the orbit, the counter climbs, faces stack up.
      gsap.set(layers.slice(1), { autoAlpha: 0 });
      const flyers = q('[data-flyer]');
      const faces = q('[data-stack-face]');
      let running: gsap.core.Timeline | null = null;
      const play = (i: number) => {
        const c = CAMPAIGNS[i];
        const next = (i + 1) % CAMPAIGNS.length;
        const n = { v: 0 };
        setApps(0);
        gsap.set(faces, { autoAlpha: 0, x: -8 });
        const tl = gsap.timeline({ onComplete: () => play(next) });
        flyers.forEach((f, k) => {
          const a = ((k * 67 + i * 40) * Math.PI) / 180;
          tl.fromTo(
            f,
            { x: Math.cos(a) * R_OUT, y: Math.sin(a) * R_OUT, scale: 1, autoAlpha: 0 },
            { x: 0, y: 40, scale: 0.35, autoAlpha: 1, duration: 0.9, ease: 'power2.in' },
            0.3 + k * 0.45,
          ).to(f, { autoAlpha: 0, duration: 0.15 }, '>');
          if (faces[k]) tl.to(faces[k], { autoAlpha: 1, x: 0, duration: 0.4, ease: 'back.out(2)' }, 1.2 + k * 0.45);
        });
        tl.to(n, { v: c.apps, duration: 2.6, ease: 'power1.out', onUpdate: () => setApps(Math.round(n.v)) }, 0.8)
          .addLabel('swap', '+=2')
          .to(layers[i], { autoAlpha: 0, y: -16, filter: 'blur(6px)', duration: 0.4, ease: 'power2.in' }, 'swap')
          .fromTo(
            layers[next],
            { autoAlpha: 0, y: 20, filter: 'blur(8px)' },
            { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out' },
            'swap+=0.3',
          );
        running = tl;
      };

      const stop = onGateReady(() => {
        reveal();
        intro.play();
        gsap.delayedCall(1.4, () => play(0));
      });
      return () => {
        stop();
        running?.kill();
        spinOut.kill();
        spinIn.kill();
        upright.forEach((u) => u.kill());
      };
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      data-page-hero
      data-tone="dark"
      className="relative isolate overflow-hidden bg-night pb-20 pt-32 text-white sm:pt-36 lg:min-h-[100svh] lg:pb-0 lg:pt-0"
    >
      <div
        data-hero-glow
        data-reveal
        className="pointer-events-none absolute right-[-10vmin] top-[-30vmin] -z-10 h-[90vmin] w-[90vmin] rounded-full bg-brand opacity-25 blur-[140px]"
      />
      <div className="pointer-events-none absolute -bottom-[26vmin] -left-[20vmin] -z-10 opacity-[0.06]">
        <div className="animate-[spin_70s_linear_infinite]">
          <LogoMark size={640} color="#ffffff" className="h-[70vmin] w-[70vmin]" />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1320px] items-center gap-14 px-4 sm:px-8 lg:min-h-[100svh] lg:grid-cols-[minmax(0,1fr)_600px] lg:gap-10">
        <div className="flex flex-col gap-7">
          <div data-hero-eyebrow data-reveal className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">
            [ For brands ]
          </div>
          <h1 data-hero-title data-reveal className="font-display text-[46px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-7xl xl:text-[84px]">
            Find <span className="text-brand">real</span> creators. Run every collab to the finish.
          </h1>
          <p data-hero-sub data-reveal className="max-w-[540px] text-lg leading-relaxed text-night-soft sm:text-xl">
            Post a campaign, shortlist creators who proved they own their accounts, agree terms in writing and pay through
            Razorpay, stage by stage.
          </p>
          <div data-hero-cta data-reveal className="flex flex-wrap gap-3">
            <a
              href={SIGNUP_URL.business}
              className="flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-[17px] font-bold text-night transition-colors hover:bg-magenta-tint"
            >
              Post your first campaign
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#steps"
              className="flex h-14 items-center rounded-full border-[1.5px] border-white/25 px-6 text-[17px] font-semibold transition-colors hover:border-white/60"
            >
              See how it works
            </a>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[520px] flex-col items-center gap-5 lg:block lg:h-[600px] lg:w-[600px] lg:max-w-none">
          {/* Orbits, desktop only. */}
          <div className="absolute inset-0 hidden lg:block" aria-hidden>
            <div data-ring data-reveal className="absolute rounded-full border border-dashed border-white/12" style={{ inset: C - R_OUT }} />
            <div data-ring data-reveal className="absolute rounded-full border border-white/8" style={{ inset: C - R_IN }} />
            <div data-orbit="out" className="absolute inset-0">
              {OUTER.map((b) => (
                <Bubble key={b.i + b.a} b={b} r={R_OUT} />
              ))}
            </div>
            <div data-orbit="in" className="absolute inset-0">
              {INNER.map((b) => (
                <Bubble key={b.i + b.a} b={b} r={R_IN} />
              ))}
            </div>
            {[0, 1, 2, 3].map((k) => (
              <span
                key={k}
                data-flyer
                className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full bg-brand opacity-0 shadow-[0_0_14px_#ff078e]"
              />
            ))}
          </div>

          <div className="flex w-full justify-center lg:absolute lg:left-1/2 lg:top-1/2 lg:w-[360px] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <div data-card data-reveal className="flex w-full justify-center">
              <CampaignCard />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5 lg:contents">
            {PILLS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.label} data-pill data-reveal className={`lg:absolute ${p.pos}`}>
                  <div data-pill-bob>
                    <span className="flex h-11 items-center gap-2.5 whitespace-nowrap rounded-full border border-white/12 bg-[#1f1a25]/85 py-1 pl-1 pr-4 text-sm font-semibold text-[#ece6f1] shadow-[0_12px_32px_-12px_rgba(0,0,0,.7)] backdrop-blur">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${p.color}26`, color: p.color }}>
                        <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} aria-hidden />
                      </span>
                      {p.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
