'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import styles from './creator-profile.module.css';
import type { CreatorProfileView, PlatformCardView } from '@/lib/public-profile/creator-profile';

const PRESETS: { name: string; a: string; b: string }[] = [
  { name: 'Violet', a: '#7C6BF6', b: '#9E92FF' },
  { name: 'Rose', a: '#EC2C7A', b: '#FF6FA6' },
  { name: 'Blue', a: '#2E90FA', b: '#6AB6FF' },
  { name: 'Emerald', a: '#12B981', b: '#4BD9A8' },
  { name: 'Amber', a: '#F5A623', b: '#FFC15E' },
];

const THUMB_GRADIENTS = [
  'linear-gradient(160deg,#f6b8a0,#c76b8e)',
  'linear-gradient(160deg,#a0c0f6,#6b7ec7)',
  'linear-gradient(160deg,#d7a0f6,#8e6bc7)',
  'linear-gradient(160deg,#8a5a3a,#3a2418)',
  'linear-gradient(160deg,#3a5a8a,#182438)',
  'linear-gradient(160deg,#6a3a8a,#2a1838)',
];

function lighten(hex: string, amt: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = Math.round(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amt);
  const g = Math.round(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amt);
  const b = Math.round(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amt);
  return `rgb(${r},${g},${b})`;
}

/* ── icons ── */
const Ic = (p: { d: string; fill?: boolean; w?: number }) => (
  <svg className={styles.ico} viewBox="0 0 24 24" fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={p.w ? { width: `${p.w}em`, height: `${p.w}em` } : undefined}>
    <path d={p.d} />
  </svg>
);
const Check = ({ w }: { w?: number }) => <Ic d="M20 6 9 17l-5-5" w={w} />;
const Play = () => <Ic d="M8 5v14l11-7z" fill />;
const IgLogo = ({ s = 18 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="#fff" strokeWidth={2}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.4" r="1.1" fill="#fff" stroke="none" />
  </svg>
);
const YtLogo = ({ w = 27, h = 19 }: { w?: number; h?: number }) => (
  <svg viewBox="0 0 28 20" width={w} height={h}><rect width="28" height="20" rx="6" fill="#FF0033" /><path d="M11.4 5.8 L19.5 10 L11.4 14.2 Z" fill="#fff" /></svg>
);

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
  const [toast, setToast] = useState(false);

  const storeKey = `influnet:profile-appearance:${data.username}`;

  // Restore the owner's saved appearance (per-browser for now).
  useEffect(() => {
    if (!isOwner) return;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const a = JSON.parse(raw) as { accent?: string; accent2?: string; dark?: boolean };
        if (a.accent) setAccent(a.accent);
        if (a.accent2) setAccent2(a.accent2);
        if (typeof a.dark === 'boolean') setDark(a.dark);
      }
    } catch { /* ignore */ }
  }, [isOwner, storeKey]);

  const applyPreset = (a: string, b: string) => { setAccent(a); setAccent2(b); };
  const applyCustom = (v: string) => { setAccent(v); setAccent2(lighten(v, 0.22)); };
  const publish = () => {
    try { localStorage.setItem(storeKey, JSON.stringify({ accent, accent2, dark })); } catch { /* ignore */ }
    setToast(true);
    setTimeout(() => setToast(false), 2800);
  };

  const styleVars = { ['--accent']: accent, ['--accent-2']: accent2 } as CSSProperties;
  const rootClass = [styles.stage, dark ? styles.dark : '', previewing ? styles.previewing : '', editing ? styles.editing : ''].filter(Boolean).join(' ');

  const igBadge = data.floating.find((f) => f.platform === 'instagram');
  const ytBadge = data.floating.find((f) => f.platform === 'youtube');
  const verifiedBadge = data.floating.find((f) => f.platform === 'verified');

  return (
    <div className={rootClass} style={styleVars}>
      <div className={styles.bg}><span className={`${styles.blob} ${styles.b1}`} /><span className={`${styles.blob} ${styles.b2}`} /><span className={`${styles.blob} ${styles.b3}`} /></div>

      {isOwner && (
        <div className={styles.previewbanner}>
          <span><Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />You&apos;re viewing your public profile exactly as a visitor sees it</span>
          <button className={`${styles.btn} ${styles.tb}`} onClick={() => setPreviewing(false)}><Ic d="M19 12H5M11 6l-6 6 6 6" />Back to editing</button>
        </div>
      )}

      <div className={styles.wrap}>
        <div className={styles.top}>
          <Link href="/" className={styles.brand}><span className={styles.blogo}>i</span>influnet</Link>
          <div className={styles.url}><Ic d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />influnet.com/<b>@{data.username}</b></div>
        </div>

        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.hleft}>
            <span className={styles.eyebrow}><Ic d="M12 2l2.4 6.9L21 9.2l-5.2 4.2 1.9 6.6L12 16.6 6.3 20l1.9-6.6L3 9.2l6.6-.3z" fill />{data.isVerified ? 'Verified creator' : 'Creator'}</span>
            <h1 className={styles.h1}>{data.name}</h1>
            <h2 className={styles.subtitle}>{data.subtitleLead} {data.subtitleAccent && <span className={styles.grad}>{data.subtitleAccent}</span>}</h2>
            <p className={styles.tag}>{data.tagline}</p>
            <div className={styles.cta}>
              <Link href={ctaHref} className={`${styles.btn} ${styles.accent}`}><Ic d="M5 12h14M13 6l6 6-6 6" />{ctaLabel}</Link>
              <a href="#platforms" className={`${styles.btn} ${styles.ghost}`}><Play />View content</a>
            </div>
            <div className={styles.chips}>
              {data.heroStats.map((s, i) => (
                <div className={styles.chip} key={s.label}>
                  <span className={styles.ci}>{i === 0 ? <Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" /> : i === 1 ? <Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /> : <Ic d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />}</span>
                  <div><div className={styles.cn}>{s.value}</div><div className={styles.cl}>{s.label}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.hright}>
            <div className={styles.halo}>
              <span className={`${styles.ring} ${styles.r1}`} /><span className={`${styles.ring} ${styles.r2}`} /><span className={`${styles.ring} ${styles.r3}`} /><span className={styles.glow} />
              <div className={styles.avatar}>
                {data.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className={styles.avimg} src={data.avatarUrl} alt={data.name} />
                  : <div className={styles.avmono}>{data.name.replace('@', '').charAt(0).toUpperCase()}</div>}
              </div>
              {igBadge && <div className={`${styles.fcard} ${styles.fIg}`}><span className={styles.fi} style={{ background: 'var(--ig)' }}><IgLogo s={17} /></span><div><b>{igBadge.value}</b><small>{igBadge.label}</small></div></div>}
              {ytBadge && <div className={`${styles.fcard} ${styles.fYt}`}><span className={styles.fi}><YtLogo /></span><div><b>{ytBadge.value}</b><small>{ytBadge.label}</small></div></div>}
              {verifiedBadge && <div className={`${styles.fcard} ${styles.fSeal}`}><span className={styles.fi}><span className={styles.rot} /><b style={{ color: '#fff', fontSize: '1rem' }}>i</b></span><div><b>{verifiedBadge.value}</b><small>{verifiedBadge.label}</small></div></div>}
            </div>
          </div>
        </section>

        {/* SHOWCASE */}
        <section className={styles.showcase} id="platforms">
          <div className={styles.sechead}>
            <div><div className={styles.seclabel}>Where I create</div><h3>Connected platforms</h3></div>
            <span className={styles.viewall}>View full media kit <Ic d="M5 12h14M13 6l6 6-6 6" /></span>
          </div>
          <div className={styles.platgrid}>
            {data.platforms.map((p) => <PlatformCard key={p.platform} card={p} />)}
          </div>
        </section>
      </div>

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

      <div className={`${styles.toast} ${toast ? styles.show : ''}`}><span className={styles.tk}><Check w={0.6} /></span>Published — your profile is live at influnet.com/@{data.username}</div>
    </div>
  );
}

function PlatformCard({ card }: { card: PlatformCardView }) {
  const isIg = card.platform === 'instagram';
  return (
    <div className={styles.pcard}>
      <div className={styles.phead}>
        <span className={styles.plogo} style={{ background: isIg ? 'var(--ig)' : 'transparent' }}>
          {isIg ? <IgLogo /> : <YtLogo w={30} h={21} />}
        </span>
        <span className={styles.phandle}>{card.displayName}<small>{card.handle}</small></span>
        {isIg
          ? <button className={`${styles.follow} ${styles.followIg}`}>Follow</button>
          : <button className={`${styles.follow} ${styles.followYt}`}><Ic d="M15 8a3 3 0 0 1 0 8M8 8v8H6V8ZM8 8l6-4v16l-6-4" />Subscribe</button>}
      </div>
      <div className={styles.pstats}>
        {card.stats.map((s) => <div key={s.label}><div className={styles.pn}>{s.value}</div><div className={styles.pl}>{s.label}</div></div>)}
      </div>
      {card.content.length > 0 && (
        <div className={styles.thumbs}>
          {card.content.map((c, i) => (
            <div
              key={i}
              className={`${styles.th} ${isIg ? styles.sq : styles.wide}`}
              style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : { background: THUMB_GRADIENTS[(isIg ? 0 : 3) + i] }}
            >
              {isIg
                ? <span className={styles.ov}><Play />{c.views}</span>
                : <><span className={styles.play}><Play /></span>{c.duration && <span className={styles.dur}>{c.duration}</span>}</>}
            </div>
          ))}
        </div>
      )}
      <div className={styles.pfoot}><span className={styles.vok}><Check w={0.55} /></span>{card.note}</div>
    </div>
  );
}
