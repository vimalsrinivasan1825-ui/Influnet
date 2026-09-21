'use client';

/**
 * Creator Intake & Traction Applications Management Page.
 * Displays structured survey responses submitted through https://influnet.io/join.
 * Includes search, follower tier filters, category filters, and CSV export.
 */

import { useState } from 'react';
import { UserCheck, Search, Trash2, Phone, Camera, ExternalLink, MessageCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  AdminPage,
  Badge,
  Button,
  DataTable,
  ExportButton,
  Input,
  KpiRow,
  SectionCard,
  ago,
  buildQuery,
  nf,
  useInsight,
} from '@/components/dashboard/admin/kit';

interface CreatorApplicationRow {
  id: string;
  application_number: number;
  name: string;
  email: string;
  phone: string;
  instagram_handle: string | null;
  creator_type: string;
  follower_tier: string;
  content_niches: string[];
  brand_experience: string;
  biggest_challenge: string | null;
  status: string;
  created_at: string;
}

export default function CreatorApplicationsAdminPage() {
  const [followerTier, setFollowerTier] = useState('');
  const [creatorType, setCreatorType] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const params = {
    search: query,
    follower_tier: followerTier,
    creator_type: creatorType,
    limit: 50,
    offset: page * 50,
  };

  const { data, loading, error, reload } = useInsight<any>('creator_applications', null, params);
  const s = data?.summary ?? {};

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete creator application for "${name}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; deleted?: string }>(`/api/admin/creator-applications/${id}`, {
        method: 'DELETE',
      });
      if (res.ok && res.data?.ok) {
        reload();
      } else {
        alert(res.error || 'Failed to delete application');
      }
    } catch {
      alert('Network error while deleting application');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminPage
      eyebrow="Traction & Pipeline"
      title="Creator Join Applications"
      subtitle="Creator intake and traction survey responses submitted via influnet.io/join"
      icon={<UserCheck />}
      error={error}
      actions={
        <div className="flex gap-2">
          <ExportButton
            path={`/api/admin/insights/creator_applications?${buildQuery(null, { ...params, limit: 500, format: 'csv' })}`}
            filename="influnet-creator-join-applications.csv"
          />
        </div>
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: 'Total Applications', value: nf.format(s.total ?? 0), tone: 'brand' },
          { label: 'Over 10K Followers', value: nf.format(s.over_10k ?? 0), tone: 'info' },
          { label: 'Prior Brand Deals', value: nf.format(s.experienced ?? 0), tone: 'success' },
          {
            label: 'Latest Submission',
            value: s.latest_at ? ago(s.latest_at) : 'None',
            tone: 'neutral',
          },
        ]}
      />

      <SectionCard
        eyebrow={`${nf.format(s.total ?? 0)} applicants`}
        title="Application Submissions"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(0);
                setQuery(search);
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, handle…"
                className="h-8 w-44 text-xs"
              />
              <Button type="submit" variant="surface" size="sm">
                <Search className="size-3.5" />
              </Button>
            </form>

            <select
              value={followerTier}
              onChange={(e) => {
                setFollowerTier(e.target.value);
                setPage(0);
              }}
              className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2.5 text-xs font-semibold text-content-soft outline-none"
            >
              <option value="">All Follower Tiers</option>
              <option value="Under 1K">Under 1K</option>
              <option value="1K – 10K">1K – 10K</option>
              <option value="10K – 50K">10K – 50K</option>
              <option value="50K – 100K">50K – 100K</option>
              <option value="100K+">100K+</option>
            </select>

            <select
              value={creatorType}
              onChange={(e) => {
                setCreatorType(e.target.value);
                setPage(0);
              }}
              className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2.5 text-xs font-semibold text-content-soft outline-none"
            >
              <option value="">All Creator Types</option>
              <option value="🎥 Influencer / Creator">Influencer / Creator</option>
              <option value="📱 Content Creator">Content Creator</option>
              <option value="🎬 YouTuber">YouTuber</option>
              <option value="📸 Instagram Creator">Instagram Creator</option>
              <option value="📢 Marketing Agency">Marketing Agency</option>
            </select>
          </div>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total ?? s.total}
          page={page}
          onPage={setPage}
          columns={[
            {
              key: 'app_number',
              label: '#',
              render: (r: any) => (
                <span className="font-mono text-xs font-bold text-brand">
                  #{r.application_number}
                </span>
              ),
            },
            {
              key: 'applicant',
              label: 'Creator',
              render: (r: any) => (
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-content text-xs sm:text-sm">{r.name}</span>
                  {r.instagram_handle ? (
                    <a
                      href={`https://instagram.com/${r.instagram_handle.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#ff078e] hover:underline font-mono"
                    >
                      <Camera className="size-3" />
                      @{r.instagram_handle.replace(/^@/, '')}
                      <ExternalLink className="size-2.5 opacity-60" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-content-muted font-mono italic">No handle</span>
                  )}
                </div>
              ),
            },
            {
              key: 'contact',
              label: 'Contact',
              render: (r: any) => {
                const digitsOnly = (r.phone || '').replace(/\D/g, '');
                const waUrl = digitsOnly.length >= 10 ? `https://wa.me/${digitsOnly}` : null;
                return (
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-content font-mono">{r.email}</span>
                    <div className="flex items-center gap-1.5 text-content-soft font-mono text-[11px]">
                      <Phone className="size-2.5 text-content-muted" />
                      <span>{r.phone}</span>
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Chat on WhatsApp"
                          className="inline-flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
                        >
                          <MessageCircle className="size-3.5 ml-0.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'type_and_reach',
              label: 'Category & Reach',
              render: (r: any) => {
                const isBig = r.follower_tier === '10K – 50K' || r.follower_tier === '50K – 100K' || r.follower_tier === '100K+';
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-content">{r.creator_type}</span>
                    <div>
                      <Badge variant={isBig ? 'brand' : 'neutral'}>
                        {r.follower_tier}
                      </Badge>
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'niches',
              label: 'Content Niches',
              render: (r: any) => (
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {(r.content_niches ?? []).map((n: string) => (
                    <span
                      key={n}
                      className="inline-block px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-surface-card border border-hairline text-content-soft"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: 'brand_exp',
              label: 'Brand Deals',
              render: (r: any) => {
                const hasExp = (r.brand_experience || '').toLowerCase().includes('yes');
                return (
                  <Badge variant={hasExp ? 'success' : 'neutral'}>
                    {r.brand_experience}
                  </Badge>
                );
              },
            },
            {
              key: 'challenge',
              label: 'Biggest Challenge',
              render: (r: any) => (
                <p className="max-w-xs text-xs text-content-soft line-clamp-2" title={r.biggest_challenge ?? ''}>
                  {r.biggest_challenge || <span className="italic text-content-muted">Not specified</span>}
                </p>
              ),
            },
            {
              key: 'created_at',
              label: 'Submitted',
              render: (r: any) => (
                <span className="text-xs text-content-soft font-mono" title={r.created_at}>
                  {ago(r.created_at)}
                </span>
              ),
            },
            {
              key: 'actions',
              label: '',
              render: (r: any) => (
                <button
                  type="button"
                  onClick={() => handleDelete(r.id, r.name)}
                  disabled={deletingId === r.id}
                  aria-label={`Delete application for ${r.name}`}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              ),
            },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
