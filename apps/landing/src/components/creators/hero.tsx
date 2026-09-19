'use client';

import { useRef, useState } from 'react';
import { BadgeCheck, Eye, LayoutGrid, Megaphone, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
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

type FeatureItem = {
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  hasPing?: boolean;
  isCounter?: boolean;
  icon: LucideIcon;
  color: string;
  glowColor: string;
  x: number;
  y: number;
  depth: number;
  path: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  speed: string;
  delay: string;
  microDetail: string;
};

// The 6 creator platform capabilities arranged in a 720×640 canvas.
// Center of ProfileCard is at (360, 320), card spans [190..530] horizontally and [200..440] vertically.
const SATELLITE_FEATURES: FeatureItem[] = [
  {
    id: 'reviewed-brands',
    label: 'Reviewed Brands',
    sublabel: 'Verified businesses only',
    badge: 'Verified',
    icon: BadgeCheck,
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    x: 125,
    y: 80,
    depth: 0.9,
    path: 'M 265 200 C 240 145, 205 120, 185 105',
    startPoint: { x: 265, y: 200 },
    endPoint: { x: 185, y: 105 },
    speed: '2.5s',
    delay: '0s',
    microDetail: 'Approved Brand ✓',
  },
  {
    id: 'open-campaigns',
    label: 'Open Campaigns',
    sublabel: 'Apply to live brand briefs',
    badge: '3 Live',
    hasPing: true,
    icon: Megaphone,
    color: '#f43f5e',
    glowColor: 'rgba(244, 63, 94, 0.4)',
    x: 595,
    y: 80,
    depth: 1.2,
    path: 'M 455 200 C 480 145, 515 120, 535 105',
    startPoint: { x: 455, y: 200 },
    endPoint: { x: 535, y: 105 },
    speed: '2.8s',
    delay: '0.4s',
    microDetail: '₹45k avg · 2 Reels',
  },
  {
    id: 'invoices',
    label: 'Instant Invoices',
    sublabel: 'Automated payment receipts',
    badge: 'Paid',
    icon: ReceiptText,
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    x: 90,
    y: 320,
    depth: 1.1,
    path: 'M 190 320 C 185 320, 180 320, 175 320',
    startPoint: { x: 190, y: 320 },
    endPoint: { x: 175, y: 320 },
    speed: '2.3s',
    delay: '0.8s',
    microDetail: '₹35,000 · Tax Logged',
  },
  {
    id: 'who-viewed-you',
    label: 'Who Viewed You',
    sublabel: 'Real-time brand discovery',
    badge: '14 views',
    isCounter: true,
    icon: Eye,
    color: '#3b82f6',
    glowColor: 'rgba(59, 130, 246, 0.4)',
    x: 630,
    y: 320,
    depth: 0.8,
    path: 'M 530 320 C 535 320, 540 320, 545 320',
    startPoint: { x: 530, y: 320 },
    endPoint: { x: 545, y: 320 },
    speed: '2.6s',
    delay: '1.2s',
    microDetail: 'Brand Marketing Leads',
  },
  {
    id: 'payment-gates',
    label: 'Payment Gates',
    sublabel: 'Advance locked before shoot',
    badge: 'Escrow',
    icon: ShieldCheck,
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    x: 125,
    y: 560,
    depth: 1.3,
    path: 'M 265 440 C 240 495, 205 520, 185 535',
    startPoint: { x: 265, y: 440 },
    endPoint: { x: 185, y: 535 },
    speed: '2.9s',
    delay: '1.6s',
    microDetail: '100% Advance Secured',
  },
  {
    id: 'portfolio',
    label: 'Live Media Kit',
    sublabel: 'Verified reach & stats',
    badge: '8.4% ER',
    icon: LayoutGrid,
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    x: 595,
    y: 560,
    depth: 0.9,
    path: 'M 455 440 C 480 495, 515 520, 535 535',
    startPoint: { x: 455, y: 440 },
    endPoint: { x: 535, y: 535 },
    speed: '2.4s',
    delay: '2.0s',
    microDetail: 'Curated Reels & Proof',
  },
];

// Rich, tactile micro-mockup card for each satellite feature
function SatelliteCard({
  item,
  counterValue,
}: {
  item: FeatureItem;
  counterValue: number;
}) {
  const Icon = item.icon;
  const isCounter = item.isCounter;

  return (
    <div
      className="group relative flex w-[185px] items-center gap-2.5 rounded-2xl border border-white/15 bg-[#171320] p-2.5 pr-3 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-white/35 hover:bg-[#201a2d] hover:scale-[1.03]"
      style={{
        boxShadow: `0 8px 30px -4px ${item.glowColor}, inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`,
      }}
    >
      {/* Ambient hover glow halo */}
      <div
        className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-35"
        style={{ background: item.color }}
      />

      {/* Thematic Icon Pill */}
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
        style={{
          backgroundColor: `${item.color}22`,
          color: item.color,
          border: `1px solid ${item.color}45`,
          boxShadow: `0 0 14px ${item.color}28`,
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        {item.hasPing && (
          <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: item.color }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          </span>
        )}
      </div>

      {/* Content & Micro Preview */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[12px] font-bold tracking-tight text-white/95">
            {item.label}
          </span>
          {item.badge && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${item.color}25`,
                color: item.color,
                border: `1px solid ${item.color}45`,
              }}
            >
              {isCounter ? `${counterValue} views` : item.badge}
            </span>
          )}
        </div>
        <span className="mt-0.5 truncate text-[10.5px] font-medium text-white/60">
          {item.sublabel}
        </span>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold" style={{ color: item.color }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="truncate">{item.microDetail}</span>
        </div>
      </div>
    </div>
  );
}

function ProfileCard() {
  return (
    <div className="relative w-[min(100%,340px)] rounded-[26px] border border-white/10 bg-card p-6 text-ink shadow-[0_30px_80px_-20px_rgba(255,7,142,.35),0_0_50px_-10px_rgba(255,7,142,.15)] backdrop-blur-md">
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

export default function CreatorHero() {
  const root = useRef<HTMLElement>(null);
  const [views, setViews] = useState(14);

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
        .from(q('[data-hero-watermark]'), { rotation: -70, scale: 0.7, autoAlpha: 0, duration: 2.2 }, 0)
        .from(q('[data-hero-eyebrow]'), { y: 14, autoAlpha: 0, duration: 0.8 }, 0.1)
        .from(title.lines, { yPercent: 105, duration: 1.2, stagger: 0.09 }, 0.15)
        .from(q('[data-hero-sub]'), { y: 24, autoAlpha: 0, duration: 1 }, 0.5)
        .from(q('[data-hero-cta] > *'), { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.6)
        .from(q('[data-hero-tilt]'), { y: 60, scale: 0.86, rotation: -4, filter: 'blur(14px)', autoAlpha: 0, duration: 1.4 }, 0.35)
        .from(q('[data-hero-spoke]'), { drawSVG: '0%', duration: 0.8, ease: 'power3.out', stagger: 0.08 }, 0.7)
        .from(q('[data-hero-pill]'), { scale: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.06 }, 1.0);

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

      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        // Organic floating bobbing for each satellite node
        q('[data-hero-bob]').forEach((el, i) => {
          gsap.to(el, { y: i % 2 ? 8 : -8, duration: 2.8 + (i % 3) * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        });

        // 3D parallax on pointer movement
        const pills = q('[data-hero-pill]');
        const pulls = pills.map((el) => ({
          x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }),
          y: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3.out' }),
          depth: Number((el as HTMLElement).dataset.depth ?? 1),
        }));
        const card = q('[data-hero-tilt]')[0];
        const tiltX = gsap.quickTo(card, 'rotationY', { duration: 1, ease: 'power3.out' });
        const tiltY = gsap.quickTo(card, 'rotationX', { duration: 1, ease: 'power3.out' });
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          pulls.forEach((p) => {
            p.x(nx * 32 * p.depth);
            p.y(ny * 24 * p.depth);
          });
          tiltX(nx * 10);
          tiltY(-ny * 8);
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
      });

      const stop = onGateReady(() => {
        reveal();
        intro.play();
        gsap.delayedCall(1.2, () => {
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

  return (
    <section
      ref={root}
      data-creator-hero
      data-page-hero
      data-tone="dark"
      className="relative isolate overflow-hidden bg-night pb-20 pt-32 text-white sm:pt-36 lg:min-h-[100svh] lg:pb-0 lg:pt-0"
    >
      <div
        data-hero-glow
        data-reveal
        className="pointer-events-none absolute left-1/2 top-[-45vmin] -z-10 h-[90vmin] w-[90vmin] -translate-x-1/2 rounded-full bg-brand opacity-25 blur-[140px]"
      />
      <div data-hero-watermark data-reveal className="pointer-events-none absolute -bottom-[22vmin] -right-[18vmin] -z-10 opacity-[0.07]">
        <div className="animate-[spin_60s_linear_infinite]">
          <LogoMark size={720} color="#ffffff" className="h-[80vmin] w-[80vmin]" />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1360px] items-center gap-12 px-4 sm:px-8 lg:min-h-[100svh] lg:grid-cols-[minmax(0,1fr)_720px] lg:gap-8">
        <div className="flex flex-col gap-7">
          <div data-hero-eyebrow data-reveal className="font-mono text-xs uppercase tracking-[0.16em] text-night-soft">
            [ For creators ]
          </div>
          <h1
            data-hero-title
            data-reveal
            className="font-display text-[46px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-7xl xl:text-[88px]"
          >
            Your brand deals deserve better than your <span className="text-brand">DMs.</span>
          </h1>
          <p data-hero-sub data-reveal className="max-w-[540px] text-lg leading-relaxed text-night-soft sm:text-xl">
            One profile for every collaboration. See who the brand is, agree terms in writing, and get the advance
            confirmed before you shoot.
          </p>
          <div data-hero-cta data-reveal className="flex flex-wrap gap-3">
            <a
              href={SIGNUP_URL.creator}
              className="flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-[17px] font-bold text-night transition-colors hover:bg-magenta-tint"
            >
              Create your free profile
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#how"
              className="flex h-14 items-center rounded-full border-[1.5px] border-white/25 px-6 text-[17px] font-semibold transition-colors hover:border-white/60"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* Hero visual canvas: flex on mobile, 720x640 absolute canvas on desktop */}
        <div className="relative mx-auto flex w-full max-w-[520px] flex-wrap justify-center gap-3 [perspective:1200px] lg:block lg:h-[640px] lg:w-[720px] lg:max-w-none">
          {/* Desktop SVG Canvas with animated energy beams */}
          <svg viewBox="0 0 720 640" className="absolute inset-0 hidden h-full w-full lg:block pointer-events-none" data-reveal aria-hidden>
            <defs>
              <filter id="beam-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {SATELLITE_FEATURES.map((item) => (
                <linearGradient key={item.id} id={`beam-grad-${item.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff078e" stopOpacity="0.8" />
                  <stop offset="60%" stopColor={item.color} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={item.color} stopOpacity="1" />
                </linearGradient>
              ))}
            </defs>

            {/* Subtle curved base guidelines */}
            {SATELLITE_FEATURES.map((item) => (
              <path
                key={`base-${item.id}`}
                data-hero-spoke
                d={item.path}
                fill="none"
                stroke={item.color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.25}
              />
            ))}

            {/* Glowing animated flowing energy beams */}
            {SATELLITE_FEATURES.map((item) => (
              <path
                key={`beam-${item.id}`}
                className="flowing-beam"
                d={item.path}
                fill="none"
                stroke={`url(#beam-grad-${item.id})`}
                strokeWidth={2.5}
                strokeLinecap="round"
                filter="url(#beam-glow)"
                style={{
                  ['--beam-speed' as string]: item.speed,
                  ['--beam-delay' as string]: item.delay,
                }}
              />
            ))}

            {/* Anchor beacons at start and end points */}
            {SATELLITE_FEATURES.map((item) => (
              <g key={`beacons-${item.id}`}>
                <circle cx={item.startPoint.x} cy={item.startPoint.y} r={2.5} fill="#ff078e" opacity={0.8} />
                <circle
                  cx={item.endPoint.x}
                  cy={item.endPoint.y}
                  r={3.5}
                  fill={item.color}
                  style={{ filter: `drop-shadow(0 0 6px ${item.color})` }}
                />
              </g>
            ))}
          </svg>

          {/* Central creator profile card */}
          <div className="mb-4 flex w-full justify-center lg:absolute lg:left-1/2 lg:top-1/2 lg:z-10 lg:mb-0 lg:w-[340px] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <div data-hero-tilt data-reveal className="flex w-full justify-center [transform-style:preserve-3d]">
              <ProfileCard />
            </div>
          </div>

          {/* Satellite feature cards */}
          {SATELLITE_FEATURES.map((item) => (
            <div
              key={item.id}
              data-hero-pill
              data-reveal
              data-depth={item.depth}
              className="lg:absolute lg:left-[var(--x)] lg:top-[var(--y)] lg:z-20"
              style={{
                ['--x' as string]: `${item.x}px`,
                ['--y' as string]: `${item.y}px`,
              }}
            >
              <div data-hero-bob>
                <div className="lg:-translate-x-1/2 lg:-translate-y-1/2">
                  <SatelliteCard item={item} counterValue={views} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
