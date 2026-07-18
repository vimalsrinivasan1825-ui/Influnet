'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

const PERKS = [
  {
    title: 'Verified Profile',
    description: 'Get a verified badge that builds trust with brands.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    title: 'Professional Dashboard',
    description: 'Track your views, requests, and active projects.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    title: 'Direct Brand Deals',
    description: 'Get collaboration requests from top brands directly.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    title: 'Secure Payments',
    description: 'Track payments and invoices for every campaign.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
];

export default function Verified() {
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
      id="verified"
      ref={sectionRef}
      className="relative overflow-hidden bg-gray-50 py-20 lg:py-28"
    >
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-pink-50 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="animate-on-scroll opacity-0 translate-y-5 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
              <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5">
                For Creators
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
                Get{' '}
                <span className="bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent">
                  Verified
                </span>{' '}
                & Grow
              </h2>
              <p className="text-lg text-gray-500 mb-8 leading-relaxed">
                Build your professional presence. Get discovered by top brands.
                Manage your creator business like a pro.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {PERKS.map((perk, i) => (
                <div
                  key={perk.title}
                  className="animate-on-scroll p-5 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-pink-100 transition-all duration-300 opacity-0 translate-y-5 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center text-pink-500 mb-3">
                    {perk.icon}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">
                    {perk.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {perk.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-on-scroll opacity-0 translate-y-8 transition-all duration-700 delay-200 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
            <div className="relative p-8 rounded-3xl bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.08)]">
              <div className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 text-xs font-bold text-white shadow-lg">
                Verified Creator
              </div>
              <div className="flex items-center gap-4 mb-6 mt-2">
                <img
                  src="https://i.pravatar.cc/150?img=1"
                  alt="Creator"
                  className="w-16 h-16 rounded-2xl object-cover"
                />
                <div>
                  <div className="text-lg font-bold text-gray-900">Priya Sharma</div>
                  <div className="text-sm text-gray-500">Fashion & Lifestyle</div>
                  <div className="flex items-center gap-1 mt-1">
                    <svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs text-pink-500 font-semibold">Verified</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3 rounded-xl bg-gray-50">
                  <div className="text-lg font-bold text-gray-900">125K</div>
                  <div className="text-xs text-gray-500">Followers</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-gray-50">
                  <div className="text-lg font-bold text-gray-900">4.8%</div>
                  <div className="text-xs text-gray-500">Engagement</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-gray-50">
                  <div className="text-lg font-bold text-gray-900">47</div>
                  <div className="text-xs text-gray-500">Campaigns</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-pink-50 text-pink-600 border border-pink-100">
                  Fashion
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-600 border border-orange-100">
                  Lifestyle
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  Reels
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  Stories
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-12">
          <Link
            href={`${process.env.NEXT_PUBLIC_APP_URL}/signup/influencer`}
            className="inline-flex px-8 py-3.5 rounded-full text-base font-bold text-white bg-gray-900 shadow-lg hover:bg-gray-800 hover:-translate-y-0.5 transition-all"
          >
            Join as Creator
          </Link>
        </div>
      </div>
    </section>
  );
}
