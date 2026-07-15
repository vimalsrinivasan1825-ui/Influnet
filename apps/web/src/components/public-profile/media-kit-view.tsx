'use client';

// Creator media kit — the brand-facing one-pager. Visual design ported from
// docs/product/mockups/creator-media-kit.html; every number rendered here is
// real (scraped snapshot / creator profile / platform reviews). Sections with
// no data are simply not rendered.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import styles from './media-kit.module.css';
import type { MediaKitView, AudienceSlice } from '@/lib/public-profile/media-kit';

const PRESETS: { name: string; a: string; b: string }[] = [
  { name: 'Rose', a: '#EC2C7A', b: '#FF6FA6' },
  { name: 'Violet', a: '#7C6BF6', b: '#9E92FF' },
  { name: 'Blue', a: '#2E90FA', b: '#6AB6FF' },
  { name: 'Emerald', a: '#12B981', b: '#4BD9A8' },
  { name: 'Amber', a: '#F5A623', b: '#FFC15E' },
];

const DONUT_COLORS = ['var(--c2)', 'var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--ink-3)'];

function lighten(hex: string, amt: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = Math.round(parseInt(h.slice(0, 2), 16) + (255 - parseInt(h.slice(0, 2), 16)) * amt);
  const g = Math.round(parseInt(h.slice(2, 4), 16) + (255 - parseInt(h.slice(2, 4), 16)) * amt);
  const b = Math.round(parseInt(h.slice(4, 6), 16) + (255 - parseInt(h.slice(4, 6), 16)) * amt);
  return `rgb(${r},${g},${b})`;
}

/* ── icons ── */
const Ic = (p: { d: string; fill?: boolean }) => (
  <svg className={styles.ico} viewBox="0 0 24 24" fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={p.d} />
  </svg>
);
const Play = () => <Ic d="M8 5v14l11-7z" fill />;
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

export interface MediaKitViewProps {
  data: MediaKitView;
  /** Real scannable QR of the profile URL, rendered server-side as SVG markup. */
  qrSvg: string;
  isOwner: boolean;
  ctaHref: string;
  ctaLabel: string;
}

export default function MediaKitViewComponent({ data, qrSvg, isOwner, ctaHref, ctaLabel }: MediaKitViewProps) {
  const [accent, setAccent] = useState(PRESETS[0].a);
  const [accent2, setAccent2] = useState(PRESETS[0].b);
  const [dark, setDark] = useState(false);
  const [copied, setCopied] = useState(false);

  // Human-readable form of the real shareable URL, e.g. "influnet.com/c/username".
  const displayUrl = data.profileUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Same appearance store as the public profile page, so both pages match.
  const storeKey = `influnet:profile-appearance:${data.username}`;
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

  const persist = (a: string, b: string, d: boolean) => {
    if (!isOwner) return;
    try { localStorage.setItem(storeKey, JSON.stringify({ accent: a, accent2: b, dark: d })); } catch { /* ignore */ }
  };
  const applyPreset = (a: string, b: string) => { setAccent(a); setAccent2(b); persist(a, b, dark); };
  const applyCustom = (v: string) => { const b = lighten(v, 0.22); setAccent(v); setAccent2(b); persist(v, b, dark); };
  const applyTheme = (d: boolean) => { setDark(d); persist(accent, accent2, d); };

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

  const styleVars = { ['--accent']: accent, ['--accent-2']: accent2 } as CSSProperties;

  return (
    <div className={`${styles.stage} ${dark ? styles.dark : ''}`} style={styleVars}>
      <div className={styles.bg}><span className={`${styles.blob} ${styles.b1}`} /><span className={`${styles.blob} ${styles.b2}`} /></div>

      <div className={styles.wrap}>
        <div className={styles.topbar}>
          <Link href="/" className={styles.brand}><span className={styles.blogo}>i</span>influnet</Link>
          <div className={styles.url}>
            <Ic d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /><b>{displayUrl}</b>
            <span className={styles.cp} role="button" tabIndex={0} onClick={copyUrl} onKeyDown={(e) => e.key === 'Enter' && copyUrl()}><Copy /> {copied ? 'Copied' : 'Copy'}</span>
          </div>
          <Link className={`${styles.btn} ${styles.accent}`} href={ctaHref}><Send />Let&apos;s Collab</Link>
        </div>

        {isOwner && (
          <div className={styles.toolbar}>
            <Link className={`${styles.btn} ${styles.sm}`} href={`/c/${data.username}`}><Ic d="M19 12H5M11 6l-6 6 6 6" />Back to profile</Link>
            <div className={styles.grp}>
              <span className={styles.glbl}>Theme</span>
              <div className={styles.seg} role="group" aria-label="Theme">
                <button aria-pressed={!dark} onClick={() => applyTheme(false)}>Light</button>
                <button aria-pressed={dark} onClick={() => applyTheme(true)}>Dark</button>
              </div>
            </div>
            <div className={styles.grp} role="group" aria-label="Accent color">
              <span className={styles.glbl}>Color</span>
              {PRESETS.map((p) => (
                <button key={p.name} className={styles.sw} style={{ background: p.a }} aria-label={p.name} aria-pressed={accent === p.a} onClick={() => applyPreset(p.a, p.b)} />
              ))}
              <span className={styles.picker} title="Pick any color">
                <input type="color" value={accent.startsWith('#') ? accent : '#EC2C7A'} aria-label="Custom accent color" onChange={(e) => applyCustom(e.target.value)} />
              </span>
            </div>
            <div className={styles.tspace} /><span className={styles.hint}>Owner-only bar</span>
          </div>
        )}

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

            {/* FEATURED CONTENT — real recent posts, linked to the originals */}
            {data.featured.length > 0 && (
              <section className={`${styles.card} ${styles.pad}`} id="featured">
                <div className={styles.chead}>
                  <div className={styles.ctitle}><span className={styles.ci}><Ic d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></span>Featured Content</div>
                  {data.snapshotAge && <span className={styles.viewall}>Live from Instagram · {data.snapshotAge}</span>}
                </div>
                <div className={styles.thumbs6}>
                  {data.featured.map((p) => (
                    <a key={p.href} className={styles.th} style={{ backgroundImage: `url(${p.thumbUrl})` }} href={p.href} target="_blank" rel="noopener noreferrer">
                      {p.isVideo && <span className={styles.play}><Play /></span>}
                      <span className={styles.ov}><Play />{p.label}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* AUDIENCE INSIGHTS — self-reported; hidden when empty */}
            {data.audience && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Audience Insights</div></div>
                <div className={styles.aud3}>
                  {data.audience.locations && (
                    <div className={styles.subcard}>
                      <h4>Top Locations</h4>
                      {data.audience.locations.map((l) => (
                        <div className={styles.bar} key={l.label}>
                          <span>{l.label}</span>
                          <span className={styles.track}><span className={styles.fill} style={{ width: `${l.pct}%` }} /></span>
                          <span className={styles.pct}>{l.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.audience.age && <Donut title="Age Range" slices={data.audience.age} />}
                  {data.audience.gender && <Donut title="Gender" slices={data.audience.gender} />}
                </div>
              </section>
            )}

            {/* PAST COLLABORATIONS — self-reported; hidden when empty */}
            {data.pastCollaborations && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Past Collaborations</div></div>
                <div className={styles.brands}>
                  {data.pastCollaborations.map((b) => <div className={styles['brand-c']} key={b}>{b}</div>)}
                </div>
              </section>
            )}

            {/* WORK WITH ME — from the creator's collab types + pricing */}
            {data.packages && (
              <section className={`${styles.card} ${styles.pad}`}>
                <div className={styles.chead}><div className={styles.ctitle}>Work With Me</div></div>
                <div className={styles.prices}>
                  {data.packages.map((p) => (
                    <div className={`${styles.price} ${p.featured ? styles.feat : ''}`} key={p.title}>
                      <div className={styles.ph}>
                        <span className={styles.plogo} style={{ background: p.platform === 'youtube' ? 'var(--yt)' : p.platform === 'instagram' ? 'var(--ig)' : 'var(--c2)' }}>
                          {p.platform === 'youtube' ? <YtPlay s={15} /> : <IgLogo s={15} />}
                        </span>
                        {p.title}
                      </div>
                      <div className={styles.pdesc}>{p.description}</div>
                      <div className={styles.amt}>{p.priceLabel}</div>
                      <ul>{p.perks.map((perk) => <li key={perk}><span className={styles.ck}>✓</span>{perk}</li>)}</ul>
                      <Link className={`${styles.btn} ${p.featured ? styles.accent : ''} ${styles.wide} ${styles.sm}`} href={ctaHref}>Select</Link>
                    </div>
                  ))}
                </div>
                <div className={styles.note}>Packages are customizable. Let&apos;s discuss what works best for your brand!</div>
              </section>
            )}
          </div>

          {/* SIDEBAR */}
          <div className={styles.side}>
            <div className={`${styles.card} ${styles.pad}`}>
              <div className={styles['share-title']}><h3>Share My Profile</h3><p>Connect instantly</p></div>
              <div className={styles.qrbox} dangerouslySetInnerHTML={{ __html: qrSvg }} />
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

            {(data.location || data.languages.length > 0 || data.topAudience) && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>About Me</h3>
                <div className={styles.aboutlist}>
                  {data.location && <div><span className={styles.ai}><Ic d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></span>{data.location}</div>}
                  {data.languages.length > 0 && <div><span className={styles.ai}><Ic d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></span>{data.languages.join(', ')}</div>}
                  {data.topAudience && <div><span className={styles.ai}><Ic d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></span>Top Audience: <b>{data.topAudience}</b></div>}
                </div>
              </div>
            )}

            {data.niches.length > 0 && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>What I Create</h3>
                <div className={styles.createpills}>{data.niches.map((n) => <span className={styles.cpill} key={n}>{n}</span>)}</div>
              </div>
            )}

            <div className={`${styles.card} ${styles.pad}`}>
              <h3>Let&apos;s Collaborate</h3>
              <p className={styles.collabtxt}>Open to brand deals, product collaborations, ambassador roles and more!</p>
              <Link className={`${styles.btn} ${styles.ghost} ${styles.wide} ${styles.sm}`} href={ctaHref}>{ctaLabel}</Link>
            </div>

            {data.reviews && (
              <div className={`${styles.card} ${styles.pad}`}>
                <h3>What Brands Say</h3>
                <div className={styles.quote}>
                  <span className={styles.qm}>&ldquo;</span>
                  <p>{data.reviews[0].comment}</p>
                  <div className={styles.qa}>— {'★'.repeat(data.reviews[0].rating)} verified collaboration</div>
                </div>
                {data.reviews.length > 1 && (
                  <div className={styles.dots}>{data.reviews.map((_, i) => <span key={i} className={i === 0 ? styles.on : ''} />)}</div>
                )}
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
          <Link href={`/c/${data.username}`} style={{ color: 'inherit', textDecoration: 'none' }}>View profile</Link>
        </div>
      </footer>
    </div>
  );
}

function Donut({ title, slices }: { title: string; slices: AudienceSlice[] }) {
  // conic-gradient stops from cumulative percentages
  let acc = 0;
  const stops = slices.map((s, i) => {
    const from = acc;
    acc = Math.min(100, acc + s.pct);
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}% ${acc}%`;
  });
  if (acc < 100) stops.push(`var(--tile) ${acc}% 100%`);
  return (
    <div className={styles.subcard}>
      <h4>{title}</h4>
      <div className={styles.donutwrap}>
        <div className={styles.donut} style={{ background: `conic-gradient(${stops.join(',')})` }} />
        <div className={styles.legend}>
          {slices.map((s, i) => (
            <div key={s.label}><span className={styles.dot} style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{s.label}<b>{s.pct}%</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}
