'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

const PILLARS = [
  'Manage Opportunities.',
  'Build Relationships.',
  'Run Campaigns.',
  'Grow Your Influence.',
];

export default function Cta() {
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
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    const items = sectionRef.current?.querySelectorAll('.animate-on-scroll');
    items?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-gray-900 py-20 sm:py-24"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(238,62,150,0.15),transparent_70%)]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 text-center">
        <div className="animate-on-scroll opacity-0 translate-y-6 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
          <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-white bg-white/10 border border-white/20 mb-6">
            Get Started Today
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-[3.5rem] font-semibold text-white leading-tight tracking-tight mb-8">
            Join the{' '}
            <span className="bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent font-semibold">
              Creator Business Revolution
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-10">
          {PILLARS.map((text, i) => (
            <div
              key={text}
              className="animate-on-scroll p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur font-semibold text-base sm:text-lg text-gray-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:border-white/20 opacity-0 translate-y-3.5 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
              style={{ transitionDelay: `${80 + i * 60}ms` }}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-pink-400 to-orange-400 mr-2 align-middle" />
              {text}
            </div>
          ))}
        </div>

        <div className="animate-on-scroll opacity-0 translate-y-3 transition-all duration-600 delay-300 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
          <p className="text-2xl font-bold text-white mb-2">Welcome to Influnet.</p>
          <p className="text-lg text-gray-400 mb-8">
            <strong className="text-gray-200 font-semibold">
              The Business Operating System for Influencers and Brands.
            </strong>
          </p>
        </div>

        <div className="animate-on-scroll flex flex-col sm:flex-row gap-4 justify-center items-center opacity-0 translate-y-3 transition-all duration-600 delay-[460ms] [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
          <Link
            href="/signup/influencer"
            className="w-full sm:w-auto min-w-[12rem] h-14 flex items-center justify-center px-8 rounded-full text-lg font-semibold text-white bg-white hover:bg-gray-100 transition-all"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto min-w-[12rem] h-14 flex items-center justify-center px-8 rounded-full text-lg font-semibold text-white border border-white/30 hover:bg-white/10 transition-all"
          >
            Book a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
