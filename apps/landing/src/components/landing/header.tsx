'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { APP_URL } from '@/lib/site';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#09090b]/90 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-8 w-auto flex-shrink-0"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/#why-exists"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Why Us
            </Link>
            <Link
              href="/#opportunities"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              For Business
            </Link>
            <Link
              href="/#creator-economy"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              For Creators
            </Link>
            <Link
              href="/join"
              className="text-sm font-semibold text-[#ff078e] hover:text-[#ff4da6] transition-colors flex items-center gap-1"
            >
              Join as Creator
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href={`${APP_URL}/login`}
              className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
            >
              Log In
            </Link>
            <Link
              href={`${APP_URL}/signup`}
              className="text-sm font-semibold text-black px-5 py-2.5 rounded-xl bg-white shadow-lg shadow-white/10 hover:shadow-white/20 hover:-translate-y-0.5 transition-all"
            >
              Get Started
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-400 hover:text-white p-2"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/5 space-y-1">
            <Link
              href="/#why-exists"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
            >
              Why Us
            </Link>
            <Link
              href="/#opportunities"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
            >
              For Business
            </Link>
            <Link
              href="/#creator-economy"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
            >
              For Creators
            </Link>
            <Link
              href="/join"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm font-semibold text-[#ff078e] hover:bg-[#ff078e]/10 rounded-lg"
            >
              Join as Creator ✨
            </Link>
            <div className="border-t border-white/5 pt-3 mt-3 space-y-2">
              <Link
                href={`${APP_URL}/login`}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-gray-300 hover:text-white"
              >
                Log In
              </Link>
              <Link
                href={`${APP_URL}/signup`}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#ee3e96] to-[#f26e59] rounded-xl text-center"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
