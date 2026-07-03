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
          startTime = null;
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

  const displayValue = end % 1 === 0 ? count.toFixed(0) : count.toFixed(1);
  return <span ref={elementRef}>{displayValue}{suffix}</span>;
}

const CREATOR_CARDS = [
  {
    id: '01',
    title: 'Get Discovered by the Right Brands',
    description: 'Create your verified profile and get matched with brands that align with your content and audience values.',
    bullets: [
      'Smart brand matching engine',
      'Verified creator badge builds instant trust',
      'Increase inbound sponsorship opportunities'
    ],
    accent: 'from-purple-500 to-pink-500',
    mockupType: 'profile'
  },
  {
    id: '02',
    title: 'Manage Collaborations Like a Pro',
    description: 'Keep all your direct conversations, briefs, files, and milestones in one unified workspace.',
    bullets: [
      'Centralized client chat & updates',
      'Share media kits & content drafts instantly',
      'Never lose another campaign brief'
    ],
    accent: 'from-purple-600 to-indigo-600',
    mockupType: 'chat'
  },
  {
    id: '03',
    title: 'Work with Clear Agreements',
    description: 'Protect your creative freedom with transparent deliverables, timeline schedules, and secure payout terms.',
    bullets: [
      'Pre-approved briefs & deliverables',
      'One-click smart digital contracts',
      'Zero scope creep or verbal confusion'
    ],
    accent: 'from-indigo-500 to-blue-500',
    mockupType: 'contract'
  },
  {
    id: '04',
    title: 'Get Paid On Time, Every Time',
    description: 'Never chase brands for invoices. Enjoy automatic milestone releases and 100% payment security.',
    bullets: [
      'Escrow budget funding transparency',
      'Automated payouts upon work completion',
      'Direct secure bank disbursements'
    ],
    accent: 'from-blue-600 to-teal-500',
    mockupType: 'payments'
  },
  {
    id: '05',
    title: 'Track Your Growth & Performance',
    description: 'Consolidate analytics metrics from all your linked social accounts into one premium creator report.',
    bullets: [
      'Real-time reach & engagement stats',
      'Historical channel growth timelines',
      'Exportable verification logs for pitches'
    ],
    accent: 'from-teal-500 to-emerald-500',
    mockupType: 'analytics'
  },
  {
    id: '06',
    title: 'Build Your Creator Brand & Reputation',
    description: 'Showcase your portfolio deliverables, collect client feedback, and stand out on the platform feed.',
    bullets: [
      'Featured highlight portfolio showcases',
      'Verified platform client reviews',
      'Continuous reputation score growth'
    ],
    accent: 'from-emerald-500 to-yellow-500',
    mockupType: 'reviews'
  }
];

const NEHA_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80";

function MockupProfile() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Creator Profile</span>
          <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">Verified</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <img src={NEHA_AVATAR} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow" />
          <div>
            <div className="font-black text-gray-900 text-sm flex items-center gap-1">
              Neha Kapoor
              <span className="text-[8px] text-blue-500">✓</span>
            </div>
            <div className="text-[10px] text-gray-400 font-semibold">@neha.creates</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-extrabold scale-[0.95]">Fashion</span>
          <span className="px-2 py-0.5 rounded bg-gray-200/60 text-gray-650 font-bold scale-[0.95]">Beauty</span>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-gray-100 mt-4 shadow-sm text-center">
          <div>
            <div className="font-black text-gray-800 text-xs">75K</div>
            <div className="text-[8px] text-gray-400 font-bold uppercase">Followers</div>
          </div>
          <div>
            <div className="font-black text-purple-600 text-xs">8.6%</div>
            <div className="text-[8px] text-gray-400 font-bold uppercase">Eng. Rate</div>
          </div>
          <div>
            <div className="font-black text-gray-800 text-xs">320+</div>
            <div className="text-[8px] text-gray-400 font-bold uppercase">Campaigns</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupChat() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Campaign Messages</span>
          <span className="text-[10px] font-black text-purple-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            FitLife Brands
          </span>
        </div>
        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center font-black text-purple-600 text-[8px] flex-shrink-0">FL</div>
            <div className="max-w-[80%] bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none font-bold text-gray-700 shadow-sm leading-relaxed">
              Hi Neha! Loved your profile. We'd love to work with you.
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[80%] bg-purple-600 text-white p-3 rounded-2xl rounded-tr-none font-black shadow-sm leading-relaxed">
              Hi! Thanks so much. Excited about this! 🌟
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupContract() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Campaign Agreement</span>
          <span className="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">Signed</span>
        </div>
        <div className="space-y-2 font-semibold">
          {[
            { label: 'Deliverables', val: '3 Instagram Reels' },
            { label: 'Timeline', val: '10 Days' },
            { label: 'Budget', val: '₹50,000' },
            { label: 'Payment Terms', val: '50% Advance + 50% on Delivery' }
          ].map((term) => (
            <div key={term.label} className="bg-white p-2 rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] flex justify-between items-center">
              <span className="text-gray-400">{term.label}</span>
              <span className="text-gray-800 font-extrabold text-[9px]">{term.val}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-100 mt-3">
        <div className="text-[8px] text-gray-400 font-bold uppercase">Signature</div>
        <div className="font-serif italic text-blue-600 text-[13px] font-bold">Neha Kapoor</div>
      </div>
    </div>
  );
}

function MockupPayments() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Payments Ledger</span>
          <span className="text-[8px] font-bold text-gray-400">Escrow Protected</span>
        </div>
        <div className="bg-purple-600 bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-3 rounded-xl border border-purple-500/10 shadow mb-3 text-center">
          <div className="text-[8px] text-purple-200 font-bold uppercase">Balance Withdrawn</div>
          <div className="text-sm font-black mt-0.5">₹3,45,000</div>
        </div>
        <div className="space-y-2">
          {[
            { label: 'FitLife Brands', type: 'Paid', amt: '₹50,000', labelClass: 'bg-green-50 text-green-700' },
            { label: 'Glow Skincare', type: 'Paid', amt: '₹40,000', labelClass: 'bg-green-50 text-green-700' },
            { label: 'Urbanic', type: 'In Escrow', amt: '₹35,000', labelClass: 'bg-amber-50 text-amber-700 animate-pulse' }
          ].map((tx, idx) => (
            <div key={idx} className="bg-white p-2 rounded-lg border border-gray-100 flex justify-between items-center shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
              <div>
                <span className="font-extrabold text-gray-800 block text-[9px]">{tx.label}</span>
                <span className={`text-[7px] font-black px-1 rounded ${tx.labelClass}`}>{tx.type}</span>
              </div>
              <span className="font-black text-gray-800">{tx.amt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Dynamic Scaled SVG Chart for Card 5 ---
function MockupAnalytics() {
  const [activePoint, setActivePoint] = useState<number | null>(4);

  const points = [
    { x: 15, y: 95, val: '250K' },
    { x: 70, y: 75, val: '540K' },
    { x: 125, y: 82, val: '720K' },
    { x: 180, y: 48, val: '950K' },
    { x: 225, y: 18, val: '1.2M' }
  ];

  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Growth Tracking</span>
          <span className="text-[10px] font-black text-purple-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            Live Analytics
          </span>
        </div>
        
        {/* Dynamic Animated Statistics */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <div className="text-[9px] text-gray-400 font-bold uppercase">Reach</div>
            <div className="text-sm font-black text-gray-850 mt-0.5">
              <CountUp end={1.2} suffix="M" />
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-center shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <div className="text-[9px] text-gray-400 font-bold uppercase">Profile Visits</div>
            <div className="text-sm font-black text-purple-600 mt-0.5">
              <CountUp end={24} suffix="K" />
            </div>
          </div>
        </div>
      </div>

      {/* SVG Interactive Line Graph (Bespoke, Beautiful, and Correctly Scaled) */}
      <div className="h-32 bg-white rounded-xl border border-gray-100 relative overflow-hidden flex items-end p-2">
        <svg className="w-full h-full" viewBox="0 0 240 120">
          {/* Grid lines */}
          <line x1="0" y1="20" x2="240" y2="20" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="0" y1="60" x2="240" y2="60" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="0" y1="100" x2="240" y2="100" stroke="#f1f5f9" strokeDasharray="3" />

          {/* Filled Area Gradient */}
          <defs>
            <linearGradient id="creatorChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Line Path Area */}
          <path 
            d="M 15 95 C 40 85, 55 75, 70 75 C 88 75, 108 82, 125 82 C 148 82, 162 48, 180 48 C 198 48, 215 18, 225 18 L 225 110 L 15 110 Z" 
            fill="url(#creatorChartGradient)"
          />

          {/* Sparkline Drawing Path */}
          <motion.path 
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            d="M 15 95 C 40 85, 55 75, 70 75 C 88 75, 108 82, 125 82 C 148 82, 162 48, 180 48 C 198 48, 215 18, 225 18" 
            fill="none" 
            stroke="#a855f7" 
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
                fill={activePoint === idx ? "#a855f7" : "#ffffff"} 
                stroke="#a855f7" 
                strokeWidth="2.5" 
              />
            </g>
          ))}
        </svg>

        {/* Floating Interactive Tooltip */}
        {activePoint !== null && (
          <div className="absolute top-2 left-2 bg-gray-900/90 text-[9px] font-black text-white px-2 py-1 rounded shadow pointer-events-none transition-all">
            Reach: {points[activePoint].val}
          </div>
        )}
      </div>
    </div>
  );
}

function MockupReviews() {
  return (
    <div className="w-full bg-slate-50 rounded-2xl border border-gray-155 p-5 font-sans text-xs flex flex-col justify-between h-full min-h-[260px] shadow-inner">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
          <span className="font-extrabold text-gray-800">Reviews & Portfolio</span>
          <span className="text-[8px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">Feedback</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-150 shadow-sm mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-gray-900">4.9</span>
            <div className="text-yellow-500 font-extrabold text-[11px] tracking-wide">★★★★★</div>
          </div>
          <div className="text-[9px] text-gray-400 font-bold mt-0.5">Based on 24 Verified Collaborations</div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
          <div className="flex justify-between items-center">
            <span className="font-extrabold text-purple-600 flex items-center gap-1">FitLife Brands <span className="text-[7px] text-blue-500">✓</span></span>
            <span className="text-[8px] text-gray-400 font-semibold">May 18</span>
          </div>
          <p className="text-[9.5px] text-gray-500 font-bold mt-1.5 leading-relaxed italic">
            "Amazing work! Delivered high quality Reels before time. Highly recommended!"
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CreatorCarousel() {
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
            <span className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-purple-600 bg-purple-50 border border-purple-100 mb-4">
              For Creators
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-black text-gray-900 leading-none tracking-tight mb-5">
              Why <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Creators</span> Love Influnet
            </h2>
            <p className="text-base sm:text-lg text-gray-500 font-semibold leading-relaxed max-w-2xl">
              Everything you need to grow, collaborate and get paid — all in one professional platform.
            </p>
          </div>

          {/* Apple-style Slider Nav Buttons */}
          <div className="hidden md:flex gap-3">
            <button
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                canScrollLeft 
                  ? 'border-gray-250 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
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
                  ? 'border-gray-250 bg-white text-gray-800 hover:bg-gray-50 shadow-sm active:scale-95' 
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
        {CREATOR_CARDS.map((card) => {
          return (
            <motion.div 
              key={card.id}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: false, margin: "-80px" }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
              className="w-[88vw] sm:w-[560px] md:w-[760px] flex-shrink-0 bg-white border border-gray-150 rounded-[2.5rem] p-8 md:p-12 flex flex-col md:flex-row gap-8 md:gap-10 justify-between shadow-[0_8px_30px_rgba(0,0,0,0.02)] snap-start hover:shadow-[0_25px_60px_rgba(0,0,0,0.06)] transition-all duration-500 hover:border-gray-200 min-h-[460px] md:min-h-[500px]"
              style={{
                scrollMarginLeft: leftOffset
              }}
            >
              {/* Left Details */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <span className={`inline-block text-6xl md:text-7xl font-black bg-gradient-to-r ${card.accent} bg-clip-text text-transparent opacity-85 mb-5`}>
                    {card.id}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight mb-4 tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-sm md:text-base text-gray-500 font-semibold leading-relaxed mb-8">
                    {card.description}
                  </p>
                </div>
                
                {/* Bullet Points */}
                <ul className="space-y-3.5 border-t border-gray-100 pt-6">
                  {card.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-650 font-bold leading-normal">
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
                {card.mockupType === 'profile' && <MockupProfile />}
                {card.mockupType === 'chat' && <MockupChat />}
                {card.mockupType === 'contract' && <MockupContract />}
                {card.mockupType === 'payments' && <MockupPayments />}
                {card.mockupType === 'analytics' && <MockupAnalytics />}
                {card.mockupType === 'reviews' && <MockupReviews />}
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
          className="bg-purple-50/40 border border-purple-100/70 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_8px_30px_rgba(147,51,234,0.015)]"
        >
          <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
            <div className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/20">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black text-gray-900 leading-tight">
                Everything you need to grow your creator journey.
              </h3>
              <p className="text-xs md:text-sm text-gray-500 font-semibold mt-1">
                Better collaborations. Professional workflow. Timely payments.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <Link
              href="/signup/influencer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-750 text-white font-black text-xs md:text-sm shadow-md shadow-purple-500/25 transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              Create Your Profile Now
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <span className="text-[10px] text-gray-400 font-bold">100% Free • No Credit Card Required</span>
          </div>
        </motion.div>
      </div>

    </section>
  );
}
