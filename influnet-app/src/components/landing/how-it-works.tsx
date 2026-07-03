'use client';

import { motion } from 'framer-motion';

const STEPS = [
  {
    number: '1',
    title: 'Discover Creators',
    description: 'Search creators based on niche, followers, engagement, location and platform. Our intelligent filtering helps you find the perfect match for your brand in seconds.',
    tags: ['#Aesthetic', '#GenZ', '#Lifestyle'],
    visual: 'search',
  },
  {
    number: '2',
    title: 'Connect & Chat',
    description: 'Send collaboration requests and directly communicate with creators in one place. No more messy email chains—keep all your conversations centralized and organized.',
    badge: '2.4k Messages Sent Today',
    visual: 'chat',
  },
  {
    number: '3',
    title: 'Finalize Collaboration',
    description: 'Discuss campaign ideas, timelines, deliverables and finalize the partnership. Our smart contract system ensures both parties are protected and aligned on expectations.',
    badge: '100% Secure Agreements',
    visual: 'contract',
  },
  {
    number: '4',
    title: 'Launch Campaign',
    description: 'Start collaborating and grow through meaningful creator partnerships. Track performance in real-time and scale your reach with the world\'s most creative talent.',
    cta: 'Get Started Now →',
    visual: 'performance',
  },
];

function SearchVisual() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100">
      <div className="text-sm font-semibold text-gray-900 mb-1">Smart Search</div>
      <div className="text-xs text-gray-400 mb-3">Filtering Creators</div>
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 mb-4">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-gray-400">Search by niche, username or keyword...</span>
        <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </div>
      <div className="text-xs font-medium text-gray-600 mb-2">Top Creators for you</div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <img key={i} src={`https://i.pravatar.cc/80?img=${i + 10}`} alt="" className="w-10 h-10 rounded-full object-cover" />
        ))}
      </div>
      <div className="text-xs font-semibold text-pink-500">View Profile →</div>
    </div>
  );
}

function ChatVisual() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <img src="https://i.pravatar.cc/80?img=5" alt="" className="w-8 h-8 rounded-full" />
        <div>
          <div className="text-sm font-semibold text-gray-900">Emma Lawson</div>
          <div className="text-[10px] text-green-500">Active now</div>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
          <p className="text-xs text-gray-700">Hey! Loved your work. Would love to collaborate on our new campaign.</p>
          <span className="text-[9px] text-gray-400 mt-1 block">10:30 AM</span>
        </div>
        <div className="bg-pink-50 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] ml-auto">
          <p className="text-xs text-gray-700">Hi! That sounds exciting. Let&apos;s discuss more.</p>
          <span className="text-[9px] text-gray-400 mt-1 block">10:32 AM</span>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
        <span className="text-sm text-gray-400">Type a message...</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function ContractVisual() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-900">Contract Overview</div>
        <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-semibold rounded-full">Secure</span>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Deliverables
          </div>
          <span className="text-xs font-medium text-gray-900">3 Posts + 2 Stories</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Timeline
          </div>
          <span className="text-xs font-medium text-gray-900">May 20 – May 30, 2024</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Compensation
          </div>
          <span className="text-xs font-medium text-gray-900">₹75,000</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Status
          </div>
          <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-semibold rounded-full">Confirmed</span>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-gray-900 mb-1">Collaboration Agreement</div>
        <div className="h-16 bg-gray-50 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function PerformanceVisual() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-900">Campaign Performance</div>
        <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-semibold rounded-full">Live</span>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Reach</div>
          <div className="text-sm font-bold text-gray-900">1.2M</div>
          <div className="text-[10px] text-green-500">↑ 24.5%</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Engagement</div>
          <div className="text-sm font-bold text-gray-900">8.7%</div>
          <div className="text-[10px] text-green-500">↑ 18.2%</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Clicks</div>
          <div className="text-sm font-bold text-gray-900">12.4K</div>
          <div className="text-[10px] text-green-500">↑ 32.1%</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Conversions</div>
          <div className="text-sm font-bold text-gray-900">2.3K</div>
          <div className="text-[10px] text-green-500">↑ 28.9%</div>
        </div>
      </div>
      <div className="h-24 relative">
        <svg className="w-full h-full" viewBox="0 0 300 80" fill="none">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ee3e96" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ee3e96" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 60 Q50 50 100 45 T200 30 T300 20 V80 H0 Z" fill="url(#chartGrad)" />
          <path d="M0 60 Q50 50 100 45 T200 30 T300 20" stroke="#ee3e96" strokeWidth="2" fill="none" />
        </svg>
      </div>
    </div>
  );
}

const VISUALS: Record<string, () => React.JSX.Element> = {
  search: SearchVisual,
  chat: ChatVisual,
  contract: ContractVisual,
  performance: PerformanceVisual,
};

export default function HowItWorks() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5"
          >
            Collaborate & Win
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-gray-900 leading-tight tracking-tight mb-5"
          >
            How{' '}
            <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent font-semibold">
              Collaborations
            </span>{' '}
            Work
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed"
          >
            Simplified workflows for the next generation of storytellers.
            Connect, create, and launch your dream campaigns in four simple steps.
          </motion.p>
        </div>

        {/* Steps */}
        <div className="space-y-8">
          {STEPS.map((step, i) => {
            const Visual = VISUALS[step.visual];
            const isEven = i % 2 === 0;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: 0.1 }}
                className={`grid lg:grid-cols-2 gap-8 items-center ${isEven ? '' : 'lg:direction-rtl'}`}
              >
                <div className={isEven ? 'order-1' : 'order-2'}>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {step.number === '1' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />}
                        {step.number === '2' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
                        {step.number === '3' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                        {step.number === '4' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
                      </svg>
                    </div>
                    <div>
                      <div className="text-5xl font-bold text-gray-200 mb-1">{step.number}</div>
                      <h3 className="text-2xl font-semibold text-gray-900">{step.title}</h3>
                    </div>
                  </div>
                  <p className="text-lg text-gray-500 leading-relaxed mb-4 ml-16">{step.description}</p>
                  {step.tags && (
                    <div className="flex gap-2 ml-16">
                      {step.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                  {step.badge && (
                    <div className="ml-16">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 text-xs font-semibold rounded-full border border-green-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {step.badge}
                      </span>
                    </div>
                  )}
                  {step.cta && (
                    <div className="ml-16">
                      <span className="text-sm font-semibold text-pink-500 cursor-pointer hover:text-pink-600">{step.cta}</span>
                    </div>
                  )}
                </div>
                <div className={isEven ? 'order-2' : 'order-1'}>
                  {Visual && <Visual />}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
