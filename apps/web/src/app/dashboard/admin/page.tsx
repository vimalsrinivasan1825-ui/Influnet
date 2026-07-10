'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Shield, Users, Building2, Star, Briefcase, CheckCircle, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface AdminStats {
  total_users: number;
  total_businesses: number;
  total_influencers: number;
  pending_approvals: number;
  total_collabs: number;
  active_collabs: number;
  pending_collabs: number;
  active_projects: number;
  completed_projects: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch<{ stats: AdminStats }>('/api/admin/dashboard');
        if (!res.ok || !res.data) {
          throw new Error(res.error || 'Failed to load admin data');
        }
        setStats(res.data.stats);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, border: '3px solid #f1f5f9', borderTopColor: '#ee3e96', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Loading admin dashboard...</p>
        </div>
        <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 16, color: '#dc2626', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      </div>
    );
  }

  const s = stats || {
    total_users: 0, total_businesses: 0, total_influencers: 0,
    pending_approvals: 0, total_collabs: 0, active_collabs: 0,
    pending_collabs: 0, active_projects: 0, completed_projects: 0
  };

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
            <Shield size={20} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>Platform Admin</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>Admin Dashboard</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/admin/approvals" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'linear-gradient(105deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, borderRadius: 12, fontSize: 12, textDecoration: 'none', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
            <Building2 size={14} />
            Pending Approvals {s.pending_approvals > 0 && `(${s.pending_approvals})`}
          </Link>
          <Link href="/dashboard/admin/users" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, borderRadius: 12, fontSize: 12, textDecoration: 'none' }}>
            <Users size={14} />
            All Users
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
            <Users size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Users</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{s.total_users}</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#db2777' }}>
            <Building2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Businesses</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{s.total_businesses}</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f26e59' }}>
            <Star size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Influencers</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{s.total_influencers}</div>
          </div>
        </div>
        <div style={{ background: s.pending_approvals > 0 ? '#fffbeb' : '#fff', borderRadius: 16, border: `1px solid ${s.pending_approvals > 0 ? '#fde68a' : '#f1f5f9'}`, padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: s.pending_approvals > 0 ? '#fef3c7' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.pending_approvals > 0 ? '#d97706' : '#94a3b8' }}>
            <Clock size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending Approvals</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: s.pending_approvals > 0 ? '#d97706' : '#0f172a' }}>{s.pending_approvals}</div>
          </div>
        </div>
      </div>

      {/* Second Row: Collabs & Projects */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Collaborations Overview */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>Collaborations</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Total Requests', value: s.total_collabs, color: '#6366f1', bg: '#eef2ff' },
              { label: 'Active', value: s.active_collabs, color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Pending Response', value: s.pending_collabs, color: '#d97706', bg: '#fffbeb' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects Overview */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em' }}>Campaign Projects</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Active Projects', value: s.active_projects, color: '#2563eb', bg: '#eff6ff' },
              { label: 'Completed', value: s.completed_projects, color: '#16a34a', bg: '#f0fdf4' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
