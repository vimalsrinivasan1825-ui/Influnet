'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Eye, LayoutGrid, Megaphone, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { gsap, SplitText, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { onGateReady } from '@/components/motion/use-gate-ready';
import { SIGNUP_URL } from '@/components/site/links';

// Sample creators the hero card cycles through.
const PROFILES = [
  { initial: 'N', handle: 'neha.creates', name: 'Neha Kapoor', niche: 'Fashion and beauty · Chennai', posts: '312', followers: '75K', old: 'DM for paid promotion', link: 'influnet.io/neha', bg: '#f3dfe8', fg: '#9e1f62' },
  { initial: 'A', handle: 'arjun.eats', name: 'Arjun Rao', niche: 'Food · Bengaluru', posts: '540', followers: '128K', old: 'Email for collaboration', link: 'influnet.io/arjun.eats', bg: '#fde7c8', fg: '#8a4b08' },
  { initial: 'P', handle: 'priya.travels', name: 'Priya Menon', niche: 'Travel · Kochi', posts: '210', followers: '42K', old: 'Collabs? Slide into my DMs', link: 'influnet.io/priya.travels', bg: '#d6ecf3', fg: '#1d5b73' },
  { initial: 'K', handle: 'karthik.fits', name: 'Karthik S', niche: 'Fitness · Coimbatore', posts: '389', followers: '96K', old: 'Paid promos: DM me', link: 'influnet.io/karthik.fits', bg: '#dcefdc', fg: '#1f6b35' },
];

// ── Stage geometry ──────────────────────────────────────────────────────────
// Desktop draws the middle of the hero as one fixed 1400×330 stage (scaled down
// to whatever room the screen leaves): three cards down the left, the creator
// card in the middle, three down the right, and a curve from each card into the
// middle one. Fixed geometry is what lets every line meet a card edge exactly.
// Below `lg` the same cards simply stack.
const STAGE_W = 1400;
const STAGE_H = 330;
const CARD_W = 290;
const CARD_H = 86;
const CENTER_W = 340;
const CENTER_X = (STAGE_W - CENTER_W) / 2;
const ROW_Y = [45, 165, 285]; // vertical centre of each side card
const ATTACH_Y = [120, 165, 210]; // where each line lands on the creator card

type Feature = {
  id: string;
  label: string;
  sublabel: string;
  badge: string;
  hasPing?: boolean;
  isCounter?: boolean;
  icon: LucideIcon;
  color: string;
  glowColor: string;
  microDetail: string;
  side: 'left' | 'right';
  row: 0 | 1 | 2;
  speed: string;
  delay: string;
};

const FEATURES: Feature[] = [
  { id: 'reviewed-brands', label: 'Reviewed Brands', sublabel: 'Verified businesses only', badge: 'Verified', icon: BadgeCheck, color: '#10b981', glowColor: 'rgba(16, 185, 129, 0.4)', microDetail: 'Approved Brand ✓', side: 'left', row: 0, speed: '2.5s', delay: '0s' },
  { id: 'invoices', label: 'Instant Invoices', sublabel: 'Automated payment receipts', badge: 'Paid', icon: ReceiptText, color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.4)', microDetail: '₹35,000 · Tax Logged', side: 'left', row: 1, speed: '2.3s', delay: '0.8s' },
  { id: 'payment-gates', label: 'Payment Gates', sublabel: 'Advance paid before you shoot', badge: 'Razorpay', icon: ShieldCheck, color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.4)', microDetail: 'Confirmed before work starts', side: 'left', row: 2, speed: '2.9s', delay: '1.6s' },
  { id: 'open-campaigns', label: 'Open Campaigns', sublabel: 'Apply to live brand briefs', badge: '3 Live', hasPing: true, icon: Megaphone, color: '#f43f5e', glowColor: 'rgba(244, 63, 94, 0.4)', microDetail: '₹45k avg · 2 Reels', side: 'right', row: 0, speed: '2.8s', delay: '0.4s' },
  { id: 'who-viewed-you', label: 'Who Viewed You', sublabel: 'Real-time brand discovery', badge: 'views', isCounter: true, icon: Eye, color: '#3b82f6', glowColor: 'rgba(59, 130, 246, 0.4)', microDetail: 'Brand Marketing Leads', side: 'right', row: 1, speed: '2.6s', delay: '1.2s' },
  { id: 'portfolio', label: 'Live Media Kit', sublabel: 'Verified reach & stats', badge: '8.4% ER', icon: LayoutGrid, color: '#a855f7', glowColor: 'rgba(168, 85, 247, 0.4)', microDetail: 'Curated Reels & Proof', side: 'right', row: 2, speed: '2.4s', delay: '2.0s' },
];

// Where a card sits and the curve that carries it into the creator card. The
// curve leaves the card and arrives at the creator card with horizontal
// tangents, so it reads as one smooth wire rather than a diagonal.
function place(f: Feature) {
  const left = f.side === 'left';
  const cardX = left ? 0 : STAGE_W - CARD_W;
  const cardY = ROW_Y[f.row] - CARD_H / 2;
  const start = { x: left ? CARD_W : STAGE_W - CARD_W, y: ROW_Y[f.row] };
  const end = { x: left ? CENTER_X : CENTER_X + CENTER_W, y: ATTACH_Y[f.row] };
  const dx = end.x - start.x;
  const path = `M ${start.x} ${start.y} C ${start.x + dx * 0.55} ${start.y}, ${end.x - dx * 0.55} ${end.y}, ${end.x} ${end.y}`;
  return { cardX, cardY, start, end, path };
}
const PLACED = FEATURES.map((f) => ({ f, ...place(f) }));

// Measures the room the stage has been given (the hero fills the screen, the
// headline and the buttons take what they need, the stage gets the rest) and
// returns the scale that fits the fixed-size stage inside it. This is what keeps
// the whole hero on one screen, and the lines on the cards at any size.
function useFitScale(baseW: number, baseH: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.3, Math.min(1, width / baseW, height / baseH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseW, baseH]);
  return [ref, scale] as const;
}

// A feature card: icon, label, a live badge and one line of proof. Hovering it
// lifts it, tints its border, sweeps a light across it and lights its wire.
// These are CSS transitions on elements GSAP never animates (GSAP moves the
// wrappers around them), so the two never fight over a transform.
function FeatureCard({ item, counterValue }: { item: Feature; counterValue: number }) {
  const Icon = item.icon;
  return (
    <div
      className="group/card relative flex h-full w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-white/15 bg-[#171320] p-3 pr-3.5 transition-[translate,scale,rotate,border-color,background-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:scale-[1.025] hover:border-[var(--c)] hover:bg-[#1d1728] hover:shadow-[0_18px_44px_-10px_var(--g),inset_0_1px_0_0_rgba(255,255,255,.14)]"
      style={{
        ['--c' as string]: `${item.color}99`,
        ['--g' as string]: item.glowColor,
        boxShadow: `0 10px 34px -6px ${item.glowColor}, inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`,
      }}
    >
      {/* A light that sweeps across the card on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent opacity-0 transition-[translate,scale,rotate,opacity] duration-700 ease-out group-hover/card:translate-x-[330%] group-hover/card:opacity-100"
      />
      <div
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 ease-out group-hover/card:-rotate-6 group-hover/card:scale-110"
        style={{ backgroundColor: `${item.color}22`, color: item.color, border: `1px solid ${item.color}45`, boxShadow: `0 0 16px ${item.color}30` }}
      >
        <Icon className="h-[21px] w-[21px]" strokeWidth={2.2} aria-hidden />
        {item.hasPing && (
          <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: item.color }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          </span>
        )}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-bold tracking-tight text-white/95">{item.label}</span>
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${item.color}25`, color: item.color, border: `1px solid ${item.color}45` }}
          >
            {item.isCounter ? `${counterValue} views` : item.badge}
          </span>
        </div>
        <span className="mt-0.5 truncate text-[12px] font-medium text-white/60">{item.sublabel}</span>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: item.color }}>
          <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-0 group-hover/card:animate-ping group-hover/card:opacity-75" style={{ backgroundColor: item.color }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
          </span>
          <span className="truncate">{item.microDetail}</span>
        </div>
      </div>
    </div>
  );
}

function ProfileCard() {
  return (
    <div className="relative w-[min(100%,340px)] rounded-[26px] border border-white/10 bg-card p-6 text-ink shadow-[0_30px_80px_-20px_rgba(255,7,142,.35),0_0_50px_-10px_rgba(255,7,142,.15)]">
      <span className="absolute right-5 top-5 z-10 flex items-center gap-1 rounded-full bg-verified-tint px-2.5 py-1 text-xs font-bold text-[#0b7a55]">
        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
        Verified
      </span>
      {/* Every profile is stacked in the same cell; GSAP shows one at a time. */}
      <div className="grid">
        {PROFILES.map((p, i) => (
          <div key={p.handle} data-profile={i} className="[grid-area:1/1]" aria-hidden={i > 0}>
            <div className="flex items-center gap-4">
              <div className="h-[76px] w-[76px] shrink-0 rounded-full border-[3px] border-brand p-[3px]">
                <div
                  className="flex h-full w-full items-center justify-center rounded-full font-display text-2xl font-extrabold"
                  style={{ background: p.bg, color: p.fg }}
                >
                  {p.initial}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-[17px] font-bold">{p.handle}</span>
                <div className="flex gap-3 text-[13px] text-ink-soft">
                  <span><b className="text-ink">{p.posts}</b> posts</span>
                  <span><b className="text-ink">{p.followers}</b> followers</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1 text-[14px] leading-snug">
              <span className="font-bold">{p.name}</span>
              <span className="text-ink-soft">{p.niche}</span>
              <div className="relative mt-0.5 h-6">
                <span data-bio-old className="absolute left-0 top-0 inline-block whitespace-nowrap">
                  {p.old}
                  <span data-bio-strike className="absolute -left-0.5 -right-0.5 top-[11px] block h-[2px] origin-left bg-[#d12f2f]" />
                </span>
                <span className="absolute left-0 top-0 flex items-center gap-0.5">
                  <span data-bio-new className="whitespace-nowrap font-bold text-brand-deep">
                    Collabs: {p.link}
                  </span>
                  <span data-bio-caret className="inline-block h-[18px] w-[2px] animate-pulse bg-brand-deep" />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-1.5" aria-hidden>
        {PROFILES.map((p, i) => (
          <span key={p.handle} data-profile-dot={i} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        ))}
      </div>
    </div>
  );
}

// The Influnet mark, as two baked images (made by scripts/render-hero-mark.mjs):
// a plain white hairline shown very faintly, and the pink outline with its glow,
// shown only under the cursor. A live SVG filter that size would cost the hero
// most of its frame budget; textures cost almost nothing. The images are the
// filter region, so the ring's centre is not their middle; these are where it
// sits, so the ring can be put exactly on the hero's bottom edge.
const MARK = { line: '/brand/hero-mark-line.webp', glow: '/brand/hero-mark-glow.webp', w: 2000, h: 2067, originX: 47.42, originY: 51.09 };
// Sized so the half that shows spans about 89% of the screen, leaving an even
// margin on both sides.
const MARK_CSS_W = 'clamp(1100px, 128vw, 2600px)';
// How far round the cursor the outline lights up.
const LIGHT_RADIUS = 260;
// Turned clockwise about the ring so the two arms above the edge sit at mirror
// angles (about 41° and 139°); untouched they lean left, at 53° and 151°.
const MARK_TILT = 12;
// The tilt swings the visible half to the right: its outline runs from 272 to
// 347 mark units either side of the ring, so its middle sits 37.6 units (4.22%
// of the image's width) right of centre. The mark moves left by that much.
const MARK_SHIFT = 0.0422;

// One wire's moving light, on its own small canvas. Animating a dash repaints
// whatever it lives in, so each wire gets a box just big enough for itself
// instead of sharing the whole 1300×440 stage.
function Beam({ f, start, end, path, active }: (typeof PLACED)[number] & { active: boolean }) {
  const pad = 14;
  const x = Math.min(start.x, end.x) - pad;
  const y = Math.min(start.y, end.y) - pad;
  const w = Math.abs(end.x - start.x) + pad * 2;
  const h = Math.abs(end.y - start.y) + pad * 2;
  return (
    <svg
      data-reveal
      aria-hidden
      className="pointer-events-none absolute hidden lg:block"
      viewBox={`${x} ${y} ${w} ${h}`}
      style={{ left: x, top: y, width: w, height: h, ['--beam-speed' as string]: f.speed, ['--beam-delay' as string]: f.delay }}
    >
      <defs>
        {/* userSpaceOnUse: the middle wires are perfectly level, and a
            bounding-box gradient has no area on a line with no height. */}
        <linearGradient id={`hero-beam-${f.id}`} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
          <stop offset="0%" stopColor={f.color} />
          <stop offset="100%" stopColor="#ff078e" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      {/* A wide faint stroke is the glow, a thin bright one the light: both ride the same dash. */}
      <path className="flowing-beam" d={path} fill="none" stroke={f.color} strokeOpacity={0.22} strokeWidth={9} strokeLinecap="round" />
      <path className="flowing-beam" d={path} fill="none" stroke={`url(#hero-beam-${f.id})`} strokeWidth={2.5} strokeLinecap="round" />
      {/* The whole wire, lit while its card is hovered. */}
      <path
        d={path}
        fill="none"
        stroke={`url(#hero-beam-${f.id})`}
        strokeWidth={2}
        strokeLinecap="round"
        className="transition-opacity duration-300"
        style={{ opacity: active ? 0.95 : 0 }}
      />
      <path d={path} fill="none" stroke={f.color} strokeOpacity={0.3} strokeWidth={10} strokeLinecap="round" className="transition-opacity duration-300" style={{ opacity: active ? 1 : 0 }} />
    </svg>
  );
}

// The mark, with its ring centre on the bottom edge of the hero so only the top
// half shows. Drawn twice, one on top of the other: the faint blurred line, and
// the crisp pink glow only where the cursor is (see the light layer below).
function Mark({ src }: { src: string }) {
  return (
    <div className="absolute bottom-0 left-1/2 h-0 w-0">
      <div
        className="absolute"
        style={{
          width: MARK_CSS_W,
          left: `calc(${MARK_CSS_W} * -${MARK.originX / 100 + MARK_SHIFT})`,
          top: `calc(${MARK_CSS_W} * ${MARK.h / MARK.w} * -${MARK.originY / 100})`,
          rotate: `${MARK_TILT}deg`,
          transformOrigin: `${MARK.originX}% ${MARK.originY}%`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={MARK.w} height={MARK.h} decoding="async" fetchPriority="low" draggable={false} className="block h-auto w-full max-w-none select-none" />
      </div>
    </div>
  );
}

export default function CreatorHero() {
  const root = useRef<HTMLElement>(null);
  const [views, setViews] = useState(14);
  const [hovered, setHovered] = useState<string | null>(null);
  const [stageRef, scale] = useFitScale(STAGE_W, STAGE_H);
  const lightRef = useRef<HTMLDivElement>(null);
  const lightInnerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reveal = () => gsap.set(q('[data-reveal]'), { visibility: 'visible' });
      const layers = q('[data-profile]');
      const dots = q('[data-profile-dot]');

      if (prefersReducedMotion()) {
        gsap.set(layers.slice(1), { autoAlpha: 0 });
        gsap.set(q('[data-bio-old]'), { autoAlpha: 0 });
        gsap.set(dots[0], { backgroundColor: '#ff078e', width: 18 });
        reveal();
        return;
      }

      const title = new SplitText(q('[data-hero-title]'), { type: 'lines', mask: 'lines', linesClass: 'pb-1' });

      const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
      intro
        .from(q('[data-hero-glow]'), { scale: 0.4, autoAlpha: 0, duration: 2 }, 0)
        .from(q('[data-hero-watermark]'), { autoAlpha: 0, duration: 2.4 }, 0)
        .from(q('[data-hero-eyebrow]'), { y: 14, autoAlpha: 0, duration: 0.8 }, 0.1)
        .from(title.lines, { yPercent: 105, duration: 1.2, stagger: 0.09 }, 0.15)
        .from(q('[data-hero-sub]'), { y: 24, autoAlpha: 0, duration: 1 }, 0.5)
        .from(q('[data-hero-cta] > *'), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.6)
        .from(q('[data-hero-tilt]'), { y: 60, scale: 0.86, filter: 'blur(14px)', autoAlpha: 0, duration: 1.4 }, 0.5)
        .from(q('[data-hero-spoke]'), { autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.9)
        .from(
          q('[data-hero-pill]'),
          { x: (_i, el: HTMLElement) => (el.dataset.side === 'left' ? -70 : 70), autoAlpha: 0, duration: 1, stagger: 0.07 },
          0.8,
        );

      // The card cycles through creators; each one's bio rewrites itself into their Influnet link.
      const chars = layers.map((l) => new SplitText(l.querySelector('[data-bio-new]'), { type: 'chars' }).chars);
      const resetBio = (i: number) => {
        const l = layers[i];
        gsap.set(l.querySelector('[data-bio-strike]'), { scaleX: 0 });
        gsap.set(l.querySelector('[data-bio-old]'), { autoAlpha: 1, y: 0 });
        gsap.set(chars[i], { autoAlpha: 0, color: '#c8307f' });
        gsap.set(l.querySelector('[data-bio-caret]'), { autoAlpha: 0 });
      };
      gsap.set(layers.slice(1), { autoAlpha: 0 });
      layers.forEach((_, i) => resetBio(i));
      gsap.set(dots, { backgroundColor: '#d9d4cb', width: 6 });
      gsap.set(dots[0], { backgroundColor: '#ff078e', width: 18 });

      let current = 0;
      let running: gsap.core.Timeline | null = null;
      const play = (i: number) => {
        const layer = layers[i];
        const next = (i + 1) % layers.length;
        running = gsap
          .timeline({ onComplete: () => play(next) })
          .to(layer.querySelector('[data-bio-strike]'), { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, 0.9)
          .to(layer.querySelector('[data-bio-old]'), { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' }, '+=0.3')
          .set(layer.querySelector('[data-bio-caret]'), { autoAlpha: 1 })
          .to(chars[i], { autoAlpha: 1, duration: 0.01, stagger: 0.04 })
          .to(chars[i], { color: '#ff078e', duration: 0.25, stagger: 0.008 }, '+=0.15')
          .to(chars[i], { color: '#c8307f', duration: 0.35, stagger: 0.008 })
          .addLabel('swap', '+=1.6')
          .to(layer, { autoAlpha: 0, y: -18, filter: 'blur(6px)', duration: 0.45, ease: 'power2.in' }, 'swap')
          .add(() => resetBio(next), 'swap+=0.45')
          .fromTo(
            layers[next],
            { autoAlpha: 0, y: 22, filter: 'blur(8px)' },
            { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out' },
            'swap+=0.3',
          )
          .to(dots[i], { backgroundColor: '#d9d4cb', width: 6, duration: 0.4 }, 'swap')
          .to(dots[next], { backgroundColor: '#ff078e', width: 18, duration: 0.4 }, 'swap');
        current = next;
      };

      // Periodic live counter increment for "Who viewed you"
      const viewTimer = setInterval(() => {
        setViews((v) => v + 1);
      }, 7000);

      // A slow bob on the side cards. Small on purpose: the lines end on the
      // cards' edges, and a big drift would pull them apart.
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        q('[data-hero-bob]').forEach((el, i) => {
          gsap.to(el, { y: i % 2 ? 4 : -4, duration: 2.8 + (i % 3) * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        });
      });

      const stop = onGateReady(() => {
        reveal();
        intro.play();
        gsap.delayedCall(1.4, () => {
          play(current);
        });
      });

      return () => {
        stop();
        clearInterval(viewTimer);
        running?.kill();
        mm.revert();
      };
    },
    { scope: root },
  );

  // The cursor lights the outline. A small disc follows the pointer, and inside
  // it a bright copy of the mark slides the opposite way, so it stays lined up
  // with the dim one underneath. Both only ever move (transforms), which the
  // browser does without repainting. The disc eases after the cursor rather than
  // sticking to it, so the light drifts over the line like it is alive; the loop
  // stops as soon as it has caught up.
  // Only for a real pointer: a finger has no hover, and reduced motion asks for
  // less that moves with you.
  useEffect(() => {
    const section = root.current;
    const light = lightRef.current;
    const inner = lightInnerRef.current;
    if (!section || !light || !inner || prefersReducedMotion() || !window.matchMedia('(hover: hover)').matches) return;
    let frame = 0;
    let tx = 0; // where the cursor is, in the hero's own coordinates
    let ty = 0;
    let x = 0; // where the light is
    let y = 0;
    let placed = false;
    let size = '';
    const step = () => {
      frame = 0;
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      const px = x - LIGHT_RADIUS;
      const py = y - LIGHT_RADIUS;
      light.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      inner.style.transform = `translate3d(${-px}px, ${-py}px, 0)`;
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) frame = requestAnimationFrame(step);
    };
    const aim = (clientX: number, clientY: number) => {
      const r = section.getBoundingClientRect();
      tx = clientX - r.left;
      ty = clientY - r.top;
      // The bright copy needs the hero's own box, so the mark sits where the dim one does.
      const next = `${r.width}x${r.height}`;
      if (next !== size) {
        size = next;
        inner.style.width = `${r.width}px`;
        inner.style.height = `${r.height}px`;
      }
      // First entry: start the light under the cursor instead of sliding in from a corner.
      if (!placed) {
        placed = true;
        x = tx;
        y = ty;
      }
      light.style.opacity = '1';
      if (!frame) frame = requestAnimationFrame(step);
    };
    let lastX = 0;
    let lastY = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      lastX = e.clientX;
      lastY = e.clientY;
      aim(lastX, lastY);
    };
    const leave = () => {
      light.style.opacity = '0';
      placed = false;
    };
    // The page moving under a still cursor moves the light with it.
    const scroll = () => {
      if (light.style.opacity === '1') aim(lastX, lastY);
    };
    section.addEventListener('pointermove', move);
    section.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      section.removeEventListener('pointermove', move);
      section.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', scroll);
    };
  }, []);

  // Soft edge for the disc. It never changes, and it moves with the disc.
  const lightMask = 'radial-gradient(circle closest-side at 50% 50%, #000 0%, rgba(0,0,0,.55) 45%, transparent 100%)';

  return (
    <section
      ref={root}
      data-creator-hero
      data-page-hero
      data-tone="dark"
      className="relative isolate overflow-hidden bg-night text-white lg:h-[max(100svh,660px)]"
    >
      {/* Behind everything: the Influnet mark, still, running edge to edge and
          rising from the bottom. At rest it is a faint, blurred hairline, so it
          never competes with the copy; a crisp pink glow only shows through a
          soft circle that follows the cursor. */}
      <div data-hero-watermark data-reveal aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="opacity-[0.14]">
          <Mark src={MARK.line} />
        </div>
        <div
          ref={lightRef}
          className="absolute left-0 top-0 overflow-hidden opacity-0 transition-opacity duration-500 will-change-transform"
          style={{ width: LIGHT_RADIUS * 2, height: LIGHT_RADIUS * 2, maskImage: lightMask, WebkitMaskImage: lightMask, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}
        >
          <div ref={lightInnerRef} className="absolute left-0 top-0 will-change-transform">
            <Mark src={MARK.glow} />
          </div>
        </div>
      </div>
      <div
        data-hero-glow
        data-reveal
        className="pointer-events-none absolute left-1/2 top-[-45vmin] -z-10 h-[90vmin] w-[90vmin] -translate-x-1/2 rounded-full bg-brand opacity-25 blur-[140px]"
      />

      {/* One screen: the headline, the stage, then the pitch and buttons. The
          stage takes whatever height the screen leaves and scales to fit it. */}
      <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col items-center px-4 pb-16 pt-32 sm:px-8 sm:pt-36 lg:justify-center lg:pb-10 lg:pt-[104px]">
        <div className="flex max-w-[1000px] flex-col items-center gap-4 text-center lg:gap-[clamp(8px,1.8vh,18px)]">
          <div data-hero-eyebrow data-reveal className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">
            [ For creators ]
          </div>
          <h1
            data-hero-title
            data-reveal
            className="text-balance font-display text-[44px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-7xl lg:text-[clamp(38px,7.4vh,76px)]"
          >
            Your brand deals deserve better than your <span className="text-brand">DMs.</span>
          </h1>
        </div>

        {/* The stage. On desktop a fixed 1400×330 canvas scaled to fit the room
            it is given; below that the creator card leads and the six cards
            stack underneath. */}
        <div
          ref={stageRef}
          style={{ ['--s' as string]: scale }}
          className="relative mt-10 w-full max-w-[560px] lg:my-[clamp(6px,1.6vh,18px)] lg:mt-0 lg:min-h-0 lg:max-h-[400px] lg:max-w-[1400px] lg:flex-1"
        >
          <div className="lg:absolute lg:left-1/2 lg:top-1/2 lg:h-[calc(330px*var(--s))] lg:w-[calc(1400px*var(--s))] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <div className="flex flex-col gap-4 lg:absolute lg:left-0 lg:top-0 lg:block lg:h-[330px] lg:w-[1400px] lg:origin-top-left lg:[scale:var(--s)]">
              {/* Wires: the faint dashed track and a port at each end never change. */}
              <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} className="pointer-events-none absolute left-0 top-0 hidden h-[330px] w-[1400px] lg:block" data-reveal aria-hidden>
                {PLACED.map(({ f, path }) => (
                  <path key={`base-${f.id}`} data-hero-spoke d={path} fill="none" stroke={f.color} strokeWidth={1.5} strokeDasharray="4 5" strokeOpacity={0.35} />
                ))}
                {PLACED.map(({ f, start, end }) => (
                  <g key={`ports-${f.id}`}>
                    <circle cx={start.x} cy={start.y} r={4} fill={f.color} style={{ filter: `drop-shadow(0 0 6px ${f.color})` }} />
                    <circle cx={end.x} cy={end.y} r={4} fill="#ff078e" style={{ filter: 'drop-shadow(0 0 6px #ff078e)' }} />
                  </g>
                ))}
              </svg>
              {PLACED.map((item) => (
                <Beam key={item.f.id} {...item} active={hovered === item.f.id} />
              ))}

              {/* Creator card, in the middle */}
              <div className="mx-auto flex w-full justify-center lg:absolute lg:left-[var(--cx)] lg:top-1/2 lg:z-10 lg:w-[340px] lg:-translate-y-1/2" style={{ ['--cx' as string]: `${CENTER_X}px` }}>
                <div data-hero-tilt data-reveal className="flex w-full justify-center">
                  <ProfileCard />
                </div>
              </div>

              {/* The six cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:block">
                {PLACED.map(({ f, cardX, cardY }) => (
                  <div
                    key={f.id}
                    data-hero-pill
                    data-reveal
                    data-side={f.side}
                    className="lg:absolute lg:left-[var(--x)] lg:top-[var(--y)] lg:z-20 lg:h-[86px] lg:w-[290px]"
                    style={{ ['--x' as string]: `${cardX}px`, ['--y' as string]: `${cardY}px` }}
                    onPointerEnter={() => setHovered(f.id)}
                    onPointerLeave={() => setHovered((h) => (h === f.id ? null : h))}
                  >
                    <div data-hero-bob className="h-full">
                      <FeatureCard item={f} counterValue={views} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex max-w-[640px] flex-col items-center gap-5 text-center lg:mt-0 lg:gap-[clamp(10px,2.2vh,22px)]">
          <p data-hero-sub data-reveal className="text-lg leading-relaxed text-night-soft sm:text-xl lg:text-[clamp(15px,2.3vh,19px)] lg:leading-snug">
            One profile for every collaboration. See who the brand is, agree terms in writing, and get the advance
            confirmed before you shoot.
          </p>
          <div data-hero-cta data-reveal className="flex flex-wrap justify-center gap-3">
            <a
              href={SIGNUP_URL.creator}
              className="flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-[17px] font-bold text-night transition-colors hover:bg-magenta-tint lg:h-[clamp(46px,6vh,56px)]"
            >
              Create your free profile
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#how"
              className="flex h-14 items-center rounded-full border-[1.5px] border-white/25 px-6 text-[17px] font-semibold transition-colors hover:border-white/60 lg:h-[clamp(46px,6vh,56px)]"
            >
              See how it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
