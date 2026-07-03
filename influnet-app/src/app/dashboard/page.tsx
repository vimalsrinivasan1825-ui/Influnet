'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  profile: {
    company_name: string;
    industry: string;
    tagline: string | null;
    approval_status: string;
    username: string | null;
    logo_url: string | null;
  };
  stats: {
    saved_creators: number;
    requests_sent: number;
    requests_accepted: number;
    active_projects: number;
    project_spend: number;
    profile_views: number;
  };
  pipeline: {
    viewed: number;
    contacted: number;
    discussing: number;
    negotiation: number;
    active: number;
    completed: number;
  };
}

export default function BusinessDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/business/dashboard');
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
      <div className="infl-bdash infl-bdash-loading">
        <div className="infl-bdash-skeleton">
          <div className="infl-bdash-sk-hero" />
          <div className="infl-bdash-sk-title" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="infl-bdash-sk-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    saved_creators: 0,
    requests_sent: 0,
    requests_accepted: 0,
    active_projects: 0,
    project_spend: 0,
    profile_views: 0,
  };

  const pipeline = data?.pipeline || {
    viewed: 0,
    contacted: 0,
    discussing: 0,
    negotiation: 0,
    active: 0,
    completed: 0,
  };

  return (
    <div className="infl-bdash">
      <div className="infl-bdash-bento">
        {/* Hero Header */}
        <div className="infl-bdash-hero-header">
          <div className="infl-bdash-hero-intro">
            <p className="infl-bdash-hero-eyebrow">Business Dashboard</p>
            <h1>{data?.profile?.company_name || 'Your Company'}</h1>
            <div className="infl-bdash-status-pills">
              {data?.profile?.approval_status === 'approved' && (
                <span className="infl-bdash-status-pill infl-bdash-status-pill--pink">Verified</span>
              )}
              {data?.profile?.approval_status === 'pending_review' && (
                <span className="infl-bdash-status-pill infl-bdash-status-pill--warn">Pending Review</span>
              )}
              {data?.profile?.industry && (
                <span className="infl-bdash-status-pill infl-bdash-status-pill--muted">{data.profile.industry}</span>
              )}
            </div>
          </div>
          <div className="infl-bdash-hero-tools">
            <div className="infl-bdash-header-metrics">
              <div className="infl-bdash-header-metric-chip">
                <span className="infl-bdash-header-metric-value">{stats.requests_sent}</span>
                <span className="infl-bdash-header-metric-label">Requests</span>
              </div>
              <div className="infl-bdash-header-metric-chip">
                <span className="infl-bdash-header-metric-value">{stats.active_projects}</span>
                <span className="infl-bdash-header-metric-label">Active</span>
              </div>
            </div>
            <div className="infl-bdash-hero-actions-row">
              <Link href="/dashboard/discover" className="infl-bdash-btn infl-bdash-btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                Discover Creators
              </Link>
              <button className="infl-bdash-btn infl-bdash-btn-outline">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Export
              </button>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="infl-bdash-kpi-head">
          <h3>Overview</h3>
        </div>
        <div className="infl-bdash-kpi-grid">
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon pink">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">{stats.saved_creators}</div>
            <div className="infl-bdash-kpi-label">Saved Creators</div>
          </div>
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon coral">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">{stats.requests_sent}</div>
            <div className="infl-bdash-kpi-label">Requests Sent</div>
          </div>
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon green">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">{stats.requests_accepted}</div>
            <div className="infl-bdash-kpi-label">Accepted</div>
          </div>
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon blue">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">{stats.active_projects}</div>
            <div className="infl-bdash-kpi-label">Active Projects</div>
          </div>
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon purple">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">{stats.profile_views}</div>
            <div className="infl-bdash-kpi-label">Profile Views</div>
          </div>
          <div className="infl-bdash-kpi">
            <div className="infl-bdash-kpi-icon orange">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div className="infl-bdash-kpi-value">₹{stats.project_spend > 0 ? `${(stats.project_spend / 1000).toFixed(0)}K` : '0'}</div>
            <div className="infl-bdash-kpi-label">Total Spend</div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="infl-bdash-master-grid">
          {/* Brand Bento Card */}
          <div className="infl-bdash-brand-bento">
            <div className="infl-bdash-brand-bento-visual">
              <div className="infl-bdash-brand-logo-frame">
                {data?.profile?.logo_url ? (
                  <img src={data.profile.logo_url} alt={data.profile.company_name} className="infl-bdash-brand-logo-img" />
                ) : (
                  <div className="infl-bdash-brand-logo-fallback">
                    {(data?.profile?.company_name || 'C').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="infl-bdash-brand-logo-overlay">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/></svg>
                  Upload Logo
                </div>
              </div>
            </div>
            <h3 className="infl-bdash-brand-name">{data?.profile?.company_name || 'Your Company'}</h3>
            <p className="infl-bdash-brand-tagline">{data?.profile?.tagline || data?.profile?.industry || 'Business Owner'}</p>
            <div className="infl-bdash-brand-meta">
              {data?.profile?.username && (
                <span>@{data.profile.username}</span>
              )}
            </div>
            <Link href="/dashboard/settings" className="infl-bdash-brand-cta">
              Edit Profile →
            </Link>
          </div>

          {/* Analyzing Grid */}
          <div className="infl-bdash-analyzing">
            <div className="infl-bdash-analyzing-grid">
              <div className="infl-bdash-tile infl-bdash-tile--light">
                <div className="infl-bdash-tile-value infl-bdash-tile-value--accent">{stats.requests_sent}</div>
                <div className="infl-bdash-tile-label">Requests Sent</div>
              </div>
              <div className="infl-bdash-tile infl-bdash-tile--light">
                <div className="infl-bdash-tile-value infl-bdash-tile-value--accent">{stats.requests_accepted}</div>
                <div className="infl-bdash-tile-label">Accepted</div>
              </div>
              <div className="infl-bdash-tile infl-bdash-tile--light">
                <div className="infl-bdash-tile-value infl-bdash-tile-value--accent">{stats.active_projects}</div>
                <div className="infl-bdash-tile-label">Active</div>
              </div>
              <div className="infl-bdash-tile infl-bdash-tile--light">
                <div className="infl-bdash-tile-value infl-bdash-tile-value--accent">{stats.saved_creators}</div>
                <div className="infl-bdash-tile-label">Saved</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="infl-bdash-card">
          <div className="infl-bdash-card-head">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/></svg>
              Campaign Pipeline
            </h3>
          </div>
          <div className="infl-bdash-pipeline">
            {Object.entries(pipeline).map(([stage, count]) => (
              <div key={stage} className={`infl-bdash-pipeline-stage ${stage}`}>
                <div className="infl-bdash-pipeline-count">{count}</div>
                <div className="infl-bdash-pipeline-label">{stage}</div>
                <span className="infl-bdash-pipeline-arrow">→</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="infl-bdash-bottom-row">
          {/* Activity */}
          <div className="infl-bdash-card">
            <div className="infl-bdash-card-head">
              <h3>Recent Activity</h3>
            </div>
            <div className="infl-bdash-activity-list">
              <p className="infl-bdash-empty">Activity will appear here as you collaborate.</p>
            </div>
          </div>

          {/* Saved Creators */}
          <div className="infl-bdash-card">
            <div className="infl-bdash-card-head">
              <h3>Saved Creators</h3>
              <Link href="/dashboard/discover" className="infl-bdash-link">View All</Link>
            </div>
            <div className="infl-bdash-creator-grid">
              {stats.saved_creators === 0 ? (
                <p className="infl-bdash-empty">No saved creators yet. Discover creators to save them here.</p>
              ) : (
                <p className="infl-bdash-empty">Saved creators will appear here.</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="infl-bdash-card">
            <div className="infl-bdash-card-head">
              <h3>Quick Actions</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <Link href="/dashboard/discover" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                <div className="infl-bdash-creator-avatar" style={{ background: '#fdf2f8', color: '#ee3e96' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <div className="infl-bdash-creator-meta">
                  <strong>Discover Creators</strong>
                  <span>Find the perfect match</span>
                </div>
              </Link>
              <Link href="/dashboard/projects" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                <div className="infl-bdash-creator-avatar" style={{ background: '#fff7ed', color: '#f26e59' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>
                </div>
                <div className="infl-bdash-creator-meta">
                  <strong>New Project</strong>
                  <span>Start a campaign</span>
                </div>
              </Link>
              <Link href="/dashboard/messages" className="infl-bdash-creator-card" style={{ textDecoration: 'none' }}>
                <div className="infl-bdash-creator-avatar" style={{ background: '#f3f4f6', color: '#64748b' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                </div>
                <div className="infl-bdash-creator-meta">
                  <strong>Messages</strong>
                  <span>Chat with creators</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
