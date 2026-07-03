'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DashboardSidebar from '@/components/dashboard/sidebar';
import DashboardHeader from '@/components/dashboard/header';
import { useNotificationStore } from '@/store/notification-store';
import { useAuthStore } from '@/store/auth-store';
import type { UserRole } from '@/types';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setUser, setToken, setLoading } = useAuthStore();
  const { setSummary } = useNotificationStore();
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const sb = createClient();

    const loadSession = async () => {
      try {
        const stored = localStorage.getItem('influnet_user');
        const token = localStorage.getItem('influnet_token');

        if (stored) {
          const user = JSON.parse(stored);
          setUser(user);
          setRole(user.role);
          setUserName(user.name || 'User');
          setAvatarUrl(user.avatarUrl || user.logoUrl || null);
          if (token) setToken(token);
        }

        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          setToken(session.access_token);
          localStorage.setItem('influnet_token', session.access_token);

          const { data: profile } = await sb
            .from('profiles')
            .select('role, name')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            const p = profile as { role: UserRole; name: string | null };
            setRole(p.role);
            setUserName(p.name || 'User');
            setUser({ ...session.user, role: p.role, name: p.name } as any);
          }
        } else if (!stored) {
          router.push('/login');
          return;
        }

        setLoading(false);
        setIsLoaded(true);

        const notifRes = await fetch('/api/notifications/summary');
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          setSummary(notifData);
        }
      } catch {
        setLoading(false);
        setIsLoaded(true);
      }
    };

    loadSession();
  }, []);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/influet_logo.png"
            alt="loading"
            className="w-12 h-12 flex-shrink-0 animate-pulse"
          />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <DashboardSidebar
        role={role || 'influencer'}
        unreadMessages={0}
        pendingRequests={0}
      />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <DashboardHeader userName={userName} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
