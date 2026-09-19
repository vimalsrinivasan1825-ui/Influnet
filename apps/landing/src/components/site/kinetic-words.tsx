'use client';

import { Fragment, useRef } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

function Row({ words, dir }: { words: string[]; dir: 'fwd' | 'rev' }) {
  const run = [...words, ...words];
  return (
    <div className="flex overflow-hidden whitespace-nowrap" aria-hidden>
      <div data-marquee={dir} className="flex shrink-0 items-center gap-8 pr-8">
        {run.map((w, i) => (
          <Fragment key={i}>
            <span className="font-display text-[56px] font-bold leading-none tracking-[-0.04em] sm:text-[96px] xl:text-[120px]">
              {w}
            </span>
            <LogoMark size={40} className="shrink-0 sm:h-14 sm:w-14" />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Kinetic type: two rows drift in opposite directions and surge with scroll speed.
export default function KineticWords({ rowA, rowB }: { rowA: string[]; rowB: string[] }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const fwd = gsap.to(q('[data-marquee="fwd"]'), { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      const rev = gsap.fromTo(q('[data-marquee="rev"]'), { xPercent: -50 }, { xPercent: 0, duration: 42, ease: 'none', repeat: -1 });
      const st = ScrollTrigger.create({
        trigger: root.current,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 400, 6);
          gsap.to([fwd, rev], { timeScale: boost, duration: 0.2, overwrite: true });
          gsap.to([fwd, rev], { timeScale: 1, duration: 1.2, delay: 0.2, ease: 'power2.out' });
        },
        onToggle: (self) => {
          fwd.paused(!self.isActive);
          rev.paused(!self.isActive);
        },
      });
      return () => st.kill();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="flex flex-col gap-4 overflow-hidden sm:gap-6">
      <Row words={rowA} dir="fwd" />
      <div className="text-brand">
        <Row words={rowB} dir="rev" />
      </div>
    </div>
  );
}
