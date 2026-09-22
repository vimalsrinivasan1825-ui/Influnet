'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Smartphone, X } from 'lucide-react';
import { onGateReady } from '@/components/motion/use-gate-ready';
import StoreBadges from './store-badges';
import { APP_LINK, APP_LIVE } from './links';

const SEEN_KEY = 'influnet.app-card.dismissed';
const DELAY_MS = 3500;

// "Influnet is on your phone too" — shown once a visitor has settled on the
// page (after the intro), until they close it. Remembered per browser.
export default function AppCard({ hidden }: { hidden: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      // Blocked storage: show it, it just won't be remembered.
    }
    let timer = 0;
    const stop = onGateReady(() => {
      timer = window.setTimeout(() => {
        setMounted(true);
        // A timer, not rAF: rAF never fires in a hidden tab or pane.
        window.setTimeout(() => setShown(true), 30);
      }, DELAY_MS);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setShown(false);
    window.setTimeout(() => setMounted(false), 300);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
  };

  // Scroll to this page's app section when it has one, otherwise go to /app.
  const seeApp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const section = document.getElementById('app');
    if (section) {
      e.preventDefault();
      section.scrollIntoView({ behavior: 'smooth' });
    }
    dismiss();
  };

  if (!mounted) return null;
  const visible = shown && !hidden;

  return (
    <aside
      aria-label="Influnet mobile app"
      className={`fixed bottom-4 left-3 right-[5.25rem] z-[55] rounded-3xl bg-night p-4 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-white/10 transition-[opacity,translate] duration-300 ease-out sm:bottom-6 sm:left-6 sm:right-auto sm:w-[360px] sm:p-5 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-night-soft transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3.5 pr-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
          <Smartphone className="size-5" />
        </span>
        <div>
          <p className="font-display text-[17px] font-bold leading-tight">Influnet is on your phone too</p>
          <p className="mt-1 text-[13.5px] leading-snug text-night-soft">
            {APP_LIVE
              ? 'Requests, messages and sign-offs, straight to your notifications.'
              : 'Coming soon to iOS and Android: requests, messages and sign-offs in your pocket.'}
          </p>
        </div>
      </div>
      {APP_LIVE ? (
        <StoreBadges size="sm" className="mt-4" />
      ) : (
        <a
          href={APP_LINK}
          onClick={seeApp}
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-night transition-colors hover:bg-magenta-tint"
        >
          See the app <ArrowRight className="size-4" />
        </a>
      )}
    </aside>
  );
}
