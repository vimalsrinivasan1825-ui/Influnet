'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const STATS = [
  { 
    value: '10M+', 
    label: 'Creators on the rise', 
    icon: (
      <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ), 
    bg: 'bg-pink-50/70 border border-pink-100/60' 
  },
  { 
    value: '50K+', 
    label: 'Businesses trust us', 
    icon: (
      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m9 0V9a2 2 0 00-2-2M5 21V11a2 2 0 002-2h2a2 2 0 002 2v10m-3-10v10m1-10v10m3-10v10M9 5h.01M15 5h.01M9 9h.01M15 9h.01M3 13h.01M3 17h.01M21 13h.01M21 17h.01M12 5H7v4h5V5z" />
      </svg>
    ), 
    bg: 'bg-purple-50/70 border border-purple-100/60' 
  },
  { 
    value: '100%', 
    label: 'Transparent platform', 
    icon: (
      <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v12m4.5-12v12m0-12a2 2 0 012-2h2a2 2 0 012 2v12m0-12a2 2 0 012-2h2a2 2 0 012 2v12m-9-3.5h9" />
      </svg>
    ), 
    bg: 'bg-pink-50/70 border border-pink-100/60' 
  },
  { 
    value: 'Global', 
    label: 'Opportunities for all', 
    icon: (
      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8" />
      </svg>
    ), 
    bg: 'bg-purple-50/70 border border-purple-100/60' 
  },
];

const CREATORS_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&h=80&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&h=80&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80"
];

export default function Vision() {
  return (
    <section className="py-16 lg:py-20 bg-white overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="rounded-[2.5rem] border border-gray-150 p-8 lg:p-12 bg-gradient-to-br from-white via-white to-purple-50/15 shadow-[0_15px_50px_rgba(0,0,0,0.015)]"
        >
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-7">
              <span className="inline-block px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5">
                Our Vision
              </span>
              
              <h2 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-black text-gray-900 leading-none tracking-tight mb-4">
                Building the Future of<br />
                <span className="bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                  Influencer Marketing
                </span>
              </h2>

              {/* Two colored bars */}
              <div className="flex gap-1.5 mb-8">
                <div className="w-6 h-1 bg-pink-500 rounded-full" />
                <div className="w-6 h-1 bg-purple-500 rounded-full" />
              </div>

              <div className="space-y-4 mb-8 font-semibold text-gray-500 leading-relaxed text-base sm:text-lg">
                <p>
                  To become the most trusted business platform connecting influencers and brands globally.
                </p>
                <p>
                  A future where every creator is empowered, every business grows predictably, and every collaboration begins with trust.
                </p>
                <p className="text-gray-900 font-extrabold">
                  A future powered by Influnet.
                </p>
              </div>

              <div className="mb-6">
                <Link
                  href="/signup/influencer"
                  className="inline-flex items-center gap-2 px-7 py-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-black rounded-2xl shadow-lg shadow-pink-500/20 hover:shadow-pink-500/30 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer text-xs md:text-sm"
                >
                  Join Influnet Today
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Right Visual: Correct Pedestal Image with Overlay Floating Badges and Premium Ambient Glow */}
            <div className="lg:col-span-5 flex justify-center items-center relative h-[360px] w-full max-w-[380px] mx-auto overflow-visible">
              
              {/* Premium Glow Gradient Backdrops */}
              <div className="absolute w-[240px] h-[240px] rounded-full bg-gradient-to-tr from-pink-400/20 via-purple-500/15 to-transparent blur-[55px] -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
              <div className="absolute w-[160px] h-[160px] rounded-full bg-pink-500/10 blur-[40px] -z-10 translate-y-[-20px]" />
              <div className="absolute w-[180px] h-[60px] rounded-full bg-purple-500/8 blur-[30px] -z-10 translate-y-[100px]" />

              {/* Correct visual mock pedestal image */}
              <img 
                src="/AZ8n2wqgm9kiSBAYwYSpdA-AZ8n2yRuC5hH5dk0gCMkFw.png" 
                alt="Influnet Vision Centerpiece" 
                className="w-[300px] h-auto object-contain select-none pointer-events-none drop-shadow-[0_10px_35px_rgba(236,72,153,0.03)] z-10"
              />

              {/* Floating Card 1: Verified Creators (Left) */}
              <motion.div 
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-[-25px] top-[90px] w-[120px] bg-white/90 backdrop-blur-md border border-white/60 p-2.5 rounded-2xl shadow-[0_12px_30px_rgba(236,72,153,0.06)] z-20 text-left font-sans"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-black text-gray-800 leading-none">Verified<br />Creators</span>
                  <span className="w-3.5 h-3.5 rounded-full bg-purple-100 flex items-center justify-center text-[7px] text-purple-600 font-bold border border-purple-200">✓</span>
                </div>
                <div className="flex items-center">
                  <div className="flex -space-x-1.5">
                    {CREATORS_AVATARS.map((av, i) => (
                      <img key={i} src={av} alt="avatar" className="w-5 h-5 rounded-full border border-white object-cover" />
                    ))}
                  </div>
                  <span className="text-[7.5px] font-black text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-md ml-1">+12K</span>
                </div>
              </motion.div>

              {/* Floating Card 2: Smart Collaboration (Right) */}
              <motion.div 
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                className="absolute right-[-25px] top-[105px] w-[120px] bg-white/90 backdrop-blur-md border border-white/60 p-2.5 rounded-2xl shadow-[0_12px_30px_rgba(168,85,247,0.06)] z-20 text-left font-sans"
              >
                <div className="text-[9px] font-black text-gray-855 mb-2 leading-none">Smart<br />Collaboration</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-4.5 h-4.5 rounded bg-purple-50 text-purple-600 flex items-center justify-center text-[8px] font-bold">💬</div>
                  <div className="w-4.5 h-4.5 rounded bg-pink-50 text-pink-600 flex items-center justify-center text-[8px] font-bold">📄</div>
                  <div className="w-4.5 h-4.5 rounded bg-green-50 text-green-600 flex items-center justify-center text-[8px] font-bold">✓</div>
                </div>
              </motion.div>

              {/* Floating Card 3: Measurable Results (Bottom) */}
              <motion.div 
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                className="absolute left-[110px] bottom-[15px] w-[120px] bg-white/90 backdrop-blur-md border border-white/60 p-2.5 rounded-2xl shadow-[0_12px_30px_rgba(168,85,247,0.06)] z-20 text-left font-sans"
              >
                <div className="text-[9px] font-black text-gray-855 leading-none mb-1.5">Measurable<br />Results</div>
                <div className="h-8 relative overflow-hidden flex items-end">
                  <svg className="w-full h-7" viewBox="0 0 100 40">
                    <motion.path 
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      transition={{ duration: 1.5, ease: 'easeInOut' }}
                      d="M 5 35 Q 25 25, 45 30 T 85 10" 
                      fill="none" 
                      stroke="#a855f7" 
                      strokeWidth="2.5" 
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </motion.div>

            </div>

          </div>

          {/* Stats Footer Row */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-gray-100/60">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${stat.bg} shadow-sm`}>
                  {stat.icon}
                </div>
                <div>
                  <div className="text-xl font-black text-gray-900 leading-none">{stat.value}</div>
                  <div className="text-[11px] text-gray-450 font-bold mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
