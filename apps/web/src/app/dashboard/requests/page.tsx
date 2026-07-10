'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/api-client';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#fffbeb', color: '#d97706', label: 'Pending' },
  accepted:  { bg: '#f0fdf4', color: '#16a34a', label: 'Accepted ✓' },
  declined:  { bg: '#fef2f2', color: '#dc2626', label: 'Declined' },
  cancelled: { bg: '#f8fafc', color: '#64748b', label: 'Cancelled' },
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  // null = not loaded yet — prevents isSender from being wrong during render
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Step 1: Get userId from Supabase session FIRST — before fetching requests
        // Using the standard project helper ensures cookies/session sync correctly
        const sb = createClient();
        const { data: { user }, error: authErr } = await sb.auth.getUser();
        if (authErr) throw authErr;
        const uid = user?.id ?? null;
        setUserId(uid);

        // Step 2: Only THEN fetch requests (userId is in state before cards render)
        const token = await getAuthToken();
        const res = await fetch('/api/collabs', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        setRequests(data.collabs || []);
      } catch (e: any) {
        console.error("[RequestsPage init error]:", e);
        setErrorMsg(e.message || "Failed to load requests.");
      } finally {
        // loading=false only after BOTH userId and requests are ready
        setLoading(false);
      }
    };
    init();
  }, []);


  const refreshRequests = async () => {
    const token = await getAuthToken();
    const res = await fetch('/api/collabs', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setRequests(data.collabs || []);
    }
  };

  const handleAction = async (requestId: string, status: string, otherUserId: string) => {
    setActionIds(prev => new Set(prev).add(requestId));
    try {
      const token = await getAuthToken();

      const res = await fetch('/api/collabs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: requestId, status })
      });

      if (!res.ok) throw new Error('Failed to update request');

      // If accepted: also try to create conversation thread (the PATCH handler does this server-side too)
      if (status === 'accepted') {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ collab_request_id: requestId, other_user_id: otherUserId })
        }).catch(() => {}); // swallow if already exists
      }

      await refreshRequests();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionIds(prev => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  };

  // Split deterministically using the stable userId value
  const sent = userId ? requests.filter(r => r.from_user_id === userId) : [];
  const received = userId ? requests.filter(r => r.to_user_id === userId) : [];

  // Card component — isSender is passed explicitly, not computed from state inside
  const RequestCard = ({ r, isSender }: { r: any; isSender: boolean }) => {
    const otherParty = isSender ? r.receiver : r.sender;
    const otherUserId = isSender ? r.to_user_id : r.from_user_id;
    const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
    const isActing = actionIds.has(r.id);
    const title = r.message?.split('\n')[0] || 'Collaboration Request';
    const detail = r.message?.includes('\n') ? r.message.split('\n\n').slice(1).join(' ') : null;

    return (
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #f1f5f9',
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        {/* Left: who + info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 9,
              background: 'linear-gradient(135deg,#ee3e96,#a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 12, flexShrink: 0,
            }}>
              {(otherParty?.name || '?').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#020617' }}>
              {otherParty?.name || 'Unknown'}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6,
              fontWeight: 700, background: st.bg, color: st.color,
            }}>
              {st.label}
            </span>
          </div>

          <div style={{
            fontWeight: 700, fontSize: 14, color: '#020617',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </div>

          {detail && (
            <div style={{
              fontSize: 12, color: '#64748b', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {detail}
            </div>
          )}

          {r.budget && (
            <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
              Budget: <strong style={{ color: '#020617' }}>₹{Number(r.budget).toLocaleString()}</strong>
            </div>
          )}
        </div>

        {/* Right: role-specific action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {/* BUSINESS (sender) view: can only cancel a pending request */}
          {isSender && r.status === 'pending' && (
            <button
              onClick={() => handleAction(r.id, 'cancelled', otherUserId)}
              disabled={isActing}
              style={{
                padding: '7px 14px', borderRadius: 9,
                border: '1.5px solid #e5e7eb',
                cursor: isActing ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 12,
                background: '#fff', color: '#374151',
              }}
            >
              {isActing ? '...' : 'Cancel Request'}
            </button>
          )}

          {/* CREATOR (receiver) view: can accept or decline a pending request */}
          {!isSender && r.status === 'pending' && (
            <>
              <button
                onClick={() => handleAction(r.id, 'accepted', otherUserId)}
                disabled={isActing}
                style={{
                  padding: '7px 16px', borderRadius: 9, border: 'none',
                  cursor: isActing ? 'wait' : 'pointer',
                  fontWeight: 800, fontSize: 12,
                  background: 'linear-gradient(105deg,#ee3e96,#f26e59)',
                  color: '#fff',
                  boxShadow: '0 3px 10px rgba(238,62,150,0.25)',
                }}
              >
                {isActing ? '...' : '✓ Accept'}
              </button>
              <button
                onClick={() => handleAction(r.id, 'declined', otherUserId)}
                disabled={isActing}
                style={{
                  padding: '7px 12px', borderRadius: 9,
                  border: '1.5px solid #e5e7eb',
                  cursor: isActing ? 'wait' : 'pointer',
                  fontWeight: 700, fontSize: 12,
                  background: '#fff', color: '#374151',
                }}
              >
                Decline
              </button>
            </>
          )}

          {/* Terminal states */}
          {r.status === 'accepted' && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, padding: '4px 10px', background: '#f0fdf4', borderRadius: 8 }}>
              🤝 Active
            </span>
          )}
          {r.status === 'declined' && (
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, padding: '4px 10px', background: '#fef2f2', borderRadius: 8 }}>
              Declined
            </span>
          )}
          {r.status === 'cancelled' && (
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700, padding: '4px 10px', background: '#f8fafc', borderRadius: 8 }}>
              Cancelled
            </span>
          )}
        </div>
      </div>
    );
  };

  if (errorMsg) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}>
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 16, color: '#dc2626', fontWeight: 600 }}>
          ⚠️ {errorMsg}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ height: 26, width: 220, background: '#e2e8f0', borderRadius: 8, marginBottom: 8 }} />
          <div style={{ height: 14, width: 300, background: '#f1f5f9', borderRadius: 6 }} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 88, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#020617' }}>Collaboration Requests</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Track all incoming and outgoing collaboration requests</p>
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
          <p style={{ fontWeight: 700, color: '#020617', marginBottom: 4 }}>No requests yet</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Requests will appear here once you start collaborating.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ↙ INCOMING — shown on the Creator's side */}
          {received.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ee3e96' }}>
                  ↙ Incoming
                </span>
                <span style={{ fontSize: 12, background: '#fdf2f8', color: '#be185d', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                  {received.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {received.map(r => <RequestCard key={r.id} r={r} isSender={false} />)}
              </div>
            </div>
          )}

          {/* ↗ SENT — shown on the Business Owner's side */}
          {sent.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
                  ↗ Sent
                </span>
                <span style={{ fontSize: 12, background: '#f8fafc', color: '#64748b', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                  {sent.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sent.map(r => <RequestCard key={r.id} r={r} isSender={true} />)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
