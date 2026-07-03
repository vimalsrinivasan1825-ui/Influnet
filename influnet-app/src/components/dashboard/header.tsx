'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/store/notification-store';
import { useAuthStore } from '@/store/auth-store';

interface DashboardHeaderProps {
  userName: string;
  avatarUrl?: string | null;
}

export default function DashboardHeader({ userName, avatarUrl }: DashboardHeaderProps) {
  const router = useRouter();
  const { summary } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      const sb = createClient();
      await sb.auth.signOut();
      logout();
      router.push('/login');
    } catch {
      logout();
      router.push('/login');
    }
  };

  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-[#f1f5f9] flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ee3e96] to-[#f26e59] flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
          </Link>
        </div>
        <h1 className="text-sm text-[#64748b] hidden sm:block">
          Welcome back, <span className="text-[#020617] font-semibold">{userName}</span>
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/messages"
          className="relative p-2 rounded-lg text-[#9ca3af] hover:text-[#020617] hover:bg-[#f8fafc] transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          {summary.unread_messages_count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ee3e96] text-[9px] font-bold text-white flex items-center justify-center">
              {summary.unread_messages_count > 9 ? '9+' : summary.unread_messages_count}
            </span>
          )}
        </Link>

        <Link
          href="/dashboard/requests"
          className="relative p-2 rounded-lg text-[#9ca3af] hover:text-[#020617] hover:bg-[#f8fafc] transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {summary.pending_requests_count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#f26e59] text-[9px] font-bold text-white flex items-center justify-center">
              {summary.pending_requests_count > 9 ? '9+' : summary.pending_requests_count}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-[#f1f5f9]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ee3e96]/20 to-[#f26e59]/15 flex items-center justify-center text-sm font-semibold text-[#020617] overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
            ) : (
              userName.charAt(0).toUpperCase()
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-[#64748b] hover:text-[#020617] transition-colors hidden sm:block"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
