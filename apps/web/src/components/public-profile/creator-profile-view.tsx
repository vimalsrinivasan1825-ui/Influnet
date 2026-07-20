'use client';
import { toast } from "sonner";

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './creator-profile.module.css';
import type { CreatorProfileView } from '@/lib/public-profile/creator-profile';

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

// Donut palettes — shared between the ring gradient and its legend so colours
// always line up. Ordered for maximum contrast between adjacent slices: --c1
// (the accent) defaults to the same violet as --c2, so they must never sit next
// to each other or the two biggest segments blur into one solid ring.
const AGE_PALETTE = ['var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--c2)'];
const GENDER_PALETTE = ['var(--c1)', 'var(--c3)', 'var(--c4)'];

/** Build a conic-gradient from real slice percentages, normalised to a full ring. */
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
const IgLogo = ({ s = 16 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="#fff" strokeWidth={2}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.4" r="1.1" fill="#fff" stroke="none" />
  </svg>
);
const YtPlay = ({ s = 16 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="#fff"><path d="M8 5v14l11-7z" /></svg>
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
  const [showToast, setShowToast] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const storeKey = `influnet:profile-appearance:${data.username}`;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/profile/refresh', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to refresh data');
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error('An error occurred while refreshing data.');
    } finally {
      setRefreshing(false);
    }
  };

  // Restore the owner's saved appearance (per-browser for now).
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

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(data.profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const shareMore = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `${data.name} — Influnet`, url: data.profileUrl });
      else await copyUrl();
    } catch { /* dismissed */ }
  };

  // Human-readable form of the real shareable URL (protocol + trailing slash
  // stripped), e.g. "influnet.app/c/username". Derived from data.profileUrl so
  // the displayed link always matches what Copy/Share actually use.
  const displayUrl = data.profileUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const styleVars = { ['--accent']: accent, ['--accent-2']: accent2 } as CSSProperties;
  const rootClass = [styles.stage, dark ? styles.dark : '', previewing ? styles.previewing : '', editing ? styles.editing : ''].filter(Boolean).join(' ');

  const igBadge = data.floating.find((f) => f.platform === 'instagram');
  const ytBadge = data.floating.find((f) => f.platform === 'youtube');
  const verifiedBadge = data.floating.find((f) => f.platform === 'verified');

  return (
    <div className={rootClass} style={styleVars}>
      <div className={styles.bg}><span className={`${styles.blob} ${styles.b1}`} /><span className={`${styles.blob} ${styles.b2}`} /></div>

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
        <div className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            <Image src="/influet_logo.png" alt="Influnet Logo" width={32} height={32} style={{ borderRadius: '9px' }} />
            influnet
          </Link>
          <div className={styles.url}>
            <Ic d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /><b>{displayUrl}</b>
            <span className={styles.cp} role="button" tabIndex={0} onClick={copyUrl} onKeyDown={(e) => e.key === 'Enter' && copyUrl()}><Copy /> {copied ? 'Copied' : 'Copy'}</span>
          </div>
          <Link className={`${styles.btn} ${styles.accent}`} href={ctaHref}><Send />{ctaLabel}</Link>
        </div>

        <div className={styles.layout}>
          <div className={styles.main}>
            {/* HERO */}
            <section className={styles.hero}>
              <div className={styles.hleft}>
                <span className={styles.eyebrow}><Ic d="M12 2l2.4 6.9L21 9.2l-5.2 4.2 1.9 6.6L12 16.6 6.3 20l1.9-6.6L3 9.2l6.6-.3z" fill />{data.isVerified ? 'Verified creator' : 'Creator'}</span>
                <h1>{data.name}</h1>
                <h2 className={styles.subtitle}>{data.subtitleLead} <span className={styles.grad}>{data.subtitleAccent}</span></h2>
                <p className={styles.tag}>{data.tagline}</p>
                <div className={styles.cta}>
                  <Link className={`${styles.btn} ${styles.accent}`} href={ctaHref}><Send />{ctaLabel}</Link>
                  <a className={`${styles.btn} ${styles.ghost}`} href="#featured"><Play />View my work</a>
                </div>
              </div>
              <div className={styles.hright}>
                <div className={styles.havatar}>
                  <span className={styles.haloglow} /><span className={styles.halo} />
                  <div className={styles.avatar}>
                    {data.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className={styles.avimg} src={data.avatarUrl} alt={data.name} />
                      : <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', fontSize: '2.4rem', fontWeight: 800, color: 'var(--ink-3)' }}>{data.name.charAt(0).toUpperCase()}</div>}
                  </div>
                  {data.isVerified && (
                    <div className={styles.vbadge}><span className={styles.vi}>i</span><div><b>Verified</b><small>by Influnet</small></div></div>
                  )}
                  {data.heroChips.length > 0 && (
                    <div className={styles.fstack}>
                      {data.heroChips.map((c) => (
                        <div className={styles.fcard} key={c.label}>
                          <span className={styles.fi} style={{ background: c.label === 'Subscribers' ? 'var(--yt)' : 'var(--ig)' }}>
                            {c.label === 'Subscribers' ? <YtPlay /> : <IgLogo />}
                          </span>
                          <div><b>{c.value}</b><small>{c.label}</small></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {igBadge && <div className={`${styles.fcard} ${styles.fIg}`}><span className={styles.fi} style={{ background: 'var(--ig)' }}><IgLogo s={17} /></span><div><b>{igBadge.value}</b><small>{igBadge.label}</small></div></div>}
                  {ytBadge && <div className={`${styles.fcard} ${styles.fYt}`}><span className={styles.fi}><YtPlay s={17} /></span><div><b>{ytBadge.value}</b><small>{ytBadge.label}</small></div></div>}
                </div>
              </div>
            </section>

            {/* STAT CARDS */}
            <section className={styles.statchips}>
              {data.stats.map((s, i) => (
                <div className={`${styles.card} ${styles.stat}`} key={s.label}>
                  <div className={styles.si}>
                    {i === 0 ? <Ic d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
                      : i === 1 ? <Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
                        : <Ic d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />}
                  </div>
                  <div className={styles.sn}>{s.value}</div>
                  <div className={styles.sl}>{s.label}</div>
                </div>
              ))}
            </section>

            {/* FEATURED CONTENT */}
            {data.featured.length > 0 && (
              <section className={`${styles.card} ${styles.pad}`} id="featured">
                <div className={styles.chead}>
                  <div className={styles.ctitle}><span className={styles.ci}><Ic d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></span>Featured Content</div>
                  {data.snapshotAge && <span className={styles.viewall}>Live from Instagram · {data.snapshotAge}</span>}
                </div>
                <div className={styles.thumbs6}>
                  {data.featured.map((p, i) => (
                    <a key={p.href || i} className={styles.th} style={{ backgroundImage: `url(${p.imageUrl})` }} href={p.href || '#'} target="_blank" rel="noopener noreferrer">
                      {p.isVideo && <span className={styles.play}><Play /></span>}
                      <span className={styles.ov}>
                        {p.isVideo ? <Play /> : <Heart />}
                        {p.views}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* AUDIENCE INSIGHTS */}
            {data.audience && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Audience Insights</div></div>
                <div className={styles.aud3}>
                  {data.audience.locations.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Top Locations</h4>
                    {data.audience.locations.map(loc => (
                      <div className={styles.bar} key={loc.label}>
                        <span>{loc.label}</span>
                        <span className={styles.track}><span className={styles.fill} style={{ width: `${loc.pct}%` }} /></span>
                        <span className={styles.pct}>{loc.pct}%</span>
                      </div>
                    ))}
                  </div>
                  )}
                  {data.audience.ages.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Age Range</h4>
                    <div className={styles.donutwrap}>
                      <div className={styles.donut} style={{ background: buildConic(data.audience.ages, AGE_PALETTE) }} />
                      <div className={styles.legend}>
                        {data.audience.ages.map((a, i) => {
                          const color = AGE_PALETTE[i % AGE_PALETTE.length];
                          return <div key={a.label}><span className={styles.dot} style={{ background: color }} />{a.label}<b>{a.pct}%</b></div>
                        })}
                      </div>
                    </div>
                  </div>
                  )}
                  {data.audience.genders.length > 0 && (
                  <div className={styles.subcard}>
                    <h4>Gender</h4>
                    <div className={styles.donutwrap}>
                      <div className={styles.donut} style={{ background: buildConic(data.audience.genders, GENDER_PALETTE) }} />
                      <div className={styles.legend}>
                        {data.audience.genders.map((g, i) => {
                          const color = GENDER_PALETTE[i % GENDER_PALETTE.length];
                          return <div key={g.label}><span className={styles.dot} style={{ background: color }} />{g.label}<b>{g.pct}%</b></div>
                        })}
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              </section>
            )}

            {/* PAST COLLABORATIONS */}
            {data.pastCollaborations.length > 0 && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Past Collaborations</div></div>
                <div className={styles.brands}>
                  {data.pastCollaborations.map(b => (
                    <div className={styles['brand-c']} key={b} style={b.length > 8 ? { fontSize: '.62rem' } : {}}>{b}</div>
                  ))}
                </div>
              </section>
            )}

            {/* WORK WITH ME */}
            {data.pricing.length > 0 && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Work With Me</div></div>
                <div className={styles.prices}>
                  {data.pricing.map((p, i) => (
                    <div className={`${styles.price} ${i === 0 ? styles.feat : ''}`} key={p.title}>
                      <div className={styles.ph}><span className={styles.plogo} style={{ background: 'var(--ig)' }}><IgLogo /></span>{p.title}</div>
                      <div className={styles.pdesc}>{p.desc}</div>
                      <div className={styles.amt}>{p.amount}</div>
                      <ul>
                        {p.features.map(f => <li key={f}><span className={styles.ck}>✓</span> {f}</li>)}
                      </ul>
                      <Link className={`${styles.btn} ${styles.accent} ${styles.wide} ${styles.sm}`} href={ctaHref} style={{ marginTop: '.6rem' }}><Send />{ctaLabel}</Link>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* SIDEBAR */}
          <div className={styles.side}>
            <div className={`${styles.card} ${styles.pad}`}>
              <div className={styles['share-title']}><h3>Share My Profile</h3><p>Connect instantly</p></div>
              <div className={styles.urlmini} style={{ fontWeight: 600 }}>
                {displayUrl}
                <span className={styles.cp} role="button" tabIndex={0} onClick={copyUrl} onKeyDown={(e) => e.key === 'Enter' && copyUrl()}><Copy /> {copied ? 'Copied' : 'Copy'}</span>
              </div>
              <div className={styles.divlabel}>Share via</div>
              <div className={styles.sharevia}>
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
                <h3>About Me</h3>
                <div className={styles.aboutlist}>
                  {data.location && <div><span className={styles.ai}><Ic d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></span>{data.location}</div>}
                  {data.languages.length > 0 && <div><span className={styles.ai}><Ic d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></span>{data.languages.join(', ')}</div>}
                </div>
              </div>
            )}

            {data.niches.length > 0 && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>What I Create</h3>
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
