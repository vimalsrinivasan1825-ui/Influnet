'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

import { NICHES } from '@/lib/constants';

type DiscoverResult = {
  user_id: string;
  // Influencer fields
  username?: string;
  bio?: string;
  niche?: string[];
  instagram_handle?: string;
  youtube_handle?: string;
  headline?: string;
  // Business fields
  company_name?: string;
  industry?: string;
  tagline?: string;
  website?: string;
  // Shared
  profile?: { id: string; name: string; location?: string };
};

type ModalState = {
  open: boolean;
  targetId: string;
  targetName: string;
};

function DiscoverContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>({ open: false, targetId: '', targetName: '' });
  const [form, setForm] = useState({ title: '', budget: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const deepLinkHandled = useRef(false);

  // Filter state, initialized from the URL so searches are shareable
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [niche, setNiche] = useState(searchParams.get('niche') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (niche) params.set('niche', niche);
    if (location.trim()) params.set('location', location.trim());
    if (cursor) params.set('cursor', cursor);
    return params;
  }, [query, niche, location]);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    const params = buildParams(cursor);
    const res = await apiFetch<{ userRole: string; results: DiscoverResult[]; nextCursor: string | null }>(
      `/api/discover?${params.toString()}`
    );
    if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch results');
    return res.data;
  }, [buildParams]);

  // Initial load + reload on filter change (debounced for typing)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        // Keep the URL in sync so back/refresh/share preserve the search
        const urlParams = buildParams();
        const requestId = searchParams.get('request');
        if (requestId) urlParams.set('request', requestId);
        const qs = urlParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

        const data = await fetchPage();
        setUserRole(data.userRole);
        setResults(data.results);
        setNextCursor(data.nextCursor);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, niche, location]);

  // Already-sent requests (once)
  useEffect(() => {
    const loadSent = async () => {
      const res = await apiFetch<{ collabs: any[] }>('/api/collabs');
      if (res.ok && res.data) {
        const me = await apiFetch<{ profile: { id: string } }>('/api/profile');
        const myId = me.data?.profile?.id;
        if (!myId) return;
        const sent = (res.data.collabs || [])
          .filter((r: any) => r.from_user_id === myId && (r.status === 'pending' || r.status === 'accepted'))
          .map((r: any) => r.to_user_id);
        setSentIds(new Set(sent));
      }
    };
    loadSent();
  }, []);

  // Deep link (?request=<id>): open the collab modal for that user, fetching
  // their profile directly if they're not in the current result page.
  useEffect(() => {
    const requestId = searchParams.get('request');
    if (!requestId || loading || deepLinkHandled.current) return;
    if (sentIds.has(requestId)) { deepLinkHandled.current = true; return; }

    const target = results.find(r => r.user_id === requestId);
    if (target) {
      deepLinkHandled.current = true;
      const name = userRole === 'business_owner'
        ? (target.profile?.name || 'Creator')
        : (target.company_name || target.profile?.name || 'Business');
      openModal(requestId, name);
      return;
    }

    // Not in this page of results — fetch the single profile by id
    deepLinkHandled.current = true;
    (async () => {
      const res = await apiFetch<{ results: DiscoverResult[] }>(`/api/discover?id=${requestId}`);
      const t = res.data?.results?.[0];
      if (t) {
        const name = userRole === 'business_owner'
          ? (t.profile?.name || 'Creator')
          : (t.company_name || t.profile?.name || 'Business');
        openModal(requestId, name);
      }
    })();
  }, [loading, results, searchParams, sentIds, userRole]);

  // Redirect to dashboard if discover is accessed without a request deep-link
  useEffect(() => {
    const requestId = searchParams.get('request');
    if (!requestId) {
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(nextCursor);
      setResults(prev => [...prev, ...data.results]);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const openModal = (targetId: string, targetName: string) => {
    setForm({ title: '', budget: '', message: '' });
    setModal({ open: true, targetId, targetName });
  };

  const closeModal = () => {
    setModal({ open: false, targetId: '', targetName: '' });
    router.replace('/dashboard');
  };

  const sendRequest = async () => {
    if (!form.title.trim()) { setError('Please enter a project title.'); return; }
    const budgetNum = form.budget ? Number(form.budget.replace(/[^0-9.]/g, '')) : null;
    if (form.budget && (!budgetNum || budgetNum <= 0)) {
      setError('Budget must be a positive number.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/collabs', {
        method: 'POST',
        body: JSON.stringify({
          to_user_id: modal.targetId,
          project_title: form.title,
          project_description: form.message,
          budget: budgetNum,
        }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          // Duplicate pending request — treat as already sent
          setSentIds(prev => new Set(prev).add(modal.targetId));
          closeModal();
          return;
        }
        throw new Error(res.error || 'Failed to send request');
      }
      setSentIds(prev => new Set(prev).add(modal.targetId));
      setModal({ open: false, targetId: '', targetName: '' });
      router.replace('/dashboard/requests');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isCreatorView = userRole === 'business_owner';
  const hasFilters = !!(query.trim() || niche || location.trim());

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff',
    fontWeight: 600, color: '#0f172a',
  };

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#020617' }}>
          {isCreatorView ? 'Discover Creators' : 'Discover Brands'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
          {isCreatorView
            ? 'Find the perfect creator for your next campaign'
            : 'Connect with brands looking for collaborations'}
        </p>
      </div>

      {/* Search + filters */}
      <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isCreatorView ? 'Search by name, username or bio...' : 'Search brands by name or tagline...'}
              style={{ ...inputStyle, width: '100%', paddingLeft: 36, boxSizing: 'border-box' }}
            />
          </div>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (city or state)"
            style={{ ...inputStyle, flex: '0 1 200px' }}
          />
        </div>

        {isCreatorView && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {NICHES.map(n => {
              const active = niche === n;
              return (
                <button
                  key={n}
                  onClick={() => setNiche(active ? '' : n)}
                  style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                    border: active ? '1.5px solid #ee3e96' : '1.5px solid #e2e8f0',
                    background: active ? '#fdf2f8' : '#fff',
                    color: active ? '#be185d' : '#64748b',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ height: 220, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#ef4444', background: '#fff', borderRadius: 16, border: '1px solid #fee2e2' }}>
          {error}
        </div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p style={{ fontWeight: 700, color: '#020617', marginBottom: 4 }}>
            {hasFilters ? 'No matches for these filters' : 'No one found yet'}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            {hasFilters
              ? 'Try a different search or clear the filters.'
              : isCreatorView ? 'Creators will appear here once they join.' : 'Brands will appear here once they join.'}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setNiche(''); setLocation(''); }}
              style={{
                marginTop: 16, padding: '8px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {results.map((item) => {
              const name = isCreatorView ? (item.profile?.name || 'Creator') : (item.company_name || item.profile?.name || 'Business');
              const subtitle = isCreatorView
                ? (item.niche as string[] || []).slice(0, 2).join(' · ') || 'Creator'
                : item.industry || 'Brand';
              const description = isCreatorView ? item.headline || item.bio : item.tagline || item.company_name;
              const isSent = sentIds.has(item.user_id);

              return (
                <div key={item.user_id} style={{
                  background: '#fff',
                  borderRadius: 18,
                  border: '1px solid #f1f5f9',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 0.2s',
                }}>
                  {/* Avatar + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                      background: 'linear-gradient(135deg, #ee3e96, #a855f7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 18
                    }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#020617', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>
                    </div>
                  </div>

                  {/* Description */}
                  {description && (
                    <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flexGrow: 1 }}>
                      {description}
                    </p>
                  )}

                  {/* Handles / Location */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {item.username && (
                      <a href={`/c/${item.username}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '3px 8px', background: '#fdf2f8', color: '#be185d', borderRadius: 6, fontWeight: 700, textDecoration: 'none' }}>
                        @{item.username}
                      </a>
                    )}
                    {item.instagram_handle && (
                      <span style={{ fontSize: 11, padding: '3px 8px', background: '#fdf2f8', color: '#be185d', borderRadius: 6, fontWeight: 700 }}>
                        IG @{item.instagram_handle.replace('@', '')}
                      </span>
                    )}
                    {item.youtube_handle && (
                      <span style={{ fontSize: 11, padding: '3px 8px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontWeight: 700 }}>
                        YT @{item.youtube_handle.replace('@', '')}
                      </span>
                    )}
                    {item.website && (
                      <span style={{ fontSize: 11, padding: '3px 8px', background: '#f0f9ff', color: '#0284c7', borderRadius: 6, fontWeight: 700 }}>
                        🌐 Website
                      </span>
                    )}
                    {item.profile?.location && (
                      <span style={{ fontSize: 11, padding: '3px 8px', background: '#f8fafc', color: '#64748b', borderRadius: 6, fontWeight: 600 }}>
                        📍 {item.profile.location}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  {isCreatorView ? (
                    <button
                      onClick={() => !isSent && openModal(item.user_id, name)}
                      disabled={isSent}
                      style={{
                        width: '100%', padding: '10px', borderRadius: 12, border: 'none', cursor: isSent ? 'default' : 'pointer',
                        fontWeight: 800, fontSize: 13, transition: 'all 0.2s',
                        background: isSent ? '#f0fdf4' : 'linear-gradient(105deg, #ee3e96, #f26e59)',
                        color: isSent ? '#16a34a' : '#fff',
                        boxShadow: isSent ? 'none' : '0 4px 12px rgba(238,62,150,0.25)',
                      }}
                    >
                      {isSent ? '✓ Request Sent' : 'Collaborate'}
                    </button>
                  ) : (
                    <div style={{
                      width: '100%', padding: '10px', borderRadius: 12,
                      border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12,
                      fontWeight: 700, textAlign: 'center', background: '#f8fafc',
                      boxSizing: 'border-box'
                    }}>
                      Verified Brand Partner
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {nextCursor && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  padding: '11px 32px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#374151', fontWeight: 800, fontSize: 13,
                  cursor: loadingMore ? 'wait' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Collaborate Modal */}
      {modal.open && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 24, padding: 28, width: '100%', maxWidth: 460,
              boxShadow: '0 24px 64px rgba(0,0,0,0.15)'
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#020617' }}>
                Collaborate with {modal.targetName}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Fill in the details — they&apos;ll be notified instantly.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Project Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Summer Collection Launch"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Budget (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 25000"
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Message
                </label>
                <textarea
                  placeholder="Describe your vision, deliverables, or any questions..."
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  rows={4}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={closeModal}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={sendRequest}
                disabled={submitting}
                style={{
                  flex: 2, padding: '11px', borderRadius: 12, border: 'none', cursor: submitting ? 'wait' : 'pointer',
                  background: 'linear-gradient(105deg, #ee3e96, #f26e59)', color: '#fff',
                  fontWeight: 800, fontSize: 14, boxShadow: '0 4px 12px rgba(238,62,150,0.3)',
                }}
              >
                {submitting ? 'Sending...' : '🚀 Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <React.Suspense fallback={
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 220, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      </div>
    }>
      <DiscoverContent />
    </React.Suspense>
  );
}
