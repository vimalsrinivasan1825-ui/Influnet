'use client';

import { useRef, useState } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { GATE_DONE } from './gateway-events';

// Where the camera dives: the big top-right node of the mark (viewBox 430 150 690 720, node at 960,246).
const ZOOM_ORIGIN = '76.8% 13.3%';

/**
 * The logo sting that opens /creators and /business on every load: the mark
 * draws itself, the camera dives into its pink node, and the pink collapses to
 * reveal the hero. The flag that makes the hero wait is raised by BOOT_SCRIPT
 * (lib/role.ts). Rendered by the route pages only — the gateway on `/` has
 * its own longer version and never shows this one.
 */
export default function PageIntro() {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [done, setDone] = useState(false);

  useGSAP(
    () => {
      const html = document.documentElement;
      const finish = () => {
        html.style.overflow = '';
        delete html.dataset.gate;
        window.dispatchEvent(new Event(GATE_DONE));
      };
      if (prefersReducedMotion()) {
        setDone(true);
        finish();
        return;
      }
      html.style.overflow = 'hidden';
      const q = gsap.utils.selector(root);
      const word = new SplitText(q('[data-intro-word]'), { type: 'chars', mask: 'chars' });

      tl.current = gsap
        .timeline({ delay: 0.15, onComplete: () => setDone(true) })
        .from(q('.intro-logo .logo-spoke'), { drawSVG: '0%', duration: 0.5, ease: 'power3.inOut', stagger: 0.05 })
        .from(q('.intro-logo .logo-ring'), { drawSVG: '0%', duration: 0.6, ease: 'power3.inOut' }, 0.05)
        .from(q('.intro-logo .logo-node'), { scale: 0, transformOrigin: '50% 50%', duration: 0.5, ease: 'back.out(2.2)', stagger: 0.06 }, 0.35)
        .from(word.chars, { yPercent: 110, duration: 0.6, ease: 'expo.out', stagger: 0.03 }, 0.6)
        .to(word.chars, { yPercent: -110, duration: 0.35, ease: 'power3.in', stagger: 0.012 }, '+=0.35')
        // The camera dives into the pink node; the mark itself never turns.
        .to(q('.intro-logo'), { scale: 60, duration: 0.9, ease: 'expo.in', transformOrigin: ZOOM_ORIGIN }, '-=0.1')
        .set(q('[data-intro-bg]'), { backgroundColor: '#ff078e' })
        .set(q('[data-intro-mark]'), { autoAlpha: 0 })
        .add(finish)
        .to(q('[data-intro-bg]'), { clipPath: 'circle(0% at 50% 50%)', duration: 0.85, ease: 'expo.inOut' });
    },
    { scope: root },
  );

  if (done) return null;

  return (
    <div ref={root} data-page-intro className="fixed inset-0 z-[100]">
      <div data-intro-bg className="absolute inset-0 bg-night" style={{ clipPath: 'circle(150% at 50% 50%)' }} aria-hidden>
        <div data-intro-mark className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <LogoMark size={148} className="intro-logo overflow-visible" />
          <div data-intro-word className="font-display text-6xl font-bold tracking-[-0.03em] text-white sm:text-7xl">
            influnet
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => tl.current?.progress(1)}
        className="absolute right-5 top-5 h-11 rounded-full border border-white/15 bg-white/5 px-5 text-[15px] font-medium text-night-soft hover:text-white sm:right-10 sm:top-8"
      >
        Skip intro
      </button>
    </div>
  );
}
