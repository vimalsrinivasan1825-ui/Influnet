'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface FloatingCardType {
  id: number;
  type: string;
  name: string;
  role?: string;
  followers?: string;
  avatar?: string;
  match?: string;
  status?: string;
  budget?: string;
  badge?: string;
  icon?: React.ReactNode;
  style: React.CSSProperties;
  delay: number;
  value?: string;
  avatars?: string[];
  more?: string;
  count?: string;
}

const FLOATING_CARDS: FloatingCardType[] = [
  {
    id: 1,
    type: 'creator',
    name: 'Olivia Bennett',
    role: 'Lifestyle Creator',
    followers: '320K Followers',
    avatar: 'https://i.pravatar.cc/150?img=1',
    match: 'Good Match',
    style: { top: '8%', right: '2%' },
    delay: 0,
  },
  {
    id: 2,
    type: 'campaign',
    name: 'Lume Skincare',
    status: 'Active Campaign',
    budget: 'Budget $25,000',
    badge: 'Live',
    icon: (
      <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>
    ),
    style: { top: '10%', left: '2%' },
    delay: 0.2,
  },
  {
    id: 3,
    type: 'creator',
    name: 'Wander Films',
    role: 'Travel Creator',
    followers: '450K Followers',
    avatar: 'https://i.pravatar.cc/150?img=3',
    match: 'Good Match',
    style: { top: '40%', left: '-5%' },
    delay: 0.4,
  },
  {
    id: 4,
    type: 'campaign',
    name: 'Aether Apparel',
    status: 'Active Campaign',
    budget: 'Budget $40,000',
    badge: 'Live',
    icon: (
      <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center flex-shrink-0 text-white font-bold text-base">
        A
      </div>
    ),
    style: { top: '36%', right: '-5%' },
    delay: 0.3,
  },
  {
    id: 5,
    type: 'campaign',
    name: 'Summer Essentials',
    status: '18 Creators · 3 Platforms',
    badge: 'In Progress',
    icon: (
      <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </div>
    ),
    style: { bottom: '18%', left: '0%' },
    delay: 0.5,
  },
  {
    id: 6,
    type: 'creator',
    name: 'Mia Lawson',
    role: 'Beauty Creator',
    followers: '280K Followers',
    avatar: 'https://i.pravatar.cc/150?img=5',
    match: 'Good Match',
    style: { bottom: '20%', right: '0%' },
    delay: 0.6,
  },
  {
    id: 7,
    type: 'analytics',
    name: 'Performance',
    value: '↑ 32.7%',
    style: { bottom: '12%', right: '44%' },
    delay: 0.7,
  },
  {
    id: 8,
    type: 'invites',
    name: 'Campaign Invites',
    status: '12 pending invites',
    avatars: ['https://i.pravatar.cc/150?img=8', 'https://i.pravatar.cc/150?img=9', 'https://i.pravatar.cc/150?img=10'],
    more: '+7',
    style: { bottom: '0%', left: '16%' },
    delay: 0.8,
  },
  {
    id: 9,
    type: 'match',
    name: 'New match',
    count: '8 creators',
    style: { top: '4%', left: '44%' },
    delay: 0.15,
  },
];

function CreatorCard({ card }: { card: FloatingCardType }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -6, 0],
      }}
      transition={{
        opacity: { duration: 0.6, delay: card.delay },
        scale: { duration: 0.6, delay: card.delay },
        y: { duration: 4 + card.delay, repeat: Infinity, ease: 'easeInOut', delay: card.delay + 1 },
      }}
      className="absolute hidden lg:flex items-start gap-3 bg-white rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 w-56 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow z-10"
      style={card.style}
    >
      <img
        src={card.avatar}
        alt={card.name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-grow min-w-0">
        <div className="text-xs font-semibold text-gray-900 truncate">{card.name}</div>
        <div className="text-[10px] text-gray-500 truncate">{card.role}</div>
        <div className="text-[10px] text-gray-400 truncate">{card.followers}</div>
        <div className="mt-1.5">
          <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-full border border-emerald-100">
            {card.match}
          </span>
        </div>
      </div>
      <svg className="w-3.5 h-3.5 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    </motion.div>
  );
}

function CampaignCard({ card }: { card: FloatingCardType }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -5, 0],
      }}
      transition={{
        opacity: { duration: 0.6, delay: card.delay },
        scale: { duration: 0.6, delay: card.delay },
        y: { duration: 4.5 + card.delay, repeat: Infinity, ease: 'easeInOut', delay: card.delay + 1.2 },
      }}
      className="absolute hidden lg:flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 w-56 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow z-10"
      style={card.style}
    >
      <div className="flex-shrink-0">
        {card.icon}
      </div>
      <div className="min-w-0 flex-grow">
        <div className="text-xs font-semibold text-gray-900 truncate">{card.name}</div>
        <div className="text-[10px] text-gray-500 truncate">{card.status}</div>
        {card.budget && <div className="text-[10px] text-gray-400 truncate">{card.budget}</div>}
      </div>
      <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-semibold rounded-full border border-green-100 flex-shrink-0 self-start">
        {card.badge}
      </span>
    </motion.div>
  );
}

function AnalyticsCard({ card }: { card: FloatingCardType }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 0.6, delay: card.delay },
        scale: { duration: 0.6, delay: card.delay },
        y: { duration: 3.5 + card.delay, repeat: Infinity, ease: 'easeInOut', delay: card.delay + 1.5 },
      }}
      className="absolute hidden lg:flex flex-col items-center bg-white rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow z-10"
      style={card.style}
    >
      <svg className="w-5 h-5 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <div className="text-[10px] text-gray-500">{card.name}</div>
      <div className="text-sm font-bold text-emerald-500">{card.value}</div>
    </motion.div>
  );
}

function InvitesCard({ card }: { card: FloatingCardType }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -5, 0],
      }}
      transition={{
        opacity: { duration: 0.6, delay: card.delay },
        scale: { duration: 0.6, delay: card.delay },
        y: { duration: 4.2 + card.delay, repeat: Infinity, ease: 'easeInOut', delay: card.delay + 1.3 },
      }}
      className="absolute hidden lg:flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow z-10 w-56"
      style={card.style}
    >
      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>
      <div className="min-w-0 flex-grow">
        <div className="text-xs font-semibold text-gray-900 truncate">{card.name}</div>
        <div className="text-[10px] text-gray-500 truncate">{card.status}</div>
      </div>
      <div className="flex -space-x-2 ml-1 flex-shrink-0">
        {card.avatars?.slice(0, 3).map((avatar, i) => (
          <img
            key={i}
            src={avatar}
            alt=""
            className="w-6 h-6 rounded-full border border-white object-cover"
          />
        ))}
        {card.more && (
          <div className="w-6 h-6 rounded-full border border-white bg-gray-100 flex items-center justify-center text-[9px] font-semibold text-gray-600">
            {card.more}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MatchCard({ card }: { card: FloatingCardType }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 0.6, delay: card.delay },
        scale: { duration: 0.6, delay: card.delay },
        y: { duration: 3.8 + card.delay, repeat: Infinity, ease: 'easeInOut', delay: card.delay + 1.4 },
      }}
      className="absolute hidden lg:flex flex-col items-center bg-white rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow z-10"
      style={card.style}
    >
      <svg className="w-5 h-5 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
      <div className="text-[10px] text-gray-500">{card.name}</div>
      <div className="text-[10px] font-semibold text-gray-700">{card.count}</div>
    </motion.div>
  );
}

const STATS = [
  { 
    value: '8M+', 
    label: 'Creators in India', 
    icon: (
      <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  { 
    value: '50M+', 
    label: 'Creators Worldwide', 
    icon: (
      <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    )
  },
  { 
    value: '₹3,375 Cr', 
    label: 'India Market by 2026', 
    icon: (
      <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
      </svg>
    )
  },
  { 
    value: '$32B+', 
    label: 'Global Market Size', 
    icon: (
      <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    )
  },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen bg-[#fafafa] overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/influet_logo.png"
            alt="influnet"
            className="h-8 w-auto flex-shrink-0"
          />
          <span className="text-2xl font-bold text-black tracking-tight">influnet</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href={`${process.env.NEXT_PUBLIC_APP_URL}/login`} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Log in
          </Link>
          <Link
            href={`${process.env.NEXT_PUBLIC_APP_URL}/signup`}
            className="px-5 py-2.5 bg-white text-black border border-gray-200 text-sm font-semibold rounded-full hover:bg-gray-50 transition-colors shadow-sm"
            style={{ color: 'black' }}
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative pt-32 pb-16 max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-8 items-center min-h-[70vh]">
          {/* Left Column - Text */}
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm mb-8"
            >
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span className="text-sm text-gray-600">The all-in-one platform for influencer marketing</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-5xl sm:text-6xl lg:text-[4.5rem] font-semibold text-gray-900 leading-[1.1] tracking-tight mb-6"
            >
              The Operating System
              <br />
              for{' '}
              <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent font-semibold">
                Influencer
              </span>
              <br />
              <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent font-semibold">
                Marketing
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-xl text-gray-500 max-w-lg mb-10 leading-relaxed font-normal"
            >
              Discover the right creators, build meaningful partnerships and track
              campaign performance from one simple platform.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap gap-4"
            >
              <Link
                href={`${process.env.NEXT_PUBLIC_APP_URL}/signup`}
                className="group inline-flex items-center gap-2 px-7 py-4 bg-black font-semibold rounded-full hover:bg-gray-900 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                style={{ color: 'white' }}
              >
                Start Collaborating
                <svg className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <button
                className="group inline-flex items-center gap-2 px-7 py-4 bg-white text-gray-900 font-semibold rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm"
                style={{ color: '#111827' }}
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                  <svg className="w-3.5 h-3.5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                Watch Demo
              </button>
            </motion.div>
          </div>

          {/* Right Column - Network Visualization */}
          <div className="relative h-[550px] lg:h-[650px] w-full flex items-center justify-center">
            {/* SVG Connection Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 800 600" preserveAspectRatio="none">
              {/* Top Left: Lume Skincare */}
              <path d="M 400 300 C 300 250, 220 180, 152 112" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="152" cy="112" r="4" fill="#a78bfa" />
 
              {/* Top Center: New match */}
              <path d="M 400 300 L 400 75" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="400" cy="75" r="4" fill="#60a5fa" />
 
              {/* Top Right: Olivia Bennett */}
              <path d="M 400 300 C 500 250, 580 180, 648 116" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="648" cy="116" r="4" fill="#34d399" />
 
              {/* Left: Wander Films */}
              <path d="M 400 300 C 300 300, 200 290, 128 284" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="128" cy="284" r="4" fill="#fbbf24" />
 
              {/* Right: Aether Apparel */}
              <path d="M 400 300 C 500 300, 600 280, 728 256" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="728" cy="256" r="4" fill="#f472b6" />
 
              {/* Bottom Left: Summer Essentials */}
              <path d="M 400 300 C 300 350, 200 400, 112 452" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="112" cy="452" r="4" fill="#fbbf24" />
 
              {/* Bottom Center-Left: Campaign Invites */}
              <path d="M 400 300 C 350 400, 280 480, 200 560" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="200" cy="560" r="4" fill="#60a5fa" />
 
              {/* Bottom Right: Mia Lawson */}
              <path d="M 400 300 C 500 340, 600 380, 688 424" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="688" cy="424" r="4" fill="#34d399" />
 
              {/* Bottom Center-Right: Performance */}
              <path d="M 400 300 C 400 360, 390 420, 384 480" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="384" cy="480" r="4" fill="#34d399" />
            </svg>

            {/* Center Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3, type: 'spring' }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 bg-white rounded-full shadow-[0_12px_60px_rgba(0,0,0,0.12)] border border-gray-100 flex flex-col items-center justify-center z-20"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img
                  src="/influet_logo.png"
                  alt="influnet"
                  className="w-14 h-auto mb-1 flex-shrink-0"
                />
              </motion.div>
              <span className="text-xs font-bold text-gray-900 tracking-tight">influnet</span>
            </motion.div>

            {/* Floating Cards */}
            {FLOATING_CARDS.map((card) => {
              switch (card.type) {
                case 'creator':
                  return <CreatorCard key={card.id} card={card} />;
                case 'campaign':
                  return <CampaignCard key={card.id} card={card} />;
                case 'analytics':
                  return <AnalyticsCard key={card.id} card={card} />;
                case 'invites':
                  return <InvitesCard key={card.id} card={card} />;
                case 'match':
                  return <MatchCard key={card.id} card={card} />;
                default:
                  return null;
              }
            })}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="border-t border-gray-200 bg-white"
      >
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.2 + i * 0.1 }}
                className="flex items-center gap-4"
              >
                <div className="flex-shrink-0">{stat.icon}</div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
