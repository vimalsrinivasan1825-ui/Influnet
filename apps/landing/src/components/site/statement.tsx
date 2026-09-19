'use client';

import { useRef } from 'react';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

// Apple-style statement: a large paragraph whose words light up as it moves
// through the viewport. It never pins the page; it only follows the reader.
export default function Statement({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const words = new SplitText(q('[data-statement]'), { type: 'words' }).words;
      gsap.fromTo(
        words,
        { opacity: 0.14 },
        {
          opacity: 1,
          ease: 'none',
          stagger: 0.1,
          scrollTrigger: { trigger: q('[data-statement]')[0], start: 'top 80%', end: 'bottom 45%', scrub: true },
        },
      );
    },
    { scope: root },
  );

  return (
    <section ref={root} data-tone="dark" className="bg-night py-28 text-white sm:py-40">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 sm:px-8">
        <div className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">[ {eyebrow} ]</div>
        <p
          data-statement
          className="font-display text-[34px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-6xl [&_em]:not-italic [&_em]:text-brand"
        >
          {children}
        </p>
      </div>
    </section>
  );
}
