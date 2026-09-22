'use client';

import { useRef, useState } from 'react';
import { BellRing, MessageCircle, Smartphone, Signature } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import type { Role } from '@/lib/role';
import PhoneShowcase from './phone-mock';
import { ACCENT } from './app-screens';
import StoreBadges from './store-badges';
import { APP_LIVE } from './links';

const COPY: Record<Role, { title: string; body: string; points: [string, string][] }> = {
  creator: {
    title: 'Your collabs, in your pocket.',
    body: 'The Influnet app puts every brand request, message and project on your phone, right next to Instagram.',
    points: [
      ['Know the moment a brand reaches out', 'Push notifications for new requests, messages and sign-offs.'],
      ['Reply without switching apps', 'Chat with brands and share files from your phone.'],
      ['Sign off on the go', 'Approve stages and keep projects moving wherever you are.'],
    ],
  },
  business: {
    title: 'Run campaigns from anywhere.',
    body: 'The Influnet app keeps every campaign, application and creator conversation with you, not just at your desk.',
    points: [
      ['Never miss an application', 'Push notifications when creators apply, reply or deliver.'],
      ['Talk to creators instantly', 'Messages and files, in the same thread as the project.'],
      ['Approve on the go', 'Review drafts and sign off stages from your phone.'],
    ],
  },
};

const ICONS = [BellRing, MessageCircle, Signature];

export default function AppSection({ role }: { role: Role }) {
  const root = useRef<HTMLElement>(null);
  const copy = COPY[role];
  // The phone can show either side's app, so a visitor can see they differ.
  const [preview, setPreview] = useState<Role>(role);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%' } });
      tl.from(q('[data-app-phone]'), { y: 120, autoAlpha: 0, duration: 1.2, ease: 'expo.out' })
        .from(q('[data-app-fade]'), { y: 30, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.15);
    },
    { scope: root },
  );

  return (
    <section ref={root} id="app" className="relative overflow-hidden bg-paper-deep py-24 text-ink sm:py-32">
      <div className="pointer-events-none absolute -right-40 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-brand/15 blur-[120px]" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-16 px-4 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p data-app-fade className="eyebrow inline-flex items-center gap-2 text-brand!">
            <Smartphone className="size-3.5" /> Influnet for iOS and Android
          </p>
          <h2
            data-app-fade
            className="mt-4 font-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl"
          >
            {copy.title}
          </h2>
          <p data-app-fade className="mt-5 max-w-[520px] text-lg leading-relaxed text-ink-soft">
            {copy.body}
          </p>

          <ul className="mt-9 space-y-5">
            {copy.points.map(([t, d], i) => {
              const Icon = ICONS[i];
              return (
                <li key={t} data-app-fade className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card text-brand ring-1 ring-line">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="mt-0.5 text-[15px] text-ink-soft">{d}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div data-app-fade className="mt-10">
            <StoreBadges tone="light" />
            {!APP_LIVE && (
              <p className="mt-3 text-sm text-muted">
                The app is on its way to the stores. Your web account works in it the day it lands.
              </p>
            )}
          </div>
        </div>

        <div className="relative flex flex-col items-center gap-8">
          <div role="tablist" aria-label="Preview the app as" className="flex rounded-full bg-card p-1 ring-1 ring-line">
            {(['creator', 'business'] as const).map((r) => (
              <button
                key={r}
                role="tab"
                type="button"
                aria-selected={preview === r}
                onClick={() => setPreview(r)}
                className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                  preview === r ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: ACCENT[r].brand }} />
                {r === 'creator' ? 'Creator app' : 'Business app'}
              </button>
            ))}
          </div>
          <div data-app-phone className="flex justify-center">
            <PhoneShowcase key={preview} role={preview} width={300} />
          </div>
          <p className="max-w-[340px] text-center text-sm text-muted">
            Each side gets its own Home: creators work in purple, brands in pink, and each sees only what is waiting on
            them.
          </p>
        </div>
      </div>
    </section>
  );
}
