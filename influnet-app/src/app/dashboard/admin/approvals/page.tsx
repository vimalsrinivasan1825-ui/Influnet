'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, XCircle, Clock, Building2 } from 'lucide-react';

interface BusinessUser {
  user_id: string;
  company_name: string;
  industry: string;
  business_type: string | null;
  approval_status: string;
  created_at: string;
  gst_number: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  marketing_budget: string | null;
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
  };
}

export default function AdminApprovalsPage() {
  const [businesses, setBusinesses] = useState<BusinessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const res = await fetch('/api/admin/businesses', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setBusinesses(data.businesses || []);
    } else {
      const err = await res.json();
      setError(err.error || 'Failed to fetch businesses');
    }
    setLoading(false);
  };

  useEffect(() => { fetchBusinesses(); }, []);

  const handleApproval = async (userId: string, status: 'approved' | 'rejected') => {
    setActionId(userId);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/admin/businesses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, approval_status: status })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }

      await fetchBusinesses();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionId(null);
    }
  };

  const pendingBusinesses = businesses.filter(b => b.approval_status === 'pending_review');
  const reviewedBusinesses = businesses.filter(b => b.approval_status !== 'pending_review');

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Building2 size={18} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6366f1' }}>Business Approval</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Business Account Approvals</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Review and approve or reject business owner registrations</p>
      </div>

      {error && (
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 16, color: '#dc2626', fontWeight: 600, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 120, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Pending Approvals */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Clock size={16} style={{ color: '#d97706' }} />
              <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d97706' }}>
                Pending Review
              </span>
              <span style={{ fontSize: 12, background: '#fffbeb', color: '#d97706', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                {pendingBusinesses.length}
              </span>
            </div>
            {pendingBusinesses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <p style={{ fontWeight: 700, color: '#16a34a' }}>All caught up! No pending approvals.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingBusinesses.map(b => (
                  <BusinessCard key={b.user_id} business={b} actionId={actionId} onAction={handleApproval} />
                ))}
              </div>
            )}
          </div>

          {/* Previously Reviewed */}
          {reviewedBusinesses.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CheckCircle size={16} style={{ color: '#64748b' }} />
                <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                  Previously Reviewed
                </span>
                <span style={{ fontSize: 12, background: '#f8fafc', color: '#64748b', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                  {reviewedBusinesses.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviewedBusinesses.map(b => (
                  <BusinessCard key={b.user_id} business={b} actionId={actionId} onAction={handleApproval} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BusinessCard({ business, actionId, onAction }: {
  business: BusinessUser;
  actionId: string | null;
  onAction: (userId: string, status: 'approved' | 'rejected') => void;
}) {
  const isPending = business.approval_status === 'pending_review';
  const isApproved = business.approval_status === 'approved';
  const isActing = actionId === business.user_id;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      border: `1px solid ${isPending ? '#fde68a' : '#f1f5f9'}`,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0,
          }}>
            {(business.company_name || '?').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#020617' }}>{business.company_name || 'Unnamed Company'}</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
            background: isPending ? '#fffbeb' : isApproved ? '#f0fdf4' : '#fef2f2',
            color: isPending ? '#d97706' : isApproved ? '#16a34a' : '#dc2626',
          }}>
            {isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span>{business.profile?.name || 'No name'}</span>
          <span>{business.profile?.email}</span>
          {business.industry && <span>🏭 {business.industry}</span>}
          {business.city && business.state && <span>📍 {business.city}, {business.state}</span>}
        </div>
      </div>

      {isPending && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => onAction(business.user_id, 'approved')}
            disabled={isActing}
            style={{
              padding: '7px 16px', borderRadius: 9, border: 'none',
              cursor: isActing ? 'wait' : 'pointer',
              fontWeight: 800, fontSize: 12,
              background: 'linear-gradient(105deg, #16a34a, #22c55e)',
              color: '#fff', boxShadow: '0 3px 10px rgba(22,163,74,0.25)',
            }}
          >
            {isActing ? '...' : '✓ Approve'}
          </button>
          <button
            onClick={() => onAction(business.user_id, 'rejected')}
            disabled={isActing}
            style={{
              padding: '7px 12px', borderRadius: 9,
              border: '1.5px solid #e5e7eb',
              cursor: isActing ? 'wait' : 'pointer',
              fontWeight: 700, fontSize: 12,
              background: '#fff', color: '#dc2626',
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}
