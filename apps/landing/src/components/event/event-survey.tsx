'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, AtSign, Briefcase, Check, Loader2, Mail, MapPin, Sparkles } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import { EVENT_API_URL } from '@/components/site/links';
import { EVENT } from './event';
import { OTHER_SUFFIX, QUESTIONS, type Question, type Role } from './survey-questions';

// Pre-event survey: phone → your registration → creator/business questions.
// API: apps/web/src/app/api/event-survey/route.ts; storage: migration 174.

type Registrant = {
  firstName: string;
  location: string | null;
  instagram: string | null;
  emailMasked: string | null;
  checkedIn: boolean;
};
type Answers = Record<string, string | string[]>;
type Step =
  | { at: 'phone' }
  | { at: 'confirm' }
  | { at: 'questions'; index: number }
  | { at: 'done' };

async function call(body: object) {
  const res = await fetch(`${EVENT_API_URL}/api/event-survey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: EVENT.slug, ...body }),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 429) throw new Error('Too many attempts. Please wait a minute and try again.');
  if (!res.ok) throw new Error(json?.error || 'Something went wrong. Please try again.');
  return json;
}

const NETWORK_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';

export default function EventSurvey() {
  const [step, setStep] = useState<Step>({ at: 'phone' });
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const name = registrant?.firstName ?? '';

  // The live form comes with the lookup (edited in admin); the built-in set is
  // only a fallback if the server couldn't read it.
  const [forms, setForms] = useState<Record<Role, Question[]>>(QUESTIONS);
  const questions = role ? forms[role] : [];

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const digits = phone.replace(/\D/g, '').replace(/^0/, '');
    if (phone.trim().startsWith('+') ? digits.length < 8 : digits.length !== 10) {
      setError('Enter the 10-digit mobile number you registered with');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const json = await call({ action: 'lookup', phone: phone.trim() });
      if (!json.found) {
        setError('We couldn’t find a registration for this number. Try the number you used on the entry pass.');
        return;
      }
      setRegistrant(json.registrant);
      const live = json.questions as Record<Role, Question[]> | null | undefined;
      setForms({
        creator: live?.creator?.length ? live.creator : QUESTIONS.creator,
        business: live?.business?.length ? live.business : QUESTIONS.business,
      });
      if (json.response) {
        setRole(json.response.role);
        setAnswers(json.response.answers ?? {});
      }
      setStep({ at: 'confirm' });
    } catch (err) {
      setError(err instanceof TypeError ? NETWORK_ERROR : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickRole = (r: Role) => {
    // Switching role starts the other questionnaire fresh.
    if (r !== role) setAnswers({});
    setRole(r);
  };

  const submit = async () => {
    if (busy || !role) return;
    setBusy(true);
    setError(null);
    try {
      await call({ action: 'submit', phone: phone.trim(), role, answers: clean(answers) });
      setStep({ at: 'done' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof TypeError ? NETWORK_ERROR : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5 sm:px-6 sm:pt-7">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Influnet home">
          <LogoMark size={34} />
          <span className="font-display text-[26px] font-extrabold tracking-[-0.04em]">influnet</span>
        </Link>
        <span className="eyebrow hidden sm:inline">[ {EVENT.name} ]</span>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <div className="rounded-[26px] border border-line bg-card p-5 shadow-[0_24px_60px_-30px_rgba(23,20,29,0.3)] sm:p-8">
          {step.at === 'phone' && (
            <form onSubmit={lookup} noValidate>
              <p className="eyebrow">[ While you wait ]</p>
              <h1 className="mt-2 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[36px]">
                Help us build Influnet <span className="text-brand">for you</span>.
              </h1>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
                A few quick questions about payments and collaborations — about two minutes. Start with the mobile
                number you registered with.
              </p>
              <label htmlFor="phone" className="mt-6 block text-[15px] font-semibold">
                Mobile number
              </label>
              <div
                className={`mt-2 flex h-14 items-center rounded-2xl border bg-paper px-4 focus-within:border-ink ${
                  error ? 'border-red-500' : 'border-line'
                }`}
              >
                <span className="mr-3 font-semibold text-muted">+91</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none"
                />
              </div>
              {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
              <PrimaryButton busy={busy} className="mt-6">
                Continue <ArrowRight className="size-5" />
              </PrimaryButton>
              <p className="mt-4 text-center text-sm text-muted">
                Not registered yet?{' '}
                <Link href="/join" className="font-semibold text-ink-soft underline underline-offset-4">
                  Get your entry pass
                </Link>
              </p>
            </form>
          )}

          {step.at === 'confirm' && registrant && (
            <div>
              <p className="eyebrow">[ Welcome ]</p>
              <h1 className="mt-2 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[36px]">
                Hi {registrant.firstName} 👋
              </h1>
              <p className="mt-2 text-[16px] text-ink-soft">Here’s what we have from your registration.</p>
              <div className="mt-5 space-y-2.5">
                {registrant.location && <Detail icon={<MapPin className="size-4" />} value={registrant.location} />}
                {registrant.instagram && (
                  <Detail icon={<AtSign className="size-4" />} value={`@${registrant.instagram}`} />
                )}
                {registrant.emailMasked && <Detail icon={<Mail className="size-4" />} value={registrant.emailMasked} />}
                {registrant.checkedIn && <Detail icon={<Check className="size-4" />} value="Checked in at the event" />}
              </div>

              <h2 className="mt-8 text-[18px] font-bold">Which one are you?</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <RoleCard
                  active={role === 'creator'}
                  onClick={() => pickRole('creator')}
                  icon={<Sparkles className="size-5" />}
                  title="Creator"
                  body="Influencer, content creator or artist"
                />
                <RoleCard
                  active={role === 'business'}
                  onClick={() => pickRole('business')}
                  icon={<Briefcase className="size-5" />}
                  title="Business owner"
                  body="Brand, shop, agency or startup"
                />
              </div>
              <PrimaryButton
                type="button"
                disabled={!role}
                className="mt-6"
                onClick={() => setStep({ at: 'questions', index: 0 })}
              >
                Start <ArrowRight className="size-5" />
              </PrimaryButton>
              <button
                type="button"
                onClick={() => {
                  setStep({ at: 'phone' });
                  setRole(null);
                  setAnswers({});
                }}
                className="mt-3 w-full text-center text-sm font-semibold text-muted"
              >
                Not you? Use a different number
              </button>
            </div>
          )}

          {step.at === 'questions' && role && (
            <QuestionStep
              key={questions[step.index].id}
              question={questions[step.index]}
              index={step.index}
              total={questions.length}
              answers={answers}
              setAnswers={setAnswers}
              busy={busy}
              error={error}
              onBack={() =>
                setStep(step.index === 0 ? { at: 'confirm' } : { at: 'questions', index: step.index - 1 })
              }
              onNext={() =>
                step.index === questions.length - 1 ? submit() : setStep({ at: 'questions', index: step.index + 1 })
              }
            />
          )}

          {step.at === 'done' && (
            <div className="py-6 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-magenta-tint text-brand-deep">
                <Check className="size-8" />
              </span>
              <h1 className="mt-5 font-display text-[30px] font-extrabold tracking-[-0.035em]">
                Thank you{name ? `, ${name}` : ''}!
              </h1>
              <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-ink-soft">
                Your answers go straight to the team building Influnet. Enjoy the event — we’ll be starting shortly.
              </p>
              <button
                type="button"
                onClick={() => setStep({ at: 'questions', index: 0 })}
                className="mt-6 text-sm font-semibold text-muted underline underline-offset-4"
              >
                Change my answers
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Drop empty answers and "other" text whose option isn't picked. */
function clean(a: Answers): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(a)) {
    if (Array.isArray(v) ? v.length === 0 : !v.trim()) continue;
    out[k] = Array.isArray(v) ? v : v.trim();
  }
  for (const k of Object.keys(out)) {
    if (!k.endsWith(OTHER_SUFFIX)) continue;
    const base = out[k.slice(0, -OTHER_SUFFIX.length)];
    const picked = Array.isArray(base) ? base.includes('other') : base === 'other';
    if (!picked) delete out[k];
  }
  return out;
}

function QuestionStep({
  question: q,
  index,
  total,
  answers,
  setAnswers,
  busy,
  error,
  onBack,
  onNext,
}: {
  question: Question;
  index: number;
  total: number;
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const last = index === total - 1;
  const value = answers[q.id];
  const otherKey = q.id + OTHER_SUFFIX;
  const otherText = typeof answers[otherKey] === 'string' ? (answers[otherKey] as string) : '';

  const options = q.kind === 'text' ? [] : [...q.options, ...(q.other ? [{ id: 'other', label: 'Something else' }] : [])];
  const selected = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
  const atMax = q.kind === 'multi' && q.max !== undefined && selected.length >= q.max;
  const otherPicked = selected.includes('other');

  const toggle = (id: string) => {
    if (q.kind === 'single') {
      setAnswers((a) => ({ ...a, [q.id]: id }));
      return;
    }
    setAnswers((a) => {
      const cur = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
      if (cur.includes(id)) return { ...a, [q.id]: cur.filter((x) => x !== id) };
      // "No problems" and a problem can't both be true.
      if (id === 'none') return { ...a, [q.id]: ['none'] };
      if (q.kind === 'multi' && q.max !== undefined && cur.length >= q.max) return a;
      return { ...a, [q.id]: [...cur.filter((x) => x !== 'none'), id] };
    });
  };

  // Text and multi questions can be skipped; a single-choice needs an answer.
  const canContinue = q.kind !== 'single' || selected.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="grid size-10 place-items-center rounded-full border border-line text-ink-soft"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          {index + 1} / {total}
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <h2 className="mt-6 font-display text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-[28px]">{q.title}</h2>
      {q.hint && <p className="mt-1.5 text-[15px] text-ink-soft">{q.hint}</p>}

      {q.kind === 'text' ? (
        <textarea
          rows={5}
          maxLength={1000}
          placeholder={q.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          className="mt-5 w-full rounded-2xl border border-line bg-paper p-4 text-[16px] outline-none focus:border-ink"
        />
      ) : (
        <div className="mt-5 grid gap-2.5">
          {options.map((o) => {
            const on = selected.includes(o.id);
            const disabled = !on && atMax;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                disabled={disabled}
                aria-pressed={on}
                className={`flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[16px] font-medium transition-colors ${
                  on ? 'border-ink bg-ink text-white' : 'border-line bg-paper hover:border-line-strong'
                } ${disabled ? 'opacity-40' : ''}`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center border ${q.kind === 'single' ? 'rounded-full' : 'rounded-md'} ${
                    on ? 'border-white bg-white text-ink' : 'border-line-strong'
                  }`}
                >
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            );
          })}
          {otherPicked && (
            <input
              autoFocus
              maxLength={200}
              placeholder="Tell us what"
              value={otherText}
              onChange={(e) => setAnswers((a) => ({ ...a, [otherKey]: e.target.value }))}
              className="h-12 rounded-2xl border border-line bg-paper px-4 text-[16px] outline-none focus:border-ink"
            />
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
      <PrimaryButton type="button" busy={busy} disabled={!canContinue} className="mt-6" onClick={onNext}>
        {last ? 'Submit' : selected.length === 0 && q.kind !== 'single' ? 'Skip' : 'Next'}
        {!last && <ArrowRight className="size-5" />}
      </PrimaryButton>
    </div>
  );
}

function PrimaryButton({
  busy,
  className = '',
  children,
  type = 'submit',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type={type}
      {...rest}
      disabled={busy || rest.disabled}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[17px] font-semibold text-white transition-opacity active:scale-[0.985] disabled:opacity-40 ${className}`}
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : children}
    </button>
  );
}

function Detail({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
      <span className="grid size-8 place-items-center rounded-lg bg-magenta-tint text-brand-deep">{icon}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-paper hover:border-line-strong'
      }`}
    >
      <span className={`grid size-10 place-items-center rounded-xl ${active ? 'bg-white/15' : 'bg-magenta-tint text-brand-deep'}`}>
        {icon}
      </span>
      <div className="mt-3 text-[17px] font-bold">{title}</div>
      <div className={`mt-0.5 text-sm ${active ? 'text-white/75' : 'text-ink-soft'}`}>{body}</div>
    </button>
  );
}
