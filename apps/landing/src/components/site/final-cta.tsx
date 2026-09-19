'use client';

import { useRef } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import type { Role } from '@/lib/role';
import { APP_URL, SIGNUP_URL } from './links';

type Props = { role: Role; title: string; body: string; cta: string };

export default function FinalCta({ role, title, body, cta }: Props) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) return;
      const title = new SplitText(q('[data-cta-title]'), { type: 'lines', mask: 'lines' });

      // The mark assembles itself as you reach the section and stays stationary.
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 60%' } });
      tl.from(q('.cta-logo .logo-spoke'), { drawSVG: '0%', duration: 0.8, ease: 'power3.inOut', stagger: 0.08 })
        .from(q('.cta-logo .logo-ring'), { drawSVG: '0%', duration: 1, ease: 'power3.inOut' }, 0.1)
        .from(q('.cta-logo .logo-node'), { scale: 0, transformOrigin: '50% 50%', duration: 0.7, ease: 'back.out(2.2)', stagger: 0.08 }, 0.5)
        .from(title.lines, { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.4)
        .from(q('[data-cta-fade]'), { y: 24, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.1 }, 0.8);
    },
    { scope: root },
  );

  return (
    <section ref={root} data-tone="dark" className="relative isolate overflow-hidden bg-night py-28 text-white sm:py-40">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-20 blur-[140px]" />
      <div className="mx-auto flex max-w-[980px] flex-col items-center gap-8 px-4 text-center sm:px-8">
        <div>
          <LogoMark size={132} className="cta-logo overflow-visible" />
        </div>
        <h2
          data-cta-title
          className="font-display text-[44px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-7xl"
        >
          {title}
        </h2>
        <p data-cta-fade className="max-w-[560px] text-lg leading-relaxed text-night-soft sm:text-xl">
          {body}
        </p>
        <div data-cta-fade className="flex flex-wrap justify-center gap-3">
          <a
            href={SIGNUP_URL[role]}
            className="flex h-14 items-center rounded-full bg-brand px-8 text-[17px] font-bold text-ink transition-colors hover:bg-white"
          >
            {cta}
          </a>
          <a
            href={`${APP_URL}/login`}
            className="flex h-14 items-center rounded-full border-[1.5px] border-white/25 px-7 text-[17px] font-semibold transition-colors hover:border-white/60"
          >
            Log in
          </a>
        </div>
      </div>
    </section>
  );
}
