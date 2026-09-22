'use client';

import Link from 'next/link';
import { ROLE_PATH, saveRole, type Role } from '@/lib/role';

// Creator | Business pill in every header. Picking a side also remembers it,
// so `/` sends this visitor to that side next time.
export default function RoleSwitch({ current, tone = 'light' }: { current: Role; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const items: { role: Role; label: string }[] = [
    { role: 'creator', label: 'Creator' },
    { role: 'business', label: 'Business' },
  ];
  return (
    <nav
      aria-label="Choose your side"
      className={`flex rounded-full border p-1 ${dark ? 'border-white/15 bg-white/5' : 'border-line bg-card'}`}
    >
      {items.map((it) => {
        const active = it.role === current;
        return (
          <Link
            key={it.role}
            href={ROLE_PATH[it.role]}
            aria-current={active ? 'page' : undefined}
            onClick={() => saveRole(it.role)}
            className={`flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors sm:px-4 ${
              active
                ? dark
                  ? 'bg-white text-night'
                  : 'bg-ink text-white'
                : dark
                  ? 'text-night-soft hover:text-white'
                  : 'text-ink-soft hover:text-ink'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
