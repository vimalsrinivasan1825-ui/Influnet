'use client';

import { useRef } from 'react';
import { BadgeCheck, FolderKanban, Link2, Lock, LockOpen, ShieldCheck, type LucideIcon } from 'lucide-react';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

type Card = { n: string; title: string; body: string; icon: LucideIcon; from: string; to: string };

const CARDS: Card[] = [
  {
    n: '01',
    title: 'Real creators',
    body: 'Creators put their Influnet profile link in their Instagram bio. That link proves the account is theirs and is how you reach them. Their numbers come from public profiles, not a form.',
    icon: BadgeCheck,
    from: '#ff2d9b',
    to: '#b01e6c',
  },
  {
    n: '02',
    title: 'Every collab in one place',
    body: 'Brief, chat, drafts and approvals live on the project. See whose move it is without chasing anyone.',
    icon: FolderKanban,
    from: '#6a5cf0',
    to: '#2c2787',
  },
  {
    n: '03',
    title: 'Pay at the right moment',
    body: 'Pay the agreed advance and final amounts through Razorpay. A project only moves past a payment stage once it is confirmed.',
    icon: ShieldCheck,
    from: '#f7a531',
    to: '#dd5a12',
  },
];

// A creator's Instagram bio with their Influnet profile link in it: the link is
// what verification looks for (apps/web lib/verification-ownership.ts), and
// the same link is how a brand reaches them.
function VisualVerify() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-xl bg-white/15 px-3 py-2.5 text-sm">
        <span className="block font-semibold">@arjun.eats</span>
        <span className="block text-white/75">Food · Bengaluru</span>
        <span className="mt-0.5 flex items-center gap-1.5 font-semibold">
          <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
          influnet.io/arjun.eats
        </span>
        <span data-v1-scan className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      </div>
      <div data-v1-ok className="flex items-center gap-2 self-start rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0b7a55]">
        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden /> Link found · Verified
      </div>
    </div>
  );
}

function VisualProjects() {
  const rows = [
    ['Mitti Skincare', ['Terms', 'Advance', 'Drafts']],
    ['Kaveri Foods', ['Advance', 'Drafts', 'Final']],
    ['Urban Loom', ['Request', 'Terms', 'Advance']],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([name, stages], i) => (
        <div key={name} className="flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
          <span className="font-semibold">{name}</span>
          <span className="relative h-6 w-[84px] overflow-hidden">
            {stages.map((s, k) => (
              <span
                key={s}
                data-v2-stage={i}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#2c2787]"
                style={{ opacity: k === 0 ? 1 : 0 }}
              >
                {s}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function VisualGates() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-xl bg-white/15 px-3 py-2.5 text-sm">
        <span>Advance · ₹20,000</span>
        <span data-v3-a className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#11754a]">
          Confirmed
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white/15 px-3 py-2.5 text-sm">
        <span>Final · ₹20,000</span>
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span data-v3-lock className="absolute flex">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <span data-v3-open className="absolute flex opacity-0">
            <LockOpen className="h-4 w-4" aria-hidden />
          </span>
        </span>
      </div>
    </div>
  );
}

const VISUALS = [VisualVerify, VisualProjects, VisualGates];

export default function WhyTrio() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const title = new SplitText(q('[data-why-title]'), { type: 'lines', mask: 'lines' });
      gsap
        .timeline({ scrollTrigger: { trigger: root.current, start: 'top 70%' } })
        .from(title.lines, { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.08 })
        .from(q('[data-why-sub]'), { y: 20, autoAlpha: 0, duration: 0.8, ease: 'expo.out' }, 0.3)
        .from(
          q('[data-why-card]'),
          { y: 120, rotationX: 18, transformPerspective: 1200, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12 },
          0.3,
        )
        .from(q('[data-why-num]'), { yPercent: 40, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12 }, 0.6);

      // Each card's live visual loops while the section is on screen.
      const loops = [
        gsap
          .timeline({ repeat: -1, repeatDelay: 1.2, paused: true })
          .set(q('[data-v1-ok]'), { autoAlpha: 0, scale: 0.7 })
          .fromTo(q('[data-v1-scan]'), { xPercent: -100 }, { xPercent: 700, duration: 1.2, ease: 'power2.inOut' })
          .to(q('[data-v1-ok]'), { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.4)' })
          .to({}, { duration: 1.6 }),
        (() => {
          const tl = gsap.timeline({ repeat: -1, paused: true });
          [0, 1, 2].forEach((r) => {
            const s = q(`[data-v2-stage="${r}"]`);
            tl.to(s[0], { yPercent: -100, opacity: 0, duration: 0.4, ease: 'power2.in' }, 1 + r * 0.25)
              .fromTo(s[1], { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, '<+0.2')
              .to(s[1], { yPercent: -100, opacity: 0, duration: 0.4, ease: 'power2.in' }, 2.6 + r * 0.25)
              .fromTo(s[2], { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, '<+0.2')
              .to(s[2], { yPercent: -100, opacity: 0, duration: 0.4, ease: 'power2.in' }, 4.2 + r * 0.25)
              .fromTo(s[0], { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, '<+0.2');
          });
          return tl;
        })(),
        gsap
          .timeline({ repeat: -1, repeatDelay: 1, paused: true })
          .fromTo(q('[data-v3-a]'), { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.4)' }, 0.4)
          .fromTo(q('[data-v3-lock]'), { opacity: 1, rotation: 0 }, { opacity: 0, rotation: -25, duration: 0.3 }, '+=1')
          .fromTo(q('[data-v3-open]'), { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(3)' })
          .to({}, { duration: 1.6 }),
      ];
      const st = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top 80%',
          end: 'bottom top',
          onToggle: (self) => loops.forEach((l) => (self.isActive ? l.play() : l.pause())),
        },
      });

      // Cards lean toward the pointer, like objects on a table.
      const cleanups = q('[data-why-card]').map((card) => {
        const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
        const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
        gsap.set(card, { transformPerspective: 1000 });
        const move = (e: Event) => {
          const p = e as PointerEvent;
          const r = card.getBoundingClientRect();
          ry(((p.clientX - r.left) / r.width - 0.5) * 10);
          rx(-((p.clientY - r.top) / r.height - 0.5) * 8);
        };
        const leave = () => {
          rx(0);
          ry(0);
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerleave', leave);
        return () => {
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerleave', leave);
        };
      });
      return () => {
        st.kill();
        cleanups.forEach((c) => c());
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} id="why" className="bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-14 px-4 sm:px-8">
        <div className="mx-auto flex max-w-[820px] flex-col items-center gap-5 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">[ Why Influnet ]</div>
          <h2 data-why-title className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Real creators. Clear terms. <span className="text-brand-deep">Payments that move with the work.</span>
          </h2>
          <p data-why-sub className="max-w-[580px] text-lg leading-relaxed text-ink-soft">
            Everything a brand needs to run creator collaborations without spreadsheets, scattered chats or guesswork.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {CARDS.map((c, i) => {
            const Visual = VISUALS[i];
            const Icon = c.icon;
            return (
              <article
                key={c.n}
                data-why-card
                className="relative flex min-h-[440px] flex-col gap-5 overflow-hidden rounded-[28px] p-7 text-white shadow-[0_40px_80px_-40px_rgba(23,20,29,.5)] [transform-style:preserve-3d]"
                style={{ background: `linear-gradient(155deg, ${c.from}, ${c.to})` }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                  <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-[28px] font-bold tracking-[-0.02em]">{c.title}</h3>
                  <p className="text-[15px] leading-relaxed text-white/85">{c.body}</p>
                </div>
                <div className="relative z-10 mt-auto">
                  <Visual />
                </div>
                <span
                  data-why-num
                  className="pointer-events-none absolute -bottom-8 -right-3 font-display text-[150px] font-extrabold leading-none tracking-[-0.06em] text-white/10"
                  aria-hidden
                >
                  {c.n}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
