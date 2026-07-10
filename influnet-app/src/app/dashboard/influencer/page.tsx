'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Send, MessageSquare, FolderGit2, DollarSign } from 'lucide-react';
import { AreaChart, BarChart, StatCard } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

interface DashboardData {
  profile: {
    name: string; username: string; niche: string[];
    is_verified: boolean; headline: string | null;
    avatar_url: string | null; bio: string | null; location: string | null;
  };
  stats: {
    collab_requests: number; active_discussions: number;
    active_projects: number; completed_projects: number;
    total_earnings: number;
  };
  earnings_trend: { week: string; amount: number }[];
  request_breakdown: { name: string; value: number; fill: string }[];
  recent_collabs: {
    id: string; name: string; amount: string;
    status: string; sender_id: string;
  }[] | null;
}

const statusBadge = (s: string) => {
  if (s === 'In Progress') return { bg: '#eff6ff', color: '#1d4ed8' };
  if (s === 'Completed') return { bg: '#f0fdf4', color: '#15803d' };
  if (s === 'Declined') return { bg: '#fef2f2', color: '#dc2626' };
  return { bg: '#fffbeb', color: '#d97706' };
};

export default function InfluencerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          const res = await fetch('/api/influencer/dashboard', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          if (res.ok) setData(await res.json());
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafb' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #f1f5f9', borderTopColor: '#f26e59', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const p = data?.profile || { name: 'Creator', username: '', niche: [], is_verified: false, headline: null, avatar_url: null, bio: null, location: null };
  const s = data?.stats || { collab_requests: 0, active_discussions: 0, active_projects: 0, completed_projects: 0, total_earnings: 0 };

  // Chart configs
  const earningsConfig: ChartConfig = {
    amount: { label: 'Earnings', color: '#16a34a' },
  };

  const statusConfig: ChartConfig = {
    Pending: { label: 'Pending', color: '#f59e0b' },
    Active: { label: 'Active', color: '#2563eb' },
    Completed: { label: 'Completed', color: '#16a34a' },
    Declined: { label: 'Declined', color: '#dc2626' },
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', padding: 20, background: '#fafafb',
      fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a',
      display: 'flex', flexDirection: 'column', gap: 14
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, #f26e59, #ee3e96)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 16,
            boxShadow: '0 4px 12px rgba(242,110,89,0.2)'
          }}>
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em' }}>{p.name}</h1>
              {p.is_verified && <span style={{ fontSize: 9, background: '#fdf2f8', color: '#be185d', padding: '2px 6px', borderRadius: 5, fontWeight: 800 }}>✓ Verified</span>}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
              @{p.username}{p.location ? ` · ${p.location}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/settings" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            border: '1px solid #e2e8f0', background: '#fff', color: '#334155',
            fontWeight: 700, borderRadius: 10, fontSize: 11, textDecoration: 'none'
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Profile
          </Link>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
        <StatCard label="Earnings" value={`₹${s.total_earnings.toLocaleString()}`} icon={<DollarSign size={16} />} bg="#fdf2f8" color="#db2777" />
        <StatCard label="Active Projects" value={`${s.active_projects} running`} icon={<FolderGit2 size={16} />} bg="#f0fdf4" color="#16a34a" />
        <StatCard label="Open Chats" value={`${s.active_discussions} open`} icon={<MessageSquare size={16} />} bg="#e0f2fe" color="#0369a1" />
        <StatCard label="New Pitches" value={`${s.collab_requests} pending`} icon={<Send size={16} />} bg="#fffbeb" color="#d97706" />
      </div>

      {/* ── Charts Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flexShrink: 0 }}>

        {/* Earnings Trend - Area Chart */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#16a34a' }}>
              Earnings Analysis
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>
              Weekly Earnings Trend
            </h2>
          </div>
          <AreaChart
            data={data?.earnings_trend || []}
            config={earningsConfig}
            xKey="week"
            areas={[{ dataKey: 'amount', color: '#16a34a' }]}
            height={200}
          />
        </div>

        {/* Request Status - Bar Chart */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f26e59' }}>
              Request Analysis
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>
              Collaboration Breakdown
            </h2>
          </div>
          <BarChart
            data={data?.request_breakdown || []}
            config={statusConfig}
            xKey="name"
            bars={[
              { dataKey: 'value', color: '#8884d8' }
            ]}
            height={200}
          />
        </div>

      </div>

      {/* ── Bio & Niches + Recent Collabs Grid ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 14 }}>

        {/* Profile Info */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f26e59' }}>
              Profile Snapshot
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>
              {p.name}
            </h2>
          </div>

          {p.headline && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#475569', lineHeight: 1.5, flexShrink: 0 }}>
              {p.headline}
            </p>
          )}

          {/* Niches */}
          {p.niche.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12, flexShrink: 0 }}>
              {p.niche.map(n => (
                <span key={n} style={{ fontSize: 10, background: '#fdf2f8', color: '#db2777', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>{n}</span>
              ))}
            </div>
          )}

          {/* Earnings summary card */}
          <div style={{
            padding: '12px 14px', background: '#fafafb',
            borderRadius: 12, border: '1px solid #f1f5f9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0, marginTop: 'auto'
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Total Earnings</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>₹{s.total_earnings.toLocaleString()}</span>
          </div>
        </div>

        {/* Recent Collabs */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>Activity</div>
              <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>Recent Brand Collabs</h2>
            </div>
            <Link href="/dashboard/projects" style={{ fontSize: 11, fontWeight: 800, color: '#f26e59', textDecoration: 'none' }}>All →</Link>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!data?.recent_collabs || data.recent_collabs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                <p style={{ fontSize: 22, marginBottom: 6 }}>🎯</p>
                <p>No brand collaborations yet</p>
                <p style={{ fontSize: 11, marginTop: 2 }}>Complete your profile to get discovered.</p>
              </div>
            ) : (
              data.recent_collabs.map((c, i) => {
                const badge = statusBadge(c.status);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 12, border: '1px solid #f8fafc',
                    background: '#fafafb', gap: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f26e59, #ee3e96)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 900, fontSize: 11, flexShrink: 0
                      }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{c.name}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8' }}>Brand</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{c.amount}</div>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: badge.bg, color: badge.color }}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick nav */}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexShrink: 0, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            {[
              { label: 'Requests', href: '/dashboard/requests', count: s.collab_requests, color: '#d97706', bg: '#fffbeb' },
              { label: 'Chats', href: '/dashboard/messages', count: s.active_discussions, color: '#0369a1', bg: '#e0f2fe' },
              { label: 'Projects', href: '/dashboard/projects', count: s.active_projects, color: '#16a34a', bg: '#f0fdf4' },
            ].map((a, i) => (
              <Link key={i} href={a.href} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 10, background: a.bg, textDecoration: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: a.color, textTransform: 'uppercase' }}>{a.label}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: a.color }}>{a.count}</div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
