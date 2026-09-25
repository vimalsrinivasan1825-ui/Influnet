'use client';

/**
 * Event survey — answers from influnet.io/join/survey (migration 174) and the
 * editor for its questions (migration 175). Each response is one row; clicking
 * it shows every answer with the option labels spelled out. The Edit form tab
 * changes what the page asks, live, with no redeploy.
 *
 * Answers are keyed by question id and option id. Ids are made once, from the
 * title or label, and never change — so rewording is always safe, and answers
 * to a question that was later deleted still show, under "Removed questions".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Check,
  ListChecks,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { SegmentedTabs } from '@/components/ui/tabs';
import { AdminPage, Badge, Button, Input, KpiRow, SectionCard, ago, dateTime, nf } from '@/components/dashboard/admin/kit';

type Role = 'creator' | 'business';
type Kind = 'single' | 'multi' | 'text';
interface Option {
  id: string;
  label: string;
}
interface Question {
  id: string;
  kind: Kind;
  title: string;
  hint?: string;
  placeholder?: string;
  options?: Option[];
  other?: boolean;
  max?: number;
}
type Answers = Record<string, string | string[]>;
interface ResponseRow {
  id: string;
  role: Role;
  answers: Answers;
  created_at: string;
  updated_at: string;
  registration: {
    id: string;
    name: string;
    pass_code: string;
    phone_digits: string;
    email: string | null;
    location: string | null;
    instagram_handle: string | null;
    checked_in_at: string | null;
    deleted_at: string | null;
  } | null;
}
interface Payload {
  responses: ResponseRow[];
  forms: Record<Role, Question[]>;
  formsUpdatedAt: Partial<Record<Role, string>>;
}

const OTHER_SUFFIX = '_other';
const ROLE_LABEL: Record<Role, string> = { creator: 'Creator', business: 'Business' };
const KIND_LABEL: Record<Kind, string> = {
  single: 'Pick one',
  multi: 'Pick several',
  text: 'Written answer',
};
// globals.css styles every <select> outside a layer, hence the `!` (see event-registrations).
const SELECT_CLASS =
  'h-9 rounded-lg border border-hairline-strong bg-surface-card py-0! pl-2.5! pr-7! text-xs! leading-none font-semibold text-content-soft outline-none';

export default function EventSurveyAdminPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [view, setView] = useState<'responses' | 'form'>('responses');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<Payload>('/api/admin/event-survey');
    setLoading(false);
    if (res.ok && res.data) {
      setData(res.data);
      setError(undefined);
    } else {
      setError(res.error || 'Could not load the survey');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.responses ?? [];
  const creators = rows.filter((r) => r.role === 'creator').length;
  const withThoughts = rows.filter((r) => typeof r.answers.thoughts === 'string' && r.answers.thoughts.trim()).length;

  return (
    <AdminPage
      eyebrow="Events"
      title="Event Survey"
      subtitle="Answers from influnet.io/join/survey — Silicon Nexus S2, 25 Sep 2026"
      icon={<ListChecks />}
      error={error}
      actions={
        <SegmentedTabs
          size="sm"
          value={view}
          onValueChange={setView}
          tabs={[
            { value: 'responses', label: 'Responses', count: rows.length },
            { value: 'form', label: 'Edit form' },
          ]}
        />
      }
    >
      {view === 'responses' ? (
        <>
          <KpiRow
            loading={loading && !data}
            items={[
              { label: 'Responses', value: nf.format(rows.length), tone: 'brand' },
              { label: 'Creators', value: nf.format(creators), tone: 'info' },
              { label: 'Business owners', value: nf.format(rows.length - creators), tone: 'success' },
              { label: 'Wrote their thoughts', value: nf.format(withThoughts), tone: 'neutral' },
            ]}
          />
          <Responses rows={rows} forms={data?.forms} loading={loading} onReload={load} />
        </>
      ) : data ? (
        <FormEditor forms={data.forms} updatedAt={data.formsUpdatedAt} onSaved={load} />
      ) : null}
    </AdminPage>
  );
}

/* ───────────────────────────── Responses ───────────────────────────── */

function Responses({
  rows,
  forms,
  loading,
  onReload,
}: {
  rows: ResponseRow[];
  forms: Record<Role, Question[]> | undefined;
  loading: boolean;
  onReload: () => void;
}) {
  const [role, setRole] = useState<'all' | Role>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      if (role !== 'all' && r.role !== role) return false;
      if (!q) return true;
      const g = r.registration;
      return (
        g?.name.toLowerCase().includes(q) ||
        g?.pass_code.toLowerCase().includes(q) ||
        g?.instagram_handle?.includes(q.replace(/^@/, '')) ||
        (digits.length >= 4 && g?.phone_digits.includes(digits))
      );
    });
  }, [rows, role, search]);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <SectionCard
      eyebrow={`${nf.format(shown.length)} shown`}
      title="Responses"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            size="sm"
            value={role}
            onValueChange={setRole}
            tabs={[
              { value: 'all', label: 'All' },
              { value: 'creator', label: 'Creators' },
              { value: 'business', label: 'Business' },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-content-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, pass code, phone…"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <Button variant="surface" size="sm" onClick={onReload} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      }
    >
      {loading && !rows.length ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-subtle" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-content-muted">
          {rows.length ? 'No responses match.' : 'No one has answered the survey yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => (
            <ResponseCard
              key={r.id}
              row={r}
              total={forms?.[r.role]?.length ?? 0}
              onOpen={() => setOpenId(r.id)}
            />
          ))}
        </div>
      )}

      {open && <ResponseDetail row={open} questions={forms?.[open.role] ?? []} onClose={() => setOpenId(null)} />}
    </SectionCard>
  );
}

const answeredCount = (answers: Answers) =>
  Object.entries(answers).filter(([k, v]) => !k.endsWith(OTHER_SUFFIX) && (Array.isArray(v) ? v.length : v.trim())).length;

function ResponseCard({ row, total, onOpen }: { row: ResponseRow; total: number; onOpen: () => void }) {
  const g = row.registration;
  const name = g?.name ?? 'Deleted registration';
  const thoughts = typeof row.answers.thoughts === 'string' ? row.answers.thoughts.trim() : '';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-3.5 py-3 text-left transition-colors hover:border-hairline-strong hover:bg-surface-subtle"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
          row.role === 'creator' ? 'bg-brand/10 text-brand' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {row.role === 'creator' ? <Sparkles className="size-4.5" /> : <Briefcase className="size-4.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold text-content">{name}</span>
          {g && <span className="font-mono text-[11px] font-bold tracking-wide text-brand">{g.pass_code}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-content-muted">
          {thoughts ? `“${thoughts}”` : [g?.location, g?.instagram_handle && `@${g.instagram_handle}`].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <Badge variant={row.role === 'creator' ? 'brand' : 'success'}>{ROLE_LABEL[row.role]}</Badge>
        {g?.checked_in_at && (
          <Badge variant="neutral">
            <Check className="size-3" /> Checked in
          </Badge>
        )}
        <span className="w-20 text-right font-mono text-[11px] text-content-muted">
          {answeredCount(row.answers)}/{total} answered
        </span>
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] text-content-muted" title={dateTime(row.updated_at)}>
        {ago(row.updated_at)}
      </span>
    </button>
  );
}

function ResponseDetail({ row, questions, onClose }: { row: ResponseRow; questions: Question[]; onClose: () => void }) {
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

  const g = row.registration;
  const known = new Set(questions.flatMap((q) => [q.id, q.id + OTHER_SUFFIX]));
  const removed = Object.entries(row.answers).filter(([k]) => !known.has(k));

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
        aria-labelledby="response-title"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-hairline bg-surface-card shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {g && <span className="font-mono text-xs font-bold tracking-wide text-brand">{g.pass_code}</span>}
              <Badge variant={row.role === 'creator' ? 'brand' : 'success'}>{ROLE_LABEL[row.role]}</Badge>
            </div>
            <h2 id="response-title" className="mt-1 truncate text-base font-bold text-content">
              {g?.name ?? 'Deleted registration'}
            </h2>
            {g && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-content-soft">
                <a href={`tel:+${g.phone_digits}`} className="hover:underline">
                  +{g.phone_digits}
                </a>
                <a
                  href={`https://wa.me/${g.phone_digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <MessageCircle className="size-3" /> WhatsApp
                </a>
                {g.email && <span>{g.email}</span>}
                {g.location && <span>{g.location}</span>}
                {g.instagram_handle && (
                  <a
                    href={`https://instagram.com/${g.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                  >
                    @{g.instagram_handle}
                  </a>
                )}
              </div>
            )}
            <p className="mt-1 text-[11px] text-content-muted">
              Answered {dateTime(row.created_at)}
              {row.updated_at !== row.created_at && ` · changed ${ago(row.updated_at)}`}
            </p>
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

        <ol className="flex flex-col overflow-y-auto px-5 py-2">
          {questions.map((q, i) => (
            <li key={q.id} className="border-b border-hairline py-3 last:border-b-0">
              <p className="text-xs font-semibold text-content-muted">
                {i + 1}. {q.title}
              </p>
              <AnswerView question={q} answers={row.answers} />
            </li>
          ))}
          {removed.length > 0 && (
            <li className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Removed questions</p>
              {removed.map(([k, v]) => (
                <p key={k} className="mt-1.5 text-sm text-content">
                  <span className="font-mono text-[11px] text-content-muted">{k}:</span>{' '}
                  {Array.isArray(v) ? v.join(', ') : v}
                </p>
              ))}
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

function AnswerView({ question: q, answers }: { question: Question; answers: Answers }) {
  const v = answers[q.id];
  const other = answers[q.id + OTHER_SUFFIX];
  const empty = <p className="mt-1 text-sm italic text-content-muted">Skipped</p>;
  if (q.kind === 'text') {
    return typeof v === 'string' && v.trim() ? (
      <p className="mt-1 whitespace-pre-wrap text-sm text-content">{v}</p>
    ) : (
      empty
    );
  }
  const picked = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
  if (!picked.length) return empty;
  const label = (id: string) =>
    id === 'other'
      ? `Something else${typeof other === 'string' && other ? `: “${other}”` : ''}`
      : (q.options?.find((o) => o.id === id)?.label ?? id);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {picked.map((id) => (
        <span
          key={id}
          className="rounded-lg border border-hairline bg-surface-subtle px-2 py-1 text-xs font-medium text-content"
        >
          {label(id)}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────────── Form editor ───────────────────────────── */

// A question or option added here gets its id at save time (from its wording);
// until then it carries a temporary key and `fresh: true`.
type DraftOption = Option & { key: string; fresh?: boolean };
type DraftQuestion = Omit<Question, 'options'> & { key: string; fresh?: boolean; options: DraftOption[] };

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

const toDraft = (qs: Question[]): DraftQuestion[] =>
  qs.map((q) => ({ ...q, key: nextKey(), options: (q.options ?? []).map((o) => ({ ...o, key: nextKey() })) }));

function slug(text: string, taken: Set<string>, fallback: string): string {
  let base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (!base || /^[0-9]/.test(base)) base = `${fallback}_${base}`.replace(/_+$/, '');
  if (base === 'other' || base.endsWith(OTHER_SUFFIX)) base = `${base}_x`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
}

function fromDraft(draft: DraftQuestion[]): Question[] {
  const qIds = new Set(draft.filter((q) => !q.fresh).map((q) => q.id));
  return draft.map((q) => {
    const id = q.fresh ? slug(q.title, qIds, 'q') : q.id;
    const oIds = new Set(q.options.filter((o) => !o.fresh).map((o) => o.id));
    const base = { id, kind: q.kind, title: q.title.trim(), hint: q.hint?.trim() || undefined };
    if (q.kind === 'text') return { ...base, placeholder: q.placeholder?.trim() || undefined };
    return {
      ...base,
      options: q.options.map((o) => ({ id: o.fresh ? slug(o.label, oIds, 'opt') : o.id, label: o.label.trim() })),
      other: q.other || undefined,
      max: q.kind === 'multi' && q.max ? q.max : undefined,
    };
  });
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function FormEditor({
  forms,
  updatedAt,
  onSaved,
}: {
  forms: Record<Role, Question[]>;
  updatedAt: Partial<Record<Role, string>>;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>('creator');
  const [drafts, setDrafts] = useState<Record<Role, DraftQuestion[]>>(() => ({
    creator: toDraft(forms.creator),
    business: toDraft(forms.business),
  }));
  const [dirty, setDirty] = useState<Record<Role, boolean>>({ creator: false, business: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const draft = drafts[role];
  const update = (next: DraftQuestion[]) => {
    setDrafts((d) => ({ ...d, [role]: next }));
    setDirty((d) => ({ ...d, [role]: true }));
    setMessage(null);
  };
  const patch = (i: number, p: Partial<DraftQuestion>) => update(draft.map((q, j) => (j === i ? { ...q, ...p } : q)));

  const addQuestion = (at: number) => {
    const q: DraftQuestion = {
      key: nextKey(),
      fresh: true,
      id: '',
      kind: 'single',
      title: '',
      options: [
        { key: nextKey(), fresh: true, id: '', label: '' },
        { key: nextKey(), fresh: true, id: '', label: '' },
      ],
    };
    const next = [...draft];
    next.splice(at, 0, q);
    update(next);
  };

  const remove = (i: number) => {
    const q = draft[i];
    if (!q.fresh && !window.confirm(`Delete “${q.title}”?\n\nAnswers already given stay on each response, under “Removed questions”.`)) return;
    update(draft.filter((_, j) => j !== i));
  };

  const discard = () => {
    setDrafts((d) => ({ ...d, [role]: toDraft(forms[role]) }));
    setDirty((d) => ({ ...d, [role]: false }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await apiFetch<{ ok: boolean; questions: Question[] }>('/api/admin/event-survey', {
      method: 'PUT',
      body: JSON.stringify({ role, questions: fromDraft(draft) }),
    });
    setSaving(false);
    if (res.ok && res.data?.ok) {
      setDrafts((d) => ({ ...d, [role]: toDraft(res.data!.questions) }));
      setDirty((d) => ({ ...d, [role]: false }));
      setMessage({ tone: 'ok', text: 'Saved. The survey page shows this to the next person who opens it.' });
      onSaved();
    } else {
      setMessage({ tone: 'error', text: res.error || 'Could not save the form' });
    }
  };

  const switchRole = (r: Role) => {
    if (dirty[role] && !window.confirm(`You have unsaved changes to the ${ROLE_LABEL[role]} form. Switch anyway? They stay here until you leave the page.`)) return;
    setRole(r);
    setMessage(null);
  };

  return (
    <SectionCard
      eyebrow={updatedAt[role] ? `Last saved ${ago(updatedAt[role])}` : 'Questions'}
      title={`${ROLE_LABEL[role]} form`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            size="sm"
            value={role}
            onValueChange={switchRole}
            tabs={[
              { value: 'creator', label: dirty.creator ? 'Creator •' : 'Creator' },
              { value: 'business', label: dirty.business ? 'Business •' : 'Business' },
            ]}
          />
          <Button variant="surface" size="sm" onClick={discard} disabled={!dirty[role] || saving}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty[role] || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-xs text-content-muted">
        Changes go live on influnet.io/join/survey as soon as you save. Rewording is always safe. Deleting a
        question keeps the answers already given.
      </p>
      {message && (
        <p
          role="status"
          className={`mb-4 rounded-xl px-3 py-2 text-sm font-medium ${
            message.tone === 'ok'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {draft.map((q, i) => (
          <div key={q.key}>
            <QuestionEditor
              index={i}
              count={draft.length}
              question={q}
              onChange={(p) => patch(i, p)}
              onMove={(to) => update(move(draft, i, to))}
              onRemove={() => remove(i)}
            />
            <button
              type="button"
              onClick={() => addQuestion(i + 1)}
              className="mx-auto mt-1.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-content-muted transition-colors hover:bg-surface-subtle hover:text-content"
            >
              <Plus className="size-3" /> Add question here
            </button>
          </div>
        ))}
        {draft.length === 0 && (
          <Button variant="surface" onClick={() => addQuestion(0)}>
            <Plus className="size-4" /> Add the first question
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-lg p-1.5 text-content-muted transition-colors disabled:opacity-30 ${
        danger ? 'hover:bg-rose-500/10 hover:text-rose-500' : 'hover:bg-surface-subtle hover:text-content'
      }`}
    >
      {children}
    </button>
  );
}

function QuestionEditor({
  index,
  count,
  question: q,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  question: DraftQuestion;
  onChange: (p: Partial<DraftQuestion>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const setOption = (i: number, label: string) =>
    onChange({ options: q.options.map((o, j) => (j === i ? { ...o, label } : o)) });

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-subtle font-mono text-xs font-bold text-content-soft">
          {index + 1}
        </span>
        <select
          value={q.kind}
          onChange={(e) => {
            const kind = e.target.value as Kind;
            const options =
              kind !== 'text' && q.options.length < 2
                ? [...q.options, ...Array.from({ length: 2 - q.options.length }, () => ({ key: nextKey(), fresh: true, id: '', label: '' }))]
                : q.options;
            onChange({ kind, options });
          }}
          aria-label="Question type"
          className={SELECT_CLASS}
        >
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="truncate font-mono text-[10px] text-content-muted">{q.fresh ? 'new' : q.id}</span>
        <div className="ml-auto flex items-center">
          <IconButton label="Move up" onClick={() => onMove(index - 1)} disabled={index === 0}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(index + 1)} disabled={index === count - 1}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Delete question" onClick={onRemove} danger>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Input
          value={q.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Question, e.g. What goes wrong with payments?"
          maxLength={200}
          className="font-semibold"
        />
        <Input
          value={q.hint ?? ''}
          onChange={(e) => onChange({ hint: e.target.value })}
          placeholder="Helper text under the question (optional), e.g. Pick all that apply"
          maxLength={200}
          className="text-xs"
        />
        {q.kind === 'text' && (
          <Input
            value={q.placeholder ?? ''}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            placeholder="Text inside the empty box (optional)"
            maxLength={120}
            className="text-xs"
          />
        )}
      </div>

      {q.kind !== 'text' && (
        <div className="mt-3 rounded-xl bg-surface-subtle p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">Options</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {q.options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-1">
                <span
                  className={`size-3.5 shrink-0 border border-hairline-strong ${q.kind === 'single' ? 'rounded-full' : 'rounded'}`}
                />
                <Input
                  value={o.label}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={120}
                  className="ml-1 h-8 flex-1 text-sm"
                />
                <IconButton label="Move option up" onClick={() => onChange({ options: move(q.options, i, i - 1) })} disabled={i === 0}>
                  <ArrowUp className="size-3.5" />
                </IconButton>
                <IconButton
                  label="Move option down"
                  onClick={() => onChange({ options: move(q.options, i, i + 1) })}
                  disabled={i === q.options.length - 1}
                >
                  <ArrowDown className="size-3.5" />
                </IconButton>
                <IconButton
                  label="Delete option"
                  onClick={() => onChange({ options: q.options.filter((_, j) => j !== i) })}
                  disabled={q.options.length <= 2}
                  danger
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => onChange({ options: [...q.options, { key: nextKey(), fresh: true, id: '', label: '' }] })}
              disabled={q.options.length >= 20}
              className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline disabled:opacity-40"
            >
              <Plus className="size-3.5" /> Add option
            </button>
            <label className="flex items-center gap-1.5 text-xs font-medium text-content-soft">
              <input type="checkbox" checked={Boolean(q.other)} onChange={(e) => onChange({ other: e.target.checked })} />
              Add “Something else” with a text box
            </label>
            {q.kind === 'multi' && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-content-soft">
                Pick at most
                <select
                  value={q.max ?? ''}
                  onChange={(e) => onChange({ max: e.target.value ? Number(e.target.value) : undefined })}
                  aria-label="Most options someone can pick"
                  className={SELECT_CLASS}
                >
                  <option value="">No limit</option>
                  {Array.from({ length: Math.max(q.options.length, 1) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
