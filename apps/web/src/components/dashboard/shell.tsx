'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DashboardSidebar from '@/components/dashboard/sidebar';
import DashboardHeader from '@/components/dashboard/header';
import { useNotificationStore } from '@/store/notification-store';
import { useAuthStore } from '@/store/auth-store';
import type { UserRole } from '@/types';
import { Clock, Shield } from 'lucide-react';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setUser, setToken, setLoading } = useAuthStore();
  const { setSummary } = useNotificationStore();
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

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

            // If business owner, check approval status
            if (p.role === 'business_owner') {
              const { data: bizProfile } = await sb
                .from('business_profiles')
                .select('approval_status')
                .eq('user_id', session.user.id)
                .single();

              if (bizProfile) {
                const bp = bizProfile as { approval_status: string };
                setApprovalStatus(bp.approval_status);

                // Gate: redirect pending businesses to an under-review page
                if (bp.approval_status === 'pending_review' && !window.location.pathname.includes('/admin')) {
                  // Let them stay but they'll see the pending review message instead of content
                }
              }
            }

            // Layout guard for dashboard routes
            const currentPath = window.location.pathname;
            if (p.role === 'influencer' && currentPath === '/dashboard') {
              router.push('/dashboard/influencer');
            } else if (p.role === 'business_owner' && currentPath === '/dashboard/influencer') {
              router.push('/dashboard');
            }
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

  // Show gate screen for unapproved businesses (pending review or rejected)
  if (isLoaded && role === 'business_owner' && (approvalStatus === 'pending_review' || approvalStatus === 'rejected')) {
    const isRejected = approvalStatus === 'rejected';
    return (
      <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: isRejected ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${isRejected ? '#fee2e2' : '#fde68a'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            {isRejected ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            ) : (
              <Clock size={36} style={{ color: '#d97706' }} />
            )}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
            {isRejected ? 'Account Not Approved' : 'Account Under Review'}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
            {isRejected
              ? 'Your business account registration was not approved. This decision was made by our review team. If you believe this is an error, please contact support.'
              : 'Your business account is currently being reviewed by our team. You\'ll receive access to the dashboard once your account is approved. This usually takes 1–2 business days.'}
          </p>
          <div style={{
            background: isRejected ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${isRejected ? '#fee2e2' : '#fde68a'}`,
            borderRadius: 12, padding: '12px 16px', marginBottom: 24,
            fontSize: 13, color: isRejected ? '#991b1b' : '#92400e', fontWeight: 600
          }}>
            {isRejected
              ? 'Your account has been rejected. Please contact support for assistance.'
              : 'Status: Pending Review — We\'ll notify you by email once approved.'}
          </div>
          <button
            onClick={async () => {
              const sb = createClient();
              await sb.auth.signOut();
              localStorage.clear();
              router.push('/login');
            }}
            style={{
              padding: '10px 20px', borderRadius: 12, border: '1px solid #e2e8f0',
              background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

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
