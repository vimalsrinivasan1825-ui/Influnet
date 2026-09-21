'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  AtSign,
  CalendarDays,
  CalendarPlus,
  Clock,
  Download,
  Loader2,
  MapPin,
  Share2,
  X,
} from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import { APP_URL } from '@/components/site/links';
import { EVENT, firstName, qrPath, type Pass } from './event';
import { renderPassPng } from './pass-image';

const STORE_KEY = `influnet.pass.${EVENT.slug}`;

type Field = 'name' | 'phone' | 'email' | 'location' | 'instagram';
type Errors = Partial<Record<Field | 'form', string>>;

// The pass is remembered on this device so reopening the link shows it again.
const passListeners = new Set<() => void>();
const passStore = {
  subscribe(cb: () => void) {
    passListeners.add(cb);
    window.addEventListener('storage', cb);
    return () => {
      passListeners.delete(cb);
      window.removeEventListener('storage', cb);
    };
  },
  get(): string | null {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch {
      return null;
    }
  },
  set(p: Pass | null) {
    try {
      if (p) localStorage.setItem(STORE_KEY, JSON.stringify(p));
      else localStorage.removeItem(STORE_KEY);
    } catch {
      /* private mode: the pass still shows this visit, it just isn't remembered */
    }
    passListeners.forEach((cb) => cb());
  },
};

function parsePass(raw: string | null): Pass | null {
  try {
    const p = raw ? (JSON.parse(raw) as Pass) : null;
    return p?.passCode && p?.name ? p : null;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};
const canShareFiles = () => {
  try {
    const probe = new File([new Blob()], 'p.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

function validate(v: Record<Field, string>): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name';
  const raw = v.phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) e.phone = 'Phone number is required';
  else if (!/^\+?[0-9\s\-().]+$/.test(raw)) e.phone = 'Use digits only';
  else if (raw.startsWith('+') ? digits.length < 8 || digits.length > 15 : digits.replace(/^0/, '').length !== 10)
    e.phone = 'Enter a 10-digit mobile number';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'That email doesn’t look right';
  return e;
}

export default function EventRegistration() {
  const storedPass = parsePass(useSyncExternalStore(passStore.subscribe, passStore.get, () => null));
  // Set on submit; takes precedence so the pass shows even if storage is blocked.
  const [fresh, setFresh] = useState<{ pass: Pass; returning: boolean } | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const pass = fresh?.pass ?? storedPass;
  const returning = fresh ? fresh.returning : Boolean(storedPass);

  const onRegistered = (p: Pass, already: boolean) => {
    setFresh({ pass: p, returning: already });
    passStore.set(p);
    requestAnimationFrame(() =>
      document.getElementById('pass')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const reset = () => {
    setFresh(null);
    passStore.set(null);
  };

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-5 sm:px-6 sm:pt-7">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Influnet home">
          <LogoMark size={34} />
          <span className="font-display text-[26px] font-extrabold tracking-[-0.04em]">influnet</span>
        </Link>
        <span className="eyebrow hidden sm:inline">[ Event registration ]</span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-10">
        {/* Event: poster + the facts, readable without zooming into the image. */}
        <section className="lg:sticky lg:top-8 lg:self-start">
          <button
            type="button"
            onClick={() => setPosterOpen(true)}
            className="group relative block w-full overflow-hidden rounded-[22px] border border-line bg-card shadow-[0_18px_50px_-24px_rgba(23,20,29,0.35)]"
            aria-label="View the event poster full size"
          >
            <Image
              src={EVENT.poster}
              alt="Silicon Nexus S2, September edition — soft launch of Influnet. Friday 25 September 2026, 3 to 6 PM, StartupTN office, Chennai."
              width={1254}
              height={1254}
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.015]"
            />
            <span className="absolute bottom-3 right-3 rounded-full bg-night/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white backdrop-blur">
              Tap to enlarge
            </span>
          </button>

          <div className="mt-6">
            <p className="eyebrow">[ {EVENT.name} · {EVENT.edition} ]</p>
            <h1 className="mt-3 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[44px]">
              You’re invited to the <span className="text-brand">Influnet</span> soft launch.
            </h1>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-ink-soft">
              For influencers, content creators and artists. Register below and you’ll get a personal entry
              pass with your own code — show it at the door.
            </p>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              <Fact icon={<CalendarDays className="size-[18px]" />} label="Date" value={EVENT.dateLabel} />
              <Fact icon={<Clock className="size-[18px]" />} label="Time" value={EVENT.timeLabel} />
              <a
                href={EVENT.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sm:col-span-2 flex gap-3 rounded-2xl border border-line bg-card p-3.5 transition-colors hover:border-line-strong"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-magenta-tint text-brand-deep">
                  <MapPin className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="eyebrow">Venue</div>
                  <div className="mt-0.5 font-semibold">
                    {EVENT.venue}, {EVENT.city}
                  </div>
                  <div className="mt-0.5 text-sm leading-snug text-ink-soft">{EVENT.address}</div>
                  <div className="mt-1.5 text-sm font-semibold text-brand-deep">Open in Maps →</div>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Form → pass */}
        <section id="pass" className="scroll-mt-6">
          {pass ? (
            <PassView pass={pass} returning={returning} onReset={reset} />
          ) : (
            <RegisterForm onRegistered={onRegistered} />
          )}
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-sm text-muted">
        Presented by Tecstellar &amp; Buziness 365 ·{' '}
        <Link href="/" className="font-semibold text-ink-soft underline-offset-4 hover:underline">
          influnet.io
        </Link>
      </footer>

      {!pass && <JumpToForm />}
      {posterOpen && <PosterLightbox onClose={() => setPosterOpen(false)} />}
    </div>
  );
}

// Phones see the poster and details first, so the form starts two screens down.
// Keep a way to it on screen until the form itself scrolls into view.
function JumpToForm() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const form = document.getElementById('pass');
    if (!form) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0), {
      threshold: 0,
    });
    io.observe(form);
    return () => io.disconnect();
  }, []);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 transition-[transform,opacity] duration-300 lg:hidden ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          document.getElementById('pass')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => document.getElementById('name')?.focus({ preventScroll: true }), 450);
        }}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[17px] font-semibold text-white shadow-[0_14px_36px_-10px_rgba(20,17,24,0.55)] active:scale-[0.985]"
      >
        Get my entry pass <ArrowRight className="size-5" />
      </button>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-magenta-tint text-brand-deep">{icon}</span>
      <div>
        <div className="eyebrow">{label}</div>
        <div className="mt-0.5 font-semibold">{value}</div>
      </div>
    </div>
  );
}

function PosterLightbox({ onClose }: { onClose: () => void }) {
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Event poster"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-night/90 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
      <Image
        src={EVENT.poster}
        alt="Silicon Nexus S2 event poster"
        width={1254}
        height={1254}
        className="h-auto max-h-[88dvh] w-auto max-w-full rounded-2xl"
      />
    </div>
  );
}

/* ───────────────────────────── Form ───────────────────────────── */

function RegisterForm({ onRegistered }: { onRegistered: (p: Pass, already: boolean) => void }) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    phone: '',
    email: '',
    location: '',
    instagram: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const instagramRef = useRef<HTMLInputElement>(null);
  const FIELDS: Field[] = ['name', 'phone', 'email', 'location', 'instagram'];
  const focus = (f: Field) =>
    ({ name: nameRef, phone: phoneRef, email: emailRef, location: locationRef, instagram: instagramRef })[
      f
    ].current?.focus();

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (errors[f]) setErrors((x) => ({ ...x, [f]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validate(values);
    setErrors(found);
    const first = FIELDS.find((f) => found[f]);
    if (first) {
      focus(first);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${APP_URL}/api/event-pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: EVENT.slug,
          name: values.name.trim(),
          phone: values.phone.trim(),
          email: values.email.trim() || null,
          location: values.location.trim() || null,
          instagram: values.instagram.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        onRegistered({ passCode: json.passCode, name: json.name }, Boolean(json.alreadyRegistered));
        return;
      }
      if (res.status === 429) {
        setErrors({ form: 'Too many attempts. Please wait a minute and try again.' });
        return;
      }
      const field = json?.field as Field | undefined;
      if (field && FIELDS.includes(field)) {
        setErrors({ [field]: json.error });
        focus(field);
      } else {
        setErrors({ form: json?.error || 'Something went wrong. Please try again.' });
      }
    } catch {
      setErrors({ form: 'No connection. Check your internet and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-[26px] border border-line bg-card p-5 shadow-[0_24px_60px_-30px_rgba(23,20,29,0.3)] sm:p-8"
    >
      <p className="eyebrow">[ Entry pass ]</p>
      <h2 className="mt-2 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[32px]">
        Get your entry pass
      </h2>
      <p className="mt-2 text-[15px] text-ink-soft">Takes under a minute. Fields marked * are required.</p>

      <div className="mt-6 space-y-4">
        <Input
          ref={nameRef}
          id="name"
          label="Full name"
          required
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Your name"
          value={values.name}
          onChange={set('name')}
          error={errors.name}
        />
        <Input
          ref={phoneRef}
          id="phone"
          label="Phone number"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          placeholder="10-digit mobile number"
          lead="+91"
          hint="We’ll use this to reach you about the event."
          value={values.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
        <Input
          ref={emailRef}
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          enterKeyHint="next"
          placeholder="you@email.com"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Input
          ref={locationRef}
          id="location"
          label="Current location"
          autoComplete="address-level2"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="City, e.g. Chennai"
          value={values.location}
          onChange={set('location')}
          error={errors.location}
        />
        <Input
          ref={instagramRef}
          id="instagram"
          label="Instagram profile"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="yourhandle"
          lead={<AtSign className="size-4" />}
          value={values.instagram}
          onChange={set('instagram')}
          error={errors.instagram}
        />
      </div>

      {errors.form && (
        <p role="alert" className="mt-5 rounded-xl border border-brand/30 bg-magenta-tint px-4 py-3 text-sm font-medium text-brand-deep">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[17px] font-semibold text-white transition-[transform,background-color] active:scale-[0.985] hover:bg-night disabled:opacity-70"
      >
        {submitting ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Creating your pass…
          </>
        ) : (
          <>
            Get my entry pass <ArrowRight className="size-5" />
          </>
        )}
      </button>
      <p className="mt-3 text-center text-[13px] leading-snug text-muted">
        Your details go only to the Influnet team for this event.
      </p>
    </form>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: Field;
  label: string;
  error?: string;
  hint?: string;
  lead?: React.ReactNode;
  ref: React.Ref<HTMLInputElement>;
};

function Input({ id, label, error, hint, lead, required, ref, ...rest }: InputProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold">
        {label}
        {required ? <span className="text-brand-deep"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <div
        className={`flex h-[52px] items-center rounded-2xl border bg-paper transition-[border-color,box-shadow] focus-within:bg-card ${
          error
            ? 'border-brand-deep focus-within:shadow-[0_0_0_4px_rgba(200,48,127,0.15)]'
            : 'border-line-strong focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(23,20,29,0.08)]'
        }`}
      >
        {lead && (
          <span className="flex h-full items-center border-r border-line pl-4 pr-3 text-[16px] font-medium text-ink-soft">
            {lead}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          name={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 rounded-2xl bg-transparent px-4 text-[16px] outline-none focus-visible:outline-none! placeholder:text-muted"
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-brand-deep">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Pass ───────────────────────────── */

function PassView({ pass, returning, onReset }: { pass: Pass; returning: boolean; onReset: () => void }) {
  const qr = qrPath(pass.passCode);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const canShare = useSyncExternalStore(noopSubscribe, canShareFiles, () => false);
  const fileName = `influnet-pass-${pass.passCode}.png`;

  const save = async () => {
    setBusy('save');
    try {
      const blob = await renderPassPng(pass);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    try {
      const blob = await renderPassPng(pass);
      await navigator.share({
        files: [new File([blob], fileName, { type: 'image/png' })],
        title: `My ${EVENT.name} pass`,
      });
    } catch {
      /* user closed the share sheet */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="anim-rise">
      <p className="mb-3 text-center text-[15px] font-medium text-[#0b7a55] sm:text-left">
        {returning ? '✓ You’re already registered — here’s your pass.' : '✓ You’re registered. See you there!'}
      </p>

      {/* Ticket */}
      <div className="relative overflow-hidden rounded-[28px] bg-night text-white shadow-[0_30px_70px_-30px_rgba(20,17,24,0.7)]">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-brand/30 blur-3xl" />
        <div className="relative px-6 pb-7 pt-6 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <LogoMark size={26} />
              <span className="font-display text-xl font-extrabold tracking-[-0.04em]">influnet</span>
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-night-soft">[ Entry pass ]</span>
          </div>

          <p className="mt-7 font-mono text-[12px] uppercase tracking-[0.14em] text-brand">
            {EVENT.name} · Soft launch
          </p>
          <h2 className="mt-2 break-words font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[40px]">
            Welcome, {firstName(pass.name)}
          </h2>
          <p className="mt-2 text-[16px] text-night-soft">We’re looking forward to seeing you.</p>

          <div className="mx-auto mt-7 w-full max-w-[250px] rounded-[22px] bg-white p-4">
            <svg
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              className="block w-full"
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code for pass ${pass.passCode}`}
            >
              <path d={qr.d} fill="#141118" />
            </svg>
          </div>
          <p className="mt-5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-night-soft">Your code</p>
          <p className="mt-1 text-center font-mono text-[32px] font-semibold tracking-[0.06em] select-all">
            {pass.passCode}
          </p>
        </div>

        {/* Perforation */}
        <div className="relative h-0">
          <span className="absolute -left-4 -top-4 size-8 rounded-full bg-paper" />
          <span className="absolute -right-4 -top-4 size-8 rounded-full bg-paper" />
          <span className="absolute inset-x-6 top-0 border-t-2 border-dashed border-white/15" />
        </div>

        <div className="relative grid grid-cols-3 gap-3 px-6 pb-6 pt-6 sm:px-8">
          <TicketFact label="Date" a={EVENT.dateShort} b="2026" />
          <TicketFact label="Time" a="3 – 6 PM" b="IST" />
          <TicketFact label="Venue" a="StartupTN" b={EVENT.city} />
        </div>
      </div>

      <p className="mt-4 text-center text-[14px] text-ink-soft">
        Save this pass and show the QR code at the entrance.
      </p>

      <div className={`mt-4 grid gap-2.5 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button
          type="button"
          onClick={save}
          disabled={busy !== null}
          className="flex h-13 items-center justify-center gap-2 rounded-full bg-ink py-3.5 font-semibold text-white active:scale-[0.985] disabled:opacity-70"
        >
          {busy === 'save' ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
          Save pass
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-full border border-line-strong bg-card py-3.5 font-semibold active:scale-[0.985] disabled:opacity-70"
          >
            {busy === 'share' ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
            Share
          </button>
        )}
      </div>
      <a
        href={EVENT.calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 flex items-center justify-center gap-2 rounded-full border border-line-strong bg-card py-3.5 font-semibold"
      >
        <CalendarPlus className="size-5" /> Add to calendar
      </a>

      <div className="mt-6 rounded-2xl border border-line bg-paper-deep p-4 text-[14px] leading-relaxed text-ink-soft">
        While you wait: Influnet is where creators and brands find each other, agree terms and deliver campaigns — every step on the record.{' '}
        <a href={`${APP_URL}/signup/influencer`} className="font-semibold text-ink underline underline-offset-4">
          Create your creator profile
        </a>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mx-auto mt-5 block text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
      >
        Not you? Register someone else
      </button>
    </div>
  );
}

function TicketFact({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-night-soft">{label}</div>
      <div className="mt-1 truncate font-display text-[17px] font-bold tracking-[-0.02em]">{a}</div>
      <div className="truncate text-[13px] text-night-soft">{b}</div>
    </div>
  );
}
