'use client';

/**
 * Event registrations — people who registered at influnet.io/join and got an
 * entry pass (migration 170). Search matches the pass code too, so at the door
 * someone can type INF-XXXXXX, find the person and check them in.
 */

import { useEffect, useState } from 'react';
import { Camera, Check, Copy, ExternalLink, MessageCircle, Phone, Search, Ticket, Undo2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buttonVariants } from '@/components/ui/button';
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
  const [openId, setOpenId] = useState<string | null>(null);

  const params = { search: query, status, limit: 50, offset: page * 50 };
  const { data, loading, error } = useInsight<Report>('event_registrations', null, params);
  const s = data?.summary;
  const open = (data?.rows ?? []).find((r) => r.id === openId) ?? null;

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
              // globals.css styles every <select> outside a layer, so plain utilities lose to its
              // padding and font-size and the label is clipped; hence the `!`.
              className="h-8 rounded-lg border border-hairline-strong bg-surface-card py-0! pl-2.5! pr-7! text-xs! leading-none font-semibold text-content-soft outline-none"
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
          onRowClick={(r) => setOpenId(r.id)}
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
                      onClick={(e) => e.stopPropagation()}
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
                <div className="flex flex-col gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
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
                return (
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <CheckInControl
                      at={checkedInAt(r)}
                      busy={busyId === r.id}
                      name={r.name}
                      onChange={(v) => setCheckedIn(r, v)}
                    />
                  </div>
                );
              },
            },
          ]}
        />
      </SectionCard>

      {open && (
        <RegistrationCard
          row={open}
          at={checkedInAt(open)}
          busy={busyId === open.id}
          onCheckIn={(v) => setCheckedIn(open, v)}
          onClose={() => setOpenId(null)}
        />
      )}
    </AdminPage>
  );
}

function CheckInControl({
  at,
  busy,
  name,
  onChange,
}: {
  at: string | null;
  busy: boolean;
  name: string;
  onChange: (checkedIn: boolean) => void;
}) {
  return at ? (
    <div className="flex items-center gap-2">
      <Badge variant="success" title={dateTime(at)}>
        <Check className="size-3" /> In · {ago(at)}
      </Badge>
      <button
        type="button"
        onClick={() => onChange(false)}
        disabled={busy}
        aria-label={`Undo check-in for ${name}`}
        className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:opacity-40"
      >
        <Undo2 className="size-3.5" />
      </button>
    </div>
  ) : (
    <Button size="sm" onClick={() => onChange(true)} disabled={busy}>
      {busy ? 'Saving…' : 'Check in'}
    </Button>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  return { copied, copy };
}

/** Everything about one registration in one place, each value copyable. */
function RegistrationCard({
  row,
  at,
  busy,
  onCheckIn,
  onClose,
}: {
  row: RegistrationRow;
  at: string | null;
  busy: boolean;
  onCheckIn: (checkedIn: boolean) => void;
  onClose: () => void;
}) {
  const { copied, copy } = useCopy();

  // Same handling as the other admin dialogs: Escape closes, page doesn't scroll behind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const phone = `+${row.phone_digits}`;
  const fields: { key: string; label: string; value: string | null; href?: string }[] = [
    { key: 'pass', label: 'Pass code', value: row.pass_code },
    { key: 'name', label: 'Name', value: row.name },
    { key: 'phone', label: 'Phone', value: phone, href: `tel:${phone}` },
    { key: 'email', label: 'Email', value: row.email, href: row.email ? `mailto:${row.email}` : undefined },
    { key: 'location', label: 'Location', value: row.location },
    {
      key: 'instagram',
      label: 'Instagram',
      value: row.instagram_handle ? `@${row.instagram_handle}` : null,
      href: row.instagram_handle ? `https://instagram.com/${row.instagram_handle}` : undefined,
    },
    { key: 'registered', label: 'Registered', value: dateTime(row.created_at) },
  ];
  const summary = fields
    .filter((f) => f.value)
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-title"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-hairline bg-surface-card shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold tracking-wide text-brand">{row.pass_code}</p>
            <h2 id="registration-title" className="mt-0.5 truncate text-base font-bold text-content">
              {row.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-content-muted transition-colors hover:bg-surface-subtle hover:text-content"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <dl className="flex flex-col overflow-y-auto px-5 py-2">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
              <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-content-muted">{f.label}</dt>
              <dd className="min-w-0 flex-1 break-words text-sm text-content">
                {!f.value ? (
                  <span className="italic text-content-muted">Not given</span>
                ) : f.href ? (
                  <a
                    href={f.href}
                    target={f.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    {f.value}
                  </a>
                ) : (
                  <span className={f.key === 'pass' ? 'font-mono font-semibold' : undefined}>{f.value}</span>
                )}
              </dd>
              {f.value && (
                <button
                  type="button"
                  onClick={() => copy(f.key, f.key === 'phone' ? row.phone_digits.replace(/^91(?=\d{10}$)/, '') : f.value!)}
                  aria-label={`Copy ${f.label.toLowerCase()}`}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
                >
                  {copied === f.key ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  {copied === f.key ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 py-2.5">
            <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-content-muted">Check-in</dt>
            <dd className="flex-1">
              <CheckInControl at={at} busy={busy} name={row.name} onChange={onCheckIn} />
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-4">
          <Button variant="surface" size="sm" onClick={() => copy('all', summary)}>
            {copied === 'all' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied === 'all' ? 'Copied' : 'Copy all'}
          </Button>
          <a href={`tel:${phone}`} className={buttonVariants({ variant: 'surface', size: 'sm' })}>
            <Phone className="size-3.5" /> Call
          </a>
          <a
            href={`https://wa.me/${row.phone_digits}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'surface', size: 'sm' })}
          >
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
