'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Camera,
  Mail,
  Phone,
  AlertCircle,
  CheckCircle2,
  Share2,
  Layers,
  Award,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { APP_URL } from '@/components/site/links';

const CREATOR_ROLES = [
  { id: '🎥 Influencer / Creator', title: 'Influencer / Creator', desc: 'Active across Instagram, Reels, or Shorts', icon: '🎥' },
  { id: '📱 Content Creator (UGC)', title: 'UGC Content Creator', desc: 'Creating authentic brand media & video assets', icon: '📱' },
  { id: '🎬 YouTuber', title: 'YouTuber', desc: 'Long-form video creator and storyteller', icon: '🎬' },
  { id: '📸 Instagram Creator', title: 'Instagram Creator', desc: 'Focus on carousels, photo stories, and reels', icon: '📸' },
  { id: '📢 Marketing Agency / Manager', title: 'Agency / Manager', desc: 'Managing or representing a talent roster', icon: '📢' },
];

const FOLLOWER_TIERS = [
  { id: 'Under 1K', label: 'Under 1K', sub: 'Nano / Starting Out', icon: '⚡' },
  { id: '1K – 10K', label: '1K – 10K', sub: 'Micro Creator', icon: '🚀' },
  { id: '10K – 50K', label: '10K – 50K', sub: 'Rising Influence', icon: '🔥' },
  { id: '50K – 100K', label: '50K – 100K', sub: 'Established Creator', icon: '💎' },
  { id: '100K+', label: '100K+', sub: 'Macro Creator / Star', icon: '👑' },
];

const NICHES = [
  { id: '👗 Fashion & Lifestyle', label: 'Fashion & Lifestyle' },
  { id: '💄 Beauty & Makeup', label: 'Beauty & Makeup' },
  { id: '🏋️ Fitness & Health', label: 'Fitness & Health' },
  { id: '🍔 Food & Cooking', label: 'Food & Cooking' },
  { id: '💻 Technology & Gadgets', label: 'Technology' },
  { id: '💰 Finance & Investing', label: 'Finance' },
  { id: '🚗 Automotive', label: 'Automotive' },
  { id: '💼 Business & Entrepreneurship', label: 'Business' },
  { id: '📚 Education & Career', label: 'Education' },
  { id: '🎮 Gaming & Entertainment', label: 'Gaming' },
  { id: '✈️ Travel & Adventure', label: 'Travel' },
  { id: '🐾 Pets & Animals', label: 'Pets' },
];

const BRAND_EXP_OPTIONS = [
  { id: 'Yes, paid brand deals', title: 'Yes, multiple paid brand deals', desc: 'Experienced in sponsored deliverables and briefs', icon: '💼' },
  { id: 'Yes, barter / gifting', title: 'Yes, barter / gifting collabs', desc: 'Worked with brands on product exchanges', icon: '🎁' },
  { id: 'Not yet', title: 'Not yet, looking for brand deals', desc: 'Ready to monetize with paying brands', icon: '⏳' },
  { id: 'Just getting started', title: 'Just getting started', desc: 'Building my channel and portfolio', icon: '🌱' },
];

const COMMON_CHALLENGES = [
  { id: '💸 Inconsistent brand deals & income', label: 'Inconsistent brand deals & income' },
  { id: '⏳ Delayed payments after deliverables', label: 'Delayed payouts after deliverables' },
  { id: '👻 Brands ghosting or slow in DMs', label: 'Brands ghosting or slow responses in DMs' },
  { id: '🏷️ Not knowing fair pricing / what to charge', label: 'Not knowing fair pricing / what to charge' },
  { id: '📝 Confusing contracts & rights management', label: 'Confusing brand contracts & licensing' },
  { id: '🎁 Unfair barter offers instead of cash', label: 'Low-value barter offers instead of cash' },
  { id: '🔍 Finding brands that fit my audience', label: 'Finding brands that match my audience' },
];

const PHONE_REGEX = /^\+?[0-9\s\-().]{7,25}$/;

export default function CreatorJoinPage() {
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  // Form Fields
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Multi-select for creator roles
  const [selectedCreatorTypes, setSelectedCreatorTypes] = useState<string[]>(['🎥 Influencer / Creator']);
  // Single-select for follower tier
  const [followerTier, setFollowerTier] = useState('10K – 50K');
  // Multi-select for niches
  const [selectedNiches, setSelectedNiches] = useState<string[]>(['👗 Fashion & Lifestyle']);
  // Single-select for brand experience
  const [brandExp, setBrandExp] = useState('Yes, paid brand deals');
  // Multi-select for challenges + optional free text
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([
    '💸 Inconsistent brand deals & income',
    '⏳ Delayed payments after deliverables',
  ]);
  const [customChallengeNote, setCustomChallengeNote] = useState('');

  // Explicit input refs for reliable mobile focus
  const step1InputRef = useRef<HTMLInputElement>(null);
  const step2InputRef = useRef<HTMLInputElement>(null);
  const step3EmailRef = useRef<HTMLInputElement>(null);
  const step3PhoneRef = useRef<HTMLInputElement>(null);
  const step7NoteRef = useRef<HTMLTextAreaElement>(null);

  // UI / Error State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-focus the active input on step changes (works reliably on mobile & desktop)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 1) {
        step1InputRef.current?.focus();
      } else if (step === 2) {
        step2InputRef.current?.focus();
      } else if (step === 3) {
        step3EmailRef.current?.focus();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [step]);

  // Confetti on success
  useEffect(() => {
    if (step === 8) {
      try {
        confetti({
          particleCount: 90,
          spread: 85,
          origin: { y: 0.55 },
          colors: ['#ff078e', '#7928ca', '#00e5ff', '#10b981'],
        });
      } catch {
        // ignore
      }
    }
  }, [step]);

  const toggleCreatorType = (roleId: string) => {
    setSelectedCreatorTypes((prev) =>
      prev.includes(roleId)
        ? prev.length > 1
          ? prev.filter((r) => r !== roleId)
          : prev
        : [...prev, roleId]
    );
  };

  const toggleNiche = (nicheId: string) => {
    setSelectedNiches((prev) =>
      prev.includes(nicheId)
        ? prev.length > 1
          ? prev.filter((n) => n !== nicheId)
          : prev
        : [...prev, nicheId]
    );
  };

  const toggleChallenge = (challengeId: string) => {
    setSelectedChallenges((prev) =>
      prev.includes(challengeId)
        ? prev.filter((c) => c !== challengeId)
        : [...prev, challengeId]
    );
  };

  const validateCurrentStep = (): boolean => {
    setErrorMsg(null);
    if (step === 1) {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name');
        step1InputRef.current?.focus();
        return false;
      }
    } else if (step === 2) {
      if (handle.trim().length > 60) {
        setErrorMsg('Instagram handle is too long');
        step2InputRef.current?.focus();
        return false;
      }
    } else if (step === 3) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMsg('Please enter a valid email address');
        step3EmailRef.current?.focus();
        return false;
      }
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || !PHONE_REGEX.test(phone.trim())) {
        setErrorMsg('Please enter a valid WhatsApp number (7–15 digits)');
        step3PhoneRef.current?.focus();
        return false;
      }
    } else if (step === 4) {
      if (selectedCreatorTypes.length === 0) {
        setErrorMsg('Please select at least one creator category');
        return false;
      }
    } else if (step === 5) {
      if (!followerTier) {
        setErrorMsg('Please select your follower range');
        return false;
      }
    } else if (step === 6) {
      if (selectedNiches.length === 0) {
        setErrorMsg('Please select at least one content niche');
        return false;
      }
    } else if (step === 7) {
      if (!brandExp) {
        setErrorMsg('Please indicate your brand collaboration experience');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setErrorMsg(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setErrorMsg(null);

    // Combine structured challenges and custom note
    const allChallenges = [
      ...selectedChallenges,
      ...(customChallengeNote.trim() ? [customChallengeNote.trim()] : []),
    ];

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        instagramHandle: handle.trim() ? handle.trim().replace(/^@/, '') : null,
        creatorType: selectedCreatorTypes.join(', '),
        followerTier,
        contentNiches: selectedNiches,
        brandExperience: brandExp,
        biggestChallenge: allChallenges.length > 0 ? allChallenges.join('; ') : null,
      };

      const res = await fetch(`${APP_URL}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setStep(8); // Step 8: Success
      } else {
        setErrorMsg(json?.error || 'Failed to submit application. Please try again.');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Progress percentage begins at 0% on Step 1, reaching 100% upon completion
  const progressPercent = Math.round(((step - 1) / totalSteps) * 100);

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] text-zinc-900 flex flex-col justify-between selection:bg-[#ff078e] selection:text-white relative overflow-x-hidden font-sans">
      {/* Background Ambience: Pushed to -z-10 with pointer-events-none so it NEVER intercepts mobile touch events */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 select-none">
        <div className="absolute -top-36 left-1/2 -translate-x-1/2 w-[700px] sm:w-[950px] h-[520px] bg-gradient-to-b from-[#ff078e]/12 via-[#7928ca]/8 to-transparent rounded-full blur-3xl opacity-80 pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-[480px] h-[480px] bg-gradient-to-tl from-[#ff078e]/10 via-[#00e5ff]/5 to-transparent rounded-full blur-3xl opacity-70 pointer-events-none" />
        <div className="absolute top-1/3 -left-36 w-[400px] h-[400px] bg-gradient-to-tr from-[#7928ca]/8 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-50 pointer-events-none" />
      </div>

      {/* Top Header with Centered Prominent Large Logo & Brand Name */}
      <header className="relative z-10 w-full pt-6 sm:pt-10 pb-3 sm:pb-4 px-4 sm:px-6 flex flex-col items-center justify-center">
        <Link
          href="/"
          className="group flex flex-col items-center gap-3 sm:gap-3.5 transition-transform active:scale-95 touch-manipulation"
        >
          {/* Brand Logo Badge */}
          <div className="relative size-36 sm:size-48 rounded-[32px] sm:rounded-[44px] bg-white border border-zinc-200/90 p-5 sm:p-6 flex items-center justify-center shadow-[0_14px_45px_rgba(255,7,142,0.22)] group-hover:shadow-[0_18px_55px_rgba(255,7,142,0.32)] group-hover:border-[#ff078e]/40 transition-all">
            <Image
              src="/influet_logo.png"
              alt="Influnet Logo"
              width={192}
              height={192}
              className="size-full object-contain pointer-events-none"
              priority
            />
            {/* Ambient subtle glow ring */}
            <div className="absolute -inset-1.5 rounded-3xl sm:rounded-[36px] bg-gradient-to-r from-[#ff078e]/25 via-[#7928ca]/25 to-[#ff078e]/25 blur-md -z-10 opacity-75 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-black text-3xl sm:text-4xl tracking-tight text-zinc-900 font-headline">
            influnet
          </span>
        </Link>

        {step <= totalSteps && (
          <div className="w-full max-w-md mt-4 sm:mt-6">
            {/* Step Indicator & Fixed 0% Starting Progress */}
            <div className="flex items-center justify-between text-xs font-mono font-medium text-zinc-500 mb-2 px-1">
              <span className="text-[#ff078e] font-bold">
                Step {step} of {totalSteps}
              </span>
              <span>{progressPercent}% completed</span>
            </div>
            <div className="w-full h-2 bg-zinc-200/80 rounded-full overflow-hidden p-0.5 border border-zinc-200">
              <motion.div
                className="h-full bg-gradient-to-r from-[#ff078e] via-[#c8307f] to-[#7928ca] rounded-full shadow-sm"
                initial={{ width: '0%' }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Step-by-Step Card Container: Pure white card (no mobile backdrop-filter bug) */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-4 sm:py-6 max-w-xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {/* STEP 1: Name */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/20 text-[#ff078e] text-xs font-mono font-bold mb-4">
                <Sparkles className="size-3.5" />
                <span>Creator Identity</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                What is your name?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-6">
                Tell us how brands and the Influnet creator team should address you.
              </p>

              <div
                className="cursor-text"
                onClick={() => step1InputRef.current?.focus()}
              >
                <label
                  htmlFor="creator-name-input"
                  className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2 cursor-pointer"
                >
                  Full Name / Creator Name *
                </label>
                <input
                  ref={step1InputRef}
                  id="creator-name-input"
                  name="name"
                  type="text"
                  inputMode="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') nextStep();
                  }}
                  placeholder="e.g. Vimal Srinivasan"
                  autoFocus
                  className="w-full h-14 px-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-base focus:outline-none focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10 focus:bg-white transition-all shadow-sm relative z-20 touch-manipulation cursor-text"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-end">
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Instagram Handle */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 text-xs font-mono font-bold mb-4">
                <Camera className="size-3.5" />
                <span>Social Presence</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                What is your Instagram handle?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-6">
                Brands inspect your visual content aesthetic and audience vibe before offering deals.
              </p>

              <div
                className="cursor-text"
                onClick={() => step2InputRef.current?.focus()}
              >
                <label
                  htmlFor="creator-handle-input"
                  className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2 cursor-pointer"
                >
                  Instagram Handle (Optional)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-zinc-400 font-bold text-lg select-none pointer-events-none z-30">
                    @
                  </span>
                  <input
                    ref={step2InputRef}
                    id="creator-handle-input"
                    name="instagramHandle"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value.replace(/^@/, ''));
                      if (errorMsg) setErrorMsg(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') nextStep();
                    }}
                    placeholder="creatorhandle"
                    autoFocus
                    className="w-full h-14 pl-9 pr-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-base focus:outline-none focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10 focus:bg-white transition-all font-mono shadow-sm relative z-20 touch-manipulation cursor-text"
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Leave blank or skip if YouTube/other platform is your primary channel.
                </p>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <div className="flex items-center gap-2">
                  {!handle.trim() && (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="text-xs text-zinc-500 hover:text-zinc-800 px-3 py-2 transition-colors underline font-medium touch-manipulation"
                    >
                      Skip for now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={nextStep}
                    className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                  >
                    Continue <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Email & WhatsApp */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs font-mono font-bold mb-4">
                <Phone className="size-3.5" />
                <span>Direct Contact</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                Where should brands reach you?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-6">
                Fast responses close 3x more brand collaborations. We notify you the minute an offer matches.
              </p>

              <div className="space-y-4">
                <div
                  className="cursor-text"
                  onClick={() => step3EmailRef.current?.focus()}
                >
                  <label
                    htmlFor="creator-email-input"
                    className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2 cursor-pointer"
                  >
                    Email Address *
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 size-4 text-zinc-400 pointer-events-none z-30" />
                    <input
                      ref={step3EmailRef}
                      id="creator-email-input"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder="vimal@influnet.io"
                      autoFocus
                      className="w-full h-14 pl-11 pr-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-base focus:outline-none focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10 focus:bg-white transition-all font-mono shadow-sm relative z-20 touch-manipulation cursor-text"
                    />
                  </div>
                </div>

                <div
                  className="cursor-text"
                  onClick={() => step3PhoneRef.current?.focus()}
                >
                  <label
                    htmlFor="creator-phone-input"
                    className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2 cursor-pointer"
                  >
                    WhatsApp Number (Instant Deal Alerts) *
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-4 size-4 text-zinc-400 pointer-events-none z-30" />
                    <input
                      ref={step3PhoneRef}
                      id="creator-phone-input"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') nextStep();
                      }}
                      placeholder="+91 98765 43210"
                      className="w-full h-14 pl-11 pr-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-base focus:outline-none focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10 focus:bg-white transition-all font-mono shadow-sm relative z-20 touch-manipulation cursor-text"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5">
                    Used exclusively for paid collaboration briefs & payment receipts.
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Creator Roles / Formats (MULTI-SELECT) */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 text-xs font-mono font-bold mb-4">
                <Share2 className="size-3.5" />
                <span>Format & Platform</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                Which best describes your work?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-5">
                Select all that apply. Many creators work across multiple channels and formats.
              </p>

              <div className="space-y-2.5">
                {CREATOR_ROLES.map((role) => {
                  const isSelected = selectedCreatorTypes.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => {
                        toggleCreatorType(role.id);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className={`w-full text-left p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between touch-manipulation ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#ff078e]/[0.08] to-[#7928ca]/[0.05] border-[#ff078e] shadow-sm text-zinc-950 ring-1 ring-[#ff078e]'
                          : 'bg-zinc-50/80 border-zinc-200/90 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{role.icon}</span>
                        <div>
                          <p className="font-bold text-sm sm:text-base text-zinc-900">{role.title}</p>
                          <p className="text-xs text-zinc-500">{role.desc}</p>
                        </div>
                      </div>
                      <div
                        className={`size-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'border-[#ff078e] bg-[#ff078e] text-white'
                            : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="size-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-xs font-mono text-zinc-500">
                Selected: <span className="text-[#ff078e] font-bold">{selectedCreatorTypes.length}</span> category/categories
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Follower Reach (Single Select) */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-mono font-bold mb-4">
                <Award className="size-3.5" />
                <span>Audience Reach</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                How many followers do you have?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-6">
                Across your primary creator profile. Influnet pairs every tier with verified brand budgets.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FOLLOWER_TIERS.map((tier) => {
                  const isSelected = followerTier === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        setFollowerTier(tier.id);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between touch-manipulation ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#ff078e]/[0.08] to-[#7928ca]/[0.05] border-[#ff078e] shadow-sm text-zinc-950 ring-1 ring-[#ff078e]'
                          : 'bg-zinc-50/80 border-zinc-200/90 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span>{tier.icon}</span>
                          <span className="font-extrabold text-base text-zinc-900">{tier.label}</span>
                        </div>
                        <p className="text-xs text-zinc-500">{tier.sub}</p>
                      </div>
                      <div
                        className={`size-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'border-[#ff078e] bg-[#ff078e] text-white'
                            : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="size-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 6: Content Verticals / Niches (MULTI-SELECT) */}
          {step === 6 && (
            <motion.div
              key="step6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-700 text-xs font-mono font-bold mb-4">
                <Layers className="size-3.5" />
                <span>Content Verticals</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                What type of content do you create?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-5">
                Select all niches that describe your channel. Brands search by category to invite you to campaigns.
              </p>

              <div className="flex flex-wrap gap-2 sm:gap-2.5 max-h-72 overflow-y-auto pr-1 pb-1">
                {NICHES.map((niche) => {
                  const isSelected = selectedNiches.includes(niche.id);
                  return (
                    <button
                      key={niche.id}
                      type="button"
                      onClick={() => {
                        toggleNiche(niche.id);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className={`px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 active:scale-95 touch-manipulation ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#ff078e] to-[#c8307f] border-[#ff078e] text-white shadow-md shadow-[#ff078e]/25 font-bold'
                          : 'bg-zinc-50/90 border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100/70'
                      }`}
                    >
                      <span>{niche.id}</span>
                      {isSelected && <Check className="size-3.5 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-xs font-mono text-zinc-500">
                Selected: <span className="text-[#ff078e] font-bold">{selectedNiches.length}</span> categories
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/25 transition-all active:scale-95 touch-manipulation"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: Brand Experience & Challenges */}
          {step === 7 && (
            <motion.div
              key="step7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full bg-white border border-zinc-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_15px_50px_-10px_rgba(0,0,0,0.06)] relative z-10"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 text-xs font-mono font-bold mb-4">
                <CheckCircle2 className="size-3.5" />
                <span>Deal History & Feedback</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-snug font-headline">
                Have you worked with brands before?
              </h1>
              <p className="text-sm text-zinc-500 mt-1 mb-5">
                We connect both experienced creators and rising talents with relevant business sponsorships.
              </p>

              {/* Brand Experience Options */}
              <div className="space-y-2 mb-6">
                {BRAND_EXP_OPTIONS.map((opt) => {
                  const isSelected = brandExp === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setBrandExp(opt.id);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between touch-manipulation ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#ff078e]/[0.08] to-[#7928ca]/[0.05] border-[#ff078e] text-zinc-950 font-bold ring-1 ring-[#ff078e]'
                          : 'bg-zinc-50/80 border-zinc-200/90 text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-xs sm:text-sm font-semibold text-zinc-900">{opt.title}</span>
                      </div>
                      <div
                        className={`size-4 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'border-[#ff078e] bg-[#ff078e]' : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="size-2.5 text-white stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Multi-Select Common Challenges */}
              <div className="mb-5">
                <label className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2">
                  What challenges do you face as a creator? (Select all that apply)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COMMON_CHALLENGES.map((ch) => {
                    const isSelected = selectedChallenges.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChallenge(ch.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between touch-manipulation ${
                          isSelected
                            ? 'bg-[#ff078e]/10 border-[#ff078e] text-zinc-950 font-semibold'
                            : 'bg-zinc-50/80 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                        }`}
                      >
                        <span className="truncate pr-1">{ch.label}</span>
                        <div
                          className={`size-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'border-[#ff078e] bg-[#ff078e] text-white'
                              : 'border-zinc-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="size-2.5 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Custom Notes / Challenge Details */}
              <div
                className="cursor-text"
                onClick={() => step7NoteRef.current?.focus()}
              >
                <label
                  htmlFor="creator-notes-input"
                  className="block text-xs font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2 cursor-pointer"
                >
                  Other notes or specific challenges (Optional)
                </label>
                <textarea
                  ref={step7NoteRef}
                  id="creator-notes-input"
                  name="challengeNotes"
                  inputMode="text"
                  value={customChallengeNote}
                  onChange={(e) => setCustomChallengeNote(e.target.value)}
                  rows={2}
                  placeholder="Tell us any specific issue you want Influnet to solve for your workflow..."
                  className="w-full p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-[#ff078e] focus:ring-4 focus:ring-[#ff078e]/10 focus:bg-white transition-all shadow-sm relative z-20 touch-manipulation cursor-text"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-600 text-xs mt-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <AlertCircle className="size-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={submitting}
                  className="h-12 px-5 rounded-full border border-zinc-200 hover:bg-zinc-100/80 text-zinc-700 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 touch-manipulation"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-xl shadow-[#ff078e]/30 transition-all active:scale-95 disabled:opacity-50 touch-manipulation"
                >
                  {submitting ? 'Submitting Application…' : 'Submit Application 🎉'}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: Success / Confirmation Card */}
          {step === 8 && (
            <motion.div
              key="step8"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full bg-white border border-[#ff078e]/30 rounded-3xl p-6 sm:p-10 shadow-[0_20px_60px_-15px_rgba(255,7,142,0.18)] text-center relative z-10"
            >
              <div className="size-16 rounded-2xl bg-gradient-to-br from-[#ff078e] to-[#7928ca] mx-auto flex items-center justify-center text-white shadow-[0_8px_30px_rgba(255,7,142,0.45)] mb-5">
                <CheckCircle2 className="size-9" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-tight font-headline">
                Thank you for your response!
              </h1>
              <p className="text-sm text-zinc-600 mt-2 max-w-md mx-auto leading-relaxed">
                Your application has been received. Our team will review it and get back to you soon.
              </p>

              <div className="mt-8 flex justify-center">
                <a
                  href="/"
                  className="w-full sm:w-auto h-12 px-8 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7928ca] hover:opacity-95 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95 touch-manipulation"
                >
                  Visit Our Website <ArrowRight className="size-4" />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 text-center text-xs text-zinc-500 font-mono border-t border-zinc-200/60 bg-white/60">
        Influnet Creator Network © {new Date().getFullYear()} · Made for Indian Creators & Brands
      </footer>
    </div>
  );
}
