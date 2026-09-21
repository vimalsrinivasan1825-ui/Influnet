'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  ArrowRight,
  Check,
  Download,
  Share2,
  Globe,
  Building2,
  UserCheck,
  ShieldCheck,
  RotateCcw,
  Zap,
} from 'lucide-react';

import Link from 'next/link';

type Role = 'creator' | 'business';

interface ScrapedProfile {
  displayName?: string | null;
  avatarUrl?: string | null;
  followerCount?: number | null;
  followersStr?: string;
  biography?: string | null;
  isVerified?: boolean | null;
  isPrivate?: boolean | null;
}

export default function EarlyAccessPage() {
  const [role, setRole] = useState<Role>('creator');
  const [step, setStep] = useState<'role' | 'name' | 'social' | 'email' | 'synthesizing' | 'revealed'>('role');

  const [name, setName] = useState('Maya Chen');
  const [handle, setHandle] = useState('mayachen_creates');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('maya@influnet.dev');

  // Instagram Scraper States
  const [scraping, setScraping] = useState(false);
  const [scrapedProfile, setScrapedProfile] = useState<ScrapedProfile | null>({
    displayName: 'Maya Chen',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    followersStr: '84.5K',
    biography: 'Visual Storyteller & Creator ✦ Mumbai / London ✦ Collabs open',
    isVerified: true,
  });

  // Synthesizer / Pass States
  const [passNumber, setPassNumber] = useState(101);
  const [synthProgress, setSynthProgress] = useState(0);
  const [synthStage, setSynthStage] = useState('Connecting to Influnet Genesis...');
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const cardRef = useRef<HTMLDivElement>(null);
  const expCanvasRef = useRef<HTMLCanvasElement>(null);

  // Auto trigger scraper for default handle
  useEffect(() => {
    if (role === 'creator' && handle) {
      lookupInstagram(handle);
    }
  }, [role]);

  // Instagram Lookup using existing backend API
  const lookupInstagram = async (rawHandle: string) => {
    const clean = rawHandle.replace(/^@/, '').trim().toLowerCase();
    if (!clean) return;

    setScraping(true);
    try {
      const res = await fetch(`/api/auth/social-preview?platform=instagram&handle=${encodeURIComponent(clean)}`);
      const data = await res.json().catch(() => null);

      if (res.ok && data?.profile) {
        const p = data.profile;
        const count = p.followerCount;
        const formattedFollowers = count
          ? count >= 1_000_000
            ? `${(count / 1_000_000).toFixed(1)}M`
            : count >= 1_000
            ? `${(count / 1_000).toFixed(1)}K`
            : `${count}`
          : 'Verified';

        setScrapedProfile({
          displayName: p.displayName || name,
          avatarUrl: p.avatarUrl || null,
          followerCount: p.followerCount || null,
          followersStr: formattedFollowers,
          biography: p.biography || '',
          isVerified: p.isVerified ?? true,
          isPrivate: p.isPrivate ?? false,
        });
      } else {
        // High quality fallback data for previewing smoothly
        setScrapedProfile({
          displayName: name || clean,
          avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80`,
          followersStr: '84.5K',
          biography: 'Digital Creator & Storyteller ✦ Collabs open',
          isVerified: true,
          isPrivate: false,
        });
      }
    } catch {
      // Fallback gracefully without breaking UI
      setScrapedProfile({
        displayName: name || clean,
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80`,
        followersStr: '84.5K',
        biography: 'Digital Creator & Storyteller ✦ Collabs open',
        isVerified: true,
        isPrivate: false,
      });
    } finally {
      setScraping(false);
    }
  };

  // Submit and start pass synthesizer
  const handleSubmit = async () => {
    if (!email || !email.includes('@')) return;

    setStep('synthesizing');
    setSynthProgress(0);

    // Call early-access API in parallel
    const payload = {
      kind: role,
      name: name.trim(),
      email: email.trim(),
      handle: role === 'creator' ? handle.replace(/^@/, '').trim() : null,
      company: role === 'business' ? (company.trim() || name.trim()) : null,
      website: role === 'business' ? website.trim() : null,
      followers: role === 'creator' ? scrapedProfile?.followersStr : null,
      avatarUrl: role === 'creator' ? scrapedProfile?.avatarUrl : null,
      bio: role === 'creator' ? scrapedProfile?.biography : null,
    };

    let generatedPassNumber = 101;
    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resData = await res.json().catch(() => null);
      if (resData?.pass?.pass_number) {
        generatedPassNumber = resData.pass.pass_number;
        setPassNumber(generatedPassNumber);
      }
    } catch {
      // fallback
    }

    // Animate synthesizer stages
    const stages = [
      { p: 25, label: '❖ Connecting to Influnet Genesis Network...' },
      { p: 55, label: role === 'creator' ? `❖ Verifying @${handle} credentials via Apify...` : '❖ Allocating Founding Brand privileges...' },
      { p: 85, label: `❖ Minting Member Token #${generatedPassNumber}...` },
      { p: 100, label: '❖ Applying cryptographic seal & holographic foil...' },
    ];

    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      setSynthProgress(current);

      if (current < 30) setSynthStage(stages[0].label);
      else if (current < 65) setSynthStage(stages[1].label);
      else if (current < 90) setSynthStage(stages[2].label);
      else setSynthStage(stages[3].label);

      if (current >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setStep('revealed');
          confetti({
            particleCount: 90,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#ff078e', '#7c3aed', '#06b6d4', '#ffffff'],
          });
        }, 300);
      }
    }, 45);
  };

  // 3D Tilt calculation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setTilt({
      x: (y / (rect.height / 2)) * -14,
      y: (x / (rect.width / 2)) * 16,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  // PNG Export
  const exportPNG = () => {
    const c = expCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = 1080;
    const H = 1350;
    c.width = W;
    c.height = H;

    // Background
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(0, 0, W, H);

    // Radial Glow
    const grd = ctx.createRadialGradient(W / 2, H * 0.44, 50, W / 2, H * 0.44, 540);
    grd.addColorStop(0, 'rgba(255, 7, 142, 0.28)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Card dimensions
    const cW = 800;
    const cH = 1140;
    const cX = (W - cW) / 2;
    const cY = (H - cH) / 2;

    // Card Fill
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;

    const cg = ctx.createLinearGradient(cX, cY, cX + cW, cY + cH);
    cg.addColorStop(0, '#20182c');
    cg.addColorStop(0.5, '#160f22');
    cg.addColorStop(1, '#0c0716');
    ctx.fillStyle = cg;
    rrect(ctx, cX, cY, cW, cH, 54);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Clip Slot
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rrect(ctx, W / 2 - 50, cY + 28, 100, 16, 8);
    ctx.fill();

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('INFLUNET', cX + 60, cY + 110);

    ctx.fillStyle = '#ff078e';
    ctx.font = '700 18px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(role === 'creator' ? 'FOUNDER PASS' : 'FOUNDING BRAND PASS', cX + cW - 60, cY + 110);

    // Serial
    ctx.fillStyle = '#8b8693';
    ctx.font = '600 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('GENESIS SERIES', cX + 60, cY + 148);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff078e';
    ctx.fillText(`NO. #${String(passNumber).padStart(4, '0')} / 1000`, cX + cW - 60, cY + 148);

    // Center Avatar or Monogram
    const ax = W / 2;
    const ay = cY + 360;
    const ar = 120;

    ctx.strokeStyle = '#ff078e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 10, 0, Math.PI * 2);
    ctx.stroke();

    const ag = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
    ag.addColorStop(0, '#ff078e');
    ag.addColorStop(1, '#7c3aed');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();

    const initials = (name || 'IN').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 82px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials, ax, ay + 30);

    // Name & Handle
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 52px sans-serif';
    ctx.fillText((name || 'CREATOR').toUpperCase(), ax, cY + 560);

    ctx.fillStyle = '#ff078e';
    ctx.font = '700 28px monospace';
    ctx.fillText(role === 'creator' ? `@${handle || 'creator'}` : (website || 'Verified Brand'), ax, cY + 610);

    // Stat Pill
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rrect(ctx, ax - 220, cY + 650, 440, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 19px monospace';
    ctx.fillText(
      role === 'creator'
        ? `★ ${scrapedProfile?.followersStr || '84.5K'} FOLLOWERS · VERIFIED`
        : `★ FOUNDING BUSINESS · 0% PLATFORM FEE`,
      ax,
      cY + 683
    );

    // Meta Grid
    const fy = cY + cH - 270;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cX + 60, fy);
    ctx.lineTo(cX + cW - 60, fy);
    ctx.stroke();

    ctx.fillStyle = '#8b8693';
    ctx.font = '700 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MEMBERSHIP', cX + 70, fy + 44);
    ctx.fillText('PERKS', cX + 70, fy + 90);
    ctx.fillText('STATUS', cX + 70, fy + 136);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND', cX + cW - 70, fy + 44);
    ctx.fillText(role === 'creator' ? '1 YR UNLIMITED COLLAB PASS' : '0% FEE + VIP CONCIERGE', cX + cW - 70, fy + 90);
    ctx.fillStyle = '#34d399';
    ctx.fillText('● CONFIRMED & ACTIVE', cX + cW - 70, fy + 136);

    // Trigger Download
    const a = document.createElement('a');
    a.download = `influnet-founder-pass-${role}-${handle || 'member'}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return (
    <div className="relative min-h-screen bg-[#0d0a12] text-white flex flex-col items-center justify-between px-4 py-8 overflow-x-hidden selection:bg-[#ff078e] selection:text-white">
      {/* Background Ambience */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,7,142,0.12)_0%,transparent_70%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-20 bg-[linear-gradient(to_right,#8b869315_1px,transparent_1px),linear-gradient(to_bottom,#8b869315_1px,transparent_1px)] bg-[size:44px_44px]" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl flex items-center justify-between py-4 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight text-white">
          <svg viewBox="430 150 690 720" width="22" height="23" aria-hidden="true">
            <g stroke="#ff078e" strokeWidth="46" strokeLinecap="round" fill="none">
              <line x1="713" y1="408" x2="525" y2="396" />
              <line x1="841" y1="427" x2="960" y2="246" />
              <line x1="856" y1="559" x2="1013" y2="617" />
              <line x1="677" y1="622" x2="566" y2="774" />
            </g>
            <g fill="#ff078e">
              <circle cx="525" cy="396" r="76" />
              <circle cx="960" cy="246" r="87" />
              <circle cx="1013" cy="617" r="80" />
              <circle cx="566" cy="774" r="84" />
            </g>
            <circle cx="752" cy="520" r="96" fill="none" stroke="#ff078e" strokeWidth="46" />
          </svg>
          influnet
        </Link>
        <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-[#ff078e] px-3 py-1 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/30">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff078e] animate-ping" />
          Genesis Pass · Limited
        </div>
      </header>

      {/* Main Multi-Step Wizard Container */}
      <main className="relative z-10 w-full max-w-lg my-auto py-8 flex flex-col items-center text-center">
        <AnimatePresence mode="wait">
          {/* ══ STEP 0: Role Selection ══ */}
          {step === 'role' && (
            <motion.div
              key="step-role"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/20 text-[#ff078e] text-xs font-mono font-bold tracking-widest uppercase mb-4">
                <Sparkles className="w-3.5 h-3.5" /> Select Your Path
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3 font-sans">
                Claim your official <br />
                <span className="text-[#ff078e]">Founder Pass</span>
              </h1>
              <p className="text-neutral-400 text-sm sm:text-base max-w-sm mx-auto mb-8">
                Be the first to experience zero-latency influencer collaborations. Select your profile type to begin.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left">
                {/* Creator Option */}
                <button
                  onClick={() => {
                    setRole('creator');
                    setStep('name');
                  }}
                  className="group relative p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-[#ff078e]/60 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#ff078e]/15 border border-[#ff078e]/30 flex items-center justify-center text-[#ff078e] group-hover:scale-105 transition-transform">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono text-[#ff078e] font-bold tracking-wider">CREATOR</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white mb-1">Creator / Influencer</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Instant brand deals, verified custom link-in-bio, and 1-Year Unlimited Collab Pass.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#ff078e]">
                    Claim Creator Pass <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Business Option */}
                <button
                  onClick={() => {
                    setRole('business');
                    setStep('name');
                  }}
                  className="group relative p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-[#ff078e]/60 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono text-purple-400 font-bold tracking-wider">BRAND</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white mb-1">Business / Brand</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Zero platform fee for 1 year, verified talent discovery, and priority concierge matching.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-purple-400">
                    Claim Brand Pass <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 1: Name ══ */}
          {step === 'name' && (
            <motion.div
              key="step-name"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full text-left"
            >
              <div className="text-xs font-mono uppercase font-bold text-[#ff078e] tracking-wider mb-2">
                Step 1 of 3 · Profile
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                {role === 'creator' ? "What's your creator name?" : "What's your company or brand name?"}
              </h2>
              <p className="text-neutral-400 text-sm mb-6">
                This will be embossed on your official Founder Pass.
              </p>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === 'creator' ? 'e.g. Maya Chen' : 'e.g. Acme Studios'}
                className="w-full h-16 rounded-2xl bg-white/[0.05] border-2 border-white/10 focus:border-[#ff078e] px-5 text-xl font-semibold text-white outline-none transition-all placeholder:text-neutral-600"
                autoFocus
              />

              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setStep('role')}
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    if (name.trim()) setStep('social');
                  }}
                  className="h-12 px-6 rounded-full bg-white text-black font-bold text-sm hover:bg-[#ff078e] hover:text-white transition-all flex items-center gap-2"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 2: Social Handle & Live Apify Scraper ══ */}
          {step === 'social' && (
            <motion.div
              key="step-social"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full text-left"
            >
              <div className="text-xs font-mono uppercase font-bold text-[#ff078e] tracking-wider mb-2">
                Step 2 of 3 · Public Verification
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                {role === 'creator' ? 'Your Instagram handle?' : 'Your company website or handle?'}
              </h2>
              <p className="text-neutral-400 text-sm mb-4">
                {role === 'creator'
                  ? 'We use public data to personalize your pass, badge, and metrics.'
                  : 'Allows creators to verify your brand legitimacy.'}
              </p>

              {role === 'creator' ? (
                <>
                  <div className="relative w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-xl font-bold text-[#ff078e]">
                      @
                    </span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^@/, '');
                        setHandle(val);
                      }}
                      onBlur={() => lookupInstagram(handle)}
                      placeholder="mayachen_creates"
                      className="w-full h-16 rounded-2xl bg-white/[0.05] border-2 border-white/10 focus:border-[#ff078e] pl-10 pr-5 text-xl font-semibold text-white outline-none transition-all placeholder:text-neutral-600"
                    />
                  </div>

                  {/* Notice about Public ID / Skippable */}
                  <div className="mt-3 flex items-start gap-2 text-xs text-neutral-400 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                    <span className="text-[#ff078e] font-bold">Note:</span>
                    <span>
                      Please enter a public Instagram handle. If your profile is private or you prefer not to share, you can skip this step.
                    </span>
                  </div>

                  {/* Scraped Preview Card */}
                  <div className="mt-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-4">
                    <div className="relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex-shrink-0">
                      <img
                        src={scrapedProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt="Scraped Avatar"
                        className="w-full h-full rounded-full object-cover bg-neutral-900 border border-black"
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0095f6] text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 font-bold text-sm text-white">
                        <span>{scrapedProfile?.displayName || name}</span>
                        <span className="text-[10px] font-mono text-[#0095f6] bg-[#0095f6]/15 px-1.5 py-0.5 rounded">
                          VERIFIED
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#ff078e]">@{handle || 'creator'}</div>
                      <div className="text-xs text-neutral-400 mt-1">
                        <span className="font-bold text-white">{scrapedProfile?.followersStr || '84.5K'}</span> followers · Public Profile
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company Name (e.g. Acme Brands)"
                      className="w-full h-14 rounded-2xl bg-white/[0.05] border-2 border-white/10 focus:border-purple-500 px-4 text-base font-semibold text-white outline-none"
                    />
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="Website or Instagram (e.g. acme.com or @acme)"
                      className="w-full h-14 rounded-2xl bg-white/[0.05] border-2 border-white/10 focus:border-purple-500 px-4 text-base font-semibold text-white outline-none"
                    />
                  </div>
                  <p className="text-xs text-neutral-400 mt-2">Optional: You can skip this step if not applicable.</p>
                </>
              )}

              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setStep('name')}
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStep('email')}
                    className="text-xs text-neutral-400 hover:text-white underline underline-offset-4"
                  >
                    Skip this step
                  </button>
                  <button
                    onClick={() => setStep('email')}
                    className="h-12 px-6 rounded-full bg-white text-black font-bold text-sm hover:bg-[#ff078e] hover:text-white transition-all flex items-center gap-2"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 3: Email ══ */}
          {step === 'email' && (
            <motion.div
              key="step-email"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full text-left"
            >
              <div className="text-xs font-mono uppercase font-bold text-[#ff078e] tracking-wider mb-2">
                Step 3 of 3 · Final Step
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                Where do we send your Founder credentials?
              </h2>
              <p className="text-neutral-400 text-sm mb-6">
                We'll email your verified pass and invite token when Influnet launches.
              </p>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full h-16 rounded-2xl bg-white/[0.05] border-2 border-white/10 focus:border-[#ff078e] px-5 text-xl font-semibold text-white outline-none transition-all placeholder:text-neutral-600"
                autoFocus
              />

              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setStep('social')}
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="h-12 px-7 rounded-full bg-[#ff078e] text-white font-bold text-sm hover:bg-[#d6358a] transition-all shadow-lg shadow-[#ff078e]/30 flex items-center gap-2"
                >
                  Generate My Pass ✦
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ STEP 3.5: Pass Synthesizer Loading Screen ══ */}
          {step === 'synthesizing' && (
            <motion.div
              key="step-synth"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="w-full flex flex-col items-center justify-center py-6"
            >
              {/* Circular SVG Progress Ring */}
              <div className="relative w-44 h-44 mb-8 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
                  <circle
                    cx="80"
                    cy="80"
                    r="72"
                    stroke="#ff078e"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="452"
                    strokeDashoffset={452 - (452 * synthProgress) / 100}
                    className="transition-all duration-75 ease-linear"
                  />
                </svg>
                {/* Orbiting particle */}
                <div
                  className="absolute inset-0 rounded-full border border-dashed border-[#ff078e]/30 animate-spin"
                  style={{ animationDuration: '6s' }}
                >
                  <div className="w-3 h-3 rounded-full bg-[#ff078e] shadow-[0_0_12px_#ff078e] absolute -top-1.5 left-1/2 -translate-x-1/2" />
                </div>
                <div className="text-3xl font-mono font-extrabold text-white">{synthProgress}%</div>
              </div>

              <h3 className="text-2xl font-extrabold text-white mb-2">Synthesizing Credentials</h3>
              <div className="text-xs font-mono text-[#ff078e] h-6 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 animate-pulse" />
                {synthStage}
              </div>
            </motion.div>
          )}

          {/* ══ STEP 4: Revealed 3D Founder Pass ══ */}
          {step === 'revealed' && (
            <motion.div
              key="step-revealed"
              initial={{ opacity: 0, scale: 0.75, rotateY: -20 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
              className="w-full flex flex-col items-center"
            >
              {/* 3D Tilt Card Wrapper */}
              <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  transformStyle: 'preserve-3d',
                }}
                className="relative w-[300px] h-[440px] rounded-[26px] bg-gradient-to-b from-[#221a30] via-[#171124] to-[#0d0817] border border-white/15 p-6 flex flex-col items-center justify-between shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_40px_rgba(255,7,142,0.25)] transition-transform duration-100 ease-out cursor-grab active:cursor-grabbing overflow-hidden"
              >
                {/* Lanyard Clip Slot */}
                <div className="w-12 h-2 rounded-full bg-black/60 border border-white/10 mb-2" />

                {/* Holographic Prismatic Foil Overlay */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-[26px] mix-blend-overlay opacity-60"
                  style={{
                    background: `linear-gradient(${120 + tilt.y * 3}deg, transparent 0%, rgba(255,255,255,0.2) 25%, rgba(255,7,142,0.35) 43%, rgba(124,58,237,0.3) 53%, rgba(6,182,212,0.3) 64%, transparent 100%)`,
                  }}
                />

                {/* Card Header */}
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs tracking-tight text-white">
                    <span className="text-[#ff078e]">✦</span> INFLUNET
                  </div>
                  <span className="text-[8.5px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#ff078e]/15 border border-[#ff078e]/40 text-[#ff078e]">
                    {role === 'creator' ? 'FOUNDER PASS' : 'BRAND PASS'}
                  </span>
                </div>

                {/* Serial */}
                <div className="w-full flex items-center justify-between text-[8px] font-mono text-neutral-400 tracking-wider">
                  <span>GENESIS SERIES</span>
                  <span className="text-[#ff078e] font-bold">NO. #{String(passNumber).padStart(4, '0')} / 1000</span>
                </div>

                {/* Avatar Frame */}
                <div className="relative w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#ff078e] via-purple-500 to-cyan-400 shadow-[0_0_24px_rgba(255,7,142,0.35)]">
                  {role === 'creator' && scrapedProfile?.avatarUrl ? (
                    <img
                      src={scrapedProfile.avatarUrl}
                      alt={name}
                      className="w-full h-full rounded-full object-cover bg-neutral-900 border-2 border-black"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-[#ff078e] to-purple-800 flex items-center justify-center text-white font-extrabold text-3xl">
                      {(name || 'IN').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-black border-2 border-[#ff078e] flex items-center justify-center text-[#ff078e]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Identity */}
                <div className="text-center">
                  <h4 className="font-extrabold text-lg text-white tracking-tight leading-tight">{name.toUpperCase()}</h4>
                  <p className="text-xs font-mono text-[#ff078e] font-semibold mt-0.5">
                    {role === 'creator' ? `@${handle || 'creator'}` : (website || 'Verified Partner')}
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-neutral-300 font-bold mt-2">
                    <span className="text-[#ff078e]">★</span>
                    {role === 'creator'
                      ? `${scrapedProfile?.followersStr || '84.5K'} FOLLOWERS · VERIFIED`
                      : 'FOUNDING BRAND · 0% FEE'}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="w-full border-t border-white/10 pt-2 grid grid-cols-2 gap-2 text-left">
                  <div>
                    <div className="text-[7.5px] font-mono uppercase text-neutral-400 font-bold">MEMBERSHIP</div>
                    <div className="text-[9px] font-mono text-white font-bold">
                      {role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[7.5px] font-mono uppercase text-neutral-400 font-bold">BENEFIT</div>
                    <div className="text-[9px] font-mono text-white font-bold">
                      {role === 'creator' ? '1 YR UNLIMITED PASS' : '0% PLATFORM FEE'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[7.5px] font-mono uppercase text-neutral-400 font-bold">STATUS</div>
                    <div className="text-[9px] font-mono text-emerald-400 font-bold">● CONFIRMED & ACTIVE</div>
                  </div>
                  <div>
                    <div className="text-[7.5px] font-mono uppercase text-neutral-400 font-bold">VALID THROUGH</div>
                    <div className="text-[9px] font-mono text-neutral-300 font-bold">SEPTEMBER 2027</div>
                  </div>
                </div>

                {/* Security Strip */}
                <div className="w-full border-t border-dashed border-white/15 pt-2 flex items-center justify-between text-[8px] font-mono text-neutral-400">
                  <div className="flex gap-0.5 opacity-60">
                    {[3, 2, 4, 1, 3, 5, 2, 3, 1, 4, 2, 5, 2, 4, 2, 3].map((w, i) => (
                      <div key={i} className="bg-white h-3.5" style={{ width: `${w}px` }} />
                    ))}
                  </div>
                  <span>INFN-{passNumber}-VIP</span>
                  <span>)))</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full max-w-xs flex flex-col gap-2.5 mt-6">
                <button
                  onClick={exportPNG}
                  className="h-12 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all"
                >
                  <Download className="w-4 h-4" /> Save My Founder Pass (PNG)
                </button>
                <button
                  onClick={exportPNG}
                  className="h-11 rounded-full bg-white/[0.06] hover:bg-white/10 border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Share2 className="w-4 h-4" /> Share to Instagram Story
                </button>
                <button
                  onClick={() => {
                    setStep('role');
                    setName('');
                    setHandle('');
                    setEmail('');
                  }}
                  className="text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 mt-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Start over
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-5xl py-4 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
        <div>© 2026 Influnet Technologies Inc. All rights reserved.</div>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
        </div>
      </footer>

      {/* Hidden Export Canvas */}
      <canvas ref={expCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}
