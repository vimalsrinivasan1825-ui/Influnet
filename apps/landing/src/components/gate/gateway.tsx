'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { ROLE_PATH, saveRole, type Role } from '@/lib/role';
import { GATE_DONE } from './gateway-events';

// The chosen page is mounted underneath the overlay the moment a visitor picks,
// so when the pink collapses the real page is already there.
const loadCreator = () => import('@/components/creators/creator-page');
const loadBusiness = () => import('@/components/business-page');
const CreatorPage = dynamic(loadCreator);
const BusinessPage = dynamic(loadBusiness);


// Where the intro zooms in: the big top-right node of the mark, as a fraction
// of the SVG box (viewBox 430 150 690 720, node at 960,246).
const ZOOM_ORIGIN = '76.8% 13.3%';

const CHOICES: { role: Role; title: string; body: string; icon: React.ReactNode }[] = [
  {
    role: 'creator',
    title: "I'm a Creator",
    body: 'Get brand deals out of your DMs and into one place. Know who the brand is before you reply.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" />
      </svg>
    ),
  },
  {
    role: 'business',
    title: "I'm a Business",
    body: 'Find creators who proved they own their account, and run every collab from brief to payment.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
];

export default function Gateway() {
  const root = useRef<HTMLDivElement>(null);
  const intro = useRef<gsap.core.Timeline | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [overlay, setOverlay] = useState(true);

  // Warm both pages while the intro plays, so the handoff never waits on a download.
  useEffect(() => {
    loadCreator();
    loadBusiness();
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.dataset.gate = 'on';
    return () => {
      document.documentElement.style.overflow = '';
      delete document.documentElement.dataset.gate;
    };
  }, []);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const heading = new SplitText(q('[data-gate-heading]'), { type: 'lines', mask: 'lines' });

      gsap.set(q('[data-gate-choose]'), { autoAlpha: 0 });
      gsap.set(q('[data-gate-stage]'), { autoAlpha: 1 });

      if (prefersReducedMotion()) {
        gsap.set(q('[data-gate-intro]'), { autoAlpha: 0 });
        gsap.set(q('[data-gate-bg]'), { backgroundColor: '#ff078e' });
        gsap.set(q('[data-gate-choose]'), { autoAlpha: 1 });
        return;
      }

      const word = new SplitText(q('[data-gate-word]'), { type: 'chars', mask: 'chars' });

      const tl = gsap.timeline({ delay: 0.2 });
      intro.current = tl;
      tl.from(q('.gate-logo .logo-spoke'), { drawSVG: '0%', duration: 0.55, ease: 'power3.inOut', stagger: 0.06 })
        .from(q('.gate-logo .logo-ring'), { drawSVG: '0%', duration: 0.7, ease: 'power3.inOut' }, 0.05)
        .from(
          q('.gate-logo .logo-node'),
          { scale: 0, transformOrigin: '50% 50%', duration: 0.55, ease: 'back.out(2.2)', stagger: 0.07 },
          0.4,
        )
        .from(word.chars, { yPercent: 110, duration: 0.7, ease: 'expo.out', stagger: 0.035 }, 0.75)
        .to(word.chars, { yPercent: -110, duration: 0.4, ease: 'power3.in', stagger: 0.015 }, '+=0.45')
        // The camera move: the mark holds still and we dive into its pink node until it is the whole screen.
        .to(q('.gate-logo'), { scale: 60, duration: 1.05, ease: 'expo.in', transformOrigin: ZOOM_ORIGIN }, '-=0.1')
        .set(q('[data-gate-bg]'), { backgroundColor: '#ff078e' })
        .set(q('[data-gate-intro]'), { autoAlpha: 0 })
        .addLabel('choose')
        .set(q('[data-gate-choose]'), { autoAlpha: 1 })
        .from(q('[data-gate-watermark]'), { scale: 0.6, autoAlpha: 0, rotation: -40, duration: 1.4, ease: 'expo.out' }, 'choose')
        .from(q('[data-gate-eyebrow]'), { autoAlpha: 0, y: 12, duration: 0.5, ease: 'power3.out' }, 'choose+=0.1')
        .from(heading.lines, { yPercent: 100, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 'choose+=0.15')
        .from(
          q('[data-gate-card]'),
          { y: 120, rotation: (i) => (i ? 4 : -4), autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.1 },
          'choose+=0.3',
        )
        .from(q('[data-gate-foot]'), { autoAlpha: 0, duration: 0.5 }, 'choose+=0.8');
    },
    { scope: root },
  );

  const skip = () => {
    const tl = intro.current;
    if (tl) tl.seek('choose');
  };

  const pick = (chosen: Role) => {
    if (role) return;
    saveRole(chosen);
    setRole(chosen);
    intro.current?.progress(1);
    const q = gsap.utils.selector(root);
    const path = ROLE_PATH[chosen];

    const finish = () => {
      window.history.replaceState(null, '', path);
      document.documentElement.style.overflow = '';
      delete document.documentElement.dataset.gate;
      setOverlay(false);
      window.dispatchEvent(new Event(GATE_DONE));
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    const tl = gsap.timeline();
    tl.to(q('[data-gate-card]'), {
      y: (i, el) => ((el as HTMLElement).dataset.role === chosen ? -30 : 160),
      scale: (i, el) => ((el as HTMLElement).dataset.role === chosen ? 1.04 : 0.9),
      autoAlpha: (i, el) => ((el as HTMLElement).dataset.role === chosen ? 1 : 0),
      duration: 0.5,
      ease: 'power3.inOut',
    })
      .to(q('[data-gate-heading], [data-gate-eyebrow], [data-gate-foot]'), { autoAlpha: 0, y: -30, duration: 0.4 }, '<')
      .to(q('[data-gate-card]'), { autoAlpha: 0, scale: 0.8, duration: 0.35, ease: 'power2.in' }, '+=0.1')
      .to(q('[data-gate-watermark]'), { autoAlpha: 0, scale: 1.4, duration: 0.6, ease: 'power2.in' }, '<')
      // The mark comes back, drawn in white on the pink.
      .set(q('[data-gate-return]'), { autoAlpha: 1 })
      .from(q('[data-gate-return] .logo-spoke'), { drawSVG: '0%', duration: 0.45, ease: 'power3.out', stagger: 0.05 })
      .from(q('[data-gate-return] .logo-ring'), { drawSVG: '0%', duration: 0.5, ease: 'power3.out' }, '<')
      .from(
        q('[data-gate-return] .logo-node'),
        { scale: 0, transformOrigin: '50% 50%', duration: 0.45, ease: 'back.out(2.4)', stagger: 0.05 },
        '-=0.25',
      )
      .addLabel('open', '+=0.15')
      // Pink collapses into the mark while the mark flies to its place in the top bar.
      .to(q('[data-gate-bg]'), { clipPath: 'circle(0% at 50% 50%)', duration: 0.9, ease: 'expo.inOut' }, 'open')
      .add(() => {
        const navLogo = document.querySelector<HTMLElement>('[data-nav-logo]');
        const target = navLogo?.getBoundingClientRect();
        const logo = root.current?.querySelector<HTMLElement>('[data-gate-return]');
        if (!navLogo || !target || !logo) return;
        gsap.set(navLogo, { autoAlpha: 0 });
        gsap.to(navLogo, { autoAlpha: 1, duration: 0.25, delay: 0.8 });
        const from = logo.getBoundingClientRect();
        gsap.to(logo, {
          x: target.left + target.width / 2 - (from.left + from.width / 2),
          y: target.top + target.height / 2 - (from.top + from.height / 2),
          scale: target.width / from.width,
          duration: 0.9,
          ease: 'expo.inOut',
        });
      }, 'open')
      .to(q('[data-gate-return]'), { autoAlpha: 0, duration: 0.2 }, 'open+=0.85')
      .add(finish);
  };

  return (
    <>
      {role === 'creator' && <CreatorPage />}
      {role === 'business' && <BusinessPage />}

      {overlay && (
        <div ref={root} className="fixed inset-0 z-[100] text-ink" aria-live="polite">
          <div data-gate-bg className="absolute inset-0 bg-paper" style={{ clipPath: 'circle(150% at 50% 50%)' }}>
            <div data-gate-stage className="invisible absolute inset-0">
              {/* Act 1: the mark draws itself, then the camera dives into it. */}
              <div data-gate-intro className="absolute inset-0 flex flex-col items-center justify-center gap-7">
                <LogoMark size={168} className="gate-logo overflow-visible" title="Influnet" />
                <div data-gate-word className="font-display text-6xl font-bold tracking-[-0.03em] sm:text-7xl">
                  influnet
                </div>
                <button
                  type="button"
                  onClick={skip}
                  className="absolute right-5 top-5 h-11 rounded-full border border-line bg-card px-5 text-[15px] font-medium text-ink-soft hover:text-ink sm:right-10 sm:top-8"
                >
                  Skip intro
                </button>
              </div>

              {/* Act 2: on the pink, ask who is here. */}
              <div data-gate-choose className="absolute inset-0 overflow-hidden">
                <div
                  data-gate-watermark
                  className="pointer-events-none absolute -bottom-[30vmin] -right-[25vmin] opacity-[0.16]"
                >
                  <div className="animate-[spin_40s_linear_infinite]">
                    <LogoMark size={900} color="#ffffff" className="h-[95vmin] w-[95vmin]" />
                  </div>
                </div>
                <div className="relative flex h-full flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-10 sm:gap-10">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div data-gate-eyebrow className="font-mono text-xs uppercase tracking-[0.16em] text-ink">
                      [ Welcome to Influnet ]
                    </div>
                    <h1
                      data-gate-heading
                      className="font-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl"
                    >
                      What brings you here?
                    </h1>
                  </div>
                  <div className="flex w-full max-w-[960px] flex-col gap-4 sm:flex-row sm:gap-6">
                    {CHOICES.map((c) => (
                      <button
                        key={c.role}
                        type="button"
                        data-gate-card
                        data-role={c.role}
                        onClick={() => pick(c.role)}
                        className="group flex flex-1 flex-col gap-6 rounded-3xl border-2 border-transparent bg-card p-6 text-left text-ink shadow-[0_30px_60px_-30px_rgba(23,20,29,.45)] transition-[border-color,box-shadow] duration-300 hover:border-ink hover:shadow-[0_40px_80px_-30px_rgba(23,20,29,.6)] sm:min-h-[260px] sm:justify-between sm:p-8"
                      >
                        <span className="flex items-start justify-between">
                          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-magenta-tint text-brand-deep">
                            {c.icon}
                          </span>
                          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line transition-colors duration-300 group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M5 12h14" />
                              <path d="M13 6l6 6-6 6" />
                            </svg>
                          </span>
                        </span>
                        <span className="flex flex-col gap-2.5">
                          <span className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-[34px]">{c.title}</span>
                          <span className="text-base leading-relaxed text-ink-soft sm:text-[17px]">{c.body}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p data-gate-foot className="text-center text-[15px] font-medium text-ink">
                    We&apos;ll remember your choice on this device. Switch anytime from the top bar.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Act 3: the mark returns and flies into the header. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div data-gate-return className="invisible">
              <LogoMark size={120} color="#ffffff" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
