'use client';
import { toast } from "sonner";

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './creator-profile.module.css';
import type { CreatorProfileView } from '@/lib/public-profile/creator-profile';
import { apiFetch } from '@/lib/api-client';

const PRESETS: { name: string; a: string; b: string }[] = [
  { name: 'Violet', a: '#7C6BF6', b: '#9E92FF' },
  { name: 'Rose', a: '#EC2C7A', b: '#FF6FA6' },
  { name: 'Blue', a: '#2E90FA', b: '#6AB6FF' },
  { name: 'Emerald', a: '#12B981', b: '#4BD9A8' },
  { name: 'Amber', a: '#F5A623', b: '#FFC15E' },
];

function lighten(hex: string, amt: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = Math.round(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amt);
  const g = Math.round(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amt);
  const b = Math.round(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amt);
  return `rgb(${r},${g},${b})`;
}

const AGE_PALETTE = ['var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--c2)'];

function buildConic(slices: { label: string; pct: number }[], palette: string[]): string {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.pct), 0);
  if (total <= 0) return palette[0] ?? 'var(--c1)';
  let acc = 0;
  const stops = slices.map((s, i) => {
    const start = (acc / total) * 100;
    acc += Math.max(0, s.pct);
    const end = (acc / total) * 100;
    return `${palette[i % palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(',')})`;
}

/* ── icons ── */
const Ic = (p: { d: string; fill?: boolean; w?: number }) => (
  <svg className={styles.ico} viewBox="0 0 24 24" fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={p.w ? { width: `${p.w}em`, height: `${p.w}em` } : undefined}>
    <path d={p.d} />
  </svg>
);
const Check = ({ w }: { w?: number }) => <Ic d="M20 6 9 17l-5-5" w={w} />;
const Play = () => <Ic d="M8 5v14l11-7z" fill />;
const Heart = () => <Ic d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill />;
const Send = () => <Ic d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />;
const Copy = () => <Ic d="M9 9h11v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />;
const Mail = () => <Ic d="M3 6h18v12H3zM3 7l9 6 9-6" />;
const Phone = () => <Ic d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />;
const IgLogo = ({ s = 16 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="#fff" strokeWidth={2}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.4" r="1.1" fill="#fff" stroke="none" />
  </svg>
);
const YtPlay = ({ s = 16 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="#fff"><path d="M8 5v14l11-7z" /></svg>
);

function Rail({
  children,
  label,
  title,
  icon,
  meta,
}: {
  children: React.ReactNode;
  label: string;
  title: string;
  icon: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };

  useEffect(() => {
    sync();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 200), behavior: 'smooth' });
  };

  const scrollable = !(atStart && atEnd);

  return (
    <>
      <div className={styles.chead}>
        <div className={styles.ctitle}><span className={styles.ci}>{icon}</span>{title}</div>
        <div className={styles.cmeta}>
          {meta}
          {scrollable && (
            <div className={styles.railnav}>
              <button type="button" aria-label={`Scroll ${label} left`} disabled={atStart} onClick={() => nudge(-1)}>
                <Ic d="M15 18l-6-6 6-6" />
              </button>
              <button type="button" aria-label={`Scroll ${label} right`} disabled={atEnd} onClick={() => nudge(1)}>
                <Ic d="M9 18l6-6-6-6" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.rail} ref={ref} onScroll={sync}>
        {children}
      </div>
    </>
  );
}

export interface CreatorProfileViewProps {
  data: CreatorProfileView;
  isOwner: boolean;
  ctaHref: string;
  ctaLabel: string;
}

export default function CreatorProfileViewComponent({ data, isOwner, ctaHref, ctaLabel }: CreatorProfileViewProps) {
  const [accent, setAccent] = useState(PRESETS[0].a);
  const [accent2, setAccent2] = useState(PRESETS[0].b);
  const [dark, setDark] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const storeKey = `influnet:profile-appearance:${data.username}`;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await apiFetch('/api/profile/refresh', { method: 'POST' });
      if (!res.ok) {
        toast.error(res.error || 'Failed to refresh data');
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error('An error occurred while refreshing data.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const a = JSON.parse(raw) as { accent?: string; accent2?: string; dark?: boolean };
        if (a.accent) setAccent(a.accent);
        if (a.accent2) setAccent2(a.accent2);
        if (typeof a.dark === 'boolean') setDark(a.dark);
      }
    } catch { /* ignore */ }
  }, [storeKey]);

  const applyPreset = (a: string, b: string) => { setAccent(a); setAccent2(b); };
  const applyCustom = (v: string) => { setAccent(v); setAccent2(lighten(v, 0.22)); };
  const publish = () => {
    try { localStorage.setItem(storeKey, JSON.stringify({ accent, accent2, dark })); } catch { /* ignore */ }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  // Human-readable form of the shareable URL, e.g. "influnet.app/c/username".
  // Declared before copyUrl because the failure path quotes it.
  const displayUrl = data.profileUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  /**
   * Put the profile URL on the clipboard.
   *
   * The address is no longer displayed anywhere in the "Let's connect" card, so
   * this button is the only way to get it — a silent failure would leave a
   * visitor with nothing to fall back on. The async Clipboard API is refused in
   * a few real situations (no permission, a non-secure origin, an embedded
   * frame), so a failure falls back to the old execCommand path and, only if
   * that also fails, says so instead of doing nothing.
   */
  const copyUrl = async () => {
    const confirmCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    try {
      await navigator.clipboard.writeText(data.profileUrl);
      confirmCopied();
      return;
    } catch { /* fall through to the legacy path */ }

    try {
      const field = document.createElement('textarea');
      field.value = data.profileUrl;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(field);
      if (ok) {
        confirmCopied();
        return;
      }
    } catch { /* nothing left to try */ }

    toast.error(`Couldn't copy automatically. The link is ${displayUrl}`);
  };

  const shareMore = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `${data.name} — Influnet`, url: data.profileUrl });
      else await copyUrl();
    } catch { /* dismissed */ }
  };

  const styleVars = { ['--accent']: accent, ['--accent-2']: accent2 } as CSSProperties;
  const rootClass = [styles.stage, dark ? styles.dark : '', previewing ? styles.previewing : '', editing ? styles.editing : ''].filter(Boolean).join(' ');

  const audience = data.audience;
  const genderPair = audience?.genders.slice(0, 2) ?? [];

  return (
    <div className={rootClass} style={styleVars}>
      <div className={styles.bg}>
        <span className={`${styles.blob} ${styles.b1}`} />
        <span className={`${styles.blob} ${styles.b2}`} />
      </div>

      {isOwner && (
        <div className={styles.previewbanner}>
          <span><Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />You&apos;re viewing your public profile exactly as a visitor sees it</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`${styles.btn} ${styles.tb}`} onClick={handleRefresh} disabled={refreshing}>
              <Ic d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button className={`${styles.btn} ${styles.tb}`} onClick={() => setPreviewing(false)}><Ic d="M19 12H5M11 6l-6 6 6 6" />Back to editing</button>
          </div>
        </div>
      )}

      <div className={styles.wrap}>
        {/* Masthead: the platform's name centred, and one share action.
            The primary CTA used to live here too, which meant "Work with me"
            appeared four times on a single page — masthead, hero, sidebar and
            the collaborate card. The three that sit next to the creator's own
            work are the ones that earn the click; this one just competed with
            them. The address itself is gone for the same reason it left the
            sidebar: nobody retypes a URL off a screen. */}
        <div className={styles.topbar}>
          <span className={styles.topspacer} aria-hidden="true" />

          <Link href="/" className={styles.brand}>
            <Image src="/influet_logo.png" alt="Influnet Logo" width={48} height={48} style={{ borderRadius: '12px', objectFit: 'contain' }} />
            influnet
          </Link>

          <div className={styles.topactions}>
            <button
              type="button"
              className={`${styles.copytop} ${copied ? styles.done : ''}`}
              onClick={copyUrl}
              aria-live="polite"
            >
              <span className={styles.livepulse} />
              {copied ? <Check w={0.95} /> : <Copy />}
              <span className={styles.copylabel}>{copied ? 'Link copied' : 'Copy link'}</span>
            </button>
          </div>
        </div>

        {/* ── TOP ROW: Hero (left, stretches to sidebar height) + Sidebar (right) ── */}
        <div className={styles.layout}>
          {/* HERO — fills 100% of the layout row height */}
          <div className={styles.main}>
            <section className={`${styles.hero} ${styles.herofull}`}>
              <div className={styles.herotop}>
                <div className={styles.hleft}>
                  <span className={styles.eyebrow}>
                    <Ic d="M12 2l2.4 6.9L21 9.2l-5.2 4.2 1.9 6.6L12 16.6 6.3 20l1.9-6.6L3 9.2l6.6-.3z" fill />
                    {data.isVerified ? 'Verified creator' : 'Creator'}
                  </span>

                  <h1>
                    {data.name}
                    {data.isVerified && (
                      <span className={styles.vtick} title="Verified by Influnet" aria-label="Verified by Influnet">
                        <Check w={0.62} />
                      </span>
                    )}
                  </h1>

                  <h2 className={styles.subtitle}>
                    {data.subtitleLead} <span className={styles.grad}>{data.subtitleAccent}</span>
                  </h2>

                  <p className={styles.tag}>{data.tagline}</p>

                  <div className={styles.cta}>
                    <Link className={`${styles.btn} ${styles.accent}`} href={ctaHref}><Send />{ctaLabel}</Link>
                    <a
                      className={`${styles.btn} ${styles.ghost}`}
                      href="#featured"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    ><Play />View my work</a>
                  </div>
                </div>

                {/* Right column: avatar on top, 2×2 platform cards below */}
                <div className={styles.hmid}>
                  <div className={styles.havatar}>
                    <span className={styles.haloglow} />
                    <span className={styles.halo} />
                    <span className={styles.halo2} />
                    <span className={styles.halo3} />
                    <div className={styles.avatar}>
                      {data.avatarUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img className={styles.avimg} src={data.avatarUrl} alt={data.name} />
                        : <div className={styles.avfallback}>{data.name.charAt(0).toUpperCase()}</div>}
                    </div>
                  </div>

                  {data.platformCards.length > 0 && (
                    <ul className={styles.pstack}>
                      {data.platformCards.map((c) => (
                        <li className={styles.pcard} key={c.label}>
                          <span
                            className={styles.fi}
                            style={{ background: c.platform === 'youtube' ? 'var(--yt)' : 'var(--ig)' }}
                          >
                            {c.platform === 'youtube' ? <YtPlay /> : <IgLogo />}
                          </span>
                          <span className={styles.pmeta}>
                            <b>{c.value}</b>
                            <small>{c.label}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className={styles.herostats}>
                {data.stats.map((s, i) => (
                  <div className={styles.hstat} key={s.label}>
                    <span className={styles.si}>
                      {i === 0 ? <Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
                        : i === 1 ? <Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
                          : <Ic d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />}
                    </span>
                    <span className={styles.hsmeta}>
                      <b>{s.value}</b>
                      <small>{s.label}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* SIDEBAR — 4 cards that set the row height */}
          <div className={styles.side}>
            <div className={`${styles.card} ${styles.pad}`}>
              <div className={styles['share-title']}><h3>Let&apos;s connect</h3><p>Share my profile instantly</p></div>
              {/* Copy joins the share row as a fourth destination rather than
                  repeating the masthead's button. Both were visible at once on
                  a desktop screen, which is the same duplication that pushed
                  the CTA out of the masthead. */}
              <div className={styles.divlabel}>Share via</div>
              <div className={styles.sharevia}>
                <button
                  type="button"
                  className={`${styles.svbtn} ${copied ? styles.svdone : styles.svcopy}`}
                  aria-label={copied ? 'Link copied to clipboard' : 'Copy profile link'}
                  title={copied ? 'Link copied' : 'Copy link'}
                  onClick={copyUrl}
                >
                  {copied ? <Check w={0.95} /> : <Copy />}
                </button>
                <a className={styles.svbtn} style={{ background: 'var(--wa)' }} aria-label="Share on WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(data.profileUrl)}`} target="_blank" rel="noopener noreferrer">
                  <Ic d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.3.6-.6.7-.8 1-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.5.7 1.7.9.2.1.4.1.4.2.1.2.1.7-.1 1.3Z" fill />
                </a>
                <a className={styles.svbtn} style={{ background: '#0A66C2' }} aria-label="Share on LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.profileUrl)}`} target="_blank" rel="noopener noreferrer">
                  <Ic d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z" fill />
                </a>
                <button className={styles.svbtn} style={{ background: 'var(--tile)', color: 'var(--ink-2)' }} aria-label="More ways to share" onClick={shareMore}>
                  <Ic d="M5 12a2 2 0 1 0 0 .01M12 12a2 2 0 1 0 0 .01M19 12a2 2 0 1 0 0 .01" fill />
                </button>
              </div>
            </div>

            {(data.location || data.languages.length > 0) && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>About me</h3>
                <div className={styles.aboutlist}>
                  {data.location && <div><span className={styles.ai}><Ic d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></span>{data.location}</div>}
                  {data.languages.length > 0 && <div><span className={styles.ai}><Ic d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></span>{data.languages.join(', ')}</div>}
                </div>
              </div>
            )}

            {data.niches.length > 0 && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>What I create</h3>
                <div className={styles.createpills}>{data.niches.map((n) => <span className={styles.cpill} key={n}>{n}</span>)}</div>
              </div>
            )}

            <div className={`${styles.card} ${styles.pad} ${styles.growcard}`}>
              <h3>Ready to grow together?</h3>
              <p>Let&apos;s create something impactful.</p>
              <Link className={`${styles.btn} ${styles.accent} ${styles.wide} ${styles.sm}`} href={ctaHref}><Send />{ctaLabel}</Link>
            </div>
          </div>
        </div>

        {/* ── FULL-WIDTH CONTENT ─────────────────────────────────────────
            All content sections (Featured Instagram, YouTube videos,
            Reviews, Audience, Collaborations, Work-with-me) span the
            full page width below the hero + sidebar row. */}
        <div className={styles.fullcontent}>
          {/* FEATURED CONTENT */}
          {data.featured.length > 0 && (
            <section className={`${styles.card} ${styles.pad}`} id="featured">
              <Rail
                label="featured content"
                title="Featured content"
                icon={<Ic d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />}
                meta={
                  <span className={styles.igbadge}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.4" r="1.1" fill="#fff" stroke="none" /></svg>
                    Instagram{data.snapshotAge ? ` · ${data.snapshotAge}` : ''}
                  </span>
                }
              >
                {data.featured.map((p, i) => (
                  <a key={p.href || i} className={styles.th} style={{ backgroundImage: `url(${p.imageUrl})` }} href={p.href || '#'} target="_blank" rel="noopener noreferrer">
                    {p.isVideo && <span className={styles.play}><Play /></span>}
                    <span className={styles.ov}>
                      {p.isVideo ? <Play /> : <Heart />}
                      {p.views}
                    </span>
                  </a>
                ))}
              </Rail>
            </section>
          )}

          {/* LATEST VIDEOS */}
          {data.videos.length > 0 && (
            <section className={`${styles.card} ${styles.pad}`} id="videos">
              <Rail
                label="latest videos"
                title="Latest videos"
                icon={<Ic d="M22 8.6a3 3 0 0 0-2.1-2.1C18.1 6 12 6 12 6s-6.1 0-7.9.5A3 3 0 0 0 2 8.6 31 31 0 0 0 2 12a31 31 0 0 0 .1 3.4 3 3 0 0 0 2.1 2.1C6 18 12 18 12 18s6.1 0 7.9-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22 12a31 31 0 0 0-.1-3.4ZM10 15V9l5 3Z" />}
                meta={<span className={styles.viewall}>From YouTube</span>}
              >
                {data.videos.map((v) => (
                  <a key={v.url} className={styles.vid} href={v.url} target="_blank" rel="noopener noreferrer">
                    <span className={styles.vthumb} style={{ backgroundImage: v.thumbUrl ? `url(${v.thumbUrl})` : undefined }}>
                      <span className={styles.vplay}><YtPlay s={13} /></span>
                      {v.views && <span className={styles.vviews}><Play />{v.views}</span>}
                    </span>
                    <span className={styles.vtitle}>{v.title}</span>
                  </a>
                ))}
              </Rail>
            </section>
          )}

          {/* BRAND RATINGS */}
          {data.reviews && (
            <section className={`${styles.card} ${styles.pad}`} id="reviews">
              <div className={styles.chead}>
                <div className={styles.ctitle}><span className={styles.ci}><Ic d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9Z" /></span>Brand ratings</div>
                <span className={styles.viewall}>From completed projects</span>
              </div>
              <div className={styles.ratehead}>
                {data.reviews.average != null && <span className={styles.ratebig}>{data.reviews.average.toFixed(1)}</span>}
                <span className={styles.stars} aria-label={`${data.reviews.average ?? 0} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ic key={n} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9Z" fill={n <= Math.round(data.reviews!.average ?? 0)} />
                  ))}
                </span>
                <span className={styles.ratecount}>
                  {data.reviews.count} {data.reviews.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
              {data.reviews.items.length > 0 && (
                <div className={styles.revlist}>
                  {data.reviews.items.map((r) => (
                    <div className={styles.rev} key={r.id}>
                      <div className={styles.revtop}>
                        <span className={styles.revwho}>{r.reviewerName}</span>
                        <span className={styles.stars} aria-label={`${r.rating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Ic key={n} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9Z" fill={n <= r.rating} w={0.72} />
                          ))}
                        </span>
                      </div>
                      {r.comment && <p className={styles.revtext}>{r.comment}</p>}
                      <span className={styles.revmeta}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* AUDIENCE INSIGHTS */}
          {audience && (
            <section className={`${styles.card} ${styles.pad}`}>
              <div className={styles.chead}>
                <div className={styles.ctitle}><span className={styles.ci}><Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></span>Audience insights</div>
                <span className={styles.viewall}>Reported by the creator</span>
              </div>
              <div className={styles.aud}>
                {audience.locations.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Top locations</h4>
                    {audience.locations.map((loc) => (
                      <div className={styles.bar} key={loc.label}>
                        <span className={styles.barlabel}>{loc.label}</span>
                        <span className={styles.track}><span className={styles.fill} style={{ width: `${loc.pct}%` }} /></span>
                        <span className={styles.pct}>{loc.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {audience.ages.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Age range</h4>
                    <div className={styles.donutwrap}>
                      <div className={styles.donut} style={{ background: buildConic(audience.ages, AGE_PALETTE) }}>
                        <span className={styles.donutmid}>
                          <b>{audience.ages[0].label}</b>
                          <small>largest</small>
                        </span>
                      </div>
                      <div className={styles.legend}>
                        {audience.ages.map((a, i) => (
                          <div key={a.label}>
                            <span className={styles.dot} style={{ background: AGE_PALETTE[i % AGE_PALETTE.length] }} />
                            {a.label}<b>{a.pct}%</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {genderPair.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Gender</h4>
                    <div className={styles.genders}>
                      {genderPair.map((g, i) => {
                          const isMale = g.label?.toLowerCase().includes('male') && !g.label?.toLowerCase().includes('female');
                          return (
                          <div className={styles.gcell} key={g.label}>
                            <span className={`${styles.gicon} ${isMale ? styles.gA : styles.gB}`}>
                              {isMale
                                ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="M20 4l-6 6M14 4h6v6" /></svg>
                                : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="10" r="6" /><path d="M12 16v6M9 19h6" /></svg>
                              }
                            </span>
                            <b>{g.pct}%</b>
                            <small>{g.label}</small>
                          </div>);
                        })}
                    </div>
                  </div>
                )}
                {audience.interests.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Audience interests</h4>
                    <div className={styles.chips}>
                      {audience.interests.map((t) => (
                        <span className={styles.tchip} key={t.label}>
                          {t.label}<b>{t.pct}%</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* PAST COLLABORATIONS */}
          {data.pastCollaborations.length > 0 && (
            <section className={`${styles.card} ${styles.pad}`}>
              <div className={styles.chead}><div className={styles.ctitle}>Past collaborations</div></div>
              <div className={styles.brands}>
                {data.pastCollaborations.map(b => (
                  <div className={styles['brand-c']} key={b} style={b.length > 8 ? { fontSize: '.62rem' } : {}}>{b}</div>
                ))}
              </div>
            </section>
          )}

          {/* WORK WITH ME — Interactive Package Cards */}
          {data.packages && data.packages.length > 0 && (
            <section className={`${styles.card} ${styles.pad}`} id="work-with-me">
              <div className={styles.chead}>
                <div className={styles.ctitle}>Work With Me</div>
              </div>

              <div className={styles.prices}>
                {data.packages.map((p) => (
                  <div className={`${styles.price} ${p.featured ? styles.feat : ''}`} key={p.title}>
                    <div className={styles.ph}>
                      <span
                        className={styles.plogo}
                        style={{
                          background:
                            p.platform === 'youtube'
                              ? 'var(--yt)'
                              : p.platform === 'instagram'
                              ? 'var(--ig)'
                              : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                        }}
                      >
                        {p.platform === 'youtube' ? <YtPlay s={15} /> : <IgLogo s={15} />}
                      </span>
                      {p.title}
                    </div>

                    <div className={styles.pdesc}>{p.description}</div>

                    <div className={styles.amt}>{p.priceLabel}</div>

                    <ul>
                      {p.perks.map((perk) => (
                        <li key={perk}>
                          <span className={styles.ck}>✓</span>
                          {perk}
                        </li>
                      ))}
                    </ul>

                    <Link
                      className={`${styles.btn} ${p.featured ? styles.accent : ''} ${styles.wide} ${styles.sm}`}
                      href={ctaHref}
                    >
                      Select
                    </Link>
                  </div>
                ))}
              </div>

              <div className={styles.note}>
                Packages are customizable. Let&apos;s discuss what works best for your brand!
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className={styles.mkfooter}>
        <span>© {new Date().getFullYear()} Influnet · All rights reserved</span>
        <div className={styles.flinks}>
          <Link href={`/c/${data.username}/media-kit`} style={{ color: 'inherit', textDecoration: 'none' }}>View Media Kit</Link>
        </div>
      </footer>

      {isOwner && !previewing && (
        <div className={styles.toolbar}>
          <button className={`${styles.btn} ${styles.accent} ${styles.tb}`} onClick={publish}><Ic d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />Save &amp; publish</button>
          <button className={`${styles.btn} ${styles.tb}`} onClick={() => { setPreviewing(true); setEditing(false); }}><Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />Preview as visitor</button>
          <button className={`${styles.btn} ${styles.tb}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}><Ic d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />Edit blocks</button>
          <div className={styles.grp}>
            <span className={styles.glbl}>Theme</span>
            <div className={styles.seg} role="group" aria-label="Theme">
              <button aria-pressed={!dark} onClick={() => setDark(false)}><Ic d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />Light</button>
              <button aria-pressed={dark} onClick={() => setDark(true)}><Ic d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />Dark</button>
            </div>
          </div>
          <div className={styles.grp} role="group" aria-label="Accent color">
            <span className={styles.glbl}>Color</span>
            {PRESETS.map((p) => (
              <button key={p.name} className={styles.sw} style={{ background: p.a }} aria-label={p.name} aria-pressed={accent === p.a} onClick={() => applyPreset(p.a, p.b)} />
            ))}
            <span className={styles.picker} title="Pick any color">
              <input type="color" value={accent.startsWith('#') ? accent : '#7C6BF6'} aria-label="Custom accent color" onChange={(e) => applyCustom(e.target.value)} />
            </span>
          </div>
          <div className={styles.tspace} />
          <span className={styles.hint}>Owner-only bar. Visitors see just the profile.</span>
        </div>
      )}

      <div className={`${styles.toast} ${showToast ? styles.show : ''}`}><span className={styles.tk}><Check w={0.6} /></span>Published — your profile is live at {displayUrl}</div>
    </div>
  );
}
