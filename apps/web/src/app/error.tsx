'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if available
    console.error('Unhandled app-level error:', error);
  }, [error]);

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
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">500</h1>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-gray-400 font-semibold text-sm mb-8 leading-relaxed">
            An unexpected error occurred while processing your request. Please try reloading the page or try again later.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => reset()}
              className="w-full bg-[#ee3e96] hover:bg-[#db2777] active:scale-[0.98] text-white font-extrabold rounded-2xl h-13 transition-all outline-none text-base shadow-sm shadow-pink-200 flex items-center justify-center font-sans cursor-pointer"
            >
              Try Again
            </button>
            <Link
              href="/dashboard"
              className="w-full bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-700 font-bold border border-gray-250 rounded-2xl h-13 transition-all outline-none text-base flex items-center justify-center font-sans"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
