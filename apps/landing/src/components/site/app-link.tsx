'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import PhoneShowcase from './phone-mock';
import StoreBadges from './store-badges';
import { APP_LIVE, APP_STORE_URL, PLAY_STORE_URL } from './links';

export default function AppLink() {
  // Phones skip this page and land on their own store listing.
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const target = ios ? APP_STORE_URL : /Android/.test(ua) ? PLAY_STORE_URL : null;
    if (target) window.location.replace(target);
  }, []);

  return (
    <main
      data-tone="dark"
      className="relative flex min-h-dvh items-center overflow-hidden bg-night py-16 text-white"
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-20 blur-[140px]" />
      <div className="relative mx-auto grid w-full max-w-[1080px] items-center gap-14 px-4 sm:px-8 md:grid-cols-[1.1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-night-soft transition-colors hover:text-white">
            <ArrowLeft className="size-4" /> influnet.io
          </Link>
          <div className="mt-10 flex items-center gap-3">
            <LogoMark size={40} />
            <span className="font-display text-3xl font-bold tracking-[-0.02em]">influnet</span>
          </div>
          <h1 className="mt-6 font-display text-[44px] font-bold leading-[1] tracking-[-0.04em] sm:text-6xl">
            {APP_LIVE ? 'Get the Influnet app.' : 'The Influnet app is almost here.'}
          </h1>
          <p className="mt-5 max-w-[460px] text-lg leading-relaxed text-night-soft">
            Brand requests, messages and every project stage on your phone, with a notification the moment something
            needs you.
          </p>
          <StoreBadges className="mt-9" />
          {!APP_LIVE && (
            <p className="mt-4 text-sm text-night-soft">
              Until then, everything works on the web —{' '}
              <Link href="/" className="font-semibold text-brand hover:underline">
                start there
              </Link>{' '}
              and the same account signs you in to the app.
            </p>
          )}
        </div>
        {/* Both sides of the app, so the difference shows: creator in front. */}
        <div className="relative flex justify-center">
          <PhoneShowcase role="business" width={250} pushes={false} className="absolute left-1/2 top-8 hidden translate-x-[4%] rotate-[6deg] opacity-90 md:block" />
          <PhoneShowcase role="creator" width={280} pushes={false} className="relative md:-translate-x-[38%] md:-rotate-[3deg]" />
        </div>
      </div>
    </main>
  );
}
