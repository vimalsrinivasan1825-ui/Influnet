'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

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
      className="relative overflow-hidden bg-[#090b11] py-24 sm:py-28 border-t border-white/[0.03]"
    >
      {/* Background Neon Glowing Orbs */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {/* Top center glow */}
        <div className="absolute inset-x-0 top-0 h-[350px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(236,72,153,0.18),transparent_70%)]" />
        {/* Bottom center glow */}
        <div className="absolute inset-x-0 bottom-0 h-[250px] bg-[radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(168,85,247,0.12),transparent_70%)]" />
        {/* Left ambient glow */}
        <div className="absolute left-[-10%] top-[20%] w-[300px] h-[300px] rounded-full bg-pink-500/5 blur-[90px]" />
        {/* Right ambient glow */}
        <div className="absolute right-[-10%] top-[30%] w-[300px] h-[300px] rounded-full bg-purple-500/5 blur-[90px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 text-center">
        {/* Badge & Title */}
        <div className="animate-on-scroll opacity-0 translate-y-6 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
          <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest uppercase text-pink-400 bg-pink-500/10 border border-pink-500/20 mb-6">
            Get Started Today
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-[3.5rem] font-black text-white leading-[1.1] tracking-tight mb-8">
            Join the{' '}
            <span className="bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent">
              Creator Business Revolution
            </span>
          </h2>
        </div>

        {/* Pillars Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-12">
          {PILLARS.map((text, i) => (
            <div
              key={text}
              className="animate-on-scroll p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md font-bold text-base sm:text-lg text-gray-200 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.05] hover:border-white/[0.12] hover:shadow-[0_15px_30px_rgba(0,0,0,0.2)] opacity-0 translate-y-3.5 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
              style={{ transitionDelay: `${80 + i * 60}ms` }}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 mr-3 align-middle" />
              {text}
            </div>
          ))}
        </div>

        {/* Welcome Section */}
        <div className="animate-on-scroll opacity-0 translate-y-3 transition-all duration-600 delay-300 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0 mb-10">
          <p className="text-2xl font-black text-white mb-2 tracking-tight">Welcome to Influnet.</p>
          <p className="text-base sm:text-lg text-gray-400 max-w-lg mx-auto leading-relaxed">
            The Business Operating System for{' '}
            <span className="text-gray-200 font-extrabold">Influencers and Brands</span>.
          </p>
        </div>

        {/* Action Buttons with Forced Colors */}
        <div className="animate-on-scroll flex flex-col sm:flex-row gap-4 justify-center items-center opacity-0 translate-y-3 transition-all duration-600 delay-[460ms] [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
          <Link
            href="/signup"
            className="w-full sm:w-auto min-w-[12rem] h-14 flex items-center justify-center px-8 rounded-2xl text-base font-black !text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 shadow-lg shadow-pink-500/15 hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto min-w-[12rem] h-14 flex items-center justify-center px-8 rounded-2xl text-base font-black !text-white border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer"
          >
            Book a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
