import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Soft Light Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-pink-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[450px] text-center">
        {/* Logo */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-gray-900 tracking-tight">influnet</span>
          </Link>
        </div>

        {/* Apple-like Premium Card */}
        <div className="p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          {/* Custom Responsive SVG illustration */}
          <div className="flex justify-center mb-6">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#ee3e96" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>

          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">404</h1>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Page Not Found</h2>
          <p className="text-gray-400 font-semibold text-sm mb-8 leading-relaxed">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>

          <Link
            href="/dashboard"
            className="w-full bg-[#ee3e96] hover:bg-[#db2777] active:scale-[0.98] text-white font-extrabold rounded-2xl h-13 transition-all outline-none text-base shadow-sm shadow-pink-200 inline-flex items-center justify-center font-sans"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
