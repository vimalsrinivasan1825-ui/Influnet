'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, ChevronRight, Star } from 'lucide-react';
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

const STEPS = [
  {
    t: 'Post a campaign',
    b: 'Add the brief, niche, deliverables and budget. Once your business is approved, publish it for creators to find.',
    color: '#ff078e',
  },
  { t: 'Review applications', b: 'Creators apply with their profile, reach and past work. Accept the ones that fit.', color: '#6a5cf0' },
  { t: 'Agree terms, pay the advance', b: 'Lock deliverables, timeline and the split in writing, then pay the advance through Razorpay.', color: '#1fa866' },
  { t: 'Approve and close', b: 'Review drafts, ask for changes, pay the final amount and leave a review.', color: '#f7a531' },
];

const STEP_SECONDS = 6.5;
const panel = 'flex w-full max-w-[420px] flex-col gap-3 rounded-3xl bg-card p-5 text-ink shadow-[0_30px_60px_-24px_rgba(0,0,0,.5)]';

function PreviewPost() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">New campaign</span>
        <span className="relative h-6 w-16">
          <span data-p1-draft className="absolute inset-0 flex items-center justify-center rounded-full bg-paper-deep text-[11px] font-bold text-ink-soft">
            Draft
          </span>
          <span data-p1-live className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-verified-tint text-[11px] font-bold text-[#0b7a55] opacity-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0e9f6e]" /> Live
          </span>
        </span>
      </div>
      {[
        ['Campaign', 'Diwali gifting'],
        ['Niche', 'Lifestyle'],
        ['Deliverables', '3 Reels'],
        ['Budget per creator', '₹25,000'],
      ].map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 rounded-xl border border-line px-3 py-2">
          <span className="text-[11px] text-ink-soft">{k}</span>
          <span data-p1-value className="text-sm font-semibold">
            {v}
          </span>
        </div>
      ))}
      <span data-p1-btn className="flex h-11 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white">
        Publish campaign
      </span>
    </div>
  );
}

function PreviewApplications() {
  const people = [
    { i: 'N', n: 'Neha Kapoor', m: 'Lifestyle · 75K', bg: '#f3dfe8', fg: '#9e1f62' },
    { i: 'S', n: 'Sana M', m: 'Lifestyle · 120K', bg: '#fbe3d3', fg: '#8a3a12' },
    { i: 'R', n: 'Rahul T', m: 'Lifestyle · 64K', bg: '#e2e8f7', fg: '#2f3e66' },
  ];
  return (
    <div className={panel}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Applications</span>
        <span className="rounded-full bg-[#ece9fd] px-2.5 py-0.5 text-[11px] font-bold text-[#4b3fc2]">
          <span data-p2-count>0</span> new
        </span>
      </div>
      {people.map((p, k) => (
        <div key={p.n} data-p2-row className="flex items-center gap-3 rounded-2xl bg-paper p-2.5">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-extrabold" style={{ background: p.bg, color: p.fg }}>
            {p.i}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1 text-sm font-semibold">
              {p.n} <BadgeCheck className="h-3.5 w-3.5 text-[#0e9f6e]" aria-hidden />
            </span>
            <span className="text-xs text-ink-soft">{p.m}</span>
          </span>
          <span className="relative h-8 w-[84px]">
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">Accept</span>
            {k === 0 && (
              <span data-p2-accepted className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-[#1fa866] text-xs font-semibold text-white opacity-0">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> Accepted
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewTerms() {
  return (
    <div className={panel}>
      <span className="text-sm font-bold">Terms with Neha Kapoor</span>
      {[
        ['Deliverables', '3 Reels'],
        ['Timeline', '12 days'],
        ['Split', '50% advance · 50% on delivery'],
      ].map(([k, v]) => (
        <div key={k} data-p3-row className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 text-sm">
          <span className="text-ink-soft">{k}</span>
          <span className="flex items-center gap-1.5 text-right font-semibold">
            {v}
            <Check className="h-4 w-4 shrink-0 text-[#1fa866]" strokeWidth={3} aria-hidden />
          </span>
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Advance · ₹12,500</span>
          <span data-p3-ok className="flex items-center gap-1 rounded-full bg-verified-tint px-2 py-0.5 text-[11px] font-bold text-[#0b7a55] opacity-0">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> Confirmed
          </span>
        </div>
        <span className="block h-2 overflow-hidden rounded-full bg-paper-deep">
          <span data-p3-bar className="block h-full w-full origin-left rounded-full bg-[#1fa866]" />
        </span>
        <span className="text-[11px] text-ink-soft">Paid via Razorpay</span>
      </div>
    </div>
  );
}

function PreviewClose() {
  return (
    <div className={panel}>
      <span className="text-sm font-bold">Drafts from Neha</span>
      <div className="grid grid-cols-3 gap-2">
        {['#f6c7cc', '#f9dcc0', '#d9d3f5'].map((c) => (
          <div key={c} data-p4-tile className="relative h-20 rounded-xl" style={{ background: c }}>
            <span data-p4-ok className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1fa866] text-white">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
          </div>
        ))}
      </div>
      <div data-p4-final className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5 text-sm">
        <span>Final payment · ₹12,500</span>
        <span className="rounded-full bg-verified-tint px-2 py-0.5 text-[11px] font-bold text-[#0b7a55]">Paid</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
        <span className="text-sm">Your review</span>
        <span className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} data-p4-star className="flex">
              <Star className="h-4 w-4 fill-[#e7b416] text-[#e7b416]" aria-hidden />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

const PREVIEWS = [PreviewPost, PreviewApplications, PreviewTerms, PreviewClose];

type Q = (sel: string) => Element[];
const SCENES: ((q: Q) => gsap.core.Timeline)[] = [
  (q) =>
    gsap
      .timeline()
      .fromTo(q('[data-p1-value]'), { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.45, ease: 'power3.out' }, 0.3)
      .to(q('[data-p1-btn]'), { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1 }, '+=0.4')
      .fromTo(q('[data-p1-draft]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 })
      .fromTo(q('[data-p1-live]'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.6)' }),
  (q) => {
    const count = q('[data-p2-count]')[0];
    const n = { v: 0 };
    return gsap
      .timeline()
      .fromTo(q('[data-p2-row]'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'expo.out', stagger: 0.35 }, 0.2)
      .fromTo(n, { v: 0 }, { v: 3, duration: 1.1, ease: 'none', onUpdate: () => count && (count.textContent = String(Math.round(n.v))) }, 0.2)
      .fromTo(q('[data-p2-accepted]'), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.4)' }, '+=0.8');
  },
  (q) =>
    gsap
      .timeline()
      .fromTo(q('[data-p3-row]'), { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', stagger: 0.3 }, 0.2)
      .fromTo(q('[data-p3-bar]'), { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, '+=0.2')
      .fromTo(q('[data-p3-ok]'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.6)' }),
  (q) =>
    gsap
      .timeline()
      .fromTo(q('[data-p4-tile]'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.12 }, 0.2)
      .fromTo(q('[data-p4-ok]'), { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.25 }, '+=0.2')
      .fromTo(q('[data-p4-final]'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, '+=0.2')
      .fromTo(q('[data-p4-star]'), { scale: 0, rotation: -60 }, { scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(3)', stagger: 0.1 }, '+=0.2'),
];

export default function CampaignSteps() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);
  const scenes = useRef<gsap.core.Timeline[]>([]);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reduced = prefersReducedMotion();
      scenes.current = q('[data-preview]').map((el, i) => {
        const tl = SCENES[i](gsap.utils.selector(el) as Q).pause();
        if (reduced) tl.progress(1);
        return tl;
      });
      gsap.set(q('[data-preview]'), { autoAlpha: 0 });
      if (!reduced) {
        const title = new SplitText(q('[data-cs-title]'), { type: 'lines', mask: 'lines' });
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%' } })
          .from(title.lines, { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.08 })
          .from(q('[data-cs-chip]'), { y: 16, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.08 }, 0.3)
          .from(q('[data-cs-panel]'), { y: 80, scale: 0.96, autoAlpha: 0, duration: 1.2, ease: 'expo.out' }, 0.4);
      }
      const st = ScrollTrigger.create({
        trigger: q('[data-cs-panel]')[0],
        start: 'top 75%',
        end: 'bottom 15%',
        onToggle: (self) => setLive(self.isActive),
      });
      return () => st.kill();
    },
    { scope: root },
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const reduced = prefersReducedMotion();
    const previews = q('[data-preview]');
    if (!previews.length) return;
    previews.forEach((p, i) => {
      if (i !== active) gsap.to(p, { autoAlpha: 0, x: -30, duration: reduced ? 0 : 0.3, overwrite: true });
    });
    gsap.fromTo(
      previews[active],
      { autoAlpha: 0, x: 40 },
      { autoAlpha: 1, x: 0, duration: reduced ? 0 : 0.6, ease: 'expo.out', delay: reduced ? 0 : 0.15, overwrite: true },
    );
    gsap.to(q('[data-cs-glow]'), { backgroundColor: STEPS[active].color, duration: reduced ? 0 : 0.8 });
    const tl = scenes.current[active];
    if (tl && !reduced && live) tl.restart(true).delay(0.35);

    const bar = q(`[data-cs-bar="${active}"]`)[0];
    if (!live || reduced || !bar) return;
    const countdown = gsap.fromTo(
      bar,
      { scaleX: 0 },
      { scaleX: 1, duration: STEP_SECONDS, ease: 'none', onComplete: () => setActive((a) => (a + 1) % STEPS.length) },
    );
    return () => {
      countdown.kill();
    };
  }, [active, live]);

  return (
    <section ref={root} id="steps" className="bg-paper-deep py-24 text-ink sm:py-32">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-10 px-4 sm:px-8">
        <div className="flex max-w-[760px] flex-col items-center gap-5 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ 4 steps · 1 flow ]</div>
          <h2 data-cs-title className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Run a campaign in <span className="text-brand-deep">four steps.</span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s.t} className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-cs-chip
                  onClick={() => setActive(i)}
                  className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors ${
                    i === active ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="font-mono text-xs">{i + 1}</span>
                  {s.t.split(',')[0]}
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-line-strong" aria-hidden />}
              </span>
            ))}
          </div>
        </div>

        <div data-cs-panel className="relative grid w-full overflow-hidden rounded-[32px] bg-night text-white lg:grid-cols-[340px_minmax(0,1fr)]">
          <div data-cs-glow className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-25 blur-[120px]" style={{ backgroundColor: STEPS[0].color }} aria-hidden />
          <ol className="relative flex flex-col gap-1 border-b border-white/10 p-4 lg:border-b-0 lg:border-r lg:p-6" aria-label="Campaign steps">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.t}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={on ? 'step' : undefined}
                    className={`flex w-full flex-col gap-2 rounded-2xl p-3 text-left transition-colors ${on ? 'bg-white/[.07]' : 'hover:bg-white/[.04]'}`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors"
                        style={{ background: on || i < active ? s.color : 'rgba(255,255,255,.08)', color: on || i < active ? '#fff' : '#c9c1d1' }}
                      >
                        {i < active ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : i + 1}
                      </span>
                      <span className={`font-semibold ${on ? 'text-white' : 'text-night-soft'}`}>{s.t}</span>
                    </span>
                    <span className={`grid transition-[grid-template-rows] duration-500 ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <span className="overflow-hidden">
                        <span className="block pl-11 text-sm leading-relaxed text-night-soft">{s.b}</span>
                        <span className="mb-1 ml-11 mt-3 block h-[3px] overflow-hidden rounded-full bg-white/10">
                          <span data-cs-bar={i} className="block h-full w-full origin-left scale-x-0 rounded-full" style={{ background: s.color }} />
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="relative flex min-h-[460px] flex-col p-5 lg:min-h-[520px] lg:p-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-night-soft">Dashboard preview</span>
              <span className="font-mono text-[11px] text-night-soft">
                Step {active + 1} / {STEPS.length}
              </span>
            </div>
            <div className="relative flex-1">
              {PREVIEWS.map((P, i) => (
                <div key={i} data-preview className="absolute inset-0 flex items-center justify-center" aria-hidden={i !== active}>
                  <P />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
