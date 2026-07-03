'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const STATS = [
  { value: '10M+', label: 'Creators on Influnet', icon: '👥' },
  { value: '50K+', label: 'Brands Trust Us', icon: '🏢' },
  { value: '100%', label: 'Trusted Platform', icon: '🛡️' },
  { value: 'Global', label: 'Connecting Worldwide', icon: '🌐' },
];

export default function Vision() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl border-2 border-purple-400 p-8 lg:p-12 bg-gradient-to-br from-white to-purple-50/30"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5"
              >
                Our Vision
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl font-semibold text-gray-900 leading-tight tracking-tight mb-6"
              >
                Building the Future of<br />
                <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent font-semibold">
                  Influencer Marketing
                </span>
              </motion.h2>
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="space-y-3 mb-8"
              >
                <p className="text-lg text-gray-600 leading-relaxed">
                  To become the most trusted business platform connecting
                  influencers and brands globally.
                </p>
                <p className="text-lg text-gray-600 leading-relaxed">
                  A future where every creator manages their business
                  professionally.
                </p>
                <p className="text-lg text-gray-600 leading-relaxed">
                  A future where every collaboration begins with trust.
                </p>
                <p className="text-lg text-gray-600 leading-relaxed font-semibold">
                  A future powered by Influnet.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <Link
                  href="/signup/influencer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-full shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 hover:-translate-y-0.5 transition-all"
                >
                  Join Influnet Today
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </motion.div>
            </div>

            {/* Right Visual - World Map */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative h-80 lg:h-96 bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden flex items-center justify-center"
            >
              {/* World Map SVG */}
              <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 400 300" fill="none">
                <path d="M50 150 Q100 100 150 120 T250 110 T350 130" stroke="#ee3e96" strokeWidth="0.5" fill="none" opacity="0.3" />
                <path d="M30 180 Q80 140 130 160 T230 150 T330 170" stroke="#ee3e96" strokeWidth="0.5" fill="none" opacity="0.3" />
                <path d="M70 200 Q120 170 170 190 T270 180 T370 200" stroke="#ee3e96" strokeWidth="0.5" fill="none" opacity="0.3" />
                {/* Dots representing locations */}
                <circle cx="100" cy="140" r="3" fill="#ee3e96" opacity="0.4" />
                <circle cx="180" cy="120" r="3" fill="#ee3e96" opacity="0.4" />
                <circle cx="260" cy="130" r="3" fill="#ee3e96" opacity="0.4" />
                <circle cx="320" cy="150" r="3" fill="#ee3e96" opacity="0.4" />
                <circle cx="140" cy="170" r="3" fill="#ee3e96" opacity="0.4" />
                <circle cx="220" cy="160" r="3" fill="#ee3e96" opacity="0.4" />
              </svg>

              {/* Center Logo */}
              <div className="relative z-10 w-32 h-32 bg-pink-50 rounded-full flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <svg className="w-16 h-16" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="6" fill="#ee3e96" />
                    <circle cx="8" cy="12" r="3" fill="#ee3e96" opacity="0.6" />
                    <circle cx="32" cy="12" r="3" fill="#ee3e96" opacity="0.6" />
                    <circle cx="8" cy="28" r="3" fill="#ee3e96" opacity="0.6" />
                    <circle cx="32" cy="28" r="3" fill="#ee3e96" opacity="0.6" />
                    <line x1="20" y1="20" x2="8" y2="12" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                    <line x1="20" y1="20" x2="32" y2="12" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                    <line x1="20" y1="20" x2="8" y2="28" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                    <line x1="20" y1="20" x2="32" y2="28" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                  </svg>
                </motion.div>
              </div>

              {/* Floating connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 350">
                <motion.path
                  d="M200 175 L100 140"
                  stroke="#ee3e96"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                  opacity="0.3"
                />
                <motion.path
                  d="M200 175 L260 130"
                  stroke="#ee3e96"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 0.7 }}
                  opacity="0.3"
                />
                <motion.path
                  d="M200 175 L320 150"
                  stroke="#ee3e96"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 0.9 }}
                  opacity="0.3"
                />
                <motion.path
                  d="M200 175 L140 170"
                  stroke="#ee3e96"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 1.1 }}
                  opacity="0.3"
                />
                <motion.path
                  d="M200 175 L220 160"
                  stroke="#ee3e96"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 1.3 }}
                  opacity="0.3"
                />
              </svg>
            </motion.div>
          </div>

          {/* Stats Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-gray-100"
          >
            {STATS.map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-lg">
                  {stat.icon}
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
