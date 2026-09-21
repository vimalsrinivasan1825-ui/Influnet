'use client';

import React, { useState, useEffect } from 'react';
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
  Home,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { APP_URL } from '@/components/site/links';

const CREATOR_ROLES = [
  { id: '🎥 Influencer / Creator', title: 'Influencer / Creator', desc: 'Active across Instagram, Reels, or Shorts', icon: '🎥' },
  { id: '📱 Content Creator', title: 'Content Creator', desc: 'Creating UGC, aesthetics, and video content', icon: '📱' },
  { id: '🎬 YouTuber', title: 'YouTuber', desc: 'Long-form video creator and storyteller', icon: '🎬' },
  { id: '📸 Instagram Creator', title: 'Instagram Creator', desc: 'Focus on carousels, photo stories, and reels', icon: '📸' },
  { id: '📢 Marketing Agency', title: 'Marketing Agency', desc: 'Managing or representing a talent roster', icon: '📢' },
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

const PHONE_REGEX = /^\+?[0-9\s\-().]{7,25}$/;

export default function CreatorJoinPage() {
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  // Form Fields
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [creatorType, setCreatorType] = useState('🎥 Influencer / Creator');
  const [followerTier, setFollowerTier] = useState('10K – 50K');
  const [selectedNiches, setSelectedNiches] = useState<string[]>(['👗 Fashion & Lifestyle']);
  const [brandExp, setBrandExp] = useState('Yes, paid brand deals');
  const [challenge, setChallenge] = useState('');

  // UI / Error State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    applicationNumber: number;
    message: string;
  } | null>(null);

  // Confetti on success
  useEffect(() => {
    if (step === 8) {
      try {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#ff078e', '#00e5ff', '#7c3aed', '#ffffff'],
        });
      } catch {
        // ignore
      }
    }
  }, [step]);

  const toggleNiche = (nicheId: string) => {
    setSelectedNiches((prev) =>
      prev.includes(nicheId)
        ? prev.length > 1
          ? prev.filter((n) => n !== nicheId)
          : prev
        : [...prev, nicheId]
    );
  };

  const validateCurrentStep = (): boolean => {
    setErrorMsg(null);
    if (step === 1) {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name');
        return false;
      }
    } else if (step === 2) {
      // Handle is optional, but if provided, validate length
      if (handle.trim().length > 60) {
        setErrorMsg('Instagram handle is too long');
        return false;
      }
    } else if (step === 3) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMsg('Please enter a valid email address');
        return false;
      }
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || !PHONE_REGEX.test(phone.trim())) {
        setErrorMsg('Please enter a valid WhatsApp number (7–15 digits)');
        return false;
      }
    } else if (step === 4) {
      if (!creatorType) {
        setErrorMsg('Please select your creator category');
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

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        instagramHandle: handle.trim() ? handle.trim().replace(/^@/, '') : null,
        creatorType,
        followerTier,
        contentNiches: selectedNiches,
        brandExperience: brandExp,
        biggestChallenge: challenge.trim() || null,
      };

      const res = await fetch(`${APP_URL}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setSubmissionResult({
          applicationNumber: json.applicationNumber || 1001,
          message: json.message || 'Application received successfully!',
        });
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

  return (
    <div className="min-h-screen bg-[#0d0914] text-white flex flex-col justify-between selection:bg-[#ff078e] selection:text-white">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-[#ff078e]/15 via-[#7c3aed]/10 to-transparent blur-3xl opacity-60" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-gradient-to-t from-[#ff078e]/10 to-transparent blur-3xl opacity-40" />
      </div>

      {/* Top Header with Centered Logo & Brand Name */}
      <header className="relative z-10 w-full pt-6 sm:pt-8 pb-4 px-4 sm:px-6 flex flex-col items-center justify-center">
        <Link
          href="/"
          className="group flex flex-col items-center gap-2 transition-transform active:scale-95"
        >
          <div className="relative size-12 sm:size-14 rounded-2xl bg-white/5 border border-white/10 p-2 flex items-center justify-center shadow-[0_0_25px_rgba(255,7,142,0.35)] group-hover:border-[#ff078e]/50 transition-all">
            <Image
              src="/influet_logo.png"
              alt="Influnet Logo"
              width={48}
              height={48}
              className="size-full object-contain"
              priority
            />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white font-headline">
            influnet
          </span>
        </Link>

        {step <= totalSteps && (
          <div className="w-full max-w-md mt-5">
            {/* Step & Progress */}
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-2 px-1">
              <span className="text-[#ff078e] font-bold">
                Step {step} of {totalSteps}
              </span>
              <span>{Math.round((step / totalSteps) * 100)}% completed</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#ff078e] to-[#7c3aed] rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${(step / totalSteps) * 100}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Step-by-Step Card Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-6 max-w-xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {/* STEP 1: Name */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff078e]/10 border border-[#ff078e]/30 text-[#ff078e] text-[11px] font-mono font-semibold mb-4">
                <Sparkles className="size-3.5" />
                <span>Creator Identity</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                What is your name?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-6">
                Tell us how brands and the Influnet creator team should address you.
              </p>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2">
                  Full Name / Creator Name *
                </label>
                <input
                  type="text"
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
                  className="w-full h-13 px-4 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-neutral-500 text-base sm:text-lg focus:outline-none focus:border-[#ff078e] focus:ring-2 focus:ring-[#ff078e]/30 transition-all"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-end">
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
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
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-mono font-semibold mb-4">
                <Camera className="size-3.5" />
                <span>Social Presence</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                What is your Instagram handle?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-6">
                Brands check your content style and visual presence before sending deal offers.
              </p>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2">
                  Instagram Handle (Optional)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-neutral-400 font-bold text-lg select-none">
                    @
                  </span>
                  <input
                    type="text"
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
                    className="w-full h-13 pl-9 pr-4 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-neutral-500 text-base sm:text-lg focus:outline-none focus:border-[#ff078e] focus:ring-2 focus:ring-[#ff078e]/30 transition-all font-mono"
                  />
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Leave blank or skip if YouTube/other platform is your primary channel.
                </p>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <div className="flex items-center gap-2">
                  {!handle.trim() && (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="text-xs text-neutral-400 hover:text-white px-3 py-2 transition-colors underline"
                    >
                      Skip for now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={nextStep}
                    className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
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
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold mb-4">
                <Phone className="size-3.5" />
                <span>Direct Contact</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                Where should brands reach you?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-6">
                Fast responses close 3x more brand collaborations. We notify you the minute an offer matches.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2">
                    Email Address *
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 size-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder="vimal@influnet.io"
                      autoFocus
                      className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-neutral-500 text-sm sm:text-base focus:outline-none focus:border-[#ff078e] focus:ring-2 focus:ring-[#ff078e]/30 transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2">
                    WhatsApp Number (Instant VIP alerts) *
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-4 size-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') nextStep();
                      }}
                      placeholder="+91 98765 43210"
                      className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-neutral-500 text-sm sm:text-base focus:outline-none focus:border-[#ff078e] focus:ring-2 focus:ring-[#ff078e]/30 transition-all font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Used exclusively for paid collaboration requests & deal milestones.
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Creator Role */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono font-semibold mb-4">
                <Share2 className="size-3.5" />
                <span>Primary Role</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                Which best describes you?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-5">
                Choose the category that represents your main content format.
              </p>

              <div className="space-y-2.5">
                {CREATOR_ROLES.map((role) => {
                  const isSelected = creatorType === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => {
                        setCreatorType(role.id);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className={`w-full text-left p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#ff078e]/15 border-[#ff078e] text-white shadow-md shadow-[#ff078e]/20'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:border-white/20 hover:bg-white/8'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{role.icon}</span>
                        <div>
                          <p className="font-bold text-sm sm:text-base text-white">{role.title}</p>
                          <p className="text-xs text-neutral-400">{role.desc}</p>
                        </div>
                      </div>
                      <div
                        className={`size-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-[#ff078e] bg-[#ff078e] text-white'
                            : 'border-white/20 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="size-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Follower Reach */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-semibold mb-4">
                <Sparkles className="size-3.5" />
                <span>Audience Reach</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                How many followers do you have?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-6">
                Across your main creator profile. Influnet matches all tiers with appropriate campaign budgets.
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
                      className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#ff078e]/15 border-[#ff078e] shadow-md shadow-[#ff078e]/20 text-white'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:border-white/20 hover:bg-white/8'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span>{tier.icon}</span>
                          <span className="font-extrabold text-base text-white">{tier.label}</span>
                        </div>
                        <p className="text-xs text-neutral-400">{tier.sub}</p>
                      </div>
                      <div
                        className={`size-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-[#ff078e] bg-[#ff078e] text-white'
                            : 'border-white/20 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="size-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 6: Content Categories / Niches */}
          {step === 6 && (
            <motion.div
              key="step6"
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[11px] font-mono font-semibold mb-4">
                <Sparkles className="size-3.5" />
                <span>Content Verticals</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                What type of content do you create?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-5">
                Select all niches that describe your channel. Brands search by category to find ideal creators.
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
                      className={`px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 active:scale-95 ${
                        isSelected
                          ? 'bg-[#ff078e] border-[#ff078e] text-white shadow-md shadow-[#ff078e]/30'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <span>{niche.id}</span>
                      {isSelected && <Check className="size-3.5 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-xs font-mono text-neutral-400">
                Selected: <span className="text-[#ff078e] font-bold">{selectedNiches.length}</span> categories
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-12 px-6 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all active:scale-95"
                >
                  Continue <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: Brand Experience & Challenge */}
          {step === 7 && (
            <motion.div
              key="step7"
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full bg-[#15101f]/90 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-semibold mb-4">
                <CheckCircle2 className="size-3.5" />
                <span>Deal History & Feedback</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug font-headline">
                Have you worked with brands before?
              </h1>
              <p className="text-sm text-neutral-400 mt-1 mb-5">
                We connect both experienced creators and rising talents with relevant business sponsorships.
              </p>

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
                      className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#ff078e]/15 border-[#ff078e] text-white'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span>{opt.icon}</span>
                        <span className="text-xs sm:text-sm font-semibold text-white">{opt.title}</span>
                      </div>
                      <div
                        className={`size-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-[#ff078e] bg-[#ff078e]' : 'border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="size-2.5 text-white stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2">
                  What is your biggest challenge as a creator today? (Optional)
                </label>
                <textarea
                  value={challenge}
                  onChange={(e) => setChallenge(e.target.value)}
                  rows={3}
                  placeholder="e.g. Inconsistent brand deals, delayed payouts, brands ghosting in DMs, or pricing deliverables..."
                  className="w-full p-3.5 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-[#ff078e] focus:ring-2 focus:ring-[#ff078e]/30 transition-all"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-xs mt-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={submitting}
                  className="h-12 px-5 rounded-full border border-white/15 hover:bg-white/5 text-neutral-300 text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-12 px-7 rounded-full bg-gradient-to-r from-[#ff078e] to-[#7c3aed] hover:opacity-90 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-xl shadow-[#ff078e]/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Submitting Application…' : 'Submit Application 🎉'}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: Success / Confirmation */}
          {step === 8 && (
            <motion.div
              key="step8"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full bg-[#15101f]/90 border border-[#ff078e]/40 rounded-3xl p-6 sm:p-10 backdrop-blur-xl shadow-2xl text-center"
            >
              <div className="size-16 rounded-2xl bg-gradient-to-br from-[#ff078e] to-[#7c3aed] mx-auto flex items-center justify-center text-white shadow-[0_0_35px_rgba(255,7,142,0.6)] mb-5">
                <CheckCircle2 className="size-9" />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff078e]/15 border border-[#ff078e]/40 text-[#ff078e] font-mono text-xs font-bold mb-2">
                Application #{submissionResult?.applicationNumber || 1001} Confirmed
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight font-headline">
                You’re on the Influnet Creator Roster, {name}!
              </h1>
              <p className="text-sm text-neutral-300 mt-2 max-w-md mx-auto leading-relaxed">
                {submissionResult?.message ||
                  'Your profile has been recorded in the Influnet creator database. Our partnerships team is matching you with active brand campaigns.'}
              </p>

              <div className="my-6 p-4 rounded-2xl bg-white/5 border border-white/10 text-left max-w-sm mx-auto space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono">Category:</span>
                  <span className="text-white font-semibold">{creatorType}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono">Audience:</span>
                  <span className="text-[#ff078e] font-semibold">{followerTier}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono">WhatsApp Alerts:</span>
                  <span className="text-emerald-400 font-mono font-semibold">{phone}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
                <Link
                  href="/"
                  className="w-full sm:w-auto h-12 px-6 rounded-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all"
                >
                  <Home className="size-4" /> Return to Home
                </Link>
                <a
                  href={`${APP_URL}/early-access`}
                  className="w-full sm:w-auto h-12 px-7 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-[#ff078e]/30 transition-all"
                >
                  <Sparkles className="size-4" /> Claim Founder Pass
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 text-center text-xs text-neutral-500 font-mono">
        Influnet Creator Network © {new Date().getFullYear()} · Made for Indian Creators & Brands
      </footer>
    </div>
  );
}
