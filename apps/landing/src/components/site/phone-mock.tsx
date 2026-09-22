'use client';

import { useRef } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import type { Role } from '@/lib/role';
import IPhoneFrame from './iphone-frame';
import AppHomeScreen from './app-screens';

// Real screenshots, when we have them: drop a 393×852 capture of each Home
// screen in public/app/ and set its path here. Until then the phone shows the
// Home screen redrawn from the app's own tokens (app-screens.tsx).
const SCREENSHOT: Record<Role, string | null> = {
  creator: null,
  business: null,
};

// The pushes each side actually gets (apps/web notifications → Expo push).
const PUSHES: Record<Role, [string, string, string][]> = {
  creator: [
    ['New request', 'Saffron & Co. wants a Reel and 2 Stories for Monsoon Edit.', 'now'],
    ['Advance confirmed', '₹12,000 for Café Bloom launch is paid. You’re clear to start.', '2m ago'],
    ['Brand signed off', 'Your draft for Monsoon Edit was approved.', '1h ago'],
  ],
  business: [
    ['New application', 'Ananya R. applied to Diwali Drop.', 'now'],
    ['Draft submitted', 'Kabir M. uploaded the draft for Store opening.', '5m ago'],
    ['Creator signed off', 'Terms for Diwali Drop are agreed by both sides.', '1h ago'],
  ],
};

// Where each push sits around the phone. The first drops over the top edge
// like a real banner, clear of the headline; the other two overlap the sides
// lower down. Phones only get the first, so the screen stays readable.
const SPOTS = [
  'top-[-4%] -translate-x-1/2 sm:-translate-x-[95%] lg:-translate-x-[100%] xl:-translate-x-[115%]',
  'hidden sm:block top-[55%] sm:translate-x-[4%] lg:-translate-x-[18%] xl:translate-x-[14%]',
  'hidden sm:block top-[79%] sm:-translate-x-[95%] lg:-translate-x-[100%] xl:-translate-x-[115%]',
];

type Props = { role: Role; width?: number; pushes?: boolean; className?: string };

export default function PhoneShowcase({ role, width = 300, pushes = true, className = '' }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!pushes || prefersReducedMotion()) return;
      const cards = gsap.utils.toArray<HTMLElement>('[data-push]', root.current);
      gsap.from(cards, {
        y: -24,
        scale: 0.9,
        autoAlpha: 0,
        duration: 0.8,
        ease: 'back.out(1.6)',
        stagger: 0.35,
        scrollTrigger: { trigger: root.current, start: 'top 75%' },
      });
      cards.forEach((el, i) =>
        gsap.to(el, { y: i % 2 ? 7 : -7, duration: 2.6 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.5 }),
      );
    },
    { scope: root, dependencies: [role] },
  );

  return (
    <div ref={root} className={`relative ${className}`} style={{ width }}>
      <IPhoneFrame width={width} src={SCREENSHOT[role] ?? undefined} alt={`Influnet app Home screen for ${role === 'creator' ? 'creators' : 'brands'}`}>
        <AppHomeScreen role={role} />
      </IPhoneFrame>

      {pushes &&
        PUSHES[role].map(([title, body, when], i) => (
          <div key={title} className={`absolute left-1/2 ${SPOTS[i]}`}>
            <div
              data-push
              className="w-[250px] rounded-[22px] bg-white/80 p-3 text-ink shadow-[0_20px_50px_-18px_rgba(23,20,29,.45)] ring-1 ring-black/5 backdrop-blur-xl sm:w-[270px]"
            >
              <div className="flex gap-3">
                <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-night">
                  <LogoMark size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13.5px] font-semibold">{title}</p>
                    <span className="shrink-0 text-[11px] text-muted">{when}</span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{body}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
