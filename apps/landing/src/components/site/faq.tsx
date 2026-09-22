'use client';

import { useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

export type FaqItem = { q: string; a: string };

// Every answer passed in must be checked against the product. No pricing,
// commission or payout-timing answers until those are decided and built.
export default function Faq({ items, title }: { items: FaqItem[]; title: string }) {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(gsap.utils.toArray<HTMLElement>('[data-faq-item]', root.current), {
        y: 40,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.07,
        scrollTrigger: { trigger: root.current, start: 'top 70%' },
      });
    },
    { scope: root },
  );

  const toggle = (i: number) => {
    const panels = root.current?.querySelectorAll<HTMLElement>('[data-faq-panel]');
    const next = open === i ? null : i;
    const dur = prefersReducedMotion() ? 0 : 0.6;
    panels?.forEach((p, k) => {
      gsap.to(p, { height: k === next ? 'auto' : 0, duration: dur, ease: 'expo.out' });
    });
    setOpen(next);
  };

  return (
    <section ref={root} id="faq" className="bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-4 sm:px-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-20">
        <div className="flex flex-col gap-5">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ Questions ]</div>
          <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
            {title}
          </h2>
        </div>
        <div className="flex flex-col">
          {items.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} data-faq-item className="border-b border-line">
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => toggle(i)}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left text-lg font-semibold sm:text-xl"
                  >
                    {f.q}
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong transition-transform duration-500 ${
                        isOpen ? 'rotate-45 border-ink bg-ink text-white' : ''
                      }`}
                      aria-hidden
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  data-faq-panel
                  className="overflow-hidden"
                  style={{ height: i === 0 ? 'auto' : 0 }}
                >
                  <p className="max-w-[640px] pb-6 text-[17px] leading-relaxed text-ink-soft">{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
