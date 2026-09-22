'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Bell, Check, FileText, Lock, LockOpen, Paperclip, Star } from 'lucide-react';
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';

// The real project lifecycle, compressed to the moments a creator feels.
// Wording is checked against packages/core/src/project-lifecycle.ts.
const STEPS = [
  { t: 'Request', b: 'A brand sends a request from your profile, or you apply to one of their open campaigns.', color: '#7c6cf2' },
  { t: 'Talk it through', b: 'Chat inside Influnet, right next to the brief. Nothing lost between apps.', color: '#2f9fd8' },
  { t: 'Agree terms', b: 'Deliverables, timeline and the payment split, agreed by both of you in writing.', color: '#e89a2c' },
  { t: 'Advance paid', b: 'The brand pays the advance through Razorpay before content planning starts.', color: '#1fa866' },
  { t: 'Create and review', b: 'Share drafts, get feedback and handle revisions on the project, not in scattered chats.', color: '#ec5a68' },
  { t: 'Final payment', b: 'The final amount is paid before the project can close. Invoices and receipts stay on the project.', color: '#e0077d' },
  { t: 'Review', b: 'You review each other. It lands on your profile as proof for the next brand.', color: '#e7b416' },
];

const STEP_SECONDS = 6.5;

const card = 'w-[min(100%,360px)] rounded-3xl bg-card text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,.35)]';

// ── The seven scenes. Each is plain markup; its motion lives in SCENES below. ──

function SceneRequest() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div data-s1-toast className="flex items-center gap-2.5 rounded-full bg-white/95 py-2 pl-2 pr-4 text-sm font-semibold text-ink shadow-lg">
        <span data-s1-bell className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ece9fd] text-[#5b4ad6]">
          <Bell className="h-4 w-4" strokeWidth={2.4} aria-hidden />
        </span>
        New collaboration request
      </div>
      <div data-s1-card className={`${card} flex flex-col gap-4 p-5`}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e4d3c0] font-display text-xl font-extrabold">M</div>
          <div className="flex flex-col">
            <span className="font-bold">Mitti Skincare</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[#0b7a55]">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Reviewed by Influnet
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Wants', '2 Reels'],
            ['Budget', '₹40,000'],
            ['Timeline', '10 days'],
          ].map(([k, v]) => (
            <div key={k} data-s1-field className="flex flex-col gap-0.5 rounded-xl bg-paper-deep p-2.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">{k}</span>
              <span className="text-sm font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="relative grid grid-cols-2 gap-2">
          <span className="flex h-11 items-center justify-center rounded-xl border border-line text-sm font-semibold text-ink-soft">Decline</span>
          <span data-s1-accept className="relative flex h-11 items-center justify-center overflow-hidden rounded-xl bg-ink text-sm font-semibold text-white">
            Accept
            <span data-s1-accepted className="absolute inset-0 flex items-center justify-center gap-1.5 bg-[#1fa866] opacity-0">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> Accepted
            </span>
          </span>
          <span data-s1-cursor className="pointer-events-none absolute right-10 top-3 h-5 w-5 rounded-full border-2 border-white bg-ink/80 opacity-0 shadow" />
        </div>
      </div>
    </div>
  );
}

function SceneTalk() {
  const bubble = 'max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-snug';
  return (
    <div className={`${card} flex flex-col gap-2.5 p-5`}>
      <div className="mb-1 flex items-center gap-2.5 border-b border-line pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e4d3c0] font-display font-extrabold">M</div>
        <span className="text-sm font-bold">Mitti Skincare</span>
        <span className="ml-auto text-xs text-ink-soft">Project chat</span>
      </div>
      <div data-s2-msg className={`${bubble} self-start rounded-bl-md bg-paper-deep`}>Loved your last reel! The brief is attached.</div>
      <div data-s2-msg className="flex items-center gap-2 self-start rounded-xl border border-line px-3 py-2 text-xs font-semibold">
        <Paperclip className="h-3.5 w-3.5 text-[#2f9fd8]" aria-hidden /> Monsoon-launch-brief.pdf
      </div>
      <div data-s2-typing className="flex gap-1 self-end rounded-2xl bg-[#e3f2fb] px-4 py-3">
        {[0, 1, 2].map((d) => (
          <span key={d} data-s2-dot className="h-1.5 w-1.5 rounded-full bg-[#2f9fd8]" />
        ))}
      </div>
      <div data-s2-msg className={`${bubble} self-end rounded-br-md bg-[#2f9fd8] text-white`}>Thanks! Can we do 2 reels and 1 story?</div>
      <div data-s2-msg className={`${bubble} self-start rounded-bl-md bg-paper-deep`}>Works for us. Sending the terms now.</div>
    </div>
  );
}

function SceneTerms() {
  return (
    <div className={`${card} flex flex-col gap-3 p-5`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        <FileText className="h-4 w-4 text-[#e89a2c]" aria-hidden /> Collaboration terms
      </div>
      {[
        ['Deliverables', '2 Reels + 1 Story'],
        ['Timeline', '10 days'],
        ['Payment', '50% advance · 50% on delivery'],
      ].map(([k, v]) => (
        <div key={k} data-s3-row className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 text-sm">
          <span className="text-ink-soft">{k}</span>
          <span className="flex items-center gap-2 text-right font-semibold">
            {v}
            <span data-s3-tick className="flex shrink-0">
              <Check className="h-4 w-4 text-[#1fa866]" strokeWidth={3} aria-hidden />
            </span>
          </span>
        </div>
      ))}
      <div className="mt-1 grid grid-cols-2 gap-3">
        {[
          ['Mitti Skincare', 'M5 30 C 18 4, 28 44, 40 20 S 62 8, 72 26 S 98 38, 116 12'],
          ['Neha Kapoor', 'M4 26 C 16 8, 24 40, 36 22 C 46 8, 54 34, 66 20 S 92 30, 118 16'],
        ].map(([name, d]) => (
          <div key={name} className="flex flex-col gap-1">
            <svg viewBox="0 0 122 44" className="h-11 w-full" aria-hidden>
              <path data-s3-sign d={d} fill="none" stroke="#17141d" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="border-t border-line pt-1 text-xs text-ink-soft">{name}</span>
          </div>
        ))}
      </div>
      <div data-s3-badge className="self-center rounded-full bg-[#fdf1dc] px-4 py-1.5 text-sm font-bold text-[#9a5b06]">
        Agreed by both
      </div>
    </div>
  );
}

function SceneAdvance() {
  return (
    <div className={`${card} flex flex-col gap-4 p-5`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Advance payment · 50%</span>
        <span className="relative h-7 w-[104px]">
          <span data-s4-pending className="absolute inset-0 flex items-center justify-center rounded-full bg-paper-deep text-xs font-bold text-ink-soft">
            Processing
          </span>
          <span data-s4-done className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-[#e2f6ec] text-xs font-bold text-[#11754a] opacity-0">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> Confirmed
          </span>
        </span>
      </div>
      <div className="font-display text-5xl font-bold tracking-[-0.03em]">
        ₹<span data-s4-amount>20,000</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
        <span data-s4-bar className="block h-full w-full origin-left rounded-full bg-[#1fa866]" />
      </div>
      <span className="text-xs text-ink-soft">Paid by Mitti Skincare via Razorpay</span>
      <div className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#e2f6ec] text-[#11754a]">
          <span data-s4-lock className="absolute flex">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <span data-s4-open className="absolute flex opacity-0">
            <LockOpen className="h-5 w-5" aria-hidden />
          </span>
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-bold">Content planning</span>
          <span data-s4-unlock className="text-xs text-ink-soft">
            Unlocks when the advance is confirmed
          </span>
        </span>
      </div>
    </div>
  );
}

function SceneReview() {
  return (
    <div className={`${card} flex flex-col gap-4 p-5`}>
      <span className="text-sm font-bold">Drafts for review</span>
      <div className="grid grid-cols-3 gap-2.5">
        {['#f6c7cc', '#f9dcc0', '#d9d3f5'].map((c, i) => (
          <div key={c} className="relative flex flex-col gap-1.5">
            <div data-s5-tile className="relative h-[108px] overflow-hidden rounded-xl" style={{ background: c }}>
              {i === 1 && (
                <span data-s5-v2 className="absolute left-2 top-2 rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white opacity-0">
                  v2
                </span>
              )}
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-paper-deep">
              <span data-s5-up className="block h-full w-full origin-left rounded-full bg-[#ec5a68]" />
            </span>
          </div>
        ))}
      </div>
      <div data-s5-comment className="self-center rounded-2xl rounded-tl-md bg-paper-deep px-4 py-2.5 text-sm">
        <b>Mitti Skincare:</b> Can we brighten the intro?
      </div>
      <div data-s5-stamp className="self-center rounded-xl border-2 border-[#1fa866] px-4 py-1.5 font-mono text-sm font-medium uppercase tracking-[0.12em] text-[#1fa866]">
        Approved
      </div>
    </div>
  );
}

function SceneFinal() {
  return (
    <div className="relative w-[min(100%,360px)]">
      <div data-s6-paper className={`${card} flex flex-col gap-3 p-6`}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Invoice · Project #1042</span>
          <span className="text-xs text-ink-soft">Neha Kapoor</span>
        </div>
        {[
          ['Advance (50%)', '₹20,000'],
          ['Final payment (50%)', '₹20,000'],
        ].map(([k, v]) => (
          <div key={k} data-s6-line className="flex justify-between border-b border-dashed border-line pb-2 text-sm">
            <span className="text-ink-soft">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
        <div data-s6-line className="flex items-end justify-between pt-1">
          <span className="text-sm font-bold">Total</span>
          <span className="font-display text-3xl font-bold">₹40,000</span>
        </div>
        <span data-s6-line className="text-xs text-ink-soft">
          Receipt shared with both sides
        </span>
      </div>
      <div className="absolute -right-4 -top-7">
        <div
          data-s6-stamp
          className="rotate-[-12deg] rounded-xl border-[3px] border-[#e0077d] bg-white/85 px-4 py-1 font-mono text-2xl font-medium uppercase tracking-[0.1em] text-[#e0077d]"
        >
          Paid
        </div>
      </div>
    </div>
  );
}

function SceneStars() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className={`${card} flex flex-col gap-3 p-5`}>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} data-s7-star className="flex">
              <Star className="h-8 w-8 fill-[#e7b416] text-[#e7b416]" aria-hidden />
            </span>
          ))}
        </div>
        <p data-s7-text className="text-[15px] leading-snug">
          &ldquo;Delivered before time and the reels performed well. Would work again.&rdquo;
        </p>
        <span className="text-xs text-ink-soft">Mitti Skincare · completed project</span>
      </div>
      <div data-s7-profile className="flex items-center gap-3 rounded-full bg-white/95 py-2 pl-2 pr-5 text-ink shadow-lg">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3dfe8] font-display font-extrabold text-[#9e1f62]">N</span>
        <span className="text-sm">
          <b data-s7-rating className="inline-block">4.8</b> · <span data-s7-count>24</span> completed collabs
        </span>
      </div>
    </div>
  );
}

const SCENE_VIEWS = [SceneRequest, SceneTalk, SceneTerms, SceneAdvance, SceneReview, SceneFinal, SceneStars];

// Motion for each scene, built against that scene's own element. Every
// timeline must be replayable from the start (restart), so values it changes
// by hand are reset in an initial .add().
type Q = (sel: string) => Element[];
const setText = (el: Element | undefined, text: string) => {
  if (el) el.textContent = text;
};
const SCENES: ((q: Q) => gsap.core.Timeline)[] = [
  (q) =>
    gsap
      .timeline()
      .from(q('[data-s1-toast]'), { y: -40, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.8)' })
      .fromTo(q('[data-s1-bell]'), { rotation: -18 }, { rotation: 0, duration: 0.8, ease: 'elastic.out(1.4, 0.3)' }, '-=0.2')
      .from(q('[data-s1-card]'), { y: 60, autoAlpha: 0, scale: 0.94, duration: 0.8, ease: 'expo.out' }, '-=0.5')
      .from(q('[data-s1-field]'), { y: 14, autoAlpha: 0, duration: 0.45, stagger: 0.1, ease: 'power3.out' }, '-=0.4')
      .fromTo(q('[data-s1-cursor]'), { x: -150, y: 40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.8, ease: 'power3.inOut' }, '+=0.3')
      .to(q('[data-s1-accept]'), { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1 })
      .to(q('[data-s1-cursor]'), { scale: 0.7, duration: 0.12, yoyo: true, repeat: 1 }, '<')
      .fromTo(q('[data-s1-accepted]'), { opacity: 0 }, { opacity: 1, duration: 0.3 })
      .to(q('[data-s1-cursor]'), { opacity: 0, duration: 0.3 }),
  (q) => {
    const msgs = q('[data-s2-msg]');
    return gsap
      .timeline()
      .from(msgs[0], { y: 16, autoAlpha: 0, scale: 0.9, transformOrigin: '0% 100%', duration: 0.5, ease: 'back.out(1.8)' }, 0.2)
      .from(msgs[1], { x: -20, autoAlpha: 0, duration: 0.5, ease: 'expo.out' }, '+=0.3')
      .from(q('[data-s2-typing]'), { autoAlpha: 0, scale: 0.6, duration: 0.3 }, '+=0.3')
      .to(q('[data-s2-dot]'), { y: -4, duration: 0.25, stagger: 0.12, yoyo: true, repeat: 3, ease: 'sine.inOut' })
      .to(q('[data-s2-typing]'), { autoAlpha: 0, scale: 0.6, duration: 0.2 })
      .set(q('[data-s2-typing]'), { display: 'none' })
      .from(msgs[2], { y: 16, autoAlpha: 0, scale: 0.9, transformOrigin: '100% 100%', duration: 0.5, ease: 'back.out(1.8)' })
      .from(msgs[3], { y: 16, autoAlpha: 0, scale: 0.9, transformOrigin: '0% 100%', duration: 0.5, ease: 'back.out(1.8)' }, '+=0.6');
  },
  (q) =>
    gsap
      .timeline()
      .from(q('[data-s3-row]'), { x: -24, autoAlpha: 0, duration: 0.5, stagger: 0.25, ease: 'expo.out' }, 0.2)
      .from(q('[data-s3-tick]'), { scale: 0, duration: 0.4, stagger: 0.25, ease: 'back.out(3)' }, 0.5)
      .from(q('[data-s3-sign]'), { drawSVG: '0%', duration: 1, stagger: 0.7, ease: 'power2.inOut' }, '+=0.2')
      .from(q('[data-s3-badge]'), { scale: 0.4, autoAlpha: 0, duration: 0.5, ease: 'back.out(2.4)' }),
  (q) => {
    const amount = q('[data-s4-amount]')[0];
    const n = { v: 0 };
    return gsap
      .timeline()
      .add(() => setText(q('[data-s4-unlock]')[0], 'Unlocks when the advance is confirmed'))
      .from(q('[data-s4-bar]'), { scaleX: 0, duration: 1.6, ease: 'power2.inOut' }, 0.2)
      .fromTo(
        n,
        { v: 0 },
        { v: 20000, duration: 1.6, ease: 'power2.inOut', onUpdate: () => setText(amount, Math.round(n.v).toLocaleString('en-IN')) },
        0.2,
      )
      .fromTo(q('[data-s4-pending]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 })
      .fromTo(q('[data-s4-done]'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.6)' })
      .fromTo(q('[data-s4-lock]'), { opacity: 1, rotation: 0 }, { opacity: 0, rotation: -20, duration: 0.25 }, '+=0.3')
      .fromTo(q('[data-s4-open]'), { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(3)' })
      .add(() => setText(q('[data-s4-unlock]')[0], 'Unlocked. Time to plan the content.'));
  },
  (q) => {
    const tile = q('[data-s5-tile]')[1];
    return gsap
      .timeline()
      .set(tile, { filter: 'brightness(1)' })
      .from(q('[data-s5-tile]'), { y: 30, autoAlpha: 0, duration: 0.5, stagger: 0.12, ease: 'expo.out' }, 0.1)
      .from(q('[data-s5-up]'), { scaleX: 0, duration: 0.9, stagger: 0.2, ease: 'power2.inOut' }, 0.3)
      .from(q('[data-s5-comment]'), { y: 12, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: 'back.out(2)' }, '+=0.2')
      .to(tile, { rotationY: 90, duration: 0.25, ease: 'power2.in' }, '+=0.6')
      .set(tile, { filter: 'brightness(1.12)' })
      .to(tile, { rotationY: 0, duration: 0.3, ease: 'power2.out' })
      .fromTo(q('[data-s5-v2]'), { opacity: 0 }, { opacity: 1, duration: 0.2 }, '<')
      .from(q('[data-s5-stamp]'), { scale: 2, rotation: -16, autoAlpha: 0, duration: 0.45, ease: 'back.out(2)' }, '+=0.2');
  },
  (q) =>
    gsap
      .timeline()
      .from(q('[data-s6-paper]'), { y: 90, autoAlpha: 0, rotation: 3, duration: 0.9, ease: 'expo.out' }, 0.1)
      .from(q('[data-s6-line]'), { autoAlpha: 0, x: -14, duration: 0.4, stagger: 0.18, ease: 'power3.out' }, 0.5)
      .from(q('[data-s6-stamp]'), { scale: 3, autoAlpha: 0, rotation: -40, duration: 0.4, ease: 'power4.in' }, '+=0.3')
      .fromTo(q('[data-s6-paper]'), { x: 0 }, { x: -4, duration: 0.05, yoyo: true, repeat: 5 }),
  (q) => {
    const rating = q('[data-s7-rating]')[0];
    const count = q('[data-s7-count]')[0];
    const text = new SplitText(q('[data-s7-text]'), { type: 'words' });
    return gsap
      .timeline()
      .add(() => {
        setText(rating, '4.8');
        setText(count, '24');
      })
      .from(q('[data-s7-star]'), { scale: 0, rotation: -60, duration: 0.45, stagger: 0.14, ease: 'back.out(3)' }, 0.2)
      .from(text.words, { autoAlpha: 0, y: 6, duration: 0.2, stagger: 0.05 }, '+=0.1')
      .from(q('[data-s7-profile]'), { y: 30, autoAlpha: 0, duration: 0.6, ease: 'expo.out' }, '+=0.2')
      .add(() => {
        setText(rating, '4.9');
        setText(count, '25');
      }, '+=0.4')
      .fromTo(rating, { scale: 1.6, color: '#e7b416' }, { scale: 1, color: '#17141d', duration: 0.6, ease: 'back.out(2)' });
  },
];

export default function CollabTrack() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);
  const scenes = useRef<gsap.core.Timeline[]>([]);

  // Build every scene's timeline once; the section only runs while on screen.
  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reduced = prefersReducedMotion();
      scenes.current = q('[data-scene]').map((el, i) => {
        const tl = SCENES[i](gsap.utils.selector(el) as Q).pause();
        if (reduced) tl.progress(1);
        return tl;
      });
      gsap.set(q('[data-scene]'), { autoAlpha: 0 });

      if (!reduced) {
        const title = new SplitText(q('[data-track-title]'), { type: 'lines', mask: 'lines' });
        gsap.from(title.lines, {
          yPercent: 105,
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.08,
          scrollTrigger: { trigger: q('[data-track-title]')[0], start: 'top 80%' },
        });
      }

      const st = ScrollTrigger.create({
        trigger: q('[data-track-stage]')[0],
        start: 'top 75%',
        end: 'bottom 15%',
        onToggle: (self) => setLive(self.isActive),
      });
      return () => st.kill();
    },
    { scope: root },
  );

  // Show the active scene, replay its motion, and count down to the next step.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const reduced = prefersReducedMotion();
    const step = STEPS[active];
    const sceneEls = q('[data-scene]');
    if (!sceneEls.length) return;

    sceneEls.forEach((s, i) => {
      if (i !== active) gsap.to(s, { autoAlpha: 0, scale: 0.96, duration: reduced ? 0 : 0.3, overwrite: true });
    });
    gsap.to(q('[data-track-stage]'), { backgroundColor: step.color, duration: reduced ? 0 : 0.6, ease: 'power2.out' });
    gsap.fromTo(
      sceneEls[active],
      { autoAlpha: 0, scale: 0.94, y: 20 },
      { autoAlpha: 1, scale: 1, y: 0, duration: reduced ? 0 : 0.6, ease: 'expo.out', delay: reduced ? 0 : 0.15, overwrite: true },
    );
    const tl = scenes.current[active];
    if (tl && !reduced && live) tl.restart(true).delay(0.3);

    const bar = q(`[data-step-bar="${active}"]`)[0];
    if (!live || reduced || !bar) return;
    const countdown = gsap.fromTo(
      bar,
      { scaleX: 0 },
      { scaleX: 1, duration: STEP_SECONDS, ease: 'none', onComplete: () => setActive((a) => (a + 1) % STEPS.length) },
    );
    return () => {
      countdown.kill();
    };
  }, [active, live]);

  return (
    <section ref={root} id="how" data-tone="dark" className="relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-14 px-4 sm:px-8">
        <div className="flex flex-col gap-5">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">[ How a collab runs ]</div>
          <h2 data-track-title className="max-w-[820px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            From &ldquo;hi&rdquo; to paid, with every step on the record.
          </h2>
          <p className="max-w-[560px] text-lg leading-relaxed text-night-soft">
            Most stages move forward only when both of you sign off, so nothing changes because one side decided it had.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-14">
          <ol className="order-2 flex flex-col lg:order-1" aria-label="Collaboration steps">
            {STEPS.map((s, i) => {
              const on = i === active;
              const done = i < active;
              return (
                <li key={s.t} className="border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={on ? 'step' : undefined}
                    className="flex w-full flex-col gap-2 py-4 text-left"
                  >
                    <span className="flex items-center gap-3.5">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium transition-colors duration-300"
                        style={{
                          background: on || done ? s.color : 'rgba(255,255,255,.06)',
                          color: on || done ? (i === 6 ? '#17141d' : '#fff') : '#c9c1d1',
                        }}
                      >
                        {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={`font-display text-xl font-bold tracking-[-0.02em] transition-colors ${on ? 'text-white' : 'text-night-soft'}`}>
                        {s.t}
                      </span>
                    </span>
                    <span className={`grid transition-[grid-template-rows] duration-500 ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <span className="overflow-hidden">
                        <span className="block pl-[50px] text-[15px] leading-relaxed text-night-soft">{s.b}</span>
                        <span className="mb-1 ml-[50px] mt-3 block h-[3px] overflow-hidden rounded-full bg-white/10">
                          <span data-step-bar={i} className="block h-full w-full origin-left scale-x-0 rounded-full" style={{ background: s.color }} />
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div
            data-track-stage
            className="relative order-1 flex h-[480px] items-center justify-center overflow-hidden rounded-[32px] px-5 lg:order-2 lg:h-[560px]"
            style={{ backgroundColor: STEPS[0].color }}
          >
            {/* Soft shapes so each colour field has depth. */}
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden />
            <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-black/10" aria-hidden />
            <span className="absolute left-6 top-5 font-mono text-xs uppercase tracking-[0.14em] text-white/85">
              Step {String(active + 1).padStart(2, '0')} / 07 · {STEPS[active].t}
            </span>
            {SCENE_VIEWS.map((View, i) => (
              <div key={i} data-scene className="absolute inset-0 flex items-center justify-center px-5 [perspective:900px]" aria-hidden={i !== active}>
                <View />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
