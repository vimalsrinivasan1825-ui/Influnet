'use client';

/**
 * Early Access & Founder Pass management page.
 * Displays real-time waitlist registrations for both Creators and Brands,
 * with search, role filters, and 1-click CSV export.
 */

import { useState } from 'react';
import { Sparkles, Search, UserCheck, Building2, Download, Trash2, Globe, Phone } from 'lucide-react';
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

export default function EarlyAccessAdminPage() {
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const params = {
    kind,
    search: query,
    limit: 50,
    offset: page * 50,
  };

  const { data, loading, error, reload } = useInsight<any>('early_access', null, params);
  const s = data?.summary ?? {};

  const handleDelete = async (id: string, memberName: string) => {
    if (!window.confirm(`Delete early access pass for "${memberName}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; deleted?: string }>(`/api/admin/early-access/${id}`, {
        method: 'DELETE',
      });
      if (res.ok && res.data?.ok) {
        reload();
      } else {
        alert(res.error || 'Failed to delete record');
      }
    } catch {
      alert('Network error while deleting record');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminPage
      eyebrow="Growth & Access"
      title="Early Access & Founder Passes"
      subtitle="Founding creators and brands registered via the early access pass generator"
      icon={<Sparkles />}
      error={error}
      actions={
        <div className="flex gap-2">
          <ExportButton
            path={`/api/admin/insights/early_access?${buildQuery(null, { ...params, limit: 500, format: 'csv' })}`}
            filename="influnet-early-access-passes.csv"
          />
        </div>
      }
    >
      <KpiRow
        loading={loading}
        items={[
          { label: 'Total Passes Issued', value: nf.format(s.total ?? 0), tone: 'brand' },
          { label: 'Founding Creators', value: nf.format(s.creators ?? 0), tone: 'info' },
          { label: 'Founding Brands', value: nf.format(s.businesses ?? 0), tone: 'warning' },
          {
            label: 'Latest Registration',
            value: s.latest_at ? ago(s.latest_at) : 'None',
            tone: 'neutral',
          },
        ]}
      />

      <SectionCard
        eyebrow={`${nf.format(s.total ?? 0)} members`}
        title="Pass Registry"
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
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(0);
              }}
              className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2.5 text-xs font-semibold text-content-soft outline-none"
            >
              <option value="">All roles</option>
              <option value="creator">Creators only</option>
              <option value="business">Brands only</option>
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
              key: 'pass_number',
              label: 'Pass #',
              render: (r: any) => (
                <span className="font-mono text-xs font-bold text-brand">
                  #{String(r.pass_number).padStart(4, '0')}
                </span>
              ),
            },
            {
              key: 'name',
              label: 'Member & Contact',
              render: (r: any) => (
                <div className="flex items-center gap-2.5 min-w-0">
                  {r.avatar_url ? (
                    <img
                      src={r.avatar_url}
                      alt={r.name}
                      className="size-7 rounded-full object-cover border border-hairline flex-shrink-0"
                    />
                  ) : (
                    <div className="size-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold font-mono flex-shrink-0">
                      {r.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-content text-xs sm:text-sm">{r.name}</p>
                    <p className="truncate text-xs text-content-muted">{r.email}</p>
                    {r.phone && (
                      <p className="truncate text-[11px] font-mono text-content-soft flex items-center gap-1 mt-0.5">
                        <Phone className="size-2.5 text-content-muted" />
                        <span>{r.phone}</span>
                      </p>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'kind',
              label: 'Role',
              render: (r: any) => (
                <Badge size="sm" variant={r.kind === 'creator' ? 'brand' : 'info'}>
                  {r.kind === 'creator' ? 'Creator' : 'Brand'}
                </Badge>
              ),
            },
            {
              key: 'handle',
              label: 'Handle / Links',
              render: (r: any) => (
                <div className="flex flex-col text-xs font-mono">
                  {r.handle ? (
                    <span className="text-content-soft font-semibold">@{r.handle}</span>
                  ) : (
                    <span className="text-content-muted italic">No Instagram handle</span>
                  )}
                  {r.website && (
                    <a
                      href={r.website.startsWith('http') ? r.website : `https://${r.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline flex items-center gap-1 text-[11px] mt-0.5"
                    >
                      <Globe className="size-2.5" />
                      <span className="truncate max-w-[130px]">{r.website.replace(/^https?:\/\//, '')}</span>
                    </a>
                  )}
                  {r.company && r.company !== r.name && (
                    <span className="text-content-muted text-[11px] truncate max-w-[130px]">{r.company}</span>
                  )}
                </div>
              ),
            },
            {
              key: 'followers',
              label: 'Audience / Reach',
              render: (r: any) => (
                <span className="text-xs font-semibold text-content">
                  {r.followers ? `${r.followers} followers` : r.kind === 'business' ? 'Business Partner' : 'Early Supporter'}
                </span>
              ),
            },
            {
              key: 'created_at',
              label: 'Claimed',
              render: (r: any) => (
                <span className="text-xs text-content-muted" title={r.created_at}>
                  {ago(r.created_at)}
                </span>
              ),
            },
            {
              key: 'actions',
              label: '',
              render: (r: any) => (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletingId === r.id}
                  onClick={() => handleDelete(r.id, r.name)}
                  className="text-danger hover:bg-danger/10 hover:text-danger h-7 px-2"
                  title="Delete registration"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ),
            },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
