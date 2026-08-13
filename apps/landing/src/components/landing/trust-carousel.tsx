'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const TRUST_CARDS = [
  {
    id: '01',
    tag: 'Transparency & Logging',
    title: 'Every collaboration is fully recorded.',
    description: 'Chats, contracts, milestones, and sign-offs are locked in a secure audit ledger.',
    statValue: '100%',
    statLabel: 'Tracked & Logged',
    accent: 'from-pink-500 to-rose-500',
    mockupType: 'logging'
  },
  {
    id: '02',
    tag: 'Escrow Payments',
    title: 'Milestone protection keeps your money safe.',
    description: 'Funds are secured in escrow before work begins and released upon campaign milestone approval.',
    statValue: '100%',
    statLabel: 'Secure Transactions',
    accent: 'from-purple-600 to-indigo-600',
    mockupType: 'escrow'
  },
  {
    id: '03',
    tag: 'Identity Verification',
    title: 'Advanced verification keeps our network authentic.',
    description: 'Creators undergo government ID verification, social validation, and quality audits.',
    statValue: '98%+',
    statLabel: 'Verified Creators',
    accent: 'from-blue-500 to-cyan-500',
    mockupType: 'creator'
  },
  {
    id: '04',
    tag: 'Company Verification',
    title: 'Only validated brands can hire creators.',
    description: 'Brands are verified using tax identifiers, registration checks, and company domains.',
    statValue: '99%+',
    statLabel: 'Verified Businesses',
    accent: 'from-emerald-500 to-teal-500',
    mockupType: 'business'
  },
  {
    id: '05',
    tag: 'Live Metrics',
    title: 'Track platform trust metrics in real-time.',
    description: 'Explore live collaboration counts, secure payments, and global operational uptime.',
    statValue: '99.99%',
    statLabel: 'System Uptime',
    accent: 'from-amber-500 to-orange-500',
    mockupType: 'metrics'
  }
];

const PORTRAIT_AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&h=180&q=80";

// --- Animating Visual Mockup Components ---

// Card 1: Collaboration Ledger (LIGHT THEMED)
function LoggingMockup() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false }}
      className="w-[240px] bg-white rounded-2xl p-4.5 border border-gray-100 shadow-md relative overflow-hidden flex flex-col justify-between h-[190px] font-sans text-gray-800"
    >
      <div>
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
          <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Ledger Index</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        
        <div className="space-y-2 mt-1">
          <motion.div variants={itemVariants} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-gray-100">
            <span className="text-[10px] text-gray-700 font-bold">Campaign Brief</span>
            <span className="text-[8px] bg-emerald-55 text-emerald-600 px-1.5 py-0.5 rounded font-bold border border-emerald-100">Locked</span>
          </motion.div>
          <motion.div variants={itemVariants} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-gray-100">
            <span className="text-[10px] text-gray-700 font-bold">Smart Contract</span>
            <span className="text-[8px] bg-emerald-55 text-emerald-600 px-1.5 py-0.5 rounded font-bold border border-emerald-100">Verified</span>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[8px] text-gray-400 font-semibold">
        <span>Log: #INF-99824</span>
        <span className="text-emerald-600 font-bold">Synced ✓</span>
      </div>
    </motion.div>
  );
}

// Card 2: Escrow protection (DARK THEMED credit card)
function EscrowMockup() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="w-[240px] h-[190px] bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950 rounded-2xl p-4.5 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between font-sans text-white"
    >
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

      <div className="flex justify-between items-start">
        <div>
          <span className="text-[8px] uppercase tracking-wider text-indigo-400 font-bold">Influnet Pay</span>
          <div className="text-[10px] text-slate-300 font-bold mt-0.5">Escrow Protected</div>
        </div>
        {/* Golden Microchip */}
        <motion.div 
          animate={{ rotateY: [0, 180, 360] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="w-7 h-5.5 bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-500 rounded-md border border-amber-200/20 shadow flex items-center justify-center relative"
        >
          <div className="absolute inset-x-1.5 inset-y-1 border border-amber-600/30 rounded-sm opacity-50" />
        </motion.div>
      </div>

      <div className="my-auto py-2">
        <div className="text-[8px] uppercase tracking-wider text-slate-455 font-bold">Locked Funds</div>
        <div className="text-xl font-bold tracking-tight text-white mt-0.5">₹75,000</div>
      </div>

      <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-[8px] text-slate-455 font-semibold">
        <span>•••• 9285</span>
        <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
          Active Escrow
        </span>
      </div>
    </motion.div>
  );
}

// Card 3: Creator Credentials ID Card (RESTORED LIGHT THEMED - Exactly as first version with subtle fade animation)
function CreatorMockup() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-[240px] h-[190px] bg-white rounded-2xl border border-gray-100 p-4.5 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans text-gray-805"
    >
      {/* Top Banner Verification Badge */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
        <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400">ID Verification</span>
        <span className="text-[8px] bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full font-bold">Passed</span>
      </div>

      <div className="flex items-center gap-3.5 my-auto">
        {/* Creator Passport Avatar */}
        <div className="relative">
          <img src={PORTRAIT_AVATAR} alt="Verified Creator" className="w-12 h-12 rounded-full object-cover border border-gray-100 shadow" />
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-purple-600 rounded-full border-2 border-white flex items-center justify-center text-[7px] text-white font-bold">✓</span>
        </div>

        <div className="flex-1">
          <div className="font-bold text-gray-900 text-sm">Amara Watson</div>
          <div className="text-[10px] text-gray-400 font-semibold">@amara.lifestyle</div>
          <div className="text-[8px] bg-slate-50 border border-gray-100 rounded px-1.5 py-0.5 mt-1.5 inline-block text-gray-500 font-bold">
            Audience Engagement Audit: 9.2%
          </div>
        </div>
      </div>

      {/* Custom Barcode to mimic ID credentials */}
      <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-[8px] text-gray-400 font-bold">
        <span>INFLUNET ID: #CR-2061A</span>
        {/* Mini simulated barcode */}
        <div className="flex items-center gap-[1.5px] h-3">
          {[1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1].map((w, idx) => (
            <motion.div 
              key={idx} 
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              transition={{ delay: idx * 0.02, duration: 0.3 }}
              className="bg-gray-800 h-full origin-bottom" 
              style={{ width: `${w}px` }} 
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Card 4: Business Verification Card (RESTORED LIGHT THEMED - Exactly as first version with load animations)
function BusinessMockup() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false }}
      className="w-[240px] h-[190px] bg-white rounded-2xl border border-gray-155 p-4.5 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans text-gray-800"
    >
      {/* Top Banner Verification Badge */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
        <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Brand Authenticity</span>
        <span className="text-[8px] bg-emerald-55 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">Verified</span>
      </div>

      <div className="my-auto space-y-2.5">
        <motion.div variants={itemVariants} className="flex justify-between items-center bg-slate-50/50 p-2 rounded-lg border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
          <span className="text-[10px] text-gray-500 font-semibold">GSTIN Registry Status</span>
          <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Authorized</span>
        </motion.div>
        <motion.div variants={itemVariants} className="flex justify-between items-center bg-slate-50/50 p-2 rounded-lg border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
          <span className="text-[10px] text-gray-500 font-semibold">Domain Ownership</span>
          <span className="text-[8px] text-gray-800 font-bold">https://fitlife.com</span>
        </motion.div>
      </div>

      <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-[8px] text-gray-400 font-bold">
        <span>EMPLOYER ID: #BR-88301</span>
        <span className="text-emerald-600 font-bold">Approved ✓</span>
      </div>
    </motion.div>
  );
}

// Card 5: Live Metrics Monitor Dashboard (RESTORED DARK THEMED - Exactly as first version with glowing green bars growing animation)
function MetricsMockup() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-[240px] h-[190px] bg-slate-950 text-white rounded-2xl p-4.5 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between font-sans"
    >
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">System Monitoring</span>
          <span className="text-[8px] bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">All OK</span>
        </div>

        <div className="flex justify-between items-end my-1">
          <div>
            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Platform Uptime</div>
            <div className="text-lg font-bold text-white mt-0.5">99.991%</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Response Time</div>
            <div className="text-[10px] font-bold text-slate-200 mt-0.5">42ms</div>
          </div>
        </div>
      </div>

      {/* Glowing System Uptime Bars (Visual Uptime Chart growing sequentially) */}
      <div className="bg-slate-900 border border-slate-800/80 p-2.5 rounded-xl flex items-center justify-between gap-1 h-12.5 mt-2">
        {Array.from({ length: 18 }).map((_, idx) => {
          const isYellow = idx === 12;
          return (
            <motion.div 
              key={idx} 
              initial={{ height: 0 }}
              whileInView={{ height: isYellow ? 20 : 34 }}
              transition={{ delay: idx * 0.02, type: "spring", stiffness: 120 }}
              className={`w-1.5 rounded-full ${isYellow ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.2)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.15)]'}`} 
            />
          );
        })}
      </div>
    </motion.div>
  );
}

export default function TrustCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [leftOffset, setLeftOffset] = useState('2rem');

  const checkScrollLimits = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScrollLimits, { passive: true });
      checkScrollLimits();
    }
    return () => {
      if (el) {
        el.removeEventListener('scroll', checkScrollLimits);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        const offset = (width - 1280) / 2 + 32;
        setLeftOffset(`${offset}px`);
      } else if (width >= 1024) {
        setLeftOffset('32px');
      } else if (width >= 640) {
        setLeftOffset('24px');
      } else {
        setLeftOffset('16px');
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const { clientWidth } = scrollRef.current;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.8 : clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <section className="py-24 lg:py-28 bg-[#f5f5f7] border-t border-gray-200 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        
        {/* Header Grid */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2.5xl">
            <span className="eyebrow block mb-4">
              Trust & Accountability
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-bold text-gray-900 leading-none tracking-tight mb-5">
              Trust Is the Foundation of <span className="text-[var(--magenta-deep)]">Every Collaboration</span>
            </h2>
            <p className="text-base sm:text-lg text-gray-500 font-semibold leading-relaxed max-w-2xl">
              Influnet ensures transparency, security and accountability at every step so businesses and creators can collaborate with confidence.
            </p>
          </div>

          {/* Apple-style Slider Nav Buttons */}
          <div className="hidden md:flex gap-3">
            <button
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                canScrollLeft 
                  ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
                  : 'border-gray-200 bg-white text-gray-300 cursor-not-allowed opacity-50'
              }`}
              aria-label="Scroll left"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                canScrollRight 
                  ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
                  : 'border-gray-200 bg-white text-gray-300 cursor-not-allowed opacity-50'
              }`}
              aria-label="Scroll right"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* Horizontal Carousel (Overflow Container) */}
      <div 
        ref={scrollRef}
        className="w-full overflow-x-auto flex gap-8 pb-14 scrollbar-none snap-x snap-mandatory scroll-smooth"
        style={{
          paddingLeft: leftOffset,
          paddingRight: leftOffset,
          scrollPaddingLeft: leftOffset,
          scrollPaddingRight: leftOffset
        }}
      >
        {TRUST_CARDS.map((card) => {
          return (
            <motion.div 
              key={card.id}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: false, margin: "-80px" }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
              className="w-[85vw] sm:w-[460px] md:w-[400px] h-[480px] flex-shrink-0 bg-white border border-gray-100 rounded-[2rem] p-8 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.015)] snap-start hover:shadow-[0_20px_50px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-gray-200 relative group"
              style={{
                scrollMarginLeft: leftOffset
              }}
            >
              {/* Card Header Content */}
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-2">
                  {card.tag}
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-3">
                  {card.title}
                </h3>
                <p className="text-[12px] text-gray-500 font-semibold leading-relaxed">
                  {card.description}
                </p>
              </div>

              {/* Graphic Mockups inside Cards (Positioned in Center/Bottom for Maximum Visual Impact) */}
              <div className="flex-1 flex items-center justify-center my-5">
                {card.mockupType === 'logging' && <LoggingMockup />}
                {card.mockupType === 'escrow' && <EscrowMockup />}
                {card.mockupType === 'creator' && <CreatorMockup />}
                {card.mockupType === 'business' && <BusinessMockup />}
                {card.mockupType === 'metrics' && <MetricsMockup />}
              </div>

              {/* Bottom Card Footer Details (Statistic Indicator) */}
              <div className="border-t border-gray-100 pt-4 flex flex-col">
                <span className="text-2xl font-bold text-gray-900 leading-none">
                  {card.statValue}
                </span>
                <span className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">
                  {card.statLabel}
                </span>
              </div>

            </motion.div>
          );
        })}
      </div>

      {/* Trust Quote Bottom Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="bg-white border border-gray-100 rounded-[2rem] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-[0_8px_30px_rgba(0,0,0,0.015)] hover:border-gray-200 transition-all duration-300"
        >
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-full bg-pink-50 flex items-center justify-center text-pink-500 border border-pink-100 flex-shrink-0 shadow-sm animate-pulse">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-none">
                Trust isn’t just a feature.
              </h3>
              <p className="text-lg md:text-xl font-extrabold text-purple-600 mt-1">
                It’s how Influnet works.
              </p>
            </div>
          </div>
          <div className="max-w-md text-sm text-gray-500 font-semibold leading-relaxed border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-8">
            We believe lasting partnerships are built on transparency, accountability, and mutual respect. That’s why trust checks are built directly into every layer of our platform infrastructure.
          </div>
        </motion.div>
      </div>

    </section>
  );
}
