'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Trash2, Search, XCircle, CheckCircle } from 'lucide-react';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#fffbeb', color: '#d97706', label: 'Pending' },
  accepted:  { bg: '#f0fdf4', color: '#16a34a', label: 'Accepted' },
  declined:  { bg: '#fef2f2', color: '#dc2626', label: 'Declined' },
  cancelled: { bg: '#f8fafc', color: '#64748b', label: 'Cancelled' },
};

export default function AdminCollabsPage() {
  const [collabs, setCollabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchCollabs = async () => {
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/admin/collabs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = await res.json();
      setCollabs(data.collabs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCollabs(); }, []);

  const handleStatusOverride = async (collabId: string, status: string) => {
    setActionId(collabId);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/admin/collabs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collab_id: collabId, status })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      await fetchCollabs();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteRequest = async (collabId: string) => {
    setActionId(collabId);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/admin/collabs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collab_id: collabId })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }
      setConfirmDelete(null);
      await fetchCollabs();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionId(null);
    }
  };

  const filtered = collabs.filter((c: any) =>
    !search ||
    c.sender?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.receiver?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.message?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Send size={18} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6366f1' }}>Admin</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>All Collaboration Requests</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{collabs.length} total requests — admin can override status or delete</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search requests..."
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
            <div key={i} style={{ height: 72, background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📨</div>
          <p style={{ fontWeight: 700, color: '#64748b' }}>No collaboration requests found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c: any) => {
            const st = STATUS_STYLE[c.status] || STATUS_STYLE.cancelled;
            const isActing = actionId === c.id;

            return (
              <div key={c.id} style={{
                background: '#fff',
                borderRadius: 12,
                border: `1px solid ${c.status === 'pending' ? '#fde68a' : '#f1f5f9'}`,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 14,
                }}>
                  {(c.sender?.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#020617' }}>
                      {c.sender?.name || 'Unknown'} 
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>→</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#475569' }}>
                      {c.receiver?.name || 'Unknown'}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                      background: st.bg, color: st.color,
                    }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>
                      {c.sender?.role === 'business_owner' ? 'Brand' : 'Creator'} → {c.receiver?.role === 'influencer' ? 'Creator' : 'Brand'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 1, display: 'flex', gap: 12 }}>
                    <span>📝 {(c.message || '').split('\n')[0] || 'No message'}</span>
                    {c.budget && <span>💰 ₹{Number(c.budget).toLocaleString()}</span>}
                    <span>📅 {new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Admin Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {c.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleStatusOverride(c.id, 'accepted')}
                        disabled={isActing}
                        style={{
                          padding: '6px 10px', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontWeight: 800, fontSize: 10,
                          background: '#16a34a', color: '#fff',
                        }}
                      >
                        {isActing ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleStatusOverride(c.id, 'declined')}
                        disabled={isActing}
                        style={{
                          padding: '6px 10px', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontWeight: 700, fontSize: 10,
                          background: '#ef4444', color: '#fff',
                        }}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {c.status !== 'pending' && (
                    <span style={{ fontSize: 10, color: '#94a3b8', padding: '0 4px' }}>
                      Final
                    </span>
                  )}
                  
                  {/* Force Delete */}
                  {confirmDelete === c.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleDeleteRequest(c.id)}
                        disabled={isActing}
                        style={{
                          padding: '6px 10px', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontWeight: 800, fontSize: 10,
                          background: '#dc2626', color: '#fff',
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{
                          padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                          cursor: 'pointer', fontWeight: 700, fontSize: 10,
                          background: '#fff', color: '#475569',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      style={{
                        padding: '6px 10px', borderRadius: 8, border: '1px solid #fee2e2',
                        cursor: 'pointer', fontWeight: 700, fontSize: 10,
                        background: '#fef2f2', color: '#dc2626',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
