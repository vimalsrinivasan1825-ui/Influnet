'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { EARLY_ACCESS_URL } from './links';

export default function EarlyAccessBanner({ hidden = false }: { hidden?: boolean } = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if dismissed previously during this session
    try {
      const dismissed = sessionStorage.getItem('influnet_founder_banner_dismissed');
      if (dismissed === 'true') return;
    } catch {
      // ignore storage errors
    }

    // Delay appearance by 3.5 seconds for natural arrival feel
    const timer = setTimeout(() => {
      setVisible(true);
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem('influnet_founder_banner_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {visible && !hidden && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="fixed bottom-4 left-3 right-[5.25rem] z-[55] rounded-2xl bg-[#120d1a]/95 border border-[#ff078e]/35 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(255,7,142,0.2)] backdrop-blur-xl text-white selection:bg-[#ff078e] sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-sm sm:w-[380px]"
        >
          {/* Close button */}
          <button
            onClick={dismiss}
            aria-label="Dismiss early access invitation"
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-start gap-3.5">
            {/* Mini Pass Icon */}
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-[#ff078e] to-[#7c3aed] flex-shrink-0 flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,7,142,0.5)]">
              <Sparkles className="w-5 h-5" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#0095f6] border border-black flex items-center justify-center text-[7px] font-bold">
                ✓
              </div>
            </div>

            <div className="flex-1 pr-4">
              <div className="inline-flex items-center gap-1.5 text-[9.5px] font-mono font-bold tracking-widest text-[#ff078e] uppercase mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff078e] animate-ping" />
                Limited Genesis Spots
              </div>
              <h4 className="font-extrabold text-sm text-white tracking-tight leading-snug">
                Be the 1st to use Influnet
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">
                Claim your official Founder Pass for 1 year of unlimited creator collabs.
              </p>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400 font-mono">Free · Instant mint</span>
            <a
              href={EARLY_ACCESS_URL}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#ff078e] hover:bg-[#d6358a] text-white text-xs font-bold transition-all shadow-md shadow-[#ff078e]/30 group"
            >
              Claim Pass{' '}
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
