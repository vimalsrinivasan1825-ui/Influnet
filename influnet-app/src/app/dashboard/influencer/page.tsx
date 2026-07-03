'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  profile: {
    username: string;
    niche: string[];
    is_verified: boolean;
    headline: string | null;
    avatar_url: string | null;
    bio: string | null;
    location: string | null;
  };
  stats: {
    profile_views: number;
    collab_requests: number;
    active_discussions: number;
    active_projects: number;
    saved_by_businesses: number;
  };
  trends: {
    views_change: number;
    requests_change: number;
    discussions_change: number;
    projects_change: number;
    saved_change: number;
  };
}

export default function InfluencerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/influencer/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // Dashboard data unavailable
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="infl-idash">
        <div className="infl-idash-layout">
          <div className="infl-idash-main">
            <div className="infl-idash-topbar">
              <div className="infl-idash-topbar-title">
                <div className="h-8 w-64 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            </div>
            <div className="infl-idash-kpi-grid">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="infl-idash-kpi-card">
                  <div className="h-20 bg-gray-50 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    profile_views: 0,
    collab_requests: 0,
    active_discussions: 0,
    active_projects: 0,
    saved_by_businesses: 0,
  };

  const trends = data?.trends || {
    views_change: 0,
    requests_change: 0,
    discussions_change: 0,
    projects_change: 0,
    saved_change: 0,
  };

  return (
    <div className="infl-idash">
      <div className="infl-idash-layout">
        <div className="infl-idash-main">
          {/* Top Bar */}
          <div className="infl-idash-topbar">
            <div className="infl-idash-topbar-title">
              <h1>@{data?.profile?.username || 'your-username'}</h1>
              <p>
                {data?.profile?.is_verified && (
                  <span style={{ color: '#ee3e96', fontWeight: 700, marginRight: '0.5rem' }}>✓ Verified</span>
                )}
                {data?.profile?.niche?.join(' · ')}
                {data?.profile?.location && ` · ${data.profile.location}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Link href="/dashboard/settings" className="infl-bdash-btn infl-bdash-btn-primary">
                Edit Profile
              </Link>
              <Link href={`/influnet/${data?.profile?.username || ''}`} className="infl-bdash-btn infl-bdash-btn-outline">
                View Public Profile
              </Link>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="infl-idash-kpi-grid">
            <div className="infl-idash-kpi-card">
              <div className="infl-idash-kpi-top">
                <div className="infl-idash-kpi-icon infl-idash-kpi-icon--pink">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <div className="infl-idash-kpi-value">{stats.profile_views}</div>
              </div>
              <div className="infl-idash-kpi-label">Profile Views</div>
              {trends.views_change !== 0 && (
                <div className={`infl-idash-kpi-trend ${trends.views_change > 0 ? 'infl-idash-kpi-trend--up' : 'infl-idash-kpi-trend--down'}`}>
                  {trends.views_change > 0 ? '↑' : '↓'} {Math.abs(trends.views_change)}%
                </div>
              )}
            </div>

            <div className="infl-idash-kpi-card">
              <div className="infl-idash-kpi-top">
                <div className="infl-idash-kpi-icon infl-idash-kpi-icon--coral">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
                </div>
                <div className="infl-idash-kpi-value">{stats.collab_requests}</div>
              </div>
              <div className="infl-idash-kpi-label">Collab Requests</div>
              {trends.requests_change !== 0 && (
                <div className={`infl-idash-kpi-trend ${trends.requests_change > 0 ? 'infl-idash-kpi-trend--up' : 'infl-idash-kpi-trend--down'}`}>
                  {trends.requests_change > 0 ? '↑' : '↓'} {Math.abs(trends.requests_change)}%
                </div>
              )}
            </div>

            <div className="infl-idash-kpi-card">
              <div className="infl-idash-kpi-top">
                <div className="infl-idash-kpi-icon infl-idash-kpi-icon--blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                </div>
                <div className="infl-idash-kpi-value">{stats.active_discussions}</div>
              </div>
              <div className="infl-idash-kpi-label">Active Discussions</div>
              {trends.discussions_change !== 0 && (
                <div className={`infl-idash-kpi-trend ${trends.discussions_change > 0 ? 'infl-idash-kpi-trend--up' : 'infl-idash-kpi-trend--down'}`}>
                  {trends.discussions_change > 0 ? '↑' : '↓'} {Math.abs(trends.discussions_change)}%
                </div>
              )}
            </div>

            <div className="infl-idash-kpi-card">
              <div className="infl-idash-kpi-top">
                <div className="infl-idash-kpi-icon infl-idash-kpi-icon--green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/></svg>
                </div>
                <div className="infl-idash-kpi-value">{stats.active_projects}</div>
              </div>
              <div className="infl-idash-kpi-label">Active Projects</div>
              {trends.projects_change !== 0 && (
                <div className={`infl-idash-kpi-trend ${trends.projects_change > 0 ? 'infl-idash-kpi-trend--up' : 'infl-idash-kpi-trend--down'}`}>
                  {trends.projects_change > 0 ? '↑' : '↓'} {Math.abs(trends.projects_change)}%
                </div>
              )}
            </div>

            <div className="infl-idash-kpi-card">
              <div className="infl-idash-kpi-top">
                <div className="infl-idash-kpi-icon infl-idash-kpi-icon--purple">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/></svg>
                </div>
                <div className="infl-idash-kpi-value">{stats.saved_by_businesses}</div>
              </div>
              <div className="infl-idash-kpi-label">Saved by Brands</div>
              {trends.saved_change !== 0 && (
                <div className={`infl-idash-kpi-trend ${trends.saved_change > 0 ? 'infl-idash-kpi-trend--up' : 'infl-idash-kpi-trend--down'}`}>
                  {trends.saved_change > 0 ? '↑' : '↓'} {Math.abs(trends.saved_change)}%
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {/* About You */}
            <div className="infl-bdash-card">
              <div className="infl-bdash-card-head">
                <h3>About You</h3>
                <Link href="/dashboard/settings" className="infl-bdash-link">Edit</Link>
              </div>
              <div className="infl-bdash-prefs-block">
                <div className="infl-bdash-prefs-label">Niche</div>
                <div className="infl-bdash-tags">
                  {(data?.profile?.niche || ['Creator']).map((n) => (
                    <span key={n} className="infl-bdash-tag">{n}</span>
                  ))}
                </div>
              </div>
              {data?.profile?.bio && (
                <div className="infl-bdash-prefs-block">
                  <div className="infl-bdash-prefs-label">Bio</div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>{data.profile.bio}</p>
                </div>
              )}
              {data?.profile?.headline && (
                <div className="infl-bdash-prefs-block">
                  <div className="infl-bdash-prefs-label">Headline</div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>{data.profile.headline}</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="infl-bdash-card">
              <div className="infl-bdash-card-head">
                <h3>Quick Actions</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <Link href="/dashboard/requests" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                  <div className="infl-bdash-creator-avatar" style={{ background: '#fdf2f8', color: '#ee3e96' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
                  </div>
                  <div className="infl-bdash-creator-meta">
                    <strong>View Requests</strong>
                    <span>Review collaboration offers</span>
                  </div>
                </Link>
                <Link href="/dashboard/messages" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                  <div className="infl-bdash-creator-avatar" style={{ background: '#fff7ed', color: '#f26e59' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                  </div>
                  <div className="infl-bdash-creator-meta">
                    <strong>Messages</strong>
                    <span>Chat with brands</span>
                  </div>
                </Link>
                <Link href="/dashboard/projects" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                  <div className="infl-bdash-creator-avatar" style={{ background: '#f3f4f6', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/></svg>
                  </div>
                  <div className="infl-bdash-creator-meta">
                    <strong>Projects</strong>
                    <span>Track your campaigns</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
