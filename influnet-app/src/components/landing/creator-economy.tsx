'use client';

import { useEffect, useRef } from 'react';

const STATS = [
  { value: '50M+', label: 'Creators Worldwide' },
  { value: '₹2,500Cr', label: 'Indian Creator Economy' },
  { value: '80%', label: 'Manage via DMs' },
  { value: '3x', label: 'Faster with Influnet' },
];

const FEATURES = [
  {
    title: 'Professional Profiles',
    description: 'Showcase your work, portfolio, and rates in one place.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: 'Smart Discovery',
    description: 'Find the right creators or brands with intelligent matching.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: 'Campaign Management',
    description: 'Track projects from pitch to payment in one pipeline.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
  {
    title: 'Secure Messaging',
    description: 'Communicate professionally with built-in chat and file sharing.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
];

export default function CreatorEconomy() {
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
      id="creator-economy"
      ref={sectionRef}
      className="relative bg-gray-50 py-20 lg:py-28"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="animate-on-scroll opacity-0 translate-y-5 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
            <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5">
              The Opportunity
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
              The Creator Economy is{' '}
              <span className="bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent">
                Booming
              </span>
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              India&apos;s creator economy is one of the fastest growing in the world.
              But most creators still manage their business through scattered tools.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-16">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className="animate-on-scroll text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm opacity-0 translate-y-5 transition-all duration-500 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0 hover:shadow-md hover:-translate-y-1"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="animate-on-scroll group p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-pink-100 transition-all duration-300 opacity-0 translate-y-5 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 mb-4 group-hover:bg-pink-100 transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
