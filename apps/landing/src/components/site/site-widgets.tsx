'use client';

import { useState } from 'react';
import { ROLE_KEY, type Role } from '@/lib/role';
import AppCard from './app-card';
import HelpBot from './help-bot';

// The floating pieces every page carries: the mobile-app card (bottom left)
// and the help bot (bottom right). The card steps aside while the chat is open.
export default function SiteWidgets({ role }: { role?: Role }) {
  const [open, setOpen] = useState(false);
  // Pages without a side (the legal pages) use the one the visitor last picked.
  // Nothing side-specific renders until the chat opens, so hydration is safe.
  const [side] = useState<Role>(() => role ?? savedRole());

  return (
    <>
      <AppCard hidden={open} />
      <HelpBot key={side} role={side} open={open} onOpenChange={setOpen} />
    </>
  );
}

function savedRole(): Role {
  try {
    const saved = typeof window === 'undefined' ? null : localStorage.getItem(ROLE_KEY);
    if (saved === 'creator' || saved === 'business') return saved;
  } catch {}
  return 'creator';
}
