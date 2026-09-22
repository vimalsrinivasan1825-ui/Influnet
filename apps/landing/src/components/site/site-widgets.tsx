'use client';

import { useState, useSyncExternalStore } from 'react';
import { ROLE_KEY, type Role } from '@/lib/role';
import AppCard from './app-card';
import HelpBot from './help-bot';
import EarlyAccessBanner from './early-access-banner';

// The floating pieces every page carries: the help bot (bottom right). The banner
// and app card are temporarily disabled per user request and can be re-enabled later.
// Note: AppCard (mobile app promotion) is temporarily disabled per user request and can be enabled later.
export default function SiteWidgets({ role }: { role?: Role }) {
  const [open, setOpen] = useState(false);
  // Pages without a side (the legal pages) use the one the visitor last picked.
  // The server cannot know it, so it renders the creator side; a sync external
  // store tells React the browser's answer may differ, and React switches after
  // hydration instead of reporting a mismatch. (The chat stays mounted so it can
  // animate out, so its greeting is part of the first render.)
  const side = useSyncExternalStore(
    noSubscribe,
    () => role ?? savedRole(),
    () => role ?? 'creator',
  );

  return (
    <>
      {/* Mobile app card temporarily disabled — can be re-enabled later */}
      {false && <AppCard hidden={open} />}
      {/* Founder pass / early-access banner temporarily disabled — can be re-enabled later */}
      {false && <EarlyAccessBanner hidden={open} />}
      <HelpBot key={side} role={side} open={open} onOpenChange={setOpen} />
    </>
  );
}

// The saved side only changes when the visitor picks one, which navigates.
const noSubscribe = () => () => {};

function savedRole(): Role {
  try {
    const saved = localStorage.getItem(ROLE_KEY);
    if (saved === 'creator' || saved === 'business') return saved;
  } catch {}
  return 'creator';
}
