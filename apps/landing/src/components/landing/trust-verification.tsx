'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

// --- CountUp Component for Animated Statistics ---
function CountUp({ end, suffix = '', duration = 1200 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(progress * end);
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startTime = null; // Reset animation timer
          animationFrameId = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.1 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [end, duration]);

  // Handle formatting
  const displayValue = end % 1 === 0 ? count.toFixed(0) : count.toFixed(1);
  return <span ref={elementRef}>{displayValue}{suffix}</span>;
}

// Discovery is deliberately absent from the landing page — the story starts at
// the point a brand reaches out, not at browsing a directory.
const BUSINESS_CARDS = [
  {
    id: '01',
    title: 'No Fake Numbers. Only Real Impact.',
    description: 'We verify creators so you can collaborate with confidence, ensuring zero wasted campaign spend.',
    bullets: [
      'Audience authenticity checks',
      'Engagement quality analysis',
      'Fraud & fake follower detection',
      'Verified badge you can trust'
    ],
    accent: 'from-purple-600 to-indigo-600',
    mockupType: 'verify'
  },
  {
    id: '02',
    title: 'Track Every Campaign. Prove Every Result.',
    description: 'Monitor performance in real time and measure the exact return on investment (ROI) that actually matters.',
    bullets: [
      'Real-time campaign analytics',
      'Reach, engagement, clicks & ROI',
      'Custom reports in one click',
      'Share results with your team'
    ],
    accent: 'from-blue-500 to-cyan-500',
    mockupType: 'performance'
  },
  {
    id: '03',
    title: 'Manage Payments & Budgets Seamlessly',
    description: 'Automated payments, clear budgets, and zero manual payment follow-ups or administrative hassle.',
    bullets: [
      'Secure escrow & milestone payments',
      'Automated invoicing & reminders',
      'Transparent transaction history',
      'On-time payments, always'
    ],
    accent: 'from-emerald-500 to-teal-500',
    mockupType: 'payments'
  }
];

const SARAH_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80";

function MockupVerify() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-100 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[250px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
          <span className="font-extrabold text-gray-800">Verification Engine</span>
          <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">Verified</span>
        </div>
        <div className="space-y-2.5 font-semibold">
          {[
            { label: 'Audience Authenticity', delay: 0.1 },
            { label: 'Engagement Quality', delay: 0.25 },
            { label: 'Identity Verification', delay: 0.4 }
          ].map((item) => (
            <motion.div 
              key={item.label}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: item.delay, duration: 0.3 }}
              className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
            >
              <span className="text-gray-600">{item.label}</span>
              <span className="text-green-600 font-extrabold">Passed</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[9px] text-gray-500 font-bold mb-1">
          <span>Overall Score</span>
          <span className="text-green-600 font-bold">86/100</span>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            whileInView={{ width: '86%' }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="h-full bg-green-500 rounded-full" 
          />
        </div>
      </div>
    </div>
  );
}

// --- Live SVG Chart for Card 3 ---
function MockupPerformance() {
  const [activePoint, setActivePoint] = useState<number | null>(4);

  const points = [
    { x: 15, y: 95, val: '500K' },
    { x: 70, y: 75, val: '980K' },
    { x: 125, y: 82, val: '1.2M' },
    { x: 180, y: 48, val: '1.8M' },
    { x: 225, y: 18, val: '2.4M' }
  ];

  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-100 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[250px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Campaign Stats</span>
          <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Live Tracker
          </span>
        </div>
        
        {/* Dynamic Animated Statistics */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <div className="text-[9px] text-gray-400 font-bold uppercase">Reach</div>
            <div className="text-sm font-bold text-gray-800 mt-0.5">
              <CountUp end={2.4} suffix="M" />
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <div className="text-[9px] text-gray-400 font-bold uppercase">ROI</div>
            <div className="text-sm font-bold text-green-600 mt-0.5">
              <CountUp end={4.2} suffix="X" />
            </div>
          </div>
        </div>
      </div>

      {/* SVG Interactive Line Graph */}
      <div className="h-32 bg-white rounded-xl border border-gray-100 relative overflow-hidden flex items-end p-2">
        <svg className="w-full h-full" viewBox="0 0 240 120">
          {/* Grid lines */}
          <line x1="0" y1="20" x2="240" y2="20" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="0" y1="60" x2="240" y2="60" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="0" y1="100" x2="240" y2="100" stroke="#f1f5f9" strokeDasharray="3" />

          {/* Filled Area Gradient */}
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Line Path Area */}
          <path 
            d="M 15 95 C 40 85, 55 75, 70 75 C 88 75, 108 82, 125 82 C 148 82, 162 48, 180 48 C 198 48, 215 18, 225 18 L 225 110 L 15 110 Z" 
            fill="url(#chartGradient)"
          />

          {/* Sparkline Drawing Path */}
          <motion.path 
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            d="M 15 95 C 40 85, 55 75, 70 75 C 88 75, 108 82, 125 82 C 148 82, 162 48, 180 48 C 198 48, 215 18, 225 18" 
            fill="none" 
            stroke="#3b82f6" 
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Interactive Plot Nodes */}
          {points.map((p, idx) => (
            <g key={idx} className="cursor-pointer" onMouseEnter={() => setActivePoint(idx)}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={activePoint === idx ? "5" : "3.5"} 
                fill={activePoint === idx ? "#3b82f6" : "#ffffff"} 
                stroke="#3b82f6" 
                strokeWidth="2.5" 
              />
            </g>
          ))}
        </svg>

        {/* Floating Interactive Tooltip */}
        {activePoint !== null && (
          <div className="absolute top-2 left-2 bg-gray-900/90 text-[9px] font-bold text-white px-2 py-1 rounded shadow pointer-events-none transition-all">
            Reach: {points[activePoint].val}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Live Escrow Burn Progress Ring in Card 4 ---
function MockupPayments() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-100 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[250px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Escrow Payouts</span>
          <span className="text-[9px] font-bold text-gray-400">Milestone Escrow</span>
        </div>

        {/* Circular Progress & Escrow Status */}
        <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)] mb-3">
          <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full transform -rotate-95" viewBox="0 0 36 36">
              <path className="text-gray-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <motion.path 
                initial={{ strokeDasharray: "0, 100" }}
                whileInView={{ strokeDasharray: "85, 100" }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="text-emerald-500" 
                strokeWidth="3.5" 
                strokeDasharray="85, 100" 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="none" 
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
              />
            </svg>
            <span className="absolute text-[8px] font-bold text-gray-800">85%</span>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 font-bold">Total Budget Escrow</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">₹4,25,000 / ₹5,00,000</div>
          </div>
        </div>

        {/* Animated Slide-In Transactions */}
        <div className="space-y-2">
          {[
            { name: 'Sarah Fitness', amount: '₹2,50,000', status: 'Paid', statusClass: 'bg-green-50 text-green-700', delay: 0.1 },
            { name: 'Rohit Verma', amount: '₹1,75,000', status: 'In Escrow', statusClass: 'bg-amber-50 text-amber-700', delay: 0.3 }
          ].map((tx) => (
            <motion.div 
              key={tx.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: tx.delay, type: 'spring', stiffness: 120 }}
              className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'Paid' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                <span className="font-bold text-gray-700">{tx.name}</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-gray-800 block">{tx.amount}</span>
                <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${tx.statusClass}`}>{tx.status}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TrustVerification() {
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
    <section className="py-24 lg:py-28 bg-[#fcfcfd] border-t border-gray-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        
        {/* Header Grid */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2.5xl">
            <span className="eyebrow block mb-4">
              For Businesses
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-bold text-gray-900 leading-none tracking-tight mb-5">
              Why <span className="text-[var(--magenta-deep)]">Businesses</span> Love Influnet
            </h2>
            <p className="text-base sm:text-lg text-gray-500 font-semibold leading-relaxed max-w-2xl">
              Everything you need to run high-performing influencer campaigns, all in one place.
            </p>
          </div>

          {/* Apple-style Slider Nav Buttons */}
          <div className="hidden md:flex gap-3">
            <button
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                canScrollLeft 
                  ? 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
                  : 'border-gray-100 bg-white text-gray-300 cursor-not-allowed opacity-50'
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
                  ? 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
                  : 'border-gray-100 bg-white text-gray-300 cursor-not-allowed opacity-50'
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
        {BUSINESS_CARDS.map((card) => {
          return (
            <motion.div 
              key={card.id}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: false, margin: "-80px" }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
              className="w-[88vw] sm:w-[560px] md:w-[760px] flex-shrink-0 bg-white border border-gray-100 rounded-[2.5rem] p-8 md:p-12 flex flex-col md:flex-row gap-8 md:gap-10 justify-between shadow-[0_8px_30px_rgba(0,0,0,0.02)] snap-start hover:shadow-[0_25px_60px_rgba(0,0,0,0.06)] transition-all duration-500 hover:border-gray-200 min-h-[460px] md:min-h-[500px]"
              style={{
                scrollMarginLeft: leftOffset
              }}
            >
              {/* Left Details */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <span className="mb-5 inline-block font-mono text-5xl font-medium tabular-nums tracking-tight text-[var(--line-strong)] md:text-6xl">
                    {card.id}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-4 tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-sm md:text-base text-gray-500 font-semibold leading-relaxed mb-8">
                    {card.description}
                  </p>
                </div>
                
                {/* Bullet Points */}
                <ul className="space-y-3.5 border-t border-gray-100 pt-6">
                  {card.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-600 font-bold leading-normal">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right Mockup Display (Padded & Centered) */}
              <div className="w-full md:w-[280px] flex items-center justify-center flex-shrink-0 rounded-2xl self-center">
                {card.mockupType === 'verify' && <MockupVerify />}
                {card.mockupType === 'performance' && <MockupPerformance />}
                {card.mockupType === 'payments' && <MockupPayments />}
              </div>

            </motion.div>
          );
        })}
      </div>

      {/* Dynamic Landing Page Campaign Banner Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="bg-pink-50/40 border border-pink-100/70 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_8px_30px_rgba(236,72,153,0.015)]"
        >
          <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
            <div className="w-12 h-12 rounded-full bg-pink-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-500/20">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-gray-900 leading-tight">
                Everything you need to run successful influencer campaigns.
              </h3>
              <p className="text-xs md:text-sm text-gray-500 font-semibold mt-1">
                Save time. Reduce risk. Get better results.
              </p>
            </div>
          </div>
          <Link
            href={`${process.env.NEXT_PUBLIC_APP_URL}/signup/business`}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs md:text-sm shadow-md shadow-pink-500/25 transition-all hover:-translate-y-0.5 active:scale-95 flex-shrink-0 cursor-pointer"
          >
            Start Your Campaign Today
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </div>

    </section>
  );
}
