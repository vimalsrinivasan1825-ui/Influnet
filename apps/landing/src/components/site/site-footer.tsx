'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '@/components/motion/gsap';
import { ROLE_PATH, type Role } from '@/lib/role';
import { APP_LINK, APP_URL, SIGNUP_URL, SOCIALS, SUPPORT_EMAIL } from './links';

// The one footer for every page on the site.
type Props = {
  /** Preselects the enquiry form; the legal pages have no side and default to creator. */
  role?: Role;
};

const MAX_WORDS = 200;
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

type FooterLink = { label: string; href: string; external?: boolean };

const columns = (role: Role): { title: string; links: FooterLink[] }[] => [
  {
    title: 'Platform',
    links: [
      { label: 'For creators', href: '/creators' },
      { label: 'For brands', href: '/business' },
      { label: 'Mobile app', href: APP_LINK },
      { label: 'Create an account', href: SIGNUP_URL[role], external: true },
      { label: 'Log in', href: `${APP_URL}/login`, external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'How it works', href: role === 'creator' ? '/creators#how' : '/business#steps' },
      { label: 'FAQ', href: `${ROLE_PATH[role]}#faq` },
      { label: 'Contact us', href: `mailto:${SUPPORT_EMAIL}`, external: true },
    ],
  },
];

export default function SiteFooter({ role = 'creator' }: Props) {
  const root = useRef<HTMLElement>(null);
  const hasSocials = Object.values(SOCIALS).some(Boolean);

  // The wordmark rises out of the bottom edge as the footer scrolls in.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-wordmark]', {
        yPercent: 45,
        ease: 'none',
        scrollTrigger: { trigger: '[data-wordmark-wrap]', start: 'top bottom', end: 'bottom bottom', scrub: 0.6 },
      });
    },
    { scope: root },
  );

  const c = {
    shell: 'bg-night text-night-soft border-white/10',
    heading: 'text-white',
    link: 'text-night-soft hover:text-white',
    colTitle: 'text-white',
    icon: 'border-white/15 text-night-soft hover:border-brand hover:text-white',
    rule: 'border-white/10',
    fine: 'text-white/50 hover:text-white',
    wordFade: 'from-brand via-brand/45 to-night',
  };

  return (
    <footer ref={root} data-tone="dark" className={`relative overflow-hidden border-t ${c.shell}`}>
      <div className="mx-auto grid max-w-[1320px] gap-14 px-4 pt-20 sm:px-8 sm:pt-24 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-12 xl:grid-cols-[1fr_minmax(0,520px)] xl:gap-20">
        {/* Left: pitch, link columns, support */}
        <div className="flex flex-col gap-12">
          <div>
            <h2 className={`font-display max-w-[560px] text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[56px] ${c.heading}`}>
              Questions before you start? <span className="text-brand">Ask&nbsp;us.</span>
            </h2>
            <p className="mt-5 max-w-[460px] text-base leading-relaxed sm:text-lg">
              Creators, brands and agencies — tell us what you&apos;re working on and a real person from the Influnet
              team will get back to you.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-[1fr_1fr_1.35fr]">
            {columns(role).map((col) => (
              <div key={col.title}>
                <h3 className={`text-sm font-semibold ${c.colTitle}`}>{col.title}</h3>
                <ul className="mt-4 space-y-3 text-[15px]">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.external ? (
                        <a href={l.href} className={`transition-colors ${c.link}`}>
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className={`transition-colors ${c.link}`}>
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="col-span-2 sm:col-span-1">
              <h3 className={`text-sm font-semibold ${c.colTitle}`}>Support</h3>
              <p className="mt-4 text-[15px] leading-relaxed">Need help? Our team is here to guide you.</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 inline-block text-[15px] font-semibold text-brand hover:underline">
                {SUPPORT_EMAIL}
              </a>
              {hasSocials && (
                <div className="mt-5 flex gap-2.5">
                  {SOCIALS.instagram && (
                    <SocialLink href={SOCIALS.instagram} label="Influnet on Instagram" className={c.icon}>
                      <InstagramIcon />
                    </SocialLink>
                  )}
                  {SOCIALS.linkedin && (
                    <SocialLink href={SOCIALS.linkedin} label="Influnet on LinkedIn" className={c.icon}>
                      <LinkedInIcon />
                    </SocialLink>
                  )}
                  {SOCIALS.youtube && (
                    <SocialLink href={SOCIALS.youtube} label="Influnet on YouTube" className={c.icon}>
                      <YouTubeIcon />
                    </SocialLink>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: enquiry card */}
        <ContactCard defaultRole={role} />
      </div>

      {/* Legal row */}
      <div className="mx-auto mt-16 max-w-[1320px] px-4 sm:px-8">
        <div className={`flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-[13px] ${c.rule}`}>
          <div className="flex flex-wrap gap-6">
            <Link href="/terms" className={`transition-colors ${c.fine}`}>Terms</Link>
            <Link href="/privacy" className={`transition-colors ${c.fine}`}>Privacy</Link>
            <Link href="/refunds" className={`transition-colors ${c.fine}`}>Refunds</Link>
          </div>
          <span className={c.fine.split(' ')[0]}>© {new Date().getFullYear()} Influnet. All rights reserved.</span>
        </div>
      </div>

      {/* Oversized wordmark, cropped by the page edge */}
      <div data-wordmark-wrap aria-hidden className="pointer-events-none mt-6 h-[21vw] select-none overflow-hidden sm:mt-10">
        <div
          data-wordmark
          className={`bg-gradient-to-b bg-clip-text text-center font-display text-[27.2vw] font-extrabold leading-[0.8] tracking-[-0.055em] text-transparent ${c.wordFade}`}
        >
          influnet
        </div>
      </div>
    </footer>
  );
}

function ContactCard({ defaultRole }: { defaultRole: Role }) {
  const [role, setRole] = useState<Role>(defaultRole);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const words = countWords(query);

  // No public write endpoint exists for anonymous enquiries yet, so this hands
  // the message to the visitor's own mail app, addressed to support.
  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (!name.trim()) return setError('Please tell us your name.');
    if (digits.length !== 10) return setError('Enter a 10-digit mobile number.');
    if (!query.trim()) return setError('Tell us how we can help.');
    if (words > MAX_WORDS) return setError(`Keep it under ${MAX_WORDS} words.`);
    setError(null);

    const who = role === 'creator' ? 'Creator' : 'Business';
    const subject = `Influnet enquiry — ${who} — ${name.trim()}`;
    const body = `Role: ${who}\nName: ${name.trim()}\nPhone: +91 ${digits}\n\n${query.trim()}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }

  const field =
    'w-full rounded-xl border border-transparent bg-paper-deep px-4 text-[15px] text-ink placeholder:text-muted outline-none transition-colors focus:border-brand focus:bg-white';

  return (
    <form
      onSubmit={submit}
      noValidate
      className="self-start rounded-[28px] bg-card p-6 text-ink shadow-[0_30px_80px_-30px_rgba(255,7,142,.35)] ring-1 ring-black/5 sm:p-8"
    >
      <h3 className="font-display text-[28px] font-bold tracking-[-0.03em]">Get started now</h3>

      <fieldset className="mt-6">
        <legend className="text-[13px] font-semibold">
          You are <span className="text-brand">*</span>
        </legend>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {(['creator', 'business'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`h-12 rounded-xl border-[1.5px] text-[15px] font-semibold transition-colors ${
                role === r ? 'border-brand bg-brand/[.06] text-ink' : 'border-line text-ink-soft hover:border-line-strong'
              }`}
            >
              {r === 'creator' ? 'A creator' : 'A business'}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="text-[13px] font-semibold">
          Full name <span className="text-brand">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          placeholder="Enter your name"
          className={`mt-2 h-12 ${field}`}
        />
      </label>

      <label className="mt-5 block">
        <span className="text-[13px] font-semibold">
          Phone number <span className="text-brand">*</span>
        </span>
        <div className="mt-2 flex h-12 overflow-hidden rounded-xl bg-paper-deep focus-within:ring-[1.5px] focus-within:ring-brand">
          <span className="flex items-center border-r border-line px-4 text-[15px] text-ink-soft">+91</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Enter number"
            className="min-w-0 flex-1 bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-muted"
          />
        </div>
      </label>

      <label className="mt-5 block">
        <span className="text-[13px] font-semibold">
          Your query <span className="text-brand">*</span>
        </span>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          placeholder="Tell us how we can help you…"
          className={`mt-2 resize-none py-3 ${field}`}
        />
        <span className={`mt-1.5 block text-right text-xs ${words > MAX_WORDS ? 'text-brand' : 'text-muted'}`}>
          Max words: {words} / {MAX_WORDS}
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-brand">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="group mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[16px] font-bold text-white shadow-[0_14px_30px_-12px_rgba(255,7,142,.7)] transition-colors hover:bg-brand-deep"
      >
        Send message
        <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </button>

      {opened && !error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft" aria-live="polite">
          <Check className="mt-0.5 size-4 shrink-0 text-verified" />
          Your email app should open with the message ready. If it didn&apos;t, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand">
            {SUPPORT_EMAIL}
          </a>
        </p>
      )}
    </form>
  );
}

function SocialLink({ href, label, className, children }: { href: string; label: string; className: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`flex size-10 items-center justify-center rounded-full border transition-colors ${className}`}
    >
      {children}
    </a>
  );
}

// Brand glyphs drawn inline: lucide dropped its brand icons in v1.
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[17px]" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.55 4.78 5.87v5.58h-4v-4.95c0-1.18-.02-2.7-1.7-2.7-1.7 0-1.95 1.3-1.95 2.62v5.03h-4v-11Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[19px]" fill="currentColor">
      <path d="M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.75 12 4.75 12 4.75s-6.8 0-8.5.45a2.8 2.8 0 0 0-2 2C1.05 8.9 1.05 12 1.05 12s0 3.1.45 4.8a2.8 2.8 0 0 0 2 2c1.7.45 8.5.45 8.5.45s6.8 0 8.5-.45a2.8 2.8 0 0 0 2-2c.45-1.7.45-4.8.45-4.8s0-3.1-.45-4.8ZM9.8 15.1V8.9l5.7 3.1-5.7 3.1Z" />
    </svg>
  );
}
