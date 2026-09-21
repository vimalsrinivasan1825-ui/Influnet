'use client';

/**
 * Event registrations — people who registered at influnet.io/join and got an
 * entry pass (migration 170). Search matches the pass code too, so at the door
 * someone can type INF-XXXXXX, find the person and check them in.
 */

import { useState } from 'react';
import { Camera, Check, ExternalLink, MessageCircle, Phone, Search, Ticket, Undo2 } from 'lucide-react';
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
  dateTime,
  nf,
  useInsight,
} from '@/components/dashboard/admin/kit';

interface RegistrationRow {
  id: string;
  pass_code: string;
  name: string;
  phone: string;
  phone_digits: string;
  email: string | null;
  location: string | null;
  instagram_handle: string | null;
  event_slug: string;
  checked_in_at: string | null;
  created_at: string;
}

interface Report {
  summary: { total: number; checked_in: number; with_instagram: number; today: number; latest_at: string | null };
  total: number;
  rows: RegistrationRow[];
}

const STATUS_OPTIONS = [
  ['', 'Everyone'],
  ['not_checked_in', 'Not checked in'],
  ['checked_in', 'Checked in'],
] as const;

export default function EventRegistrationsAdminPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  // Check-ins made on this screen, applied on top of the loaded rows so a tap
  // doesn't blank the table with a reload.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const params = { search: query, status, limit: 50, offset: page * 50 };
  const { data, loading, error } = useInsight<Report>('event_registrations', null, params);
  const s = data?.summary;

  const checkedInAt = (r: RegistrationRow) => (r.id in overrides ? overrides[r.id] : r.checked_in_at);
  const checkedInDelta = (data?.rows ?? []).reduce((n, r) => {
    if (!(r.id in overrides)) return n;
    return n + (overrides[r.id] ? 1 : 0) - (r.checked_in_at ? 1 : 0);
  }, 0);

  const setCheckedIn = async (r: RegistrationRow, checkedIn: boolean) => {
    if (!checkedIn && !window.confirm(`Undo check-in for ${r.name} (${r.pass_code})?`)) return;
    setBusyId(r.id);
    const res = await apiFetch<{ ok: boolean; checked_in_at: string | null }>(
      `/api/admin/event-registrations/${r.id}`,
      { method: 'PATCH', body: JSON.stringify({ checkedIn }) },
    );
    setBusyId(null);
    if (res.ok && res.data?.ok) {
      setOverrides((o) => ({ ...o, [r.id]: res.data!.checked_in_at }));
    } else {
      alert(res.error || 'Could not update check-in');
    }
  };

  const runSearch = (value: string) => {
    setPage(0);
    setOverrides({});
    setQuery(value.trim());
  };

  return (
    <AdminPage
      eyebrow="Events"
      title="Event Registrations"
      subtitle="Entry passes issued at influnet.io/join — Silicon Nexus S2, 25 Sep 2026"
      icon={<Ticket />}
      error={error}
      actions={
        <ExportButton
          path={`/api/admin/insights/event_registrations?${buildQuery(null, { ...params, limit: 500, offset: 0, format: 'csv' })}`}
          filename="influnet-event-registrations.csv"
        />
      }
    >
      <KpiRow
        loading={loading && !data}
        items={[
          { label: 'Registered', value: nf.format(s?.total ?? 0), tone: 'brand' },
          {
            label: 'Checked in',
            value: nf.format((s?.checked_in ?? 0) + checkedInDelta),
            hint: s?.total ? `of ${nf.format(s.total)}` : undefined,
            tone: 'success',
          },
          { label: 'Registered today', value: nf.format(s?.today ?? 0), hint: 'IST', tone: 'info' },
          { label: 'Latest registration', value: s?.latest_at ? ago(s.latest_at) : 'None', tone: 'neutral' },
        ]}
      />

      <SectionCard
        eyebrow={`${nf.format(data?.total ?? 0)} shown`}
        title="Registrations"
        bodyClassName="px-0 sm:px-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(search);
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pass code, name, phone…"
                className="h-8 w-52 text-xs"
              />
              <Button type="submit" variant="surface" size="sm" aria-label="Search">
                <Search className="size-3.5" />
              </Button>
            </form>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
                setOverrides({});
              }}
              aria-label="Check-in status"
              className="h-8 rounded-lg border border-hairline-strong bg-surface-card px-2.5 text-xs font-semibold text-content-soft outline-none"
            >
              {STATUS_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <DataTable
          loading={loading}
          rows={data?.rows ?? []}
          total={data?.total}
          page={page}
          onPage={setPage}
          empty={query || status ? 'No registrations match this search.' : 'No one has registered yet.'}
          columns={[
            {
              key: 'pass',
              label: 'Pass',
              render: (r) => <span className="font-mono text-xs font-bold tracking-wide text-brand">{r.pass_code}</span>,
            },
            {
              key: 'person',
              label: 'Name',
              render: (r) => (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-content sm:text-sm">{r.name}</span>
                  {r.instagram_handle ? (
                    <a
                      href={`https://instagram.com/${r.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                    >
                      <Camera className="size-3" />@{r.instagram_handle}
                      <ExternalLink className="size-2.5 opacity-60" />
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] italic text-content-muted">No Instagram</span>
                  )}
                </div>
              ),
            },
            {
              key: 'contact',
              label: 'Contact',
              render: (r) => (
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5 font-mono text-content">
                    <Phone className="size-2.5 text-content-muted" />
                    <a href={`tel:+${r.phone_digits}`} className="hover:underline">
                      +{r.phone_digits}
                    </a>
                    <a
                      href={`https://wa.me/${r.phone_digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Chat on WhatsApp"
                      className="inline-flex items-center text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                    >
                      <MessageCircle className="ml-0.5 size-3.5" />
                    </a>
                  </div>
                  {r.email ? (
                    <span className="font-mono text-content-soft">{r.email}</span>
                  ) : (
                    <span className="italic text-content-muted">No email</span>
                  )}
                </div>
              ),
            },
            {
              key: 'location',
              label: 'Location',
              render: (r) =>
                r.location ? (
                  <span className="text-xs text-content-soft">{r.location}</span>
                ) : (
                  <span className="text-xs italic text-content-muted">—</span>
                ),
            },
            {
              key: 'created_at',
              label: 'Registered',
              render: (r) => (
                <span className="font-mono text-xs text-content-soft" title={dateTime(r.created_at)}>
                  {ago(r.created_at)}
                </span>
              ),
            },
            {
              key: 'checkin',
              label: 'Check-in',
              align: 'right',
              render: (r) => {
                const at = checkedInAt(r);
                const busy = busyId === r.id;
                return at ? (
                  <div className="flex items-center justify-end gap-2">
                    <Badge variant="success" title={dateTime(at)}>
                      <Check className="size-3" /> In · {ago(at)}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => setCheckedIn(r, false)}
                      disabled={busy}
                      aria-label={`Undo check-in for ${r.name}`}
                      className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:opacity-40"
                    >
                      <Undo2 className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setCheckedIn(r, true)} disabled={busy}>
                    {busy ? 'Saving…' : 'Check in'}
                  </Button>
                );
              },
            },
          ]}
        />
      </SectionCard>
    </AdminPage>
  );
}
