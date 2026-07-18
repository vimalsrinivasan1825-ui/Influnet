'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

const OPPORTUNITIES = [
  {
    title: 'Discover Creators',
    description: 'Search by niche, location, engagement rate, and budget to find the perfect match.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: 'Send Collaboration Requests',
    description: 'Reach out with your campaign brief, budget, and timeline.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
  {
    title: 'Manage Campaigns',
    description: 'Track content from planning to delivery with a visual pipeline.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    title: 'Build Relationships',
    description: 'Grow your network with verified creators and trusted brands.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

export default function Opportunities() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const items = sectionRef.current?.querySelectorAll('.animate-on-scroll');
    items?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="opportunities"
      ref={sectionRef}
      className="relative overflow-hidden bg-white py-20 lg:py-28"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-pink-50/50 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="animate-on-scroll opacity-0 translate-y-5 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
            <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5">
              For Business
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
              Find the Right{' '}
              <span className="bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent">
                Creators
              </span>
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Everything you need to discover, hire, and manage creators for your campaigns.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mb-12">
          {OPPORTUNITIES.map((opp, i) => (
            <div
              key={opp.title}
              className="animate-on-scroll group p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-pink-200 hover:shadow-md transition-all duration-300 opacity-0 translate-y-5 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 mb-4 group-hover:bg-pink-100 transition-colors">
                {opp.icon}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{opp.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {opp.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href={`${process.env.NEXT_PUBLIC_APP_URL}/signup/business`}
            className="inline-flex px-8 py-3.5 rounded-full text-base font-bold text-white bg-gray-900 shadow-lg hover:bg-gray-800 hover:-translate-y-0.5 transition-all"
          >
            Join as Business
          </Link>
        </div>
      </div>
    </section>
  );
}
