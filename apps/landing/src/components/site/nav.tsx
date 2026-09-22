'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoMark from '@/components/brand/logo-mark';
import RoleSwitch from '@/components/brand/role-switch';
import type { Role } from '@/lib/role';
import { ROLE_PATH } from '@/lib/role';
import { APP_URL, SIGNUP_URL } from './links';

type Props = {
  role: Role;
  /** In-page anchors shown in the middle of the bar. */
  sections: readonly (readonly [string, string])[];
  cta: string;
};

// Floating glass pill: clear at the top of the hero, then frosted to match the
// section underneath it.
export default function SiteNav({ role, sections, cta }: Props) {
  const [light, setLight] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Match whatever is under the bar: dark glass over dark sections
  // (data-tone="dark"), white glass over light ones.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const under = document
        .elementsFromPoint(window.innerWidth / 2, 44)
        .find((el) => !el.closest('header'));
      const zone = under?.closest<HTMLElement>('section, footer');
      setLight(zone ? zone.dataset.tone !== 'dark' : false);
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
      {/* A floating glass pill, like a control bar resting over the page. */}
      <div
        className={`pointer-events-auto mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 rounded-full border pl-4 pr-2 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 sm:pl-6 ${
          light
            ? 'border-white/70 bg-white/65 shadow-[0_12px_40px_-12px_rgba(23,20,29,.25)]'
            : scrolled
              ? 'border-white/12 bg-[#1f1a25]/70 shadow-[0_12px_40px_-12px_rgba(0,0,0,.6)]'
              : 'border-white/10 bg-white/[.06]'
        }`}
      >
        <Link href={ROLE_PATH[role]} className="flex items-center gap-2.5" aria-label="Influnet home">
          <span data-nav-logo className="flex">
            <LogoMark size={28} />
          </span>
          <span
            className={`font-display text-[22px] font-bold tracking-[-0.02em] transition-colors duration-500 ${
              light ? 'text-ink' : 'text-white'
            }`}
          >
            influnet
          </span>
        </Link>

        <nav className="hidden items-center gap-9 text-[15px] font-medium lg:flex" aria-label="Sections">
          {sections.map(([label, href], i) => (
            <a
              key={href}
              href={href}
              // Four links fit beside the actions at 1024px; a fifth waits for xl.
              className={`whitespace-nowrap transition-colors ${i >= 4 ? 'hidden xl:inline' : ''} ${light ? 'text-ink-soft hover:text-ink' : 'text-night-soft hover:text-white'}`}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden sm:block">
            <RoleSwitch current={role} tone={light ? 'light' : 'dark'} />
          </div>
          <a
            href={`${APP_URL}/login`}
            className={`hidden whitespace-nowrap text-[15px] font-semibold transition-colors md:block ${light ? 'text-ink' : 'text-white'}`}
          >
            Log in
          </a>
          <a
            href={SIGNUP_URL[role]}
            className={`flex h-12 items-center whitespace-nowrap rounded-full px-5 text-[15px] font-semibold transition-colors ${
              light ? 'bg-ink text-white hover:bg-ink-soft' : 'bg-white text-night hover:bg-magenta-tint'
            }`}
          >
            {cta}
          </a>
        </div>
      </div>
    </header>
  );
}
