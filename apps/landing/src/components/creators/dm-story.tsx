'use client';

import { useRef } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

const ROWS = [
  { i: 'P', n: 'priya_k', m: 'hii', t: '2m', av: '#f3dfe8' },
  { i: 'K', n: 'karthik.v', m: 'Good morning!', t: '4m', av: '#dfe7f3' },
  { i: 'U', n: 'user8391022', m: 'follow back?', t: '9m', av: '#e9e6df' },
  { i: 'M', n: 'Mitti Skincare', m: 'Hi Neha, paid collab for 2 reels?', t: '12m', av: '#e4d3c0', brand: true },
  { i: 'A', n: 'arun_clicks', m: 'bro saw your reel', t: '15m', av: '#dff0e8' },
  { i: 'G', n: 'grow.fast.today', m: 'Get 10K followers in 1 day', t: '21m', av: '#f0e6d6' },
  { i: 'D', n: 'divya.r', m: 'where did you buy that?', t: '33m', av: '#ece0f3' },
];

const BEATS = [
  { k: '01', label: 'The inbox', title: 'How many DMs did you get today?', body: 'Greetings. Spam. Friends. "hi". Follow-back requests. Your inbox was never built for business.' },
  { k: '02', label: 'The brand', title: 'Somewhere in there is a real brand.', body: 'A genuine paid collaboration, sitting between a "good morning" and a bot selling followers.' },
  { k: '03', label: 'Too late', title: 'By the time you find it, they may have moved on.', body: "Brands reach out to several creators at once. Replying to every DM and email the moment it lands isn't your job." },
  { k: '04', label: 'Influnet', title: 'Influnet pulls it out of the noise.', body: 'Brands reach you through your Influnet profile instead. Every request arrives in one place, with who they are and what they want.' },
];

export default function DmStory() {
  const root = useRef<HTMLElement>(null);
  // The desktop film, so a click on a step can jump to it; and where each step starts.
  const film = useRef<{ tl: gsap.core.Timeline; starts: number[] } | null>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const count = q('[data-dm-count]')[0];
      const counter = { v: 0 };

      if (prefersReducedMotion()) {
        if (count) count.textContent = '38';
        gsap.set(q('[data-dm-inbox]'), { opacity: 0.5 });
        gsap.set(q('[data-dm-request]'), { autoAlpha: 1 });
        return;
      }

      // The film itself — the same shots on every screen size, timed to be read.
      const shots = (tl: gsap.core.Timeline, withBeats: boolean) => {
        const beats = q('[data-dm-beat]');
        if (withBeats) gsap.set(beats.slice(1), { autoAlpha: 0, yPercent: 20 });
        const beat = (i: number, at: string | number) => {
          if (!withBeats) return;
          tl.to(beats[i - 1], { autoAlpha: 0, yPercent: -20, duration: 0.5, ease: 'power2.in' }, at).to(
            beats[i],
            { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: 'expo.out' },
            '>-0.1',
          );
        };

        tl.from(q('[data-dm-row]'), { y: -48, autoAlpha: 0, duration: 0.6, ease: 'power3.out', stagger: 0.12 })
          .to(counter, {
            v: 38,
            duration: 1.4,
            ease: 'power1.out',
            onUpdate: () => {
              if (count) count.textContent = String(Math.round(counter.v));
            },
          }, 0)
          .addLabel('find', '+=1.2');
        beat(1, 'find');
        tl.to(q('[data-dm-row]:not([data-brand])'), { opacity: 0.28, filter: 'blur(1.5px)', duration: 0.6 }, 'find+=0.2')
          .to(q('[data-brand]'), { scale: 1.04, backgroundColor: '#fdeef6', boxShadow: '0 0 0 3px rgba(255,7,142,.35)', duration: 0.6, ease: 'back.out(2)' }, '<')
          .addLabel('late', '+=1.8');
        beat(2, 'late');
        tl.to(q('[data-dm-time-now]'), { autoAlpha: 0, y: -8, duration: 0.3 }, 'late+=0.2')
          .fromTo(q('[data-dm-time-late]'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3 }, '<')
          .to(q('[data-brand]'), { backgroundColor: '#f4f2ee', boxShadow: '0 0 0 0 rgba(255,7,142,0)', duration: 0.5 }, '<')
          .fromTo(q('[data-dm-late-tag]'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.4)' }, '<+0.1')
          .addLabel('pull', '+=2');
        beat(3, 'pull');
        tl.to(q('[data-dm-late-tag]'), { autoAlpha: 0, duration: 0.2 }, 'pull+=0.1')
          .to(q('[data-brand]'), { y: -18, scale: 1.08, backgroundColor: '#ffffff', boxShadow: '0 30px 60px -20px rgba(23,20,29,.35)', duration: 0.5, ease: 'power3.out' }, '<')
          .to(q('[data-dm-inbox]'), { scale: 0.93, filter: 'blur(3px)', opacity: 0.5, duration: 0.8, ease: 'power2.inOut' }, '<+0.2')
          .fromTo(
            q('[data-dm-request]'),
            { autoAlpha: 0, y: -120, scale: 0.7, rotation: -6 },
            { autoAlpha: 1, y: 0, scale: 1, rotation: 0, duration: 1, ease: 'expo.out' },
            '<+0.1',
          )
          .from(q('[data-dm-request-part]'), { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, '<+0.25')
          .to(q('[data-brand]'), { autoAlpha: 0, duration: 0.3 }, '<')
          // Hold on the answer, then clear the stage so the loop restarts cleanly.
          .to({}, { duration: 3.2 })
          .to(q('[data-dm-request]'), { autoAlpha: 0, y: 30, duration: 0.5, ease: 'power2.in' })
          .to(q('[data-dm-inbox]'), { autoAlpha: 0, duration: 0.4 }, '<');
        if (withBeats) tl.to(beats[3], { autoAlpha: 0, yPercent: -20, duration: 0.4 }, '<');
        return tl;
      };

      // Plays by itself while the section is on screen, loops, and pauses when it leaves.
      const trigger = { trigger: q('[data-dm-stage]')[0], start: 'top 60%', end: 'bottom 20%', toggleActions: 'play pause resume pause' };
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        const tl = shots(gsap.timeline({ repeat: -1, repeatDelay: 0.3, defaults: { duration: 0.7 }, scrollTrigger: trigger }), true);

        // The progress bar: each step's bar fills while its beat is on screen, and
        // its number lights up. Worked out from the film's own playhead on every
        // update, rather than tweened alongside it, so seeking to a step or the
        // loop restarting can never leave it out of step with what is playing.
        const end = tl.duration();
        // A step starts when its words start to appear: each beat change first
        // fades the old one out for 0.5s (see beat() above).
        const starts = [0, tl.labels.find + 0.5, tl.labels.late + 0.5, tl.labels.pull + 0.5];
        const fills = q('[data-dm-fill]');
        const steps = q('[data-dm-step]');
        let active = -1;
        const paint = () => {
          const t = tl.time();
          starts.forEach((start, i) => {
            const stop = starts[i + 1] ?? end;
            const v = Math.min(1, Math.max(0, (t - start) / (stop - start)));
            fills[i].style.transform = `scaleX(${v})`;
          });
          let now = 0;
          starts.forEach((start, i) => {
            if (t >= start) now = i;
          });
          if (now !== active) {
            active = now;
            steps.forEach((el, i) => {
              el.style.setProperty('--on', i === now ? '1' : '0');
              el.setAttribute('aria-current', i === now ? 'step' : 'false');
            });
          }
        };
        tl.eventCallback('onUpdate', paint);
        paint();
        film.current = { tl, starts };
        return () => {
          film.current = null;
        };
      });
      mm.add('(max-width: 1023px)', () => {
        shots(gsap.timeline({ repeat: -1, repeatDelay: 0.3, scrollTrigger: trigger }), false);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="problem" className="relative bg-paper text-ink">
      <div data-dm-stage className="mx-auto grid max-w-[1320px] items-center gap-12 px-4 py-24 sm:px-8 lg:h-[100svh] lg:grid-cols-2 lg:gap-16 lg:py-0">
        <div className="flex flex-col gap-6">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ The problem ]</div>

          {/* Desktop: the story plays one beat at a time, so a progress bar shows
              there are four and which one is on screen. Each step jumps to its beat. */}
          <div className="hidden grid-cols-4 gap-3 lg:mb-4 lg:grid" role="group" aria-label="The problem, in four steps">
            {BEATS.map((b, i) => (
              <button
                key={b.k}
                type="button"
                data-dm-step
                aria-label={`Step ${i + 1} of ${BEATS.length}: ${b.label}`}
                onClick={() => {
                  const f = film.current;
                  if (!f) return;
                  f.tl.seek(f.starts[i] + 0.01).play();
                }}
                className="group flex flex-col items-start gap-2 text-left [--on:0]"
                style={{ ['--on' as string]: i === 0 ? 1 : 0 }}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-ink tabular-nums opacity-[calc(0.22+var(--on)*0.78)] transition-opacity duration-300 group-hover:opacity-100">
                    {b.k}
                  </span>
                  <span className="text-[13px] font-semibold text-ink-soft opacity-[calc(0.5+var(--on)*0.5)] transition-opacity duration-300">
                    {b.label}
                  </span>
                </span>
                <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-line">
                  {/* Starts empty via transform, the same property the film writes to.
                      (A scale-x-0 class would set the separate `scale` property,
                      which multiplies with it and keeps the bar at zero.) */}
                  <span data-dm-fill className="absolute inset-0 origin-left rounded-full bg-brand" style={{ transform: 'scaleX(0)' }} />
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex flex-col gap-10 lg:h-[300px] lg:gap-0">
            {BEATS.map((b) => (
              <div key={b.k} data-dm-beat className="flex flex-col gap-4 lg:absolute lg:inset-x-0 lg:top-0">
                <span className="font-display text-5xl font-bold leading-none tracking-[-0.04em] text-brand lg:hidden">{b.k}</span>
                <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl xl:text-[56px]">
                  {b.title}
                </h2>
                <p className="max-w-[500px] text-lg leading-relaxed text-ink-soft">{b.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto h-[600px] w-full max-w-[440px]">
          <div
            data-dm-inbox
            className="absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border border-line bg-card shadow-[0_30px_60px_-30px_rgba(23,20,29,.2)]"
          >
            <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#efece6] px-6">
              <span className="text-[17px] font-bold">Instagram DMs</span>
              <span className="rounded-full bg-paper-deep px-2.5 py-1.5 font-mono text-xs text-ink-soft">
                <span data-dm-count>38</span> unread
              </span>
            </div>
            <div className="flex flex-col">
              {ROWS.map((r) => (
                <div
                  key={r.n}
                  data-dm-row
                  data-brand={r.brand ? '' : undefined}
                  className="relative flex h-[74px] items-center gap-3.5 border-b border-paper-deep bg-card px-6"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
                    style={{ background: r.av }}
                  >
                    {r.i}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{r.n}</span>
                    <span className="truncate text-sm text-ink-soft">{r.m}</span>
                  </div>
                  {r.brand ? (
                    <span className="relative w-14 text-right text-[13px] text-ink-soft">
                      <span data-dm-time-now className="absolute right-0 top-1/2 -translate-y-1/2">{r.t}</span>
                      <span data-dm-time-late className="invisible absolute right-0 top-1/2 -translate-y-1/2 whitespace-nowrap font-semibold text-[#b42318]">
                        2 days
                      </span>
                      <span
                        data-dm-late-tag
                        className="invisible absolute -top-9 right-0 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                      >
                        They may have moved on
                      </span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-ink-soft">{r.t}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            data-dm-request
            className="invisible absolute inset-x-3 top-[150px] flex flex-col gap-4 rounded-[24px] border-[1.5px] border-ink bg-card p-6 shadow-[0_40px_80px_-24px_rgba(23,20,29,.4)] sm:inset-x-6"
          >
            <div data-dm-request-part className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">New request on Influnet</span>
              <LogoMark size={22} />
            </div>
            <div data-dm-request-part className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e4d3c0] font-display text-xl font-extrabold">M</div>
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold">Mitti Skincare</span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0b7a55]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Reviewed by Influnet
                </span>
              </div>
            </div>
            <div data-dm-request-part className="grid grid-cols-2 gap-2.5">
              {[
                ['Wants', '2 Instagram Reels'],
                ['Budget', '₹40,000'],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 rounded-xl bg-paper-deep p-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</span>
                  <span className="text-[15px] font-bold">{v}</span>
                </div>
              ))}
            </div>
            <span data-dm-request-part className="flex h-12 items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-white">
              View request
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
