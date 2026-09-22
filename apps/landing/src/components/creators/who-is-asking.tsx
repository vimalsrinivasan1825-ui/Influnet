'use client';

import { useRef } from 'react';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

// The questions a creator asks about every stranger in their DMs (straight from
// creator conversations), each answered by a line on the brand's Influnet card.
const QA = [
  { q: 'Who is this brand?', label: 'Business', a: 'Mitti Skincare · Skincare · Coimbatore', pos: 'left-[2%] top-[4%]', rot: -3 },
  { q: 'Is this a real business?', label: 'Status', a: 'Reviewed by the Influnet team', ok: true, pos: 'left-[30%] top-[30%]', rot: 2 },
  { q: 'What is the collab?', label: 'Request', a: '2 Instagram Reels · ₹40,000', pos: 'left-[0%] top-[56%]', rot: 1 },
  { q: 'Have others worked with them?', label: 'Creator reviews', a: '4.8 from completed projects', pos: 'left-[24%] top-[80%]', rot: -2 },
];

export default function WhoIsAsking() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) {
        gsap.set(q('[data-ask-bubble]'), { autoAlpha: 0 });
        gsap.set(q('[data-ask-done]'), { autoAlpha: 1 });
        return;
      }

      const title = new SplitText(q('[data-ask-title]'), { type: 'lines', mask: 'lines' });
      gsap.from(title.lines, {
        yPercent: 105,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.08,
        scrollTrigger: { trigger: q('[data-ask-title]')[0], start: 'top 80%' },
      });

      const bubbles = q('[data-ask-bubble]');
      const rows = q('[data-ask-row]');
      const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-ask-stage]')[0], start: 'top 65%' } });

      tl.from(q('[data-ask-card]'), { x: 60, autoAlpha: 0, rotation: 3, duration: 1, ease: 'expo.out' })
        .from(bubbles, { scale: 0, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.22 }, 0.2)
        .to({}, { duration: 0.6 });

      // Each question travels into the row that answers it, then the answer writes in.
      bubbles.forEach((b, i) => {
        const row = rows[i];
        const at = `answer${i}`;
        tl.addLabel(at, i === 0 ? '+=0' : '-=0.35')
          .to(
            b,
            {
              x: () => row.getBoundingClientRect().left - b.getBoundingClientRect().left + (gsap.getProperty(b, 'x') as number),
              y: () => row.getBoundingClientRect().top - b.getBoundingClientRect().top + (gsap.getProperty(b, 'y') as number),
              rotation: 0,
              scale: 0.7,
              duration: 0.7,
              ease: 'power3.inOut',
            },
            at,
          )
          .to(b, { autoAlpha: 0, duration: 0.2 }, `${at}+=0.55`)
          .from(row.querySelectorAll('[data-ask-part]'), { autoAlpha: 0, x: -12, duration: 0.45, ease: 'expo.out', stagger: 0.06 }, `${at}+=0.55`)
          .from(row.querySelectorAll('[data-ask-check]'), { scale: 0, duration: 0.5, ease: 'back.out(3)' }, `${at}+=0.7`);
      });
      tl.fromTo(q('[data-ask-done]'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, '+=0.2');
    },
    { scope: root },
  );

  return (
    <section ref={root} className="overflow-x-clip bg-paper-deep py-24 text-ink sm:py-32">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-14 px-4 sm:px-8">
        <div className="flex max-w-[760px] flex-col gap-5">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ Know who&apos;s asking ]</div>
          <h2 data-ask-title className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Every question you ask about a stranger in your DMs, answered before you reply.
          </h2>
          <p className="max-w-[580px] text-lg leading-relaxed text-ink-soft">
            Every business on Influnet is reviewed by our team. Until a business is approved, its requests carry an
            &ldquo;unverified&rdquo; label, so you always know who you&apos;re dealing with.
          </p>
        </div>

        <div data-ask-stage className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-16">
          <div className="relative h-[300px] sm:h-[380px]">
            <p
              data-ask-done
              className="invisible absolute inset-x-0 top-1/2 -translate-y-1/2 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl"
            >
              Four questions.
              <br />
              <span className="text-brand-deep">Answered before you reply.</span>
            </p>
            {QA.map((item) => (
              <div
                key={item.q}
                data-ask-bubble
                style={{ transform: `rotate(${item.rot}deg)` }}
                className={`absolute ${item.pos} rounded-[22px] rounded-bl-md bg-card px-5 py-3.5 text-base font-semibold shadow-[0_18px_40px_-18px_rgba(23,20,29,.35)] sm:text-lg`}
              >
                {item.q}
              </div>
            ))}
          </div>

          <div data-ask-card className="flex flex-col gap-2 rounded-[28px] border border-line bg-card p-6 shadow-[0_40px_80px_-40px_rgba(23,20,29,.35)] sm:p-7">
            <div className="mb-3 flex items-center gap-3.5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e4d3c0] font-display text-2xl font-extrabold">M</div>
              <div className="flex flex-col">
                <span className="text-xl font-bold">Mitti Skincare</span>
                <span className="text-sm text-ink-soft">sent you a collaboration request</span>
              </div>
            </div>
            {QA.map((item) => (
              <div key={item.q} data-ask-row className="flex items-center justify-between gap-4 rounded-2xl bg-paper px-4 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span data-ask-part className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {item.label}
                  </span>
                  <span data-ask-part className={`text-[15px] font-semibold ${item.ok ? 'text-[#0b7a55]' : ''}`}>
                    {item.a}
                  </span>
                </div>
                <span
                  data-ask-check
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-verified-tint text-[#0b7a55]"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft">
              <span className="rounded-full bg-amber-tint px-2.5 py-1 text-xs font-bold text-amber">Unverified</span>
              is what you&apos;d see on a business the team hasn&apos;t approved yet.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
