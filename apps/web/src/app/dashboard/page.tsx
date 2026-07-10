'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Compass, DollarSign, Briefcase, Clock, CheckCircle } from 'lucide-react';
import { AreaChart, BarChart, StatCard } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { apiFetch } from '@/lib/api-client';

interface DashboardData {
  profile: { name: string; company_name: string; industry: string };
  stats: {
    active_collabs_count: number;
    completed_collabs_count: number;
    pending_collabs_count: number;
    total_budget_sum: number;
  };
  weekly_spend: { week: string; spend: number }[];
  pipeline_data: { name: string; value: number; fill: string }[];
  recent_collabs: {
    id: string; name: string; amount: string; status: string;
    platform: string; reach: string;
  }[] | null;
}

const statusBadge = (s: string) => {
  if (s === 'In Progress') return { bg: '#eff6ff', color: '#1d4ed8' };
  if (s === 'Completed') return { bg: '#f0fdf4', color: '#15803d' };
  return { bg: '#fffbeb', color: '#d97706' };
};

export default function BusinessDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<DashboardData>('/api/business/dashboard');
        if (res.ok && res.data) {
          setData(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafb' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #f1f5f9', borderTopColor: '#ee3e96', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const s = data?.stats || { active_collabs_count: 0, completed_collabs_count: 0, pending_collabs_count: 0, total_budget_sum: 0 };
  const p = data?.profile;

  // Chart configs
  const spendConfig: ChartConfig = {
    spend: { label: 'Spend', color: '#ee3e96' },
  };

  const pipelineConfig: ChartConfig = {
    Proposals: { label: 'Proposals', color: '#f59e0b' },
    Active: { label: 'Active', color: '#2563eb' },
    Completed: { label: 'Completed', color: '#16a34a' },
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', padding: 20, background: '#fafafb',
      fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a',
      display: 'flex', flexDirection: 'column', gap: 14
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #ee3e96, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 16,
            boxShadow: '0 4px 12px rgba(238,62,150,0.15)'
          }}>
            {(p?.company_name || 'C').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ee3e96' }}>
              Brand Partner Portal
            </div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>
              Welcome back, {p?.name || 'User'}
            </h1>
          </div>
        </div>
        <Link href="/dashboard/discover" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          background: 'linear-gradient(105deg, #ee3e96, #f26e59)',
          color: '#fff', fontWeight: 800, borderRadius: 10, fontSize: 12,
          textDecoration: 'none', boxShadow: '0 4px 12px rgba(238,62,150,0.2)'
        }}>
          <Compass size={14} /> Discover Creators
        </Link>
      </div>

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
        <StatCard label="Total Spend" value={`₹${s.total_budget_sum.toLocaleString()}`} icon={<DollarSign size={16} />} bg="#fdf2f8" color="#db2777" />
        <StatCard label="Active Campaigns" value={`${s.active_collabs_count} running`} icon={<Briefcase size={16} />} bg="#eff6ff" color="#2563eb" />
        <StatCard label="Pending" value={`${s.pending_collabs_count} pending`} icon={<Clock size={16} />} bg="#fffbeb" color="#d97706" />
        <StatCard label="Completed" value={`${s.completed_collabs_count} finished`} icon={<CheckCircle size={16} />} bg="#f0fdf4" color="#16a34a" />
      </div>

      {/* ── Charts Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flexShrink: 0 }}>

        {/* Spend Trend - Area Chart */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ee3e96' }}>
              Spend Analysis
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>
              Weekly Budget Trend
            </h2>
          </div>
          <AreaChart
            data={data?.weekly_spend || []}
            config={spendConfig}
            xKey="week"
            areas={[{ dataKey: 'spend', color: '#ee3e96' }]}
            height={200}
          />
        </div>

        {/* Pipeline - Bar Chart */}
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
          padding: 18, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a855f7' }}>
              Pipeline Analysis
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>
              Campaign Stage Breakdown
            </h2>
          </div>
          <BarChart
            data={data?.pipeline_data || []}
            config={pipelineConfig}
            xKey="name"
            bars={[
              { dataKey: 'value', color: '#8884d8' }
            ]}
            height={200}
          />
        </div>

      </div>

      {/* ── Recent Collabs ── */}
      <div style={{
        flex: 1, minHeight: 0,
        background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9',
        padding: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>Activity Feed</div>
            <h2 style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 900 }}>Recent Collabs</h2>
          </div>
          <Link href="/dashboard/projects" style={{ fontSize: 11, fontWeight: 800, color: '#ee3e96', textDecoration: 'none' }}>View All →</Link>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!data?.recent_collabs || data.recent_collabs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 20px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
              <p style={{ fontSize: 22, marginBottom: 6 }}>📣</p>
              <p>No collaborations yet</p>
              <p style={{ fontSize: 11, marginTop: 2 }}>Discover creators to get started.</p>
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
                      background: 'linear-gradient(135deg, #ee3e96, #a855f7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 11, flexShrink: 0
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{c.platform} · {c.reach} followers</div>
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

        {/* Summary footer */}
        <div style={{
          marginTop: 10, display: 'flex', gap: 8, flexShrink: 0,
          borderTop: '1px solid #f1f5f9', paddingTop: 10
        }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: '#fafafb', borderRadius: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#2563eb' }}>{s.active_collabs_count}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: '#fafafb', borderRadius: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Pending</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#d97706' }}>{s.pending_collabs_count}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: '#fafafb', borderRadius: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Completed</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#16a34a' }}>{s.completed_collabs_count}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
