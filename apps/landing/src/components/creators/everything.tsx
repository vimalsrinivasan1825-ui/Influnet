'use client';

import { useRef } from 'react';
import KineticWords from '@/components/site/kinetic-words';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

// The creator pitch's own closing list, minus what the product doesn't do yet.
const ROW_A = ['Profile', 'Portfolio', 'Social strength', 'Business verification', 'Conversations'];
const ROW_B = ['Projects', 'Invoicing', 'Payments', 'Open campaigns', 'Who viewed you'];

function Tile({ title, body, children, wide }: { title: string; body: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <article
      data-tile
      className={`flex flex-col gap-5 overflow-hidden rounded-[28px] border border-line bg-card p-6 sm:p-7 ${wide ? 'lg:col-span-2' : ''}`}
    >
      <div className="relative h-[180px] overflow-hidden rounded-2xl bg-paper">{children}</div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">{title}</h3>
        <p className="text-base leading-relaxed text-ink-soft">{body}</p>
      </div>
    </article>
  );
}

export default function Everything() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) return;

      gsap.from(q('[data-tile]'), {
        y: 70,
        rotationX: 14,
        transformPerspective: 1000,
        autoAlpha: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.09,
        scrollTrigger: { trigger: q('[data-tiles]')[0], start: 'top 75%' },
      });

      // Each tile's own small loop, running only while the grid is on screen.
      const loops: gsap.core.Timeline[] = [];
      const loop = () => {
        const t = gsap.timeline({ repeat: -1, paused: true });
        loops.push(t);
        return t;
      };

      loop()
        .to(q('[data-shuffle="0"]'), { x: 104, rotation: 4, duration: 0.8, ease: 'expo.inOut' }, 1)
        .to(q('[data-shuffle="1"]'), { x: -104, rotation: -3, duration: 0.8, ease: 'expo.inOut' }, 1)
        .to(q('[data-shuffle="0"]'), { x: 0, rotation: 0, duration: 0.8, ease: 'expo.inOut' }, 3)
        .to(q('[data-shuffle="1"]'), { x: 0, rotation: 0, duration: 0.8, ease: 'expo.inOut' }, 3)
        .to({}, { duration: 1 });

      loop()
        .fromTo(q('[data-social]'), { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.18 })
        .to({}, { duration: 2.2 })
        .to(q('[data-social]'), { scale: 0.6, autoAlpha: 0, duration: 0.3, stagger: 0.05 });

      loop().to(q('[data-viewers]'), { yPercent: -50, duration: 6, ease: 'none' });

      loop()
        .to(q('[data-camp="top"]'), { x: 260, rotation: 14, autoAlpha: 0, duration: 0.7, ease: 'power3.in' }, 1.6)
        .to(q('[data-camp="mid"]'), { y: 0, scale: 1, duration: 0.5, ease: 'expo.out' }, '<+0.2')
        .set(q('[data-camp="top"]'), { x: -60, rotation: -8 })
        .to(q('[data-camp="top"]'), { x: 0, rotation: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out' }, '+=0.5')
        .to(q('[data-camp="mid"]'), { y: 14, scale: 0.94, duration: 0.5, ease: 'power2.out' }, '<');

      loop()
        .fromTo(q('[data-receipt-line]'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out', stagger: 0.15 })
        .fromTo(q('[data-stamp]'), { scale: 2.2, rotation: -30, autoAlpha: 0 }, { scale: 1, rotation: -8, autoAlpha: 1, duration: 0.45, ease: 'back.out(2)' })
        .to({}, { duration: 2 })
        .to(q('[data-stamp], [data-receipt-line]'), { autoAlpha: 0, duration: 0.3 })
        .set(q('[data-stamp], [data-receipt-line]'), { autoAlpha: 1 });

      loop()
        .fromTo(q('[data-bar]'), { scaleX: 0 }, { scaleX: (i) => [0.9, 0.55, 0.25][i] ?? 0.5, duration: 1.4, ease: 'expo.out', stagger: 0.15 })
        .to({}, { duration: 2.2 });

      const run = ScrollTrigger.create({
        trigger: q('[data-tiles]')[0],
        start: 'top 85%',
        end: 'bottom top',
        onToggle: (self) => loops.forEach((l) => (self.isActive ? l.play() : l.pause())),
      });

      return () => run.kill();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="overflow-hidden bg-paper py-24 text-ink sm:py-32">
      <KineticWords rowA={ROW_A} rowB={ROW_B} />

      <div className="mx-auto mt-20 flex max-w-[1320px] flex-col gap-12 px-4 sm:mt-28 sm:px-8">
        <div className="flex max-w-[720px] flex-col gap-5">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ All in one place ]</div>
          <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Everything a creator needs to manage collaborations.
          </h2>
        </div>

        <div data-tiles className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile title="Your past work, as proof" body="Keep past collaborations in one portfolio, so brands see who you've worked with and what you made.">
            <div className="absolute inset-0 flex items-center justify-center gap-3">
              {['#e4d3c0', '#d3dcef', '#dcead9'].map((c, i) => (
                <div key={c} data-shuffle={i} className="h-[120px] w-[92px] rounded-xl shadow-sm" style={{ background: c }} />
              ))}
            </div>
          </Tile>

          <Tile title="All your socials, one profile" body="Connect Instagram, YouTube, Facebook, X and Snapchat, and show brands your reach before the first message.">
            <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-2.5 p-5">
              {['Instagram', 'YouTube', 'Facebook', 'X', 'Snapchat'].map((s) => (
                <span key={s} data-social className="flex h-10 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold">
                  {s}
                </span>
              ))}
            </div>
          </Tile>

          <Tile title="See who viewed you" body="Know which businesses looked at your profile, so you can follow up with the ones that matter.">
            <div className="absolute inset-x-4 top-0">
              <div data-viewers className="flex flex-col gap-2.5 py-4">
                {[...Array(2)].flatMap((_, k) =>
                  [
                    ['M', 'Mitti Skincare', '#e4d3c0'],
                    ['K', 'Kaveri Foods', '#dcead9'],
                    ['U', 'Urban Loom', '#d3dcef'],
                    ['S', 'Saaral Studio', '#f3dfe8'],
                  ].map(([i, n, c]) => (
                    <div key={`${k}-${n}`} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold" style={{ background: c }}>
                        {i}
                      </span>
                      <span className="text-sm font-semibold">{n}</span>
                      <span className="ml-auto text-xs text-ink-soft">viewed</span>
                    </div>
                  )),
                )}
              </div>
            </div>
          </Tile>

          <Tile title="Open campaigns" body="Browse campaigns brands have posted and apply to the ones that fit your content.">
            <div className="absolute inset-0 flex items-center justify-center">
              {[
                { k: 'mid', t: 'Monsoon skincare', d: '2 Reels · Beauty', z: 1, s: 0.94, y: 14 },
                { k: 'top', t: 'Diwali gifting', d: '3 Reels · Lifestyle', z: 2, s: 1, y: 0 },
              ].map((c) => (
                <div
                  key={c.k}
                  data-camp={c.k}
                  className="absolute flex w-[280px] items-center justify-between rounded-2xl border border-line bg-card px-5 py-4 shadow-[0_20px_40px_-20px_rgba(23,20,29,.3)]"
                  style={{ zIndex: c.z, transform: `translateY(${c.y}px) scale(${c.s})` }}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-base font-bold">{c.t}</span>
                    <span className="text-sm text-ink-soft">{c.d}</span>
                  </span>
                  <span className="rounded-full bg-ink px-3.5 py-2 text-xs font-bold text-white">Apply</span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile title="Invoices and payments" body="Brands pay the agreed amounts through Razorpay on the project, with invoices and receipts kept alongside.">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative flex w-[200px] flex-col gap-2.5 rounded-xl bg-card p-4 shadow-sm">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Invoice · Project #1042</span>
                {[1, 0.7, 0.85, 0.5].map((w, i) => (
                  <span key={i} data-receipt-line className="block h-2 origin-left rounded-full bg-paper-deep" style={{ width: `${w * 100}%` }} />
                ))}
                <span
                  data-stamp
                  className="absolute -right-4 bottom-2 rounded-lg border-2 border-[#0b7a55] px-2.5 py-1 font-mono text-xs font-medium uppercase text-[#0b7a55]"
                >
                  Paid
                </span>
              </div>
            </div>
          </Tile>

          <Tile title="Every project, tracked" body="See where each collaboration stands and whose move it is, from request to final payment.">
            <div className="absolute inset-0 flex flex-col justify-center gap-4 px-6">
              {['Mitti Skincare · Final approval', 'Kaveri Foods · Shooting', 'Urban Loom · Agree terms'].map((p) => (
                <div key={p} className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">{p}</span>
                  <span className="block h-2 overflow-hidden rounded-full bg-paper-deep">
                    <span data-bar className="block h-full w-full origin-left rounded-full bg-brand" />
                  </span>
                </div>
              ))}
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}
