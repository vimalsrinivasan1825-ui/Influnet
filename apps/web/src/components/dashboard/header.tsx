'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/store/notification-store';
import { useAuthStore } from '@/store/auth-store';
import { useEffect, useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface DashboardHeaderProps {
  userName: string;
  avatarUrl?: string | null;
}

export default function DashboardHeader({ userName, avatarUrl }: DashboardHeaderProps) {
  const router = useRouter();
  const { summary, notifications, unread_notifications_count, setNotifications, markAsRead } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    // Fetch initial notifications
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications');
        const json = await res.json();
        if (json.data) {
          setNotifications(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };
    fetchNotifications();
  }, [setNotifications]);

  useEffect(() => {
    // Close dropdown on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleNotifications = async () => {
    setShowNotifications((prev) => !prev);
    
    // Mark all currently unread notifications as read when opening
    if (!showNotifications && unread_notifications_count > 0) {
      const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
      if (unreadIds.length > 0) {
        // Optimistic update
        markAsRead(unreadIds);
        
        try {
          await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: unreadIds })
          });
        } catch (err) {
          console.error('Failed to mark notifications as read', err);
        }
      }
    }
  };

  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-[#f1f5f9] flex items-center justify-between px-4 sm:px-6 z-40 relative">
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

        {/* Notifications Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleNotifications}
            className={`relative p-2 rounded-lg transition-all ${
              showNotifications ? 'bg-[#f8fafc] text-[#020617]' : 'text-[#9ca3af] hover:text-[#020617] hover:bg-[#f8fafc]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unread_notifications_count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#f26e59] text-[9px] font-bold text-white flex items-center justify-center">
                {unread_notifications_count > 9 ? '9+' : unread_notifications_count}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-[#f1f5f9] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
                <h3 className="font-semibold text-[#020617] text-sm">Notifications</h3>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#9ca3af]">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <Link
                      key={notif.id}
                      href={notif.link || '#'}
                      onClick={() => setShowNotifications(false)}
                      className={`block px-4 py-3 hover:bg-[#f8fafc] border-b border-[#f1f5f9] last:border-0 transition-colors ${
                        !notif.read_at ? 'bg-[#f8fafc]/50' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-[#020617] mb-0.5">{notif.title}</p>
                      <p className="text-xs text-[#64748b] mb-1 line-clamp-2">{notif.body}</p>
                      <span className="text-[10px] text-[#9ca3af] font-medium uppercase tracking-wider">
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
