'use client';

import { useEffect } from 'react';
import { saveRole, type Role } from '@/lib/role';

// Landing directly on /creators or /business (an ad, a shared link) counts as
// choosing that side, so `/` sends the visitor back here next time.
export default function RememberRole({ role }: { role: Role }) {
  useEffect(() => saveRole(role), [role]);
  return null;
}
