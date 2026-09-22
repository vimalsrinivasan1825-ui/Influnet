'use client';

import { useRef } from 'react';
import LogoMark from '@/components/brand/logo-mark';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { SIGNUP_URL } from '@/components/site/links';

const HANDLES = ['neha', 'arjun.eats', 'priya.travels', 'karthik.fits'];

const NOTES = [
  {
    title: 'Mitti Skincare',
    body: 'viewed your profile',
    tint: 'bg-[#eef1f7] text-[#2f3e66]',
    pos: 'lg:left-[-34%] lg:top-[-7%]',
    icon: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: 'Open campaign',
    body: 'Diwali gifting · 3 Reels · Apply',
    tint: 'bg-magenta-tint text-brand-deep',
    pos: 'lg:right-[-40%] lg:top-[44%]',
    icon: (
      <>
        <path d="M3 11l15-6v14L3 13z" />
        <path d="M7 13v5h3" />
      </>
    ),
  },
  {
    title: 'Advance confirmed',
    body: '₹20,000 paid before you shoot',
    tint: 'bg-verified-tint text-[#0b7a55]',
    pos: 'lg:left-[-30%] lg:bottom-[-19%]',
    icon: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
];

export default function OneLink() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) return;

      const title = new SplitText(q('[data-link-title]'), { type: 'lines', mask: 'lines' });
      const panel = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%' } });
      panel
        .from(q('[data-link-watermark]'), { rotation: -90, scale: 0.5, autoAlpha: 0, duration: 2, ease: 'expo.out' })
        .from(title.lines, { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.1)
        .from(q('[data-link-fade]'), { y: 20, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.1 }, 0.45);

      // The handle in the link keeps changing, like a name being tried on.
      const handle = q('[data-link-handle]')[0];
      if (handle) {
        const cycle = gsap.timeline({ repeat: -1, delay: 1.5 });
        HANDLES.slice(1).concat(HANDLES[0]).forEach((h) => {
          cycle
            .to(handle, { yPercent: -100, autoAlpha: 0, duration: 0.35, ease: 'power3.in' }, '+=1.8')
            .add(() => {
              handle.textContent = h;
            })
            .fromTo(handle, { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: 'expo.out' });
        });
      }

      const card = gsap.timeline({ scrollTrigger: { trigger: q('[data-link-card]')[0], start: 'top 75%' } });
      card
        .from(q('[data-link-card]'), { y: 80, rotationX: 25, autoAlpha: 0, duration: 1.2, ease: 'expo.out', transformPerspective: 1200 })
        .from(q('[data-link-part]'), { y: 24, autoAlpha: 0, filter: 'blur(8px)', duration: 0.8, ease: 'expo.out', stagger: 0.09 }, 0.25)
        .from(q('[data-link-wire]'), { drawSVG: '0%', duration: 0.8, ease: 'power2.inOut', stagger: 0.25 }, 0.9)
        .from(q('[data-link-note]'), { scale: 0.6, autoAlpha: 0, duration: 0.7, ease: 'back.out(2)', stagger: 0.25 }, 1.2);

      // Pointer tilt on the card, like holding a real visiting card.
      const tilt = q('[data-link-tilt]')[0];
      if (tilt) {
        const rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.8, ease: 'power3.out' });
        const ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.8, ease: 'power3.out' });
        const move = (e: PointerEvent) => {
          const r = tilt.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 14);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
        };
        const leave = () => {
          rx(0);
          ry(0);
        };
        const zone = q('[data-link-zone]')[0] as HTMLElement | undefined;
        zone?.addEventListener('pointermove', move);
        zone?.addEventListener('pointerleave', leave);
        return () => {
          zone?.removeEventListener('pointermove', move);
          zone?.removeEventListener('pointerleave', leave);
        };
      }
    },
    { scope: root },
  );

  return (
    <section ref={root} className="grid bg-paper lg:min-h-[100svh] lg:grid-cols-2">
      <div className="relative isolate flex flex-col justify-center gap-7 overflow-hidden bg-brand-deep px-4 py-24 text-white sm:px-10 lg:px-16 lg:py-0 xl:px-24">
        <div data-link-watermark className="pointer-events-none absolute -bottom-[26vmin] -right-[22vmin] -z-10 opacity-[0.14]">
          <div className="animate-[spin_45s_linear_infinite]">
            <LogoMark size={700} color="#ffffff" className="h-[75vmin] w-[75vmin]" />
          </div>
        </div>
        <div data-link-fade className="font-mono text-xs uppercase tracking-[0.16em] text-[#ffe3f1]">
          [ Your Influnet link ]
        </div>
        <h2 data-link-title className="font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-6xl xl:text-7xl">
          One link in your bio. Every brand deal in one place.
        </h2>
        <p data-link-fade className="max-w-[500px] text-lg leading-relaxed text-[#fff4fa] sm:text-xl">
          Your reach, your past work, your reviews and your verified badge on one profile. Share it like a digital
          visiting card, and stop answering the same questions in every DM.
        </p>
        <div data-link-fade className="flex max-w-[520px] flex-col gap-2 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ffe3f1]">Put this in your bio</span>
          <span className="text-[17px] font-semibold">For collaborations, contact me through my Influnet ID</span>
        </div>
        <div data-link-fade className="flex flex-wrap items-center gap-3">
          <a
            href={SIGNUP_URL.creator}
            className="flex h-14 items-center rounded-full bg-white px-7 text-[17px] font-bold text-ink transition-colors hover:bg-ink hover:text-white"
          >
            Claim your link
          </a>
          <span className="flex h-14 items-center gap-1 overflow-hidden rounded-full border-[1.5px] border-dashed border-white/60 px-5 text-[17px] font-semibold">
            influnet.io/
            <span className="relative inline-flex overflow-hidden rounded-md bg-[#ffe3f1] px-2 py-0.5 text-ink">
              <span data-link-handle className="inline-block">
                {HANDLES[0]}
              </span>
            </span>
          </span>
        </div>
      </div>

      <div data-link-zone className="relative flex items-center justify-center px-4 py-20 sm:px-10 lg:py-0">
        <div className="relative w-full max-w-[380px]">
          <svg viewBox="0 0 400 600" className="pointer-events-none absolute inset-[-20%] hidden h-[140%] w-[140%] lg:block" aria-hidden>
            <path data-link-wire d="M200 300 C 140 240, 90 170, 40 110" fill="none" stroke="#d9d4cb" strokeWidth={1.5} />
            <path data-link-wire d="M200 300 C 280 300, 330 320, 380 340" fill="none" stroke="#d9d4cb" strokeWidth={1.5} />
            <path data-link-wire d="M200 300 C 140 380, 90 460, 40 520" fill="none" stroke="#d9d4cb" strokeWidth={1.5} />
          </svg>

          <div data-link-tilt className="[transform-style:preserve-3d]">
            <div data-link-card className="overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_50px_100px_-40px_rgba(23,20,29,.4)]">
              <div data-link-part className="h-24 bg-[#f3dfe8]" />
              <div className="flex flex-col gap-4 px-6 pb-6">
                <div data-link-part className="-mt-11 flex items-end justify-between">
                  <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white bg-[#e9c9d8] font-display text-3xl font-extrabold text-[#9e1f62]">
                    N
                  </div>
                  <span className="flex h-[30px] items-center gap-1.5 rounded-full bg-verified-tint px-3 text-[13px] font-bold text-[#0b7a55]">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Verified
                  </span>
                </div>
                <div data-link-part className="flex flex-col gap-1">
                  <span className="font-display text-2xl font-bold tracking-[-0.02em]">Neha Kapoor</span>
                  <span className="text-sm text-ink-soft">Fashion and beauty · Chennai · Open to collabs</span>
                </div>
                <div data-link-part className="flex flex-wrap gap-2">
                  {['Instagram 75K', 'YouTube 12K', 'Snapchat 4K'].map((c) => (
                    <span key={c} className="flex h-[30px] items-center rounded-full bg-paper-deep px-3 text-[13px] font-semibold">
                      {c}
                    </span>
                  ))}
                </div>
                <div data-link-part className="grid grid-cols-3 gap-2">
                  {['#e4d3c0', '#d3dcef', '#dcead9'].map((c) => (
                    <div key={c} className="h-[84px] rounded-xl" style={{ background: c }} />
                  ))}
                </div>
                <div data-link-part className="flex items-center justify-between pt-1">
                  <span className="text-sm text-ink-soft">
                    <b className="text-ink">4.9</b> from 24 completed collabs
                  </span>
                  <span className="flex h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Send request</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:mt-0">
            {NOTES.map((n) => (
              <div
                key={n.title}
                data-link-note
                className={`flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 shadow-[0_20px_40px_-20px_rgba(23,20,29,.25)] lg:absolute lg:w-[260px] ${n.pos}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${n.tint}`}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {n.icon}
                  </svg>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold">{n.title}</span>
                  <span className="text-[13px] text-ink-soft">{n.body}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
