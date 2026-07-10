'use client';

import { useEffect, useRef } from 'react';

const PAIN_POINTS = [
  { label: 'Instagram DMs', icon: '💬' },
  { label: 'WhatsApp Messages', icon: '📱' },
  { label: 'Emails', icon: '📧' },
  { label: 'Spreadsheets', icon: '📊' },
  { label: 'Manual Follow-ups', icon: '⏰' },
];

const BELIEFS = [
  'We believe creators deserve professional business infrastructure.',
  'We believe businesses deserve a better way to collaborate with creators.',
];

export default function WhyExists() {
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
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    const items = sectionRef.current?.querySelectorAll('.animate-on-scroll');
    items?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="why-exists"
      ref={sectionRef}
      className="relative overflow-hidden bg-white py-20 lg:py-28"
    >
      <div className="absolute -top-20 -left-10 w-96 h-96 bg-pink-50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-10 w-80 h-80 bg-orange-50 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[42fr_58fr] gap-10 lg:gap-14 items-center">
          <div className="text-center lg:text-left">
            <div className="animate-on-scroll opacity-0 translate-y-5 transition-all duration-700 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
              <span className="inline-flex px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 mb-5">
                Our Purpose
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
                Why{' '}
                <span className="bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent">
                  Influnet Exists
                </span>
              </h2>
              <p className="text-[17px] leading-relaxed text-gray-600 mb-3">
                The creator economy has grown rapidly.
              </p>
              <p className="text-[17px] leading-relaxed text-gray-600 mb-4">
                But the tools available to manage creator-business relationships
                haven&apos;t evolved at the same pace.
              </p>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mt-5">
                Most collaborations still happen through:
              </p>
            </div>
          </div>

          <div>
            <div className="animate-on-scroll opacity-0 translate-y-5 transition-all duration-700 delay-100 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0 p-6 sm:p-8 rounded-2xl bg-gray-50 border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
              <ul className="space-y-2.5 mb-7">
                {PAIN_POINTS.map((point, i) => (
                  <li
                    key={point.label}
                    className="animate-on-scroll flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 text-[15px] font-medium text-gray-700 opacity-0 translate-x-3 transition-all duration-500 hover:border-pink-200 hover:shadow-sm [&.animate-in]:opacity-100 [&.animate-in]:translate-x-0"
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-50 text-base flex-shrink-0">
                      {point.icon}
                    </span>
                    {point.label}
                  </li>
                ))}
              </ul>

              <p className="animate-on-scroll text-lg font-bold text-gray-900 mb-5 pb-5 border-b border-gray-200 opacity-0 translate-y-2.5 transition-all duration-500 delay-200 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
                Influnet was built to change that.
              </p>

              <div className="space-y-3 mb-5">
                {BELIEFS.map((belief, i) => (
                  <p
                    key={i}
                    className="animate-on-scroll px-4 py-3.5 rounded-xl bg-pink-50/50 border border-pink-100 text-[15px] leading-relaxed text-gray-600 opacity-0 translate-y-2.5 transition-all duration-500 [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0 before:content-[''] before:inline-block before:w-2 before:h-2 before:rounded-full before:bg-gradient-to-br before:from-pink-500 before:to-orange-500 before:mr-2.5 before:align-middle"
                    style={{ transitionDelay: `${280 + i * 60}ms` }}
                  >
                    {belief}
                  </p>
                ))}
              </div>

              <p className="animate-on-scroll text-xl font-extrabold bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent opacity-0 translate-y-2.5 transition-all duration-550 delay-[350ms] [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0">
                Influnet provides that infrastructure.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
