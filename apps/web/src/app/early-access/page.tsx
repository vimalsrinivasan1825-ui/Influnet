'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import confetti from 'canvas-confetti';

interface ScrapedProfile {
  displayName: string;
  avatarUrl: string | null;
  followerCount: number | null;
  followersStr: string;
  postsStr: string;
  biography: string;
  isVerified: boolean;
  isPrivate: boolean;
}

// Client-side mock registry removed — all handles route through the live
// /api/auth/social-preview verification API with instant caching and race condition protection.

export default function EarlyAccessPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [role, setRole] = useState<'creator' | 'business'>('creator');
  const [screen, setScreen] = useState<'s0' | 's1' | 's2' | 's3' | 'sLoading' | 's4'>('s0');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Form State — empty by default, no mock data
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  // Form Field Validation Errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Multi-Format Social Media Export ('story' | 'linkedin' | 'square')
  const [exportFormat, setExportFormat] = useState<'story' | 'linkedin' | 'square'>('story');

  // Scraper & Live Verification State
  const [scraping, setScraping] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'scanning' | 'verified_public' | 'verified_private' | 'not_found' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [scrapedProfile, setScrapedProfile] = useState<ScrapedProfile | null>(null);
  const [isAccountPrivate, setIsAccountPrivate] = useState(false);
  const [isAccountVerified, setIsAccountVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Synthesizer State
  const [synthProgress, setSynthProgress] = useState(0);
  const [synthStepLabel, setSynthStepLabel] = useState('Connecting to Influnet network...');
  const [passNumber, setPassNumber] = useState(89);
  const [shakeField, setShakeField] = useState<string | null>(null);

  // 3D Card State
  const [cardRotate, setCardRotate] = useState({ x: 0, y: 0 });
  const [foilAngle, setFoilAngle] = useState(130);
  const [foilOpacity, setFoilOpacity] = useState(0.7);
  const [bloomActive, setBloomActive] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const passContainerRef = useRef<HTMLDivElement>(null);
  const expCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const requestIdRef = useRef(0);

  // Preload actual Influnet logo for instant, synchronous Canvas & 3D card rendering
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = '/influet_logo.png';
      img.onload = () => {
        logoImgRef.current = img;
      };
    }
  }, []);
  const cacheRef = useRef<
    Map<
      string,
      {
        status: 'verified_public' | 'verified_private' | 'not_found';
        profile: ScrapedProfile | null;
        isPrivate: boolean;
        isVerified: boolean;
        message: string;
        error: string | null;
      }
    >
  >(new Map());

  // Web Audio Harmonic Feedback Synthesizer
  const playAudioCue = useCallback((type: 'click' | 'success' | 'complete' | 'error') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(640, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'success') {
        // High-clarity Apple-style double chime (F5 -> C6)
        [698.46, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.1, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.22);
        });
      } else if (type === 'complete') {
        // Celebratory 4-note ascending chord for pass reveal
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.5);
        });
      } else if (type === 'error') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  }, [soundEnabled]);

  // Trigger shake animation on invalid inputs
  const triggerShake = (field: string) => {
    setShakeField(field);
    setTimeout(() => setShakeField(null), 600);
  };

  // Perform Live Instagram Identity Verification via /api/auth/social-preview
  const performScrape = useCallback(
    async (rawHandle: string, autoAdvance = false): Promise<boolean> => {
      const clean = rawHandle.replace(/^@+/, '').trim().toLowerCase();
      if (!clean || clean.length < 2) {
        setVerificationStatus('idle');
        setStatusMessage('');
        setScrapedProfile(null);
        setIsAccountVerified(false);
        setIsAccountPrivate(false);
        setVerificationError(null);
        return false;
      }

      // Check cache first for immediate zero-latency feedback
      const cached = cacheRef.current.get(clean);
      if (cached) {
        setScrapedProfile(cached.profile);
        setIsAccountPrivate(cached.isPrivate);
        setIsAccountVerified(cached.isVerified);
        setVerificationStatus(cached.status);
        setStatusMessage(cached.message);
        setVerificationError(cached.error);
        if (cached.isVerified) {
          playAudioCue('success');
          if (autoAdvance) {
            playAudioCue('click');
            setScreen('s3');
          }
          return true;
        } else {
          playAudioCue('error');
          return false;
        }
      }

      const currentReqId = ++requestIdRef.current;
      setScraping(true);
      setVerificationStatus('scanning');
      setStatusMessage(`Verifying @${clean} on Instagram...`);
      setVerificationError(null);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 32000);

        const res = await fetch(
          `/api/auth/social-preview?platform=instagram&handle=${encodeURIComponent(clean)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const data = await res.json().catch(() => null);

        // Discard stale responses if user typed or initiated a newer request
        if (currentReqId !== requestIdRef.current) {
          return false;
        }

        if (res.ok && data?.status === 'found' && data?.profile) {
          // Public Instagram Profile found
          const p = data.profile;
          const count = p.followerCount;
          const formattedFollowers =
            count != null
              ? count >= 1_000_000
                ? `${(count / 1_000_000).toFixed(1)}M`
                : count >= 1_000
                ? `${(count / 1_000).toFixed(1)}K`
                : `${count}`
              : 'Verified';

          const profileObj: ScrapedProfile = {
            displayName: p.displayName || clean,
            avatarUrl: p.avatarUrl || null,
            followerCount: p.followerCount || null,
            followersStr: formattedFollowers,
            postsStr: p.postsCount != null ? String(p.postsCount) : '—',
            biography: p.biography || '',
            isVerified: Boolean(p.isVerified),
            isPrivate: false,
          };

          setScrapedProfile(profileObj);
          setIsAccountPrivate(false);
          setIsAccountVerified(true);
          setVerificationStatus('verified_public');
          setStatusMessage('✓ Verified Public Creator Profile');
          cacheRef.current.set(clean, {
            status: 'verified_public',
            profile: profileObj,
            isPrivate: false,
            isVerified: true,
            message: '✓ Verified Public Creator Profile',
            error: null,
          });
          playAudioCue('success');
          if (autoAdvance) {
            playAudioCue('click');
            setScreen('s3');
          }
          return true;
        } else if (res.ok && (data?.status === 'private' || data?.isPrivate)) {
          // Private Instagram Account: identity confirmed, zero mock metrics/media
          setScrapedProfile(null);
          setIsAccountPrivate(true);
          setIsAccountVerified(true);
          setVerificationStatus('verified_private');
          setStatusMessage('✓ Private Instagram Account Verified');
          cacheRef.current.set(clean, {
            status: 'verified_private',
            profile: null,
            isPrivate: true,
            isVerified: true,
            message: '✓ Private Instagram Account Verified',
            error: null,
          });
          playAudioCue('success');
          if (autoAdvance) {
            playAudioCue('click');
            setScreen('s3');
          }
          return true;
        } else if (res.status === 404 || data?.status === 'notfound') {
          // Handle does not exist on Instagram
          setScrapedProfile(null);
          setIsAccountPrivate(false);
          setIsAccountVerified(false);
          setVerificationStatus('not_found');
          setStatusMessage(`✕ Profile @${clean} not found`);
          const err = `Account @${clean} was not found on Instagram. Please check your username.`;
          setVerificationError(err);
          cacheRef.current.set(clean, {
            status: 'not_found',
            profile: null,
            isPrivate: false,
            isVerified: false,
            message: `✕ Profile @${clean} not found`,
            error: err,
          });
          playAudioCue('error');
          return false;
        } else {
          // Lookup issue or timeout
          setScrapedProfile(null);
          setIsAccountPrivate(false);
          setIsAccountVerified(false);
          setVerificationStatus('error');
          const msg = data?.message || 'Verification could not be completed. Please try again.';
          setStatusMessage(msg);
          setVerificationError(msg);
          playAudioCue('error');
          return false;
        }
      } catch {
        if (currentReqId !== requestIdRef.current) return false;
        setScrapedProfile(null);
        setIsAccountPrivate(false);
        setIsAccountVerified(false);
        setVerificationStatus('error');
        setStatusMessage('Connection timed out');
        setVerificationError('Verification timed out. Please check your network and retry.');
        playAudioCue('error');
        return false;
      } finally {
        if (currentReqId === requestIdRef.current) {
          setScraping(false);
        }
      }
    },
    [playAudioCue]
  );

  // Controlled Instagram Input listener (no debounced keystroke scraping)
  const handleHandleChange = (val: string) => {
    const clean = val.replace(/^@+/, '');
    setHandle(clean);
    // Invalidate any active background lookup
    requestIdRef.current++;
    // Reset status cleanly so user types without glitching
    setVerificationStatus('idle');
    setStatusMessage('');
    setScrapedProfile(null);
    setIsAccountVerified(false);
    setIsAccountPrivate(false);
    setVerificationError(null);
  };

  // Controlled Email & Phone Input Handlers with error clearing
  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailError) setEmailError(null);
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (phoneError) setPhoneError(null);
  };

  const validateEmail = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return 'Work or personal email is required';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      return 'Please enter a valid email address (e.g. you@domain.com)';
    }
    return null;
  };

  const validatePhone = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return null; // phone is optional
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return 'Please enter a valid phone number with 7–15 digits';
    }
    if (!/^\+?[0-9\s\-().]{7,25}$/.test(trimmed)) {
      return 'Phone number contains invalid characters';
    }
    return null;
  };

  // Keyboard navigation (Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (screen === 's1') handleNext1();
      else if (screen === 's2') handleNext2();
      else if (screen === 's3') handleNext3();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, name, handle, email, phone, role, isAccountVerified, scraping, emailError, phoneError]);

  const handleNext1 = () => {
    if (!name.trim()) {
      triggerShake('name');
      playAudioCue('error');
      return;
    }
    if (role === 'business' && !company.trim()) {
      setCompany(name.trim());
    }
    playAudioCue('click');
    setScreen('s2');
  };

  const handleNext2 = async (skip = false) => {
    if (skip) {
      playAudioCue('click');
      setScreen('s3');
      return;
    }

    if (role === 'creator') {
      const clean = handle.replace(/^@+/, '').trim();
      // Handle is strictly optional — empty handle moves forward smoothly
      if (!clean) {
        playAudioCue('click');
        setScreen('s3');
        return;
      }
      if (scraping) {
        // Already scanning
        return;
      }
      if (!isAccountVerified) {
        // Seamlessly trigger verification and auto-advance on success
        const ok = await performScrape(clean, true);
        if (!ok) {
          triggerShake('handle');
        }
        return;
      }
    } else {
      // For businesses, website and Instagram handle are both optional
      playAudioCue('click');
      setScreen('s3');
      return;
    }
    playAudioCue('click');
    setScreen('s3');
  };

  const handleNext3 = async () => {
    const eErr = validateEmail(email);
    if (eErr) {
      setEmailError(eErr);
      triggerShake('email');
      playAudioCue('error');
      return;
    }
    setEmailError(null);

    const pErr = validatePhone(phone);
    if (pErr) {
      setPhoneError(pErr);
      triggerShake('phone');
      playAudioCue('error');
      return;
    }
    setPhoneError(null);

    playAudioCue('click');
    startSynthesizer();
  };

  // Synthesizer Sequence (Screen 3.5 -> 4)
  const startSynthesizer = async () => {
    setScreen('sLoading');
    setSynthProgress(0);

    const cleanHandle = handle.replace(/^@+/, '').trim();
    const cleanPhone = phone.trim();
    const cleanWebsite = website.trim();

    // Call backend API in parallel
    const apiPromise = fetch('/api/early-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: role,
        name: name.trim(),
        email: email.trim(),
        phone: cleanPhone || null,
        handle: cleanHandle || null,
        website: role === 'business' ? (cleanWebsite || null) : null,
        company: role === 'business' ? (company.trim() || name.trim()) : null,
        followers: role === 'creator' && cleanHandle ? (scrapedProfile?.followersStr ?? (isAccountPrivate ? 'PRIVATE' : null)) : null,
        avatarUrl: role === 'creator' ? (scrapedProfile?.avatarUrl ?? null) : null,
        bio: role === 'creator' ? (scrapedProfile?.biography ?? (isAccountPrivate ? 'Private Creator Profile' : null)) : null,
      }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (d?.pass?.pass_number) {
          setPassNumber(d.pass.pass_number);
        }
      })
      .catch(() => {});

    // Animated multi-step progress forge
    const steps = [
      { p: 25, label: `❖ Verifying ${role === 'creator' ? 'creator' : 'brand'} identity credentials...`, ms: 500 },
      {
        p: 58,
        label: cleanHandle
          ? isAccountPrivate
            ? `❖ Enrolling verified private account @${cleanHandle}...`
            : `❖ Validating @${cleanHandle} on Instagram...`
          : `❖ Enrolling Founding ${role === 'creator' ? 'Creator' : 'Brand'} ${name.trim()}...`,
        ms: 600,
      },
      { p: 85, label: '❖ Minting Founding Member Token on Genesis Series...', ms: 550 },
      { p: 100, label: '❖ Applying holographic foil & cryptographic seal...', ms: 450 },
    ];

    for (const step of steps) {
      setSynthStepLabel(step.label);
      setSynthProgress(step.p);
      await new Promise((r) => setTimeout(r, step.ms));
    }

    await apiPromise;
    await new Promise((r) => setTimeout(r, 200));

    // Reveal Screen 4 with Bloom and Confetti
    setBloomActive(true);
    setTimeout(() => setBloomActive(false), 400);

    setScreen('s4');
    playAudioCue('complete');

    // Confetti celebration
    try {
      confetti({
        particleCount: 90,
        spread: 68,
        origin: { y: 0.62 },
        colors: ['#ff078e', '#ffffff', '#7c3aed', '#06b6d4'],
      });
    } catch {}
  };

  // 3D Card Mouse Tilt Tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!passContainerRef.current) return;
    const rect = passContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rx = (y / (rect.height / 2)) * -14;
    const ry = (x / (rect.width / 2)) * 16;
    setCardRotate({ x: rx, y: ry });

    const angle = 120 + ((e.clientX - rect.left) / rect.width) * 60;
    setFoilAngle(angle);
    setFoilOpacity(0.92);
  };

  const handleMouseLeave = () => {
    setCardRotate({ x: 0, y: 0 });
    setFoilOpacity(0.65);
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Draw Actual Influnet Logo from Image Artwork on Canvas
  const drawActualLogo = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | null,
    cx: number,
    cy: number,
    size: number,
    rot = 0,
    alpha = 1
  ) => {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (rot !== 0) {
      ctx.rotate(rot);
    }
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  };

  // Reusable Scalable VIP Pass Card Drawer on Canvas
  const drawPassCard = (
    ctx: CanvasRenderingContext2D,
    cX: number,
    cY: number,
    cW: number,
    cH: number,
    isDark: boolean,
    logoImg: HTMLImageElement | null
  ) => {
    const k = cW / 800; // scaling factor relative to 800px base card
    const textCol = isDark ? '#f0ecf8' : '#17141d';

    ctx.save();
    // Card Shadow
    ctx.shadowColor = isDark ? 'rgba(0,0,0,0.85)' : 'rgba(23,20,29,0.22)';
    ctx.shadowBlur = 60 * k;
    ctx.shadowOffsetY = 24 * k;

    // Card Background Gradient
    const cg = ctx.createLinearGradient(cX, cY, cX + cW, cY + cH);
    if (isDark) {
      cg.addColorStop(0, '#221a30');
      cg.addColorStop(0.5, '#171124');
      cg.addColorStop(1, '#0d0817');
    } else {
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.5, '#faf8f5');
      cg.addColorStop(1, '#f0ebdf');
    }
    ctx.fillStyle = cg;
    drawRoundedRect(ctx, cX, cY, cW, cH, 48 * k);
    ctx.fill();

    // Card Border
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(215,208,197,0.85)';
    ctx.lineWidth = Math.max(1.5, 3 * k);
    ctx.stroke();
    ctx.restore();

    // Subtle internal rotating actual logo watermark
    drawActualLogo(ctx, logoImg, cX + cW / 2, cY + cH * 0.44, 440 * k, 0.35, isDark ? 0.08 : 0.06);

    // Lanyard Slot
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)';
    drawRoundedRect(ctx, cX + cW / 2 - 45 * k, cY + 22 * k, 90 * k, 14 * k, 7 * k);
    ctx.fill();

    // Header: Actual Logo Mark + INFLUNET
    drawActualLogo(ctx, logoImg, cX + 68 * k, cY + 88 * k, 36 * k, 0, 1);
    ctx.fillStyle = textCol;
    ctx.font = `800 ${Math.round(26 * k)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('INFLUNET', cX + 94 * k, cY + 95 * k);

    // Header: FOUNDER PASS Pill
    ctx.fillStyle = '#ff078e';
    ctx.font = `700 ${Math.round(15 * k)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND', cX + cW - 55 * k, cY + 92 * k);

    // Serial Row
    ctx.fillStyle = isDark ? '#736b7e' : '#8b8693';
    ctx.font = `600 ${Math.round(14 * k)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('GENESIS SERIES', cX + 55 * k, cY + 128 * k);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff078e';
    ctx.fillText(`NO. #${String(passNumber).padStart(4, '0')} / 1000`, cX + cW - 55 * k, cY + 128 * k);

    // Avatar Monogram
    const ax = cX + cW / 2;
    const ay = cY + 310 * k;
    const ar = 100 * k;

    // Neon Avatar Ring
    ctx.strokeStyle = '#ff078e';
    ctx.lineWidth = Math.max(3, 7 * k);
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 8 * k, 0, Math.PI * 2);
    ctx.stroke();

    const ag = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
    ag.addColorStop(0, '#ff078e');
    ag.addColorStop(1, '#c8307f');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();

    const initials = (name || handle || 'VIP')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(70 * k)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(initials, ax, ay + 24 * k);

    // Star badge on avatar
    const starX = ax + ar * 0.68;
    const starY = ay + ar * 0.68;
    ctx.fillStyle = isDark ? '#0d0a12' : '#ffffff';
    ctx.beginPath();
    ctx.arc(starX, starY, 18 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff078e';
    ctx.font = `900 ${Math.round(18 * k)}px sans-serif`;
    ctx.fillText('★', starX, starY + 6 * k);

    // Name & Handle
    ctx.fillStyle = textCol;
    ctx.font = `800 ${Math.round(44 * k)}px sans-serif`;
    ctx.textAlign = 'center';
    const displayName = (name || (role === 'creator' ? handle : company) || 'CREATOR').toUpperCase();
    ctx.fillText(displayName, ax, cY + 490 * k);

    ctx.fillStyle = '#ff078e';
    ctx.font = `700 ${Math.round(23 * k)}px monospace`;
    const cleanH = handle.replace(/^@+/, '').trim();
    const handleLine = cleanH
      ? `@${cleanH}`
      : role === 'creator'
      ? '★ FOUNDING CREATOR'
      : (company || name || '★ FOUNDING BRAND');
    ctx.fillText(handleLine, ax, cY + 532 * k);

    // Followers / Status Badge Pill
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : '#ede8df';
    const pillW = Math.min(cW - 100 * k, 430 * k);
    drawRoundedRect(ctx, ax - pillW / 2, cY + 565 * k, pillW, 46 * k, 23 * k);
    ctx.fill();
    ctx.fillStyle = textCol;
    ctx.font = `700 ${Math.round(15 * k)}px monospace`;
    ctx.fillText(
      role === 'creator'
        ? isAccountPrivate
          ? '★ PRIVATE CREATOR · VERIFIED'
          : scrapedProfile?.followersStr
          ? `★ ${scrapedProfile.followersStr} FOLLOWERS · VERIFIED`
          : '★ VIP CREATOR · VERIFIED'
        : '★ 0% PLATFORM FEE · VIP BRAND',
      ax,
      cY + 594 * k
    );

    // Meta Grid Divider Line
    const fy = cY + cH - 230 * k;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(215,208,197,0.8)';
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.beginPath();
    ctx.moveTo(cX + 50 * k, fy);
    ctx.lineTo(cX + cW - 50 * k, fy);
    ctx.stroke();

    // Meta Grid Details
    ctx.fillStyle = isDark ? '#736b7e' : '#8b8693';
    ctx.font = `700 ${Math.round(13.5 * k)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('MEMBERSHIP', cX + 60 * k, fy + 38 * k);
    ctx.fillText('PASS BENEFIT', cX + 60 * k, fy + 78 * k);
    ctx.fillText('STATUS', cX + 60 * k, fy + 118 * k);

    ctx.textAlign = 'right';
    ctx.fillStyle = textCol;
    ctx.fillText(role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND', cX + cW - 60 * k, fy + 38 * k);
    ctx.fillText(role === 'creator' ? '1 YR UNLIMITED PASS' : '0% FEE CONCIERGE', cX + cW - 60 * k, fy + 78 * k);
    ctx.fillStyle = '#059669';
    ctx.fillText('● CONFIRMED & ACTIVE', cX + cW - 60 * k, fy + 118 * k);

    // Barcode Strip
    const by = cY + cH - 60 * k;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(cX + 50 * k, by - 12 * k);
    ctx.lineTo(cX + cW - 50 * k, by - 12 * k);
    ctx.stroke();

    // Serial & Security Code
    ctx.fillStyle = isDark ? '#736b7e' : '#8b8693';
    ctx.font = `600 ${Math.round(12 * k)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`INFN-${passNumber}-VIP · ENCRYPTED PASS`, cX + 60 * k, by + 12 * k);
    ctx.textAlign = 'right';
    ctx.fillText('VALID THRU 2027', cX + cW - 60 * k, by + 12 * k);
  };

  const getOrLoadLogo = async (): Promise<HTMLImageElement | null> => {
    if (logoImgRef.current && logoImgRef.current.complete && logoImgRef.current.naturalWidth > 0) {
      return logoImgRef.current;
    }
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        logoImgRef.current = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = '/influet_logo.png';
    });
  };

  // Multi-Ratio Social Exporter: Instagram Story (9:16), LinkedIn (16:9), Square (1:1)
  const exportPassPNG = async (targetFormat?: 'story' | 'linkedin' | 'square') => {
    const c = expCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const logoImg = await getOrLoadLogo();
    const fmt = targetFormat || exportFormat || 'story';
    const isDark = theme === 'dark';

    let W = 1080;
    let H = 1920;

    if (fmt === 'story') {
      W = 1080;
      H = 1920;
    } else if (fmt === 'linkedin') {
      W = 1200;
      H = 675;
    } else {
      W = 1080;
      H = 1080;
    }

    c.width = W;
    c.height = H;

    // Background Gradient Wallpaper
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    if (isDark) {
      bgGrad.addColorStop(0, '#0a0710');
      bgGrad.addColorStop(0.5, '#120d1c');
      bgGrad.addColorStop(1, '#07050b');
    } else {
      bgGrad.addColorStop(0, '#fbfaf8');
      bgGrad.addColorStop(0.5, '#f6f3ed');
      bgGrad.addColorStop(1, '#ece6dc');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ambient Radial Glow
    const grd = ctx.createRadialGradient(
      fmt === 'linkedin' ? W * 0.72 : W / 2,
      fmt === 'linkedin' ? H / 2 : H * 0.44,
      40,
      fmt === 'linkedin' ? W * 0.72 : W / 2,
      fmt === 'linkedin' ? H / 2 : H * 0.44,
      fmt === 'linkedin' ? 500 : 620
    );
    grd.addColorStop(0, 'rgba(255,7,142,0.3)');
    grd.addColorStop(0.6, 'rgba(124,58,237,0.12)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    if (fmt === 'story') {
      // ═══════════════════════════════════════════════════
      // 1. INSTAGRAM STORY (9:16 — 1080 x 1920)
      // ═══════════════════════════════════════════════════

      // Ambient Rotating Actual Logo Watermark in Background
      drawActualLogo(ctx, logoImg, W / 2, H * 0.46, 880, -0.32, isDark ? 0.12 : 0.08);

      // Top Safe Margin Header (Above Card)
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff078e';
      ctx.font = '800 16px monospace';
      ctx.fillText('★ INFLUNET VIP EARLY ACCESS PASS ★', W / 2, 210);

      ctx.fillStyle = isDark ? '#f0ecf8' : '#17141d';
      ctx.font = '800 36px sans-serif';
      ctx.fillText('OFFICIAL FOUNDING MEMBER', W / 2, 255);

      // Suspended 3D-styled Luxury Card
      const cW = 820;
      const cH = 1200;
      const cX = (W - cW) / 2;
      const cY = 295;
      drawPassCard(ctx, cX, cY, cW, cH, isDark, logoImg);

      // Bottom Safe Margin Footer (Below Card)
      ctx.fillStyle = '#ff078e';
      ctx.font = '700 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DM TO COLLABORATE WITH CREATOR', W / 2, 1600);

      // Call to action pill
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : '#ede8df';
      drawRoundedRect(ctx, W / 2 - 240, 1630, 480, 56, 28);
      ctx.fill();
      ctx.strokeStyle = '#ff078e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = isDark ? '#ffffff' : '#17141d';
      ctx.font = '700 19px sans-serif';
      ctx.fillText('🔗 influnet.com · Soft-Launch 2026', W / 2, 1665);

      // Bottom Actual Watermark Mark
      drawActualLogo(ctx, logoImg, W / 2, 1750, 64, 0, 0.9);
    } else if (fmt === 'linkedin') {
      // ═══════════════════════════════════════════════════
      // 2. LINKEDIN POST / BANNER (16:9 — 1200 x 675)
      // ═══════════════════════════════════════════════════

      // Watermark in Background with actual logo
      drawActualLogo(ctx, logoImg, 940, 337, 600, 0.22, isDark ? 0.12 : 0.08);
      drawActualLogo(ctx, logoImg, 110, 110, 340, -0.4, isDark ? 0.06 : 0.04);

      // Left Column — Rich Typography & VIP Perks
      const textCol = isDark ? '#f0ecf8' : '#17141d';
      ctx.textAlign = 'left';

      // Header actual logo
      drawActualLogo(ctx, logoImg, 95, 75, 42, 0, 1);
      ctx.fillStyle = textCol;
      ctx.font = '800 28px sans-serif';
      ctx.fillText('INFLUNET', 122, 84);

      // Genesis series badge
      ctx.fillStyle = '#ff078e';
      ctx.font = '700 13px monospace';
      ctx.fillText('GENESIS SERIES · VIP INVITATION', 80, 126);

      // Main Role Title
      ctx.fillStyle = textCol;
      ctx.font = '900 44px sans-serif';
      ctx.fillText(role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND', 80, 180);

      // Creator / Brand Name
      ctx.fillStyle = '#ff078e';
      ctx.font = '800 26px sans-serif';
      const cleanH = handle.replace(/^@+/, '').trim();
      ctx.fillText((name || (cleanH ? `@${cleanH}` : 'CREATOR')).toUpperCase(), 80, 222);

      if (cleanH) {
        ctx.fillStyle = isDark ? '#a19bae' : '#6b6675';
        ctx.font = '600 17px monospace';
        ctx.fillText(`@${cleanH}`, 80, 252);
      }

      // VIP Perks List
      const perks = role === 'creator'
        ? [
            '✓  0% Platform Commission on Collaborations',
            '✓  Direct Instant Pitch Notifications via App & SMS',
            '✓  Verified Creator Badge & Priority Brand Discovery',
            '✓  VIP Concierge Launch Access Guaranteed',
          ]
        : [
            '✓  Direct Access to Vetted High-Engagement Creators',
            '✓  0% Platform Surcharge during Launch Period',
            '✓  Instant Collaboration Inquiries & Fast Response',
            '✓  VIP Concierge Brand Matching Support',
          ];

      ctx.fillStyle = isDark ? '#d5cfe0' : '#3d3846';
      ctx.font = '600 16px sans-serif';
      perks.forEach((perk, i) => {
        ctx.fillText(perk, 80, 310 + i * 38);
      });

      // Pass verification badge at bottom left
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      drawRoundedRect(ctx, 80, 480, 520, 70, 16);
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ff078e';
      ctx.font = '700 14px monospace';
      ctx.fillText(`PASS NO. #${String(passNumber).padStart(4, '0')} / 1000  ·  ACTIVE & VERIFIED`, 104, 510);
      ctx.fillStyle = isDark ? '#a19bae' : '#6b6675';
      ctx.font = '500 13px sans-serif';
      ctx.fillText('Officially confirmed for the upcoming Influnet launch event at influnet.com', 104, 532);

      // Right Column — Floating Luxury Pass Card
      const cW = 390;
      const cH = 575;
      const cX = 740;
      const cY = 50;
      drawPassCard(ctx, cX, cY, cW, cH, isDark, logoImg);
    } else {
      // ═══════════════════════════════════════════════════
      // 3. SQUARE POST (1:1 — 1080 x 1080)
      // ═══════════════════════════════════════════════════

      // Ambient Rotating Actual Logo Watermark in Background
      drawActualLogo(ctx, logoImg, W / 2, H / 2, 840, 0.28, isDark ? 0.12 : 0.08);

      // Top Small Watermark
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff078e';
      ctx.font = '800 14px monospace';
      ctx.fillText('INFLUNET · GENESIS VIP FOUNDER PASS', W / 2, 42);

      // Centered Luxury Pass Card
      const cW = 720;
      const cH = 960;
      const cX = (W - cW) / 2;
      const cY = 60;
      drawPassCard(ctx, cX, cY, cW, cH, isDark, logoImg);

      // Bottom watermark
      ctx.fillStyle = isDark ? '#736b7e' : '#8b8693';
      ctx.font = '600 12px monospace';
      ctx.fillText('VERIFIED FOUNDING MEMBER  ·  INFLUNET.COM', W / 2, 1052);
    }

    // Trigger File Download
    const cleanHandleSlug = handle.replace(/^@+/, '').trim() || name || 'founder';
    const slug = cleanHandleSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const a = document.createElement('a');
    a.download = `influnet-pass-${fmt}-${slug}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen transition-colors duration-300 relative selection:bg-[#ff078e] selection:text-white ${
        isDark ? 'bg-[#0d0a12] text-[#f0ecf8]' : 'bg-[#fbfaf8] text-[#17141d]'
      }`}
      style={{
        fontFamily: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;800&family=Instrument+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@500;600;700&display=swap');

        .font-headline {
          font-family: 'Bricolage Grotesque', sans-serif;
        }
        .font-mono-code {
          font-family: 'Spline Sans Mono', monospace;
        }

        /* Subtle grid background texture */
        .bg-grid-texture {
          background-image: linear-gradient(to right, rgba(139, 134, 147, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(139, 134, 147, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
        }

        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.22); opacity: 0.28; }
        }
        .animate-pulse-ring {
          animation: pulse-ring 2.8s ease-in-out infinite;
        }

        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-orbit {
          animation: orbit-spin 8s linear infinite;
        }
        .animate-radar {
          animation: orbit-spin 0.7s linear infinite;
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-shift {
          background-size: 300% 300%;
          animation: gradientShift 4s ease infinite;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>

      {/* Grid Pattern & Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid-texture" />
      <div
        className="fixed top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none z-0 rounded-full blur-3xl opacity-60"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(255,7,142,0.14) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(255,7,142,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Screen Bloom Flash Overlay */}
      {bloomActive && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-white/70 animate-pulse duration-300" />
      )}

      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 h-[60px] z-40 px-6 sm:px-10 flex items-center justify-between border-b backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-[#0d0a12]/85 border-white/10'
            : 'bg-[#fbfaf8]/85 border-[#e7e3dc]'
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5 font-headline font-extrabold text-[19px] tracking-tight">
          <Image
            src="/influet_logo.png"
            alt="Influnet"
            width={28}
            height={28}
            className="size-7 object-contain"
            priority
          />
          <span>influnet</span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Role selector on screen 0 */}
          {screen === 's0' && (
            <div className={`p-1 rounded-full flex items-center gap-1 border text-xs font-semibold ${
              isDark ? 'bg-[#15111c] border-white/10' : 'bg-[#f4f2ee] border-[#e7e3dc]'
            }`}>
              <button
                onClick={() => setRole('creator')}
                className={`px-3 py-1 rounded-full transition-all ${
                  role === 'creator'
                    ? 'bg-[#ff078e] text-white shadow-sm'
                    : isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'
                }`}
              >
                Creator Pass
              </button>
              <button
                onClick={() => setRole('business')}
                className={`px-3 py-1 rounded-full transition-all ${
                  role === 'business'
                    ? 'bg-[#ff078e] text-white shadow-sm'
                    : isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'
                }`}
              >
                Brand Pass
              </button>
            </div>
          )}

          {/* Sound Toggle Button */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playAudioCue('click');
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              isDark
                ? 'bg-[#1a1525] border-white/10 text-zinc-300 hover:border-[#ff078e] hover:text-[#ff078e]'
                : 'bg-white border-[#e7e3dc] text-zinc-600 hover:border-[#ff078e] hover:text-[#ff078e]'
            }`}
            aria-label="Toggle Sound"
            title={soundEnabled ? 'Sound is ON' : 'Sound is OFF'}
          >
            {soundEnabled ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              isDark
                ? 'bg-[#1a1525] border-white/10 text-zinc-300 hover:border-[#ff078e] hover:text-[#ff078e]'
                : 'bg-white border-[#e7e3dc] text-zinc-600 hover:border-[#ff078e] hover:text-[#ff078e]'
            }`}
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 min-h-screen flex items-center justify-center px-4 pt-24 pb-16">
        <div className="w-full max-w-[560px] flex flex-col items-center text-center">

          {/* ════════════════════════════════════════════════════
             SCREEN 0 — Intro Hook
          ════════════════════════════════════════════════════ */}
          {screen === 's0' && (
            <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-400">
              {/* Animated Spoke Cluster SVG */}
              <svg className="w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] shrink-0 mb-6" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                <circle cx="100" cy="100" r="65" fill="rgba(255,7,142,0.06)" />
                <line x1="100" y1="100" x2="30" y2="38" stroke="#ff078e" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 5" />
                <line x1="100" y1="100" x2="170" y2="38" stroke="#ff078e" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 5" />
                <line x1="100" y1="100" x2="30" y2="162" stroke="#ff078e" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 5" />
                <line x1="100" y1="100" x2="170" y2="162" stroke="#ff078e" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 5" />
                <line x1="100" y1="100" x2="100" y2="16" stroke="#ff078e" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="4 5" />
                <line x1="100" y1="100" x2="100" y2="184" stroke="#ff078e" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="4 5" />

                <circle cx="30" cy="38" r="18" fill="rgba(255,7,142,0.11)" stroke="#ff078e" strokeOpacity="0.5" strokeWidth="1.5" />
                <text x="30" y="43" textAnchor="middle" fontFamily="Bricolage Grotesque,sans-serif" fontWeight="800" fontSize="13" fill="#ff078e">✦</text>

                <circle cx="170" cy="38" r="18" fill="rgba(255,7,142,0.11)" stroke="#ff078e" strokeOpacity="0.5" strokeWidth="1.5" />
                <text x="170" y="43" textAnchor="middle" fontFamily="Bricolage Grotesque,sans-serif" fontWeight="800" fontSize="13" fill="#ff078e">★</text>

                <circle cx="30" cy="162" r="18" fill="rgba(255,7,142,0.11)" stroke="#ff078e" strokeOpacity="0.5" strokeWidth="1.5" />
                <text x="30" y="167" textAnchor="middle" fontFamily="Bricolage Grotesque,sans-serif" fontWeight="800" fontSize="13" fill="#ff078e">⚡</text>

                <circle cx="170" cy="162" r="18" fill="rgba(255,7,142,0.11)" stroke="#ff078e" strokeOpacity="0.5" strokeWidth="1.5" />
                <text x="170" y="167" textAnchor="middle" fontFamily="Bricolage Grotesque,sans-serif" fontWeight="800" fontSize="13" fill="#ff078e">✓</text>

                <circle cx="100" cy="100" r="28" className="animate-pulse-ring" fill="#ff078e" fillOpacity="0.12" stroke="#ff078e" strokeWidth="1.8" />
                <circle cx="100" cy="100" r="17" fill="rgba(255,7,142,0.18)" stroke="#ff078e" strokeWidth="1.4" />
                <text x="100" y="105" textAnchor="middle" fontFamily="Bricolage Grotesque,sans-serif" fontWeight="800" fontSize="15" fill="#ff078e">✦</text>
              </svg>

              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/25 text-[#c8307f] dark:text-[#ff3aaa] font-mono-code text-[11px] font-bold tracking-wider uppercase mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff078e] animate-ping" />
                {role === 'creator' ? 'Founding Creator Access · Limited Genesis Spots' : 'Founding Brand Access · 0% Platform Fee'}
              </div>

              {/* Headline */}
              <h1 className="font-headline font-extrabold text-[34px] sm:text-[48px] md:text-[54px] tracking-tight leading-[1.05] mb-4">
                Secure your spot.<br />
                Be among the <span className="text-[#ff078e]">first</span><br />
                on Influnet.
              </h1>

              {/* Body */}
              <p className={`text-[16px] leading-[1.65] max-w-[420px] mb-5 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {role === 'creator'
                  ? 'Influnet connects creators with brands the moment they reach out — zero missed DMs, instant deals. Claim your official Founding Creator Pass now.'
                  : 'Direct, instant collaboration requests to verified creators with escrow-backed protection. Claim your official Founding Brand Pass now.'}
              </p>

              {/* Proof Row */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="flex -space-x-2">
                  <div className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center text-[12px] text-white bg-gradient-to-tr from-[#ff078e] to-[#ff4db1] border-white dark:border-[#0d0a12] shadow-sm">✦</div>
                  <div className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center text-[12px] text-white bg-gradient-to-tr from-[#7c3aed] to-[#a78bfa] border-white dark:border-[#0d0a12] shadow-sm">★</div>
                  <div className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center text-[12px] text-white bg-gradient-to-tr from-[#0891b2] to-[#38bdf8] border-white dark:border-[#0d0a12] shadow-sm">⚡</div>
                  <div className="w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center text-[12px] text-white bg-gradient-to-tr from-[#059669] to-[#34d399] border-white dark:border-[#0d0a12] shadow-sm">✓</div>
                </div>
                <div className={`text-[13.5px] font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  <b>89 {role === 'creator' ? 'creators' : 'brands'}</b> registered for soft launch
                </div>
              </div>

              {/* Event Soft-Launch Perks Grid */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-7 text-left">
                {role === 'creator' ? (
                  <>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">⚡</div>
                      <div className="font-bold text-[13px] mb-0.5">0% Commission</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Keep 100% of brand payouts on every deal for a full year.
                      </div>
                    </div>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">🎯</div>
                      <div className="font-bold text-[13px] mb-0.5">Deal Radar</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Instant DM alerts the second a brand searches your niche.
                      </div>
                    </div>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">🚀</div>
                      <div className="font-bold text-[13px] mb-0.5">Genesis VIP</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Priority ranking in the creator directory on Day 1.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">💎</div>
                      <div className="font-bold text-[13px] mb-0.5">0% Platform Fee</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Zero platform fees on your initial collaboration campaigns.
                      </div>
                    </div>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">🤝</div>
                      <div className="font-bold text-[13px] mb-0.5">Direct Access</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Hire verified creators directly without agency markups.
                      </div>
                    </div>
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isDark ? 'bg-[#15111c]/70 border-white/10' : 'bg-white/80 border-[#e7e3dc]'
                    }`}>
                      <div className="text-[18px] mb-1">🛡️</div>
                      <div className="font-bold text-[13px] mb-0.5">Escrow Shield</div>
                      <div className={`text-[11.5px] leading-snug ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Funds are held securely and released only on approved posts.
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Big CTA */}
              <button
                onClick={() => setScreen('s1')}
                className="inline-flex items-center gap-2.5 h-[58px] px-8 rounded-full bg-[#ff078e] hover:bg-[#c8307f] text-white font-bold text-[16px] shadow-[0_10px_30px_rgba(255,7,142,0.32)] hover:shadow-[0_16px_38px_rgba(255,7,142,0.45)] hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <span>Claim My {role === 'creator' ? 'Founder' : 'Brand'} Pass</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <p className={`mt-3 text-[12.5px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Free · Instant public verification · Takes 30s
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
             SCREEN 1 — Name
          ════════════════════════════════════════════════════ */}
          {screen === 's1' && (
            <div className="w-full flex flex-col items-start text-left animate-in fade-in duration-300">
              {/* Progress Pips */}
              <div className="flex gap-1.5 mb-6">
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
                <div className={`h-[3px] w-[34px] rounded-full ${isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
                <div className={`h-[3px] w-[34px] rounded-full ${isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
              </div>

              <div className="font-mono-code text-[11px] font-bold tracking-widest uppercase text-[#c8307f] dark:text-[#ff3aaa] mb-2">
                Question 1 of 3
              </div>

              <h2 className="font-headline font-extrabold text-[28px] sm:text-[36px] tracking-tight leading-tight mb-5">
                {role === 'creator' ? "What's your creator name?" : "What's your company or brand name?"}
              </h2>

              <div className="w-full relative mb-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={role === 'creator' ? 'e.g. Maya Chen' : 'e.g. Acme Studio'}
                  autoFocus
                  className={`w-full h-[66px] rounded-[18px] px-6 text-[21px] font-semibold border-2 transition-all outline-none ${
                    shakeField === 'name' ? 'border-[#ff078e] animate-shake' : ''
                  } ${
                    isDark
                      ? 'bg-[#1a1525] border-white/15 text-white placeholder-zinc-500 focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/20'
                      : 'bg-white border-[#e7e3dc] text-[#17141d] placeholder-zinc-400 focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10'
                  }`}
                />
              </div>

              <p className={`text-[13px] mb-6 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                This name is embossed on your Founder Pass and official genesis verification.
              </p>

              <button
                onClick={handleNext1}
                className="h-[52px] px-8 rounded-full bg-[#17141d] dark:bg-white text-white dark:text-[#0d0a12] hover:bg-[#ff078e] dark:hover:bg-[#ff078e] dark:hover:text-white font-bold text-[15.5px] inline-flex items-center gap-2.5 shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <span>Continue</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>

              <div className={`flex items-center gap-2 mt-3 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                or press <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>Enter ↵</span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
             SCREEN 2 — Social / Web Verification (Optional)
          ════════════════════════════════════════════════════ */}
          {screen === 's2' && (
            <div className="w-full flex flex-col items-start text-left animate-in fade-in duration-300">
              {/* Progress Pips */}
              <div className="flex gap-1.5 mb-6">
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
                <div className={`h-[3px] w-[34px] rounded-full ${isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
              </div>

              <div className="font-mono-code text-[11px] font-bold tracking-widest uppercase text-[#c8307f] dark:text-[#ff3aaa] mb-2">
                Question 2 of 3
              </div>

              {role === 'creator' ? (
                <>
                  <h2 className="font-headline font-extrabold text-[28px] sm:text-[36px] tracking-tight leading-tight mb-2">
                    Your Instagram handle? <span className="text-zinc-400 font-normal text-[20px]">(Optional)</span>
                  </h2>
                  <p className={`text-[13.5px] mb-5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Enter your handle to show your verified follower count on your Founder Pass, or skip to claim a standard pass.
                  </p>

                  <div
                    className={`w-full h-[66px] rounded-[18px] border-2 transition-all flex items-center px-5 mb-2 ${
                      shakeField === 'handle' || verificationStatus === 'not_found'
                        ? 'border-[#ff078e] animate-shake'
                        : verificationStatus === 'verified_public' || verificationStatus === 'verified_private'
                        ? 'border-[#059669]'
                        : ''
                    } ${
                      isDark
                        ? 'bg-[#1a1525] border-white/15 text-white focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/20'
                        : 'bg-white border-[#e7e3dc] text-[#17141d] focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/10'
                    }`}
                  >
                    <span className="font-mono-code text-[22px] font-bold text-[#ff078e] mr-2.5 select-none shrink-0">
                      @
                    </span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => handleHandleChange(e.target.value)}
                      placeholder="your_handle (optional)"
                      autoFocus
                      className="w-full bg-transparent border-0 outline-none text-[21px] font-semibold text-inherit placeholder-zinc-400 dark:placeholder-zinc-500"
                    />
                    {handle.trim().length >= 2 && (
                      <button
                        type="button"
                        onClick={() => performScrape(handle, false)}
                        disabled={scraping}
                        className={`ml-2 px-3.5 py-1.5 rounded-xl font-mono-code text-[12px] font-bold transition-all shrink-0 cursor-pointer ${
                          isAccountVerified
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : scraping
                            ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                            : 'bg-[#ff078e] hover:bg-[#c8307f] text-white shadow-sm'
                        }`}
                      >
                        {scraping ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full border-2 border-zinc-400 border-t-white animate-spin" />
                            Checking...
                          </span>
                        ) : isAccountVerified ? (
                          '✓ Verified'
                        ) : (
                          'Verify'
                        )}
                      </button>
                    )}
                  </div>

                  {verificationError && (
                    <div className="w-full text-[13px] text-[#ff078e] font-semibold flex items-center gap-1.5 mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{verificationError}</span>
                    </div>
                  )}

                  {/* Instagram Live Scraper Preview Box (Creator Mode) */}
                  {handle.trim().length >= 2 && (
                    <div
                      className={`w-full rounded-[18px] p-4 mb-6 border transition-all ${
                        isDark
                          ? 'bg-[#1a1525] border-white/15 shadow-xl shadow-black/40'
                          : 'bg-white border-[#e7e3dc] shadow-md shadow-black/5'
                      }`}
                    >
                      {/* Status bar */}
                      <div className="flex items-center justify-between font-mono-code text-[11px] font-semibold mb-3">
                        <div className="flex items-center gap-2">
                          {scraping ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-[#ff078e] animate-spin" />
                          ) : verificationStatus === 'verified_public' || verificationStatus === 'verified_private' ? (
                            <span className="text-[#059669]">●</span>
                          ) : verificationStatus === 'not_found' ? (
                            <span className="text-[#ff078e]">✕</span>
                          ) : (
                            <span className="text-zinc-400">○</span>
                          )}
                          <span
                            className={
                              scraping
                                ? 'text-zinc-400'
                                : verificationStatus === 'verified_public' || verificationStatus === 'verified_private'
                                ? 'text-[#059669]'
                                : verificationStatus === 'not_found'
                                ? 'text-[#ff078e]'
                                : 'text-zinc-400'
                            }
                          >
                            {statusMessage || 'Enter handle and tap Verify'}
                          </span>
                        </div>
                        <span className="text-[#ff078e] font-bold tracking-wider">LIVE VERIFICATION</span>
                      </div>

                      {/* State 1: Public profile verified */}
                      {verificationStatus === 'verified_public' && scrapedProfile && (
                        <div
                          className={`flex items-center gap-3.5 p-3 rounded-2xl border transition-all ${
                            isDark ? 'bg-[#15111c] border-white/10' : 'bg-[#f4f2ee] border-[#e7e3dc]'
                          }`}
                        >
                          <div className="relative w-14 h-14 shrink-0">
                            <div className="absolute -inset-[3px] rounded-full p-[2px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]" />
                            {scrapedProfile.avatarUrl ? (
                              <img
                                src={scrapedProfile.avatarUrl}
                                alt="Avatar"
                                className="w-full h-full rounded-full object-cover relative z-10 border-2 border-white dark:border-black"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full rounded-full flex items-center justify-center font-bold text-white bg-[#ff078e] relative z-10 border-2 border-white dark:border-black">
                                {(name || handle || 'CR').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            {scrapedProfile.isVerified && (
                              <div className="absolute -bottom-0.5 -right-0.5 z-20 w-[18px] h-[18px] rounded-full bg-[#0095f6] text-white flex items-center justify-center shadow">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-[15px] truncate">
                              <span>{scrapedProfile.displayName}</span>
                              {scrapedProfile.isVerified && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0095f6">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
                                </svg>
                              )}
                            </div>
                            <div className="font-mono-code text-[12px] text-[#ff078e] font-semibold">
                              @{handle.replace(/^@+/, '')}
                            </div>
                            <div className="flex gap-3 text-[12px] mt-1 text-zinc-500 dark:text-zinc-400">
                              <div>
                                <b className="text-zinc-900 dark:text-white">{scrapedProfile.followersStr}</b> followers
                              </div>
                              <div>
                                <b className="text-zinc-900 dark:text-white">{scrapedProfile.postsStr}</b> posts
                              </div>
                            </div>
                            {scrapedProfile.biography ? (
                              <div className="text-[12px] text-zinc-400 truncate mt-0.5">
                                {scrapedProfile.biography}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {/* State 2: Private profile verified */}
                      {verificationStatus === 'verified_private' && (
                        <div
                          className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all ${
                            isDark ? 'bg-[#15111c] border-emerald-500/25' : 'bg-emerald-50/70 border-emerald-200'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[14px] text-zinc-900 dark:text-white">
                                @{handle.replace(/^@+/, '')}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                PRIVATE · VERIFIED
                              </span>
                            </div>
                            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1 leading-snug">
                              Your account exists and is verified. Because it is set to private on Instagram, photos and public metrics are restricted. You are confirmed and can proceed!
                            </p>
                          </div>
                        </div>
                      )}

                      {/* State 3: Account not found */}
                      {verificationStatus === 'not_found' && (
                        <div
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border ${
                            isDark ? 'bg-[#15111c] border-rose-500/25 text-rose-300' : 'bg-rose-50/80 border-rose-200 text-rose-700'
                          }`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <div className="text-[12.5px] leading-snug">
                            No Instagram account found matching <b>@{handle.replace(/^@+/, '')}</b>. You can skip or re-enter.
                          </div>
                        </div>
                      )}

                      {/* State 4: Error / Timeout */}
                      {verificationStatus === 'error' && (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border ${
                            isDark ? 'bg-[#15111c] border-amber-500/25 text-amber-300' : 'bg-amber-50/80 border-amber-200 text-amber-800'
                          }`}
                        >
                          <div className="text-[12px] leading-snug">
                            {statusMessage || 'Could not complete the verification right now.'}
                          </div>
                          <button
                            type="button"
                            onClick={() => performScrape(handle, false)}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#ff078e] text-white hover:bg-[#c8307f] transition-all self-start sm:self-auto cursor-pointer shrink-0"
                          >
                            Retry Check
                          </button>
                        </div>
                      )}

                      {/* State 5: Idle */}
                      {verificationStatus === 'idle' && (
                        <div className="p-3 text-center text-[12.5px] text-zinc-400 font-mono-code">
                          Type your Instagram handle and tap Verify (or Confirm & Continue)
                        </div>
                      )}

                      {/* State 6: Scanning */}
                      {verificationStatus === 'scanning' && (
                        <div className="flex items-center justify-center gap-2 p-4 text-[13px] text-zinc-500 dark:text-zinc-400 font-mono-code">
                          <div className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-[#ff078e] animate-spin" />
                          <span>Verifying @{handle.replace(/^@+/, '')} on Instagram...</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Business Mode: Website + Instagram Handle both optional */
                <>
                  <h2 className="font-headline font-extrabold text-[28px] sm:text-[36px] tracking-tight leading-tight mb-2">
                    Brand online presence <span className="text-zinc-400 font-normal text-[20px]">(Optional)</span>
                  </h2>
                  <p className={`text-[13.5px] mb-5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Help us personalize your Founding Brand pass and concierge onboarding.
                  </p>

                  {/* Website Field */}
                  <div className="w-full mb-3">
                    <label className="block text-[12px] font-mono-code uppercase font-bold tracking-wider mb-1.5 text-zinc-500 dark:text-zinc-400">
                      Company Website <span className="text-zinc-400 text-[11px] font-normal lowercase">(optional)</span>
                    </label>
                    <div
                      className={`w-full h-[60px] rounded-[18px] border-2 transition-all flex items-center px-5 ${
                        isDark
                          ? 'bg-[#1a1525] border-white/15 text-white focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/20'
                          : 'bg-white border-[#e7e3dc] text-[#17141d] focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/10'
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3 text-zinc-400 shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <input
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="e.g. acmestudio.com"
                        className="w-full bg-transparent border-0 outline-none text-[18px] font-semibold text-inherit placeholder-zinc-400 dark:placeholder-zinc-500"
                      />
                    </div>
                  </div>

                  {/* Brand Instagram Handle */}
                  <div className="w-full mb-6">
                    <label className="block text-[12px] font-mono-code uppercase font-bold tracking-wider mb-1.5 text-zinc-500 dark:text-zinc-400">
                      Brand Instagram Handle <span className="text-zinc-400 text-[11px] font-normal lowercase">(optional)</span>
                    </label>
                    <div
                      className={`w-full h-[60px] rounded-[18px] border-2 transition-all flex items-center px-5 ${
                        isDark
                          ? 'bg-[#1a1525] border-white/15 text-white focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/20'
                          : 'bg-white border-[#e7e3dc] text-[#17141d] focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/10'
                      }`}
                    >
                      <span className="font-mono-code text-[20px] font-bold text-[#ff078e] mr-2.5 select-none shrink-0">
                        @
                      </span>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => handleHandleChange(e.target.value)}
                        placeholder="brand_handle"
                        className="w-full bg-transparent border-0 outline-none text-[18px] font-semibold text-inherit placeholder-zinc-400 dark:placeholder-zinc-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons with Clear "Skip for now" */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleNext2(false)}
                  disabled={scraping}
                  className="h-[52px] px-8 rounded-full bg-[#17141d] dark:bg-white text-white dark:text-[#0d0a12] hover:bg-[#ff078e] dark:hover:bg-[#ff078e] dark:hover:text-white font-bold text-[15.5px] inline-flex items-center gap-2.5 shadow-md hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scraping ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-white animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>{handle.trim() && role === 'creator' ? 'Confirm & Continue' : 'Continue'}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleNext2(true)}
                  className={`h-[52px] px-6 rounded-full border text-[14px] font-semibold transition-all cursor-pointer ${
                    isDark
                      ? 'border-white/15 text-zinc-300 hover:border-white/40 hover:text-white bg-white/5'
                      : 'border-[#e7e3dc] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 bg-white'
                  }`}
                >
                  Skip for now →
                </button>

                <button
                  onClick={() => setScreen('s1')}
                  className={`text-[13px] px-3 py-2 rounded-lg transition-colors ${
                    isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'
                  }`}
                >
                  ← Back
                </button>
              </div>

              <div className={`flex items-center gap-2 mt-3 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                or press <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>Enter ↵</span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
             SCREEN 3 — Credentials Delivery (Email + Phone)
          ════════════════════════════════════════════════════ */}
          {screen === 's3' && (
            <div className="w-full flex flex-col items-start text-left animate-in fade-in duration-300">
              {/* Progress Pips */}
              <div className="flex gap-1.5 mb-6">
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
                <div className="h-[3px] w-[34px] rounded-full bg-[#ff078e]" />
              </div>

              <div className="font-mono-code text-[11px] font-bold tracking-widest uppercase text-[#c8307f] dark:text-[#ff3aaa] mb-2">
                Question 3 of 3
              </div>

              <h2 className="font-headline font-extrabold text-[28px] sm:text-[36px] tracking-tight leading-tight mb-2">
                Where do we send your<br />Founder credentials?
              </h2>
              <p className={`text-[13.5px] mb-5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                We'll deliver your verified Genesis Pass and VIP launch activation key.
              </p>

              {/* Work / Personal Email Field */}
              <div className="w-full relative mb-4">
                <label className="block text-[12px] font-mono-code uppercase font-bold tracking-wider mb-1.5 text-zinc-500 dark:text-zinc-400">
                  Email Address <span className="text-[#ff078e]">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="you@domain.com"
                  autoFocus
                  className={`w-full h-[60px] rounded-[18px] px-5 text-[19px] font-semibold border-2 transition-all outline-none ${
                    shakeField === 'email' || emailError ? 'border-[#ff078e] animate-shake' : ''
                  } ${
                    isDark
                      ? 'bg-[#1a1525] border-white/15 text-white placeholder-zinc-500 focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/20'
                      : 'bg-white border-[#e7e3dc] text-[#17141d] placeholder-zinc-400 focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10'
                  }`}
                />
                {emailError && (
                  <div className="w-full text-[12.5px] text-[#ff078e] font-semibold flex items-center gap-1.5 mt-2 animate-in fade-in">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{emailError}</span>
                  </div>
                )}
              </div>

              {/* Mobile / WhatsApp Number (Optional with validation) */}
              <div className="w-full relative mb-6">
                <label className="block text-[12px] font-mono-code uppercase font-bold tracking-wider mb-1.5 text-zinc-500 dark:text-zinc-400">
                  Mobile / WhatsApp Number <span className="text-zinc-400 text-[11px] font-normal lowercase">(optional)</span>
                </label>
                <div
                  className={`w-full h-[60px] rounded-[18px] border-2 transition-all flex items-center px-5 ${
                    shakeField === 'phone' || phoneError
                      ? 'border-[#ff078e] animate-shake'
                      : isDark
                      ? 'bg-[#1a1525] border-white/15 text-white focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/20'
                      : 'bg-white border-[#e7e3dc] text-[#17141d] focus-within:border-[#ff078e] focus-within:ring-4 focus-within:ring-[#ff078e]/10'
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3 text-zinc-400 shrink-0">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="e.g. +91 98765 43210 (Optional)"
                    className="w-full bg-transparent border-0 outline-none text-[18px] font-semibold text-inherit placeholder-zinc-400 dark:placeholder-zinc-500"
                  />
                </div>
                {phoneError ? (
                  <div className="w-full text-[12.5px] text-[#ff078e] font-semibold flex items-center gap-1.5 mt-2 animate-in fade-in">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{phoneError}</span>
                  </div>
                ) : (
                  <p className={`text-[12px] mt-1.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Optional — for instant WhatsApp VIP launch alerts & pass delivery.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleNext3}
                  className="h-[52px] px-8 rounded-full bg-[#ff078e] hover:bg-[#c8307f] text-white font-bold text-[15.5px] inline-flex items-center gap-2.5 shadow-[0_8px_26px_rgba(255,7,142,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <span>Generate My Founder Pass ✦</span>
                </button>

                <button
                  onClick={() => setScreen('s2')}
                  className={`text-[13px] px-4 py-2 rounded-lg transition-colors ${
                    isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'
                  }`}
                >
                  ← Back
                </button>
              </div>

              <div className={`flex items-center gap-2 mt-3 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                or press <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>Enter ↵</span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
             SCREEN 3.5 — Card Synthesizer Forge Loading
          ════════════════════════════════════════════════════ */}
          {screen === 'sLoading' && (
            <div className="w-full max-w-[440px] flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
              {/* Spinning Forge Core Ring */}
              <div className="relative w-[170px] h-[170px] mb-8 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r="75"
                    fill="none"
                    stroke={isDark ? 'rgba(255,255,255,0.1)' : '#e7e3dc'}
                    strokeWidth="4"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="75"
                    fill="none"
                    stroke="#ff078e"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={471}
                    strokeDashoffset={471 - (471 * synthProgress) / 100}
                    className="transition-all duration-300 ease-out drop-shadow-[0_0_10px_rgba(255,7,142,0.7)]"
                  />
                </svg>

                {/* Orbiting particle */}
                <div className="absolute -inset-[14px] rounded-full border border-dashed border-[#ff078e]/35 animate-orbit">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#ff078e] shadow-[0_0_12px_#ff078e]" />
                </div>

                <div className="font-mono-code text-[28px] font-bold">
                  {synthProgress}%
                </div>
              </div>

              <h2 className="font-headline font-extrabold text-[26px] tracking-tight mb-2">
                Synthesizing Your Pass
              </h2>
              <div className="font-mono-code text-[12.5px] text-[#ff078e] font-semibold h-6">
                {synthStepLabel}
              </div>

              {/* Forge Segment Bars */}
              <div className="flex justify-center gap-1.5 mt-6">
                <div className={`w-12 h-[3px] rounded transition-all ${synthProgress >= 25 ? 'bg-[#ff078e] shadow-[0_0_8px_#ff078e]' : isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
                <div className={`w-12 h-[3px] rounded transition-all ${synthProgress >= 58 ? 'bg-[#ff078e] shadow-[0_0_8px_#ff078e]' : isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
                <div className={`w-12 h-[3px] rounded transition-all ${synthProgress >= 85 ? 'bg-[#ff078e] shadow-[0_0_8px_#ff078e]' : isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
                <div className={`w-12 h-[3px] rounded transition-all ${synthProgress >= 100 ? 'bg-[#ff078e] shadow-[0_0_8px_#ff078e]' : isDark ? 'bg-white/15' : 'bg-zinc-200'}`} />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
             SCREEN 4 — Luxury VIP Founder Pass Reveal
          ════════════════════════════════════════════════════ */}
          {screen === 's4' && (
            <div className="w-full max-w-[380px] flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 relative">
              {/* Social Media Format Selector Tabs */}
              <div
                className="w-full flex items-center justify-center p-1 rounded-2xl mb-5 border backdrop-blur-md transition-all shadow-sm max-w-[340px] select-none"
                style={{
                  backgroundColor: isDark ? 'rgba(26, 21, 37, 0.85)' : 'rgba(244, 242, 238, 0.9)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e7e3dc',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setExportFormat('story');
                    playAudioCue('click');
                  }}
                  className={`flex-1 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    exportFormat === 'story'
                      ? 'bg-[#ff078e] text-white shadow-[0_2px_12px_rgba(255,7,142,0.35)]'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-black'
                  }`}
                >
                  <span>📱 Story</span>
                  <span className="text-[10px] opacity-75 font-mono">9:16</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportFormat('linkedin');
                    playAudioCue('click');
                  }}
                  className={`flex-1 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    exportFormat === 'linkedin'
                      ? 'bg-[#ff078e] text-white shadow-[0_2px_12px_rgba(255,7,142,0.35)]'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-black'
                  }`}
                >
                  <span>💼 LinkedIn</span>
                  <span className="text-[10px] opacity-75 font-mono">16:9</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportFormat('square');
                    playAudioCue('click');
                  }}
                  className={`flex-1 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    exportFormat === 'square'
                      ? 'bg-[#ff078e] text-white shadow-[0_2px_12px_rgba(255,7,142,0.35)]'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-black'
                  }`}
                >
                  <span>⬛ Square</span>
                  <span className="text-[10px] opacity-75 font-mono">1:1</span>
                </button>
              </div>

              {/* 3D Stage with Ambient Rotating Spoke Logo Shadow */}
              <div className="relative w-full flex items-center justify-center">
                {/* Ambient Rotating Actual Influnet Logo Shadow */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible select-none -z-10">
                  <div className="w-[380px] h-[380px] sm:w-[460px] sm:h-[460px] animate-[spin_40s_linear_infinite] opacity-20 dark:opacity-25 transition-opacity">
                    <img
                      src="/influet_logo.png"
                      alt="Influnet Logo Shadow"
                      className="w-full h-full object-contain filter drop-shadow-[0_0_50px_rgba(255,7,142,0.45)]"
                    />
                  </div>
                </div>

                <div
                  ref={passContainerRef}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className="w-[300px] h-[440px] relative perspective-[1200px] mx-auto select-none cursor-grab active:cursor-grabbing"
                >
                  <div
                    ref={cardRef}
                    style={{
                      transform: `rotateX(${cardRotate.x}deg) rotateY(${cardRotate.y}deg)`,
                      transition: cardRotate.x === 0 ? 'transform 0.6s ease-out' : 'transform 0.08s ease-out',
                      transformStyle: 'preserve-3d',
                    }}
                    className={`w-full h-full rounded-[26px] relative overflow-hidden border transition-shadow duration-300 ${
                      isDark
                        ? 'bg-gradient-to-b from-[#221a30] via-[#171124] to-[#0d0817] border-white/15 shadow-[0_40px_90px_rgba(0,0,0,0.8),0_0_45px_rgba(255,7,142,0.25)]'
                        : 'bg-gradient-to-b from-white via-[#faf8f5] to-[#f0ebdf] border-[#d7d0c5]/80 shadow-[0_30px_70px_rgba(0,0,0,0.15),0_10px_24px_rgba(0,0,0,0.08)]'
                    }`}
                  >
                    {/* Holographic Prismatic Foil Overlay */}
                    <div
                      className="absolute inset-0 rounded-[26px] pointer-events-none z-15 mix-blend-overlay transition-opacity duration-300"
                      style={{
                        background: `linear-gradient(${foilAngle}deg, transparent 0%, rgba(255,255,255,.25) 26%, rgba(255,7,142,.35) 43%, rgba(124,58,237,.3) 53%, rgba(6,182,212,.3) 64%, transparent 100%)`,
                        opacity: foilOpacity,
                      }}
                    />

                    {/* Lanyard Clip Slot */}
                    <div
                      className={`absolute top-3 left-1/2 -translate-x-1/2 w-12 h-2 rounded-full z-20 border ${
                        isDark ? 'bg-black/60 border-white/10' : 'bg-black/10 border-black/15'
                      }`}
                    />

                    {/* Rotating Actual Influnet Logo Watermark inside Card */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.08] dark:opacity-[0.10] z-1 select-none">
                      <div className="w-[280px] h-[280px] animate-[spin_45s_linear_infinite]">
                        <img
                          src="/influet_logo.png"
                          alt="Influnet Mark"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    {/* Card Inner Content */}
                    <div className="relative z-10 flex flex-col items-center h-full pt-7 pb-4 px-5">
                      {/* Header */}
                      <div className="w-full flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 font-headline font-extrabold text-[13px] tracking-tight">
                          <img
                            src="/influet_logo.png"
                            alt="Influnet"
                            className="w-[18px] h-[18px] object-contain shrink-0"
                          />
                          <span>INFLUNET</span>
                        </div>
                        <div className="font-mono-code text-[8px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/35 text-[#ff078e]">
                          {role === 'creator' ? 'FOUNDER PASS' : 'FOUNDER BRAND'}
                        </div>
                      </div>

                      {/* Serial Row */}
                      <div className="w-full flex justify-between items-center font-mono-code text-[8px] font-semibold tracking-wider text-zinc-400 mb-2.5">
                        <span>GENESIS SERIES</span>
                        <span className="font-bold text-[#ff078e]">
                          NO. #{String(passNumber).padStart(4, '0')} / 1000
                        </span>
                      </div>

                      {/* Avatar Frame with Shifting Neon Ring */}
                      <div className="relative w-[94px] h-[94px] mb-2.5">
                        <div className="absolute -inset-1 rounded-full p-[3px] bg-gradient-to-tr from-[#ff078e] via-[#7c3aed] to-[#06b6d4] animate-gradient-shift shadow-[0_0_20px_rgba(255,7,142,0.35)]" />
                        {scrapedProfile?.avatarUrl ? (
                          <img
                            src={scrapedProfile.avatarUrl}
                            alt="Avatar"
                            className="w-full h-full rounded-full object-cover relative z-10 border-[3px] border-white dark:border-[#1a1525]"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full flex items-center justify-center font-headline font-extrabold text-[32px] text-white bg-gradient-to-br from-[#ff078e] to-[#c8307f] relative z-10 border-[3px] border-white dark:border-[#1a1525]">
                            {(name || handle || 'CR').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 z-20 w-[26px] h-[26px] rounded-full bg-white dark:bg-[#0d0a12] border-2 border-white dark:border-[#1a1525] flex items-center justify-center shadow-sm">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ff078e">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                          </svg>
                        </div>
                      </div>

                      {/* Identity */}
                      <div className="font-headline font-extrabold text-[19px] tracking-tight leading-tight max-w-[250px] truncate text-center">
                        {(name || (role === 'creator' ? handle : company) || 'CREATOR').toUpperCase()}
                      </div>
                      <div className="font-mono-code text-[12px] font-semibold text-[#ff078e] flex items-center gap-1 mt-0.5">
                        {handle.replace(/^@+/, '').trim() ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                              <circle cx="17.5" cy="6.5" r="1.5" />
                            </svg>
                            <span>@{handle.replace(/^@+/, '').trim()}</span>
                          </>
                        ) : (
                          <span>{role === 'creator' ? '★ FOUNDING CREATOR' : (company || name || '★ FOUNDING BRAND')}</span>
                        )}
                      </div>

                      {/* Stat Pill */}
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-mono-code text-[9.5px] font-bold mt-2 ${
                        isDark ? 'bg-[#15111c] border-white/10 text-zinc-300' : 'bg-[#f4f2ee] border-[#e7e3dc] text-zinc-700'
                      }`}>
                        <span className="text-[#ff078e]">★</span>
                        <span>
                          <b>
                            {role === 'creator'
                              ? isAccountPrivate
                                ? 'PRIVATE CREATOR'
                                : scrapedProfile?.followersStr
                                ? `${scrapedProfile.followersStr} FOLLOWERS`
                                : 'VIP CREATOR'
                              : '0% PLATFORM FEE'}
                          </b>{' '}
                          {role === 'creator' ? '· VERIFIED' : '· FOUNDING BRAND'}
                        </span>
                      </div>

                      {/* Metadata Grid */}
                      <div className="w-full mt-auto pt-2.5 border-t border-zinc-200 dark:border-white/10 grid grid-cols-2 gap-x-3 gap-y-1.5 text-left">
                        <div className="flex flex-col">
                          <span className="font-mono-code text-[7.5px] font-bold tracking-widest uppercase text-zinc-400">MEMBERSHIP</span>
                          <span className="font-mono-code text-[9px] font-bold">{role === 'creator' ? 'FOUNDING CREATOR' : 'FOUNDING BRAND'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono-code text-[7.5px] font-bold tracking-widest uppercase text-zinc-400">PASS BENEFIT</span>
                          <span className="font-mono-code text-[9px] font-bold">{role === 'creator' ? '1 YR UNLIMITED PASS' : '0% FEE CONCIERGE'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono-code text-[7.5px] font-bold tracking-widest uppercase text-zinc-400">SECURITY STATUS</span>
                          <span className="font-mono-code text-[9px] font-bold text-[#059669]">● CONFIRMED & ACTIVE</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono-code text-[7.5px] font-bold tracking-widest uppercase text-zinc-400">VALID THROUGH</span>
                          <span className="font-mono-code text-[9px] font-bold">SEPTEMBER 2027</span>
                        </div>
                      </div>

                      {/* Security Barcode Strip */}
                      <div className="w-full mt-2 pt-2 border-t border-dashed border-zinc-300 dark:border-white/15 flex items-center justify-between">
                        {/* Barcode SVG */}
                        <svg className="h-[18px] opacity-70" viewBox="0 0 140 18" fill="currentColor">
                          <rect x="0" width="3" height="18" /><rect x="5" width="2" height="18" /><rect x="9" width="4" height="18" />
                          <rect x="16" width="1" height="18" /><rect x="20" width="3" height="18" /><rect x="25" width="5" height="18" />
                          <rect x="33" width="2" height="18" /><rect x="37" width="3" height="18" /><rect x="43" width="1" height="18" />
                          <rect x="47" width="4" height="18" /><rect x="54" width="2" height="18" /><rect x="59" width="5" height="18" />
                          <rect x="67" width="2" height="18" /><rect x="72" width="4" height="18" /><rect x="79" width="2" height="18" />
                          <rect x="84" width="3" height="18" /><rect x="90" width="5" height="18" /><rect x="98" width="1" height="18" />
                          <rect x="102" width="3" height="18" /><rect x="108" width="4" height="18" /><rect x="115" width="2" height="18" />
                          <rect x="120" width="4" height="18" /><rect x="127" width="2" height="18" /><rect x="132" width="3" height="18" />
                        </svg>
                        <div className="font-mono-code text-[8px] font-semibold text-zinc-400 tracking-wider">
                          INFN-{passNumber}-VIP
                        </div>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-60">
                          <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                          <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                          <path d="M15.5 21.5a12 12 0 0 0 0-19" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Format Info Pill */}
              <div className={`font-mono-code text-[11px] font-semibold mt-3 mb-1 flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <span className="w-2 h-2 rounded-full bg-[#ff078e] animate-pulse inline-block" />
                <span>Format: <b>{exportFormat === 'story' ? 'Instagram Story (1080×1920)' : exportFormat === 'linkedin' ? 'LinkedIn Post (1200×675)' : 'Square Post (1080×1080)'}</b></span>
              </div>

              {/* Soft-Launch Priority Guarantee Banner */}
              <div
                className={`w-full rounded-2xl p-4 mt-3 border text-left transition-all ${
                  isDark
                    ? 'bg-[#15111c]/90 border-white/10'
                    : 'bg-white border-[#e7e3dc] shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5 font-headline font-bold text-[13.5px]">
                  <span className="text-[#ff078e]">🚀</span>
                  <span>Soft-Launch Event Guarantee</span>
                </div>
                <p className={`text-[12px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Your VIP Founding Pass and 0% platform credentials are confirmed! When we officially launch at our upcoming launch event, your VIP activation link will be delivered directly to <b>{email}</b>
                  {phone.trim() ? <> and WhatsApp <b>{phone.trim()}</b></> : null}
                  {handle.replace(/^@+/, '').trim() ? <> and Instagram DM to <b>@{handle.replace(/^@+/, '').trim()}</b></> : null}.
                </p>
              </div>

              {/* Action Buttons with format download */}
              <div className="w-full flex flex-col items-stretch gap-2.5 mt-5">
                <button
                  onClick={() => exportPassPNG(exportFormat)}
                  className="h-[52px] rounded-full bg-[#ff078e] hover:bg-[#c8307f] text-white font-bold text-[15px] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(255,7,142,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>
                    {exportFormat === 'story'
                      ? 'Download Instagram Story (PNG)'
                      : exportFormat === 'linkedin'
                      ? 'Download LinkedIn Banner (PNG)'
                      : 'Download Square Card (PNG)'}
                  </span>
                </button>

                {/* One-click quick shortcuts for all three formats */}
                <div className="w-full flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportPassPNG('story')}
                    className={`flex-1 h-[42px] rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      exportFormat === 'story'
                        ? 'border-[#ff078e] text-[#ff078e] bg-[#ff078e]/10'
                        : isDark
                        ? 'border-white/10 text-zinc-300 hover:border-white/30 bg-white/5'
                        : 'border-[#e7e3dc] text-zinc-700 hover:border-zinc-400 bg-white'
                    }`}
                    title="Download Instagram Story (1080x1920)"
                  >
                    <span>📱 Story</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportPassPNG('linkedin')}
                    className={`flex-1 h-[42px] rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      exportFormat === 'linkedin'
                        ? 'border-[#ff078e] text-[#ff078e] bg-[#ff078e]/10'
                        : isDark
                        ? 'border-white/10 text-zinc-300 hover:border-white/30 bg-white/5'
                        : 'border-[#e7e3dc] text-zinc-700 hover:border-zinc-400 bg-white'
                    }`}
                    title="Download LinkedIn Banner (1200x675)"
                  >
                    <span>💼 LinkedIn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportPassPNG('square')}
                    className={`flex-1 h-[42px] rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      exportFormat === 'square'
                        ? 'border-[#ff078e] text-[#ff078e] bg-[#ff078e]/10'
                        : isDark
                        ? 'border-white/10 text-zinc-300 hover:border-white/30 bg-white/5'
                        : 'border-[#e7e3dc] text-zinc-700 hover:border-zinc-400 bg-white'
                    }`}
                    title="Download Square Post (1080x1080)"
                  >
                    <span>⬛ Square</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setScreen('s0');
                    setSynthProgress(0);
                  }}
                  className={`text-[13px] mt-1 transition-colors ${
                    isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  ← Start over with another profile
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Hidden Canvas for 1080x1350 High-Res PNG Rendering */}
      <canvas ref={expCanvasRef} className="hidden" />
    </div>
  );
}
