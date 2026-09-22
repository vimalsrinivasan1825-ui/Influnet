'use client';

import { useRef } from 'react';
import { BadgeCheck, Bookmark, LayoutGrid, Search, Star, type LucideIcon } from 'lucide-react';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

const FEATURES: { icon: LucideIcon; title: string; body: string; color: string }[] = [
  { icon: Search, title: 'Search by niche', body: 'Beauty, food, travel, fitness and more. Start from the creators who fit.', color: '#ff7fbf' },
  { icon: BadgeCheck, title: 'Verified badge', body: 'Shown only after a creator proves they own the account.', color: '#3ddc97' },
  { icon: LayoutGrid, title: 'Portfolio and reviews', body: 'Past collaborations and reviews from completed projects.', color: '#ff7fbf' },
  { icon: Bookmark, title: 'Save to a shortlist', body: 'Keep the good ones in one place and reach out when ready.', color: '#ff7fbf' },
];

// Sample searches the widget cycles through.
const SEARCHES = [
  {
    q: 'Beauty creators',
    people: [
      { i: 'N', n: 'Neha Kapoor', m: 'Chennai · 75K', bg: '#f3dfe8', fg: '#9e1f62' },
      { i: 'D', n: 'Divya R', m: 'Hyderabad · 48K', bg: '#ece0f3', fg: '#5b2a86' },
      { i: 'S', n: 'Sana M', m: 'Mumbai · 120K', bg: '#fbe3d3', fg: '#8a3a12' },
    ],
  },
  {
    q: 'Food creators',
    people: [
      { i: 'A', n: 'Arjun Rao', m: 'Bengaluru · 128K', bg: '#fde7c8', fg: '#8a4b08' },
      { i: 'M', n: 'Meera S', m: 'Kochi · 36K', bg: '#dcead9', fg: '#1f6b35' },
      { i: 'R', n: 'Rahul T', m: 'Pune · 64K', bg: '#e2e8f7', fg: '#2f3e66' },
    ],
  },
  {
    q: 'Travel creators',
    people: [
      { i: 'P', n: 'Priya Menon', m: 'Kochi · 42K', bg: '#d6ecf3', fg: '#1d5b73' },
      { i: 'V', n: 'Vikram J', m: 'Jaipur · 88K', bg: '#f7e6f0', fg: '#8c1d5e' },
      { i: 'A', n: 'Anu K', m: 'Goa · 29K', bg: '#e6f3ea', fg: '#1f6b35' },
    ],
  },
  {
    q: 'Fitness creators',
    people: [
      { i: 'K', n: 'Karthik S', m: 'Coimbatore · 96K', bg: '#dcefdc', fg: '#1f6b35' },
      { i: 'I', n: 'Isha P', m: 'Delhi · 51K', bg: '#f3dfe8', fg: '#9e1f62' },
      { i: 'D', n: 'Dev N', m: 'Chandigarh · 73K', bg: '#fde7c8', fg: '#8a4b08' },
    ],
  },
];

export default function Shortlist() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const groups = q('[data-sl-group]');
      const queries = q('[data-sl-query]');
      const count = q('[data-sl-count]')[0];
      if (prefersReducedMotion()) {
        gsap.set(groups.slice(1), { autoAlpha: 0 });
        gsap.set(queries.slice(1), { autoAlpha: 0 });
        return;
      }

      const title = new SplitText(q('[data-sl-title]'), { type: 'lines', mask: 'lines' });
      gsap
        .timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%' } })
        .from(title.lines, { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.08 })
        .from(q('[data-sl-feature]'), { y: 40, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.3)
        .from(q('[data-sl-widget]'), { y: 60, scale: 0.94, autoAlpha: 0, duration: 1.2, ease: 'expo.out' }, 0.2);

      const typed = queries.map((el) => new SplitText(el, { type: 'chars' }).chars);
      gsap.set(groups, { autoAlpha: 0 });
      gsap.set(queries, { autoAlpha: 0 });
      let saved = 0;
      let current: gsap.core.Timeline | null = null;

      const play = (i: number) => {
        const g = groups[i];
        const next = (i + 1) % groups.length;
        const cards = g.querySelectorAll('[data-sl-card]');
        const ticks = g.querySelectorAll('[data-sl-tick]');
        const marks = g.querySelectorAll('[data-sl-save]');
        const tl = gsap.timeline({ onComplete: () => play(next) });
        tl.set(queries[i], { autoAlpha: 1 })
          .set(typed[i], { autoAlpha: 0 })
          .set(g, { autoAlpha: 1 })
          .set(cards, { autoAlpha: 0, y: 24 })
          .set(ticks, { scale: 0 })
          .set(marks, { fill: 'rgba(0,0,0,0)', scale: 1 })
          .to(typed[i], { autoAlpha: 1, duration: 0.01, stagger: 0.06 })
          .to(cards, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.12 }, '+=0.2')
          .to(ticks, { scale: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.12 }, '-=0.3');
        marks.forEach((m) => {
          tl.to(m, { scale: 1.35, fill: '#ff078e', color: '#ff078e', duration: 0.18, ease: 'power2.out' }, '+=0.35')
            .to(m, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
            .add(() => {
              saved += 1;
              if (count) count.textContent = String(saved);
            }, '<');
        });
        tl.to({}, { duration: 1.4 })
          .to(cards, { autoAlpha: 0, y: -16, duration: 0.35, ease: 'power2.in', stagger: 0.05 })
          .to(queries[i], { autoAlpha: 0, duration: 0.2 }, '<');
        current = tl;
      };

      const st = gsap.timeline({
        scrollTrigger: {
          trigger: q('[data-sl-widget]')[0],
          start: 'top 75%',
          once: true,
          onEnter: () => play(0),
        },
      });
      return () => {
        st.kill();
        current?.kill();
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} id="find" data-tone="dark" className="relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,#ff078e_0%,#c8307f_45%,transparent_70%)] opacity-30 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#ff4fa8_0%,transparent_70%)] opacity-15 blur-[120px]" aria-hidden />
      <div className="relative mx-auto grid max-w-[1320px] items-center gap-14 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">[ Find creators ]</div>
            <h2 data-sl-title className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Shortlist creators in minutes, <span className="text-brand">not weeks.</span>
            </h2>
            <p className="max-w-[540px] text-lg leading-relaxed text-night-soft">
              Skip the endless profile scrolling. Search by niche, check who is verified, look at their past work, and save the
              ones that fit.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} data-sl-feature className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-5 backdrop-blur">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${f.color}24`, color: f.color }}>
                    <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="text-[17px] font-bold">{f.title}</span>
                  <span className="text-sm leading-relaxed text-night-soft">{f.body}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div data-sl-widget className="rounded-[32px] bg-[linear-gradient(150deg,rgba(255,7,142,.55),rgba(255,255,255,.08)_40%,rgba(200,48,127,.35))] p-px shadow-[0_50px_100px_-40px_rgba(255,7,142,.45)]">
          <div className="rounded-[31px] bg-[#1c1722] p-5">
          <div className="flex items-center justify-between px-1 pb-4">
            <span className="text-sm font-semibold text-night-soft">Discover creators</span>
            <span className="flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-bold text-[#ff7fbf]">
              <Bookmark className="h-3.5 w-3.5" aria-hidden /> Shortlist · <span data-sl-count>0</span>
            </span>
          </div>
          <div className="relative mb-4 flex h-12 items-center gap-2.5 rounded-2xl bg-white px-4 text-ink">
            <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
            <span className="relative h-6 flex-1">
              {SEARCHES.map((s) => (
                <span key={s.q} data-sl-query className="absolute inset-0 whitespace-pre text-[15px] font-semibold leading-6">
                  {s.q}
                </span>
              ))}
            </span>
          </div>
          <div className="grid">
            {SEARCHES.map((s) => (
              <div key={s.q} data-sl-group className="flex flex-col gap-2.5 [grid-area:1/1]">
                {s.people.map((p) => (
                  <div key={p.n} data-sl-card className="flex items-center gap-3 rounded-2xl bg-white/[.06] p-3">
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display font-extrabold" style={{ background: p.bg, color: p.fg }}>
                      {p.i}
                      <span data-sl-tick className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#1c1722] bg-[#3ddc97] text-night">
                        <BadgeCheck className="h-3 w-3" strokeWidth={3} aria-hidden />
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{p.n}</span>
                      <span className="flex items-center gap-1.5 text-xs text-night-soft">
                        {p.m} · <Star className="h-3 w-3 fill-[#e7b416] text-[#e7b416]" aria-hidden /> 4.8
                      </span>
                    </span>
                    <Bookmark data-sl-save className="h-5 w-5 text-night-soft" strokeWidth={2} aria-hidden />
                  </div>
                ))}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
