'use client';

import { useEffect } from 'react';
import { GATE_DONE } from '@/components/gate/gateway-events';

// Runs `start` once the gateway intro has handed over, or straight away when
// the page was opened directly.
export function onGateReady(start: () => void) {
  if (typeof document !== 'undefined' && document.documentElement.dataset.gate === 'on') {
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      window.clearTimeout(fallback);
      start();
    };
    // Never leave the hero hidden if an intro fails to hand over.
    const fallback = window.setTimeout(run, 12000);
    window.addEventListener(GATE_DONE, run, { once: true });
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener(GATE_DONE, run);
    };
  }
  start();
  return () => {};
}

export function useGateReady(start: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onGateReady(start), []);
}
