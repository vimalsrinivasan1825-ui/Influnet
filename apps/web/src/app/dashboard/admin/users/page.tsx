'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Building2, Star, Shield, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface PlatformUser {
  id: string;
  role: string;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  created_at: string;
  // Extended fields
  company_name?: string;
  business_industry?: string;
  approval_status?: string;
  username?: string;
  niche?: string[];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch<{ users: PlatformUser[] }>('/api/admin/users');
        if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch users');
        setUsers(res.data.users || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filtered = users.filter(u =>
    !search || 
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Users size={18} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6366f1' }}>User Management</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>All Users</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{users.length} total platform users</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, width: 220, outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, color: '#dc2626', fontWeight: 600, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 64, background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <p style={{ fontWeight: 700, color: '#64748b' }}>No users found matching your search</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(u => {
            const isBiz = u.role === 'business_owner';
            const isInf = u.role === 'influencer';
            const isAdmin = u.role === 'admin';
            const pendingApproval = isBiz && u.approval_status === 'pending_review';

            return (
              <div key={u.id} style={{
                background: '#fff',
                borderRadius: 12,
                border: `1px solid ${pendingApproval ? '#fde68a' : '#f1f5f9'}`,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isBiz ? 'linear-gradient(135deg, #ee3e96, #f26e59)' : isInf ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 14,
                }}>
                  {(u.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#020617' }}>{u.name || 'Unnamed'}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                      background: isBiz ? '#fdf2f8' : isInf ? '#f3e8ff' : '#eef2ff',
                      color: isBiz ? '#be185d' : isInf ? '#7c3aed' : '#6366f1',
                    }}>
                      {isBiz ? 'Business' : isInf ? 'Creator' : 'Admin'}
                    </span>
                    {pendingApproval && (
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px', background: '#fffbeb', color: '#d97706' }}>
                        Pending Approval
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                    {u.email}
                    {isBiz && u.company_name && ` · ${u.company_name}`}
                    {isInf && u.username && ` · @${u.username}`}
                    {u.location && ` · ${u.location}`}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, textAlign: 'right' }}>
                  <div>Joined {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
