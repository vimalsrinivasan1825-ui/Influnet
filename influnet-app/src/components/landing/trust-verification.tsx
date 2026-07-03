'use client';

import { motion } from 'framer-motion';

const CREATOR_FEATURES = [
  {
    title: 'Social Platform Verification',
    description: 'Creators connect Instagram, YouTube, Facebook and other social platforms.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="2" y="2" width="20" height="20" rx="5" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="5" strokeWidth="1.5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Audience & Engagement Review',
    description: 'Follower quality, engagement rate and account activity are analyzed.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    title: 'Identity Confirmation',
    description: 'Mobile verification and profile validation help ensure authentic creators.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const BUSINESS_FEATURES = [
  {
    title: 'Business Profile Verification',
    description: 'Businesses provide company details, website and social presence information.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Business Validation',
    description: 'GST, registration details or company verification checks help reduce fake accounts.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Platform Moderation',
    description: 'Suspicious activity, spam and fake collaboration requests are continuously monitored.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

const BOTTOM_CARDS = [
  {
    title: 'Verified Profiles',
    description: 'Authentic creators & businesses',
    icon: (
      <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Trusted Collaborations',
    description: 'Quality-first collaboration ecosystem',
    icon: (
      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'Safe Communication',
    description: 'Reduced spam & fake requests',
    icon: (
      <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
];

export default function TrustVerification() {
  return (
    <section className="py-20 lg:py-28 bg-[#fafafa]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5"
          >
            Trust & Verification
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-gray-900 leading-tight tracking-tight mb-5"
          >
            How Are Creators &<br />
            Businesses{' '}
            <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent font-semibold">
              Verified?
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed"
          >
            Influnet maintains a trusted collaboration ecosystem through profile
            validation, business verification and authenticity checks.
          </motion.p>
        </div>

        {/* Two Columns */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* For Creators */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
          >
            <h3 className="text-sm font-bold text-pink-500 uppercase tracking-wider mb-6">For Creators</h3>
            <div className="space-y-6">
              {CREATOR_FEATURES.map((feature, i) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">{feature.title}</h4>
                    <p className="text-base text-gray-500 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* For Businesses */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
          >
            <h3 className="text-sm font-bold text-purple-500 uppercase tracking-wider mb-6">For Businesses</h3>
            <div className="space-y-6">
              {BUSINESS_FEATURES.map((feature, i) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500 flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">{feature.title}</h4>
                    <p className="text-base text-gray-500 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {BOTTOM_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                {card.icon}
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{card.title}</h4>
                <p className="text-xs text-gray-500">{card.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
