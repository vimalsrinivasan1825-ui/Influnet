'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { ProfileLayoutSections } from '@influnet/core';
import { VerifiedMark } from '@/components/icons/verified-mark';
import type { ShowcaseItem } from '@/lib/public-profile/creator-profile';
import { formatCount } from '@/lib/public-profile/creator-profile';
import type { RenderableProfileView } from '@/lib/public-profile/tier-projection';
import type { BookedBrand } from '@/lib/public-profile/profile-layout-view';
import { CountUp, Reveal, prefersReducedMotion } from './motion';
import s from './editorial.module.css';

/** Counts from get_collaboration_stats (migration 113). */
export interface CollaborationStats {
  partners: number;
  projectsTotal: number;
  projectsActive: number;
  projectsCompleted: number;
  firstCollabAt: string | null;
  lastCollabAt: string | null;
}

/** Everything a section needs. Built once by the page root. */
export interface ProfileContext {
  data: RenderableProfileView;
  firstName: string;
  isPro: boolean;
  embedded: boolean;
  inline: boolean;
  ctaHref: string;
  ctaLabel: string;
  collaborationStats: CollaborationStats | null;
  work: ShowcaseItem[];
  picked: boolean;
  heroPost: ShowcaseItem | null;
  brands: BookedBrand[];
  otherBrands: string[];
  closingNote: string | null;
  copied: boolean;
  copyUrl: () => void;
  trackLink: (platform: 'instagram' | 'youtube' | 'other') => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const monthYear = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return [name, ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function Avatar({ ctx, className }: { ctx: ProfileContext; className?: string }) {
  const { data } = ctx;
  return data.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cx(s.avatarLg, className)} src={data.avatarUrl} alt={data.name} />
  ) : (
    <span className={cx(s.avatarLg, s.avatarFallback, className)} aria-hidden="true">
      {data.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Verification, said plainly. The badge needs ownership AND the trust score. */
function verification(ctx: ProfileContext): { label: string; tone: 'verified' | 'pending'; detail: string } {
  const { data } = ctx;
  if (data.isVerified) return { label: 'Verified creator', tone: 'verified', detail: 'Influnet has verified this account.' };
  if (data.ownershipVerified)
    return {
      label: 'Verification in progress',
      tone: 'pending',
      detail: `${data.name} has proven this Instagram account is theirs. Influnet is still confirming their reach.`,
    };
  return {
    label: 'Not verified yet',
    tone: 'pending',
    detail: `${data.name} hasn't added their Influnet link to Instagram yet, so ownership isn't confirmed.`,
  };
}

function facts(ctx: ProfileContext): string[] {
  const { data } = ctx;
  return [
    data.location,
    data.languages.length ? data.languages.join(' · ') : null,
    ...data.niches.slice(0, 3),
    data.creatingSince ? `Creating since ${data.creatingSince}` : null,
  ].filter((f): f is string => !!f);
}

function platformChips(ctx: ProfileContext) {
  return ctx.data.headlineNumbers
    .filter((n) => /subscribers|followers/i.test(n.label))
    .map((n) => ({
      label: `${n.label.startsWith('YouTube') ? 'YouTube' : 'Instagram'} ${n.value}`,
      color: n.label.startsWith('YouTube') ? '#ff0033' : '#d62976',
    }));
}

function kindLabel(item: ShowcaseItem) {
  if (item.kind === 'youtube') return 'YouTube';
  if (item.kind === 'portfolio') return 'Portfolio';
  return item.isVideo ? 'Reel' : 'Post';
}

function CtaButton({ ctx, className }: { ctx: ProfileContext; className: string }) {
  if (ctx.embedded) return null;
  return (
    <Link className={cx(s.btn, className)} href={ctx.ctaHref}>
      {ctx.ctaLabel}
    </Link>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────

export function TopBar({ ctx, tone = 'ink', className }: { ctx: ProfileContext; tone?: 'ink' | 'light'; className?: string }) {
  if (ctx.embedded) return null;
  const host = ctx.data.profileUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return (
    <div className={cx(s.topbar, tone === 'light' && s.onDark, className)}>
      <Link href="/" className={s.logo}>
        <Image src="/influet_logo.png" alt="" width={36} height={36} />
        influnet
      </Link>
      <button type="button" className={s.handle} onClick={ctx.copyUrl} aria-live="polite" title="Copy profile link">
        {ctx.copied ? (
          'Link copied'
        ) : (
          <>
            {host}/<span>{ctx.data.username}</span>
          </>
        )}
      </button>
    </div>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────

function HeroCard({ ctx }: { ctx: ProfileContext }) {
  const { data } = ctx;
  const v = verification(ctx);
  const card = useRef<HTMLDivElement>(null);
  const thumbs = ctx.work.filter((w) => w.thumbUrl).slice(0, 3);
  const band = ctx.heroPost?.thumbUrl ?? thumbs[0]?.thumbUrl ?? null;
  const stats = ctx.collaborationStats;
  const avg = data.reviews?.average;

  // Pointer tilt, like holding a real visiting card. CSS variables + a CSS
  // transition, so there is no animation loop to keep alive.
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
    el.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 10}deg`);
  };
  const onLeave = () => {
    card.current?.style.setProperty('--rx', '0deg');
    card.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <section className={s.heroCard}>
      <div className={s.cardPanel}>
        <span className={s.ring} aria-hidden="true" />
        <TopBar ctx={ctx} tone="light" />
        <div className={s.tiltZone} onPointerMove={onMove} onPointerLeave={onLeave}>
          <div className={s.vcard} ref={card}>
            <div className={s.vband} style={band ? { backgroundImage: `url(${band})` } : undefined} />
            <div className={s.vbody}>
              <div className={s.vrow}>
                <Avatar ctx={ctx} />
                <span className={cx(s.chip, v.tone === 'verified' ? s.chipVerified : s.chipPending)} title={v.detail}>
                  {v.tone === 'verified' && <VerifiedMark className={s.chipMark} pro={ctx.isPro} />}
                  {v.tone === 'verified' ? 'Verified' : v.label}
                </span>
              </div>
              <div>
                <h1 className={s.vname}>{data.name}</h1>
                <p className={s.vsub}>
                  {[data.niches.slice(0, 2).join(' and ') || null, data.location?.split(',')[0] ?? null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {platformChips(ctx).length > 0 && (
                <div className={s.plats}>
                  {platformChips(ctx).map((p) => (
                    <span className={s.plat} key={p.label}>
                      <i style={{ background: p.color }} />
                      {p.label}
                    </span>
                  ))}
                </div>
              )}
              {thumbs.length === 3 && (
                <div className={s.thumbs}>
                  {thumbs.map((t) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={t.key} src={t.thumbUrl!} alt="" loading="lazy" />
                  ))}
                </div>
              )}
              <div className={s.vfoot}>
                <small>
                  {stats && stats.projectsCompleted > 0 ? (
                    <>
                      <b>{stats.projectsCompleted}</b> {stats.projectsCompleted === 1 ? 'campaign' : 'campaigns'} delivered
                      {avg != null && (
                        <>
                          {' '}
                          · <b>{avg.toFixed(1)}</b>★ rating
                        </>
                      )}
                    </>
                  ) : (
                    <>@{data.username}</>
                  )}
                </small>
                <CtaButton ctx={ctx} className={s.btnInk} />
              </div>
            </div>
          </div>
        </div>
        {!ctx.embedded && data.packages.length > 0 && (
          <p className={s.panelNote}>Brands can send a request right here. Rates start at {data.packages[0].priceLabel.split(/\s*[–-]\s*/)[0]}.</p>
        )}
      </div>

      <div className={s.cardRight}>
        <span className={cx(s.eyebrow, s.rise)}>[ About ]</span>
        <p className={cx(s.lede, s.rise)} style={{ '--d': '0.1s' } as CSSProperties}>
          {data.subtitleLead && <em>{data.subtitleLead}. </em>}
          {data.tagline}
        </p>
        {facts(ctx).length > 0 && (
          <div className={cx(s.facts, s.rise)} style={{ '--d': '0.2s' } as CSSProperties}>
            {facts(ctx).map((f) => (
              <span className={s.fact} key={f}>
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HeroCover({ ctx }: { ctx: ProfileContext }) {
  const { data } = ctx;
  const v = verification(ctx);
  const [first, rest] = splitName(data.name);
  const post = ctx.heroPost;
  return (
    <section className={s.heroCover}>
      <div className={s.wrap}>
        <TopBar ctx={ctx} />
        <div className={s.coverGrid}>
          <div>
            <div className={cx(s.eyebrow, s.rise)} style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>[ Creator{data.location ? ` · ${data.location.split(',')[0]}` : ''} ]</span>
              <span className={cx(s.status, v.tone === 'verified' ? s.statusVerified : s.statusPending)} title={v.detail}>
                {v.label}
              </span>
            </div>
            <h1 className={s.coverName}>
              <span className={s.line}>
                <span>{first}</span>
              </span>
              {rest && (
                <span className={s.line}>
                  <span style={{ '--d': '0.1s' } as CSSProperties}>{rest}</span>
                </span>
              )}
            </h1>
            <div className={cx(s.who, s.rise)} style={{ '--d': '0.4s' } as CSSProperties}>
              <Avatar ctx={ctx} />
              <p>
                {data.subtitleLead && <b>{data.subtitleLead}. </b>}
                {data.tagline}
              </p>
            </div>
            <div className={cx(s.ctas, s.rise)} style={{ marginTop: 32, '--d': '0.5s' } as CSSProperties}>
              <CtaButton ctx={ctx} className={s.btnInk} />
              {ctx.work.length > 0 && (
                <a className={cx(s.btn, s.btnLine)} href="#work">
                  See the work
                </a>
              )}
            </div>
          </div>
          <div className={s.cover}>
            <a
              className={s.coverFrame}
              href={post?.url ?? '#work'}
              target={post?.url ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => post && ctx.trackLink(post.kind === 'youtube' ? 'youtube' : 'instagram')}
            >
              {post?.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbUrl} alt={post.title} />
              ) : data.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.avatarUrl} alt={data.name} />
              ) : null}
              {post?.viewsLabel && (
                <span className={s.coverCaption}>
                  <span className={s.eyebrow}>{ctx.picked ? 'Featured' : 'Most watched'}</span>
                  <b>{post.viewsLabel} views</b>
                </span>
              )}
            </a>
            {data.packages.length > 0 && (
              <div className={s.sticker}>
                <span>₹</span>
                <div>
                  <strong>{data.packages[0].priceLabel}</strong>
                  <small>{data.packages[0].title}</small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroShowreel({ ctx }: { ctx: ProfileContext }) {
  const { data } = ctx;
  const v = verification(ctx);
  const [first, rest] = splitName(data.name);
  const post = ctx.heroPost;
  const image = post?.thumbUrl ?? data.avatarUrl;
  return (
    <section className={s.heroReel}>
      {image && <div className={s.reelBg} style={{ backgroundImage: `url(${image})` }} />}
      <div className={s.wrap}>
        <TopBar ctx={ctx} tone="light" />
      </div>
      <div className={cx(s.wrap, s.stage)}>
        <div className={s.reelLeft}>
          <span className={cx(s.eyebrow, s.rise)}>
            [ {[data.location?.split(',')[0], data.languages.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Creator'} ]
          </span>
          <h1 className={s.reelName}>
            <span className={s.line}>
              <span>{first}</span>
            </span>
          </h1>
          <p className={cx(s.reelIntro, s.rise)} style={{ '--d': '0.5s' } as CSSProperties}>
            {data.subtitleLead && <b>{data.subtitleLead}. </b>}
            {data.tagline}
          </p>
        </div>
        <a
          className={s.phone}
          href={post?.url ?? '#work'}
          target={post?.url ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={() => post && ctx.trackLink(post.kind === 'youtube' ? 'youtube' : 'instagram')}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={post?.title ?? data.name} />
          )}
          {post && <span className={s.phoneTag}>▶ {kindLabel(post)}</span>}
          {post?.viewsLabel && (
            <span className={s.phoneViews}>
              <b>{post.viewsLabel}</b>
              <small>views · {post.title}</small>
            </span>
          )}
        </a>
        <div className={s.reelRight}>
          {rest && (
            <div className={s.reelName} aria-hidden="true">
              <span className={s.line}>
                <span style={{ '--d': '0.12s' } as CSSProperties}>{rest}</span>
              </span>
            </div>
          )}
          <div className={cx(s.reelWho, s.rise)} style={{ '--d': '0.6s' } as CSSProperties}>
            <Avatar ctx={ctx} />
            <span className={cx(s.status, v.tone === 'verified' ? s.statusVerified : s.statusPending)} title={v.detail}>
              {v.label}
            </span>
          </div>
          <div className={cx(s.ctas, s.rise)} style={{ '--d': '0.7s' } as CSSProperties}>
            <CtaButton ctx={ctx} className={s.btnBrand} />
            {ctx.work.length > 0 && (
              <a className={cx(s.btn, s.btnLine)} href="#work">
                Watch the work
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HeroSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['hero'] }) {
  if (variant === 'cover') return <HeroCover ctx={ctx} />;
  if (variant === 'showreel') return <HeroShowreel ctx={ctx} />;
  return <HeroCard ctx={ctx} />;
}

// ── Numbers ────────────────────────────────────────────────────────────

export function StatsSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['stats'] }) {
  const numbers = ctx.data.headlineNumbers;
  const audience = ctx.data.audience;
  const hasAudience = !!audience && (audience.locations.length > 0 || audience.ages.length > 0 || audience.genders.length > 0);
  if (!numbers.length && !hasAudience) return null;
  const cls = variant === 'ledger' ? s.ledger : variant === 'ticker' ? s.ticker : s.tiles;
  return (
    <section className={cx(s.wrap, s.section)} style={variant === 'tiles' ? undefined : { paddingTop: 48 }}>
      {numbers.length > 0 && (
        <Reveal className={cls}>
          {numbers.map((n) => (
            <div key={n.label}>
              <CountUp className={s.num} value={n.value} />
              <span className={cx(s.eyebrow, s.numLabel)}>{n.label}</span>
            </div>
          ))}
        </Reveal>
      )}
      {hasAudience && audience && (
        <Reveal className={s.audience}>
          {[
            { title: 'Top locations', rows: audience.locations },
            { title: 'Age range', rows: audience.ages },
            { title: 'Gender', rows: audience.genders },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div className={s.audCard} key={g.title}>
                <h4>{g.title}</h4>
                {g.rows.slice(0, 5).map((r) => (
                  <div className={s.bar} key={r.label}>
                    <span>{r.label}</span>
                    <span className={s.track}>
                      <span style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </span>
                    <b>{r.pct}%</b>
                  </div>
                ))}
              </div>
            ))}
        </Reveal>
      )}
    </section>
  );
}

// ── Work ───────────────────────────────────────────────────────────────

function Tile({ ctx, item, wide }: { ctx: ProfileContext; item: ShowcaseItem; wide?: boolean }) {
  const body = (
    <>
      {item.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbUrl} alt={item.title} loading="lazy" />
      ) : (
        <span className={s.tileEmpty}>{item.title}</span>
      )}
      <span className={s.tileTag}>{kindLabel(item)}</span>
      {item.brandName && <span className={cx(s.tileTag, s.tileBrand)}>{item.brandName}</span>}
      <span className={s.tileCap}>
        <span>{item.title}</span>
        {item.viewsLabel && <b>▶ {item.viewsLabel}</b>}
      </span>
    </>
  );
  const cls = cx(s.tile, (wide ?? item.kind === 'youtube') && s.tileWide);
  return item.url ? (
    <a
      className={cls}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => ctx.trackLink(item.kind === 'youtube' ? 'youtube' : item.kind === 'instagram' ? 'instagram' : 'other')}
    >
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function WorkHead({ ctx, title, aside }: { ctx: ProfileContext; title: string; aside?: React.ReactNode }) {
  return (
    <div className={s.sh}>
      <div>
        <span className={s.eyebrow}>{ctx.picked ? `[ Chosen by ${ctx.firstName} ]` : '[ Recent work · most watched first ]'}</span>
        <h2 className={s.h2}>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function WorkGrid({ ctx }: { ctx: ProfileContext }) {
  const kinds = new Set(ctx.work.map((w) => (w.kind === 'youtube' ? 'youtube' : 'instagram')));
  const [tab, setTab] = useState<'all' | 'instagram' | 'youtube'>('all');
  const shown = ctx.work.filter((w) => tab === 'all' || (tab === 'youtube' ? w.kind === 'youtube' : w.kind !== 'youtube'));
  return (
    <section className={cx(s.wrap, s.section)} id="work">
      <WorkHead
        ctx={ctx}
        title="The work"
        aside={
          kinds.size > 1 && (
            <div className={s.tabs} role="group" aria-label="Filter work">
              {(['all', 'instagram', 'youtube'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t === 'all' ? 'All' : t === 'instagram' ? 'Instagram' : 'YouTube'}
                </button>
              ))}
            </div>
          )
        }
      />
      <div className={s.grid}>
        {shown.map((item) => (
          <Tile key={item.key} ctx={ctx} item={item} />
        ))}
      </div>
    </section>
  );
}

function WorkMasonry({ ctx }: { ctx: ProfileContext }) {
  return (
    <section className={cx(s.wrap, s.section)} id="work">
      <WorkHead ctx={ctx} title={`What ${ctx.firstName} makes`} />
      <Reveal className={s.masonry}>
        {ctx.work.map((item) => (
          <Tile key={item.key} ctx={ctx} item={item} wide={false} />
        ))}
      </Reveal>
    </section>
  );
}

/**
 * The page pins while the work slides sideways, and the counter adds up the
 * views of what has come into view. Desktop with motion only — a phone, or a
 * visitor who asked for less motion, gets a plain swipeable row.
 */
function WorkReel({ ctx }: { ctx: ProfileContext }) {
  const outer = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { scrollYProgress } = useScroll({ target: outer, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const [seen, setSeen] = useState(1);

  useLayoutEffect(() => {
    const decide = () => {
      const ok =
        !ctx.inline &&
        window.innerWidth > 960 &&
        !prefersReducedMotion();
      setPinned(ok);
      const t = track.current;
      if (t) setDistance(Math.max(0, t.scrollWidth - window.innerWidth));
    };
    decide();
    window.addEventListener('resize', decide);
    return () => window.removeEventListener('resize', decide);
  }, [ctx.work.length, ctx.inline]);

  useEffect(
    () =>
      scrollYProgress.on('change', (p) => setSeen(Math.max(1, Math.ceil(p * ctx.work.length)))),
    [scrollYProgress, ctx.work.length],
  );

  const total = ctx.work
    .slice(0, pinned ? seen : ctx.work.length)
    .reduce((sum, w) => sum + (w.views ?? 0), 0);

  return (
    <section
      id="work"
      ref={outer}
      className={cx(s.reelOuter, s.section, !pinned && s.reelNative)}
      style={pinned && distance > 0 ? { height: `calc(100svh + ${distance}px)` } : undefined}
    >
      <div className={s.reelSticky}>
        <div className={s.wrap}>
          <WorkHead
            ctx={ctx}
            title="The reel"
            aside={
              total > 0 && (
                <div className={s.meter}>
                  <span className={s.eyebrow}>Views on what you&apos;re watching</span>
                  <b>{formatCount(total)}</b>
                </div>
              )
            }
          />
        </div>
        <motion.div className={s.reelTrack} ref={track} style={pinned ? { x } : undefined}>
          {ctx.work.map((item) => (
            <Tile key={item.key} ctx={ctx} item={item} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export function WorkSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['work'] }) {
  if (!ctx.work.length) return null;
  if (variant === 'grid') return <WorkGrid ctx={ctx} />;
  if (variant === 'reel') return <WorkReel ctx={ctx} />;
  return <WorkMasonry ctx={ctx} />;
}

// ── Brands ─────────────────────────────────────────────────────────────

export function BrandsSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['brands'] }) {
  const { brands, otherBrands } = ctx;
  const stats = ctx.collaborationStats;
  const completed = stats?.projectsCompleted ?? brands.reduce((n, b) => n + b.count, 0);
  const active = stats?.projectsActive ?? 0;
  if (!brands.length && !otherBrands.length && completed === 0) return null;

  const others = otherBrands.length > 0 && (
    <p className={s.others}>
      Also worked with <span>{otherBrands.join(', ')}</span> · self-reported
    </p>
  );
  const delivered = (b: BookedBrand, paid = false) =>
    [
      `${b.count === 1 ? 'Campaign' : `${b.count} campaigns`} delivered${paid ? ' and paid' : ''}`,
      monthYear(b.latestAt),
    ]
      .filter(Boolean)
      .join(' · ');

  if (variant === 'ledger') {
    return (
      <section className={cx(s.wrap, s.section)}>
        <div className={s.brandsSplit}>
          <Reveal className={s.tally}>
            <span className={s.eyebrow}>[ On the record ]</span>
            <b>{completed}</b>
            <p>
              {completed === 1 ? 'campaign' : 'campaigns'} delivered through Influnet
              {brands.length > 0 && (
                <>
                  , for <b>{plural(brands.length, 'brand')}</b>
                </>
              )}
              .{active > 0 && (
                <>
                  {' '}
                  <b>{active} more</b> in progress right now.
                </>
              )}
            </p>
          </Reveal>
          <div>
            <ul className={s.ledgerList}>
              {brands.map((b) => (
                <Reveal as="li" key={b.name}>
                  <div>
                    <strong>{b.name}</strong>
                    <small>{delivered(b)}</small>
                  </div>
                  <span className={s.tick}>✓ Verified</span>
                </Reveal>
              ))}
            </ul>
            {others}
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'pills') {
    return (
      <section className={cx(s.wrap, s.section)}>
        <span className={s.eyebrow}>[ Verified on Influnet ]</span>
        <h2 className={s.h2}>Brands that booked {ctx.firstName} here</h2>
        <Reveal className={s.pills}>
          {brands.map((b) => (
            <span className={s.pill} key={b.name}>
              {b.name}
              {b.count > 1 && <span className={s.pillCount}>×{b.count}</span>}
            </span>
          ))}
        </Reveal>
        {completed > 0 && (
          <p className={s.brandsNote}>
            <b>{plural(completed, 'campaign')} delivered</b> through Influnet, each one paid and signed off by the brand.
            {active > 0 && (
              <>
                {' '}
                <b>{active} more</b> in progress.
              </>
            )}
          </p>
        )}
        {others}
      </section>
    );
  }

  return (
    <section className={cx(s.wrap, s.section)}>
      <span className={s.eyebrow}>[ Verified on Influnet ]</span>
      <h2 className={s.h2}>Track record</h2>
      <ul className={s.timeline}>
        {active > 0 && (
          <Reveal as="li" className={s.live}>
            <strong>{plural(active, 'campaign')} in progress</strong>
            <small>Running on Influnet right now</small>
          </Reveal>
        )}
        {brands.map((b) => (
          <Reveal as="li" key={b.name}>
            <strong>{b.name}</strong>
            <small>{delivered(b, true)}</small>
          </Reveal>
        ))}
      </ul>
      {others}
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────

export function TestimonialsSection({
  ctx,
  variant,
}: {
  ctx: ProfileContext;
  variant: ProfileLayoutSections['testimonials'];
}) {
  const reviews = ctx.data.reviews;
  if (!reviews || reviews.count === 0) return null;
  const withText = reviews.items.filter((r) => r.comment?.trim());
  const lead = withText[0] ?? null;
  const rest = reviews.items.filter((r) => r !== lead).slice(0, 4);
  const avg = reviews.average;
  const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const summary = `${avg != null ? `${avg.toFixed(1)} from ` : ''}${plural(reviews.count, 'review')}`;

  const minis = rest.length > 0 && (
    <div className={s.moreReviews}>
      {rest.map((r) => (
        <Reveal className={s.miniReview} key={r.id}>
          <span className={s.stars} aria-label={`${r.rating} out of 5`}>
            {stars(r.rating)}
          </span>
          {r.comment && <p>“{r.comment}”</p>}
          <small>
            {r.reviewerName}
            {r.createdAt ? ` · ${monthYear(r.createdAt)}` : ''}
          </small>
        </Reveal>
      ))}
    </div>
  );

  const head = (
    <>
      <span className={s.eyebrow}>[ From completed campaigns ]</span>
      <h2 className={s.h2}>What brands say</h2>
    </>
  );

  if (variant === 'accent') {
    return (
      <section className={cx(s.wrap, s.section)}>
        {head}
        <div className={s.accentList}>
          {reviews.items.slice(0, 5).map((r) => (
            <Reveal className={s.accentItem} key={r.id}>
              <p>{r.comment ? `“${r.comment}”` : `Rated ${r.rating} out of 5`}</p>
              <small>
                {stars(r.rating)} · {r.reviewerName}, after a completed campaign
              </small>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'quote') {
    return (
      <section className={cx(s.wrap, s.section)}>
        {head}
        <Reveal className={s.quoteBig}>
          <span className={s.stars} aria-label={`${avg ?? 0} out of 5`}>
            {stars(avg ?? 0)}
          </span>
          <blockquote>{lead ? `“${lead.comment}”` : summary}</blockquote>
          <cite>
            {lead && <b>{lead.reviewerName}</b>}
            {lead ? ' · after a completed campaign · ' : ''}
            {summary}
          </cite>
          {avg != null && (
            <span className={s.scoreBg} aria-hidden="true">
              {avg.toFixed(1)}
            </span>
          )}
        </Reveal>
        {minis}
      </section>
    );
  }

  return (
    <section className={cx(s.wrap, s.section)}>
      {head}
      <Reveal className={s.spotlight}>
        {avg != null && (
          <span className={s.score} aria-hidden="true">
            {avg.toFixed(1)}
          </span>
        )}
        <span className={s.stars} aria-label={`${avg ?? 0} out of 5`}>
          {stars(avg ?? 0)}
        </span>
        <blockquote>{lead ? `“${lead.comment}”` : summary}</blockquote>
        <cite>
          {lead && <b>{lead.reviewerName}</b>}
          {lead ? ' · after a completed campaign · ' : ''}
          {summary}
        </cite>
      </Reveal>
      {minis}
    </section>
  );
}

// ── Rates ──────────────────────────────────────────────────────────────

export function RatesSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['rates'] }) {
  const packages = ctx.data.packages;
  if (!packages.length) return null;
  const head = (
    <>
      <span className={s.eyebrow}>[ Rates ]</span>
      <h2 className={s.h2}>Work with {ctx.firstName}</h2>
    </>
  );
  const note = <p className={s.rateNote}>Starting points. Every campaign is priced together before anything is agreed.</p>;

  if (variant === 'cards') {
    return (
      <section className={cx(s.wrap, s.section)}>
        {head}
        <div className={s.cards}>
          {packages.map((p) => (
            <Reveal className={s.rateCard} key={p.title}>
              <span className={s.eyebrow}>{p.platform === 'youtube' ? 'YouTube' : p.platform === 'instagram' ? 'Instagram' : 'In person'}</span>
              <h3 className={s.rateTitle}>{p.title}</h3>
              <span className={s.rateAmt}>{p.priceLabel}</span>
              <ul>
                {p.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              <CtaButton ctx={ctx} className={s.btnInk} />
            </Reveal>
          ))}
        </div>
        {note}
      </section>
    );
  }

  if (variant === 'menu') {
    return (
      <section className={cx(s.wrap, s.section)}>
        {head}
        <ul className={s.menu}>
          {packages.map((p) => (
            <Reveal as="li" key={p.title}>
              <h3 className={s.rateTitle}>{p.title}</h3>
              <span className={s.dots} />
              <span className={s.rateAmt}>{p.priceLabel}</span>
              <p className={s.ratePerks}>{p.perks.join(' · ')}</p>
            </Reveal>
          ))}
        </ul>
        {note}
      </section>
    );
  }

  return (
    <section className={cx(s.wrap, s.section)}>
      {head}
      <div className={s.rows}>
        {packages.map((p) => (
          <Reveal className={s.rateRow} key={p.title}>
            <h3 className={s.rateTitle}>{p.title}</h3>
            <span className={s.rateAmt}>{p.priceLabel}</span>
            <p className={s.ratePerks}>
              {p.description} {p.perks.join(' · ')}
            </p>
          </Reveal>
        ))}
      </div>
      {note}
    </section>
  );
}

// ── Closer ─────────────────────────────────────────────────────────────

export function CloserSection({ ctx, variant }: { ctx: ProfileContext; variant: ProfileLayoutSections['closer'] }) {
  const url = ctx.data.profileUrl;
  const text = ctx.closingNote || `Planning a campaign? Ask ${ctx.firstName}.`;
  const share = (
    <div className={s.share}>
      <a href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        LinkedIn
      </a>
      <button type="button" onClick={ctx.copyUrl}>
        {ctx.copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
  const eyebrow = <span className={s.eyebrow}>[ {url.replace(/^https?:\/\//, '')} ]</span>;

  if (variant === 'centered') {
    return (
      <section className={cx(s.wrap, s.centered)}>
        <Reveal>
          {eyebrow}
          <p className={s.closerText}>{text}</p>
          <CtaButton ctx={ctx} className={s.btnBrand} />
          {!ctx.embedded && share}
        </Reveal>
      </section>
    );
  }
  return (
    <section className={s.slab}>
      <span className={s.ring} aria-hidden="true" />
      <Reveal className={s.wrap}>
        {eyebrow}
        <p className={s.closerText}>{text}</p>
        <CtaButton ctx={ctx} className={s.btnWhite} />
        {!ctx.embedded && share}
      </Reveal>
    </section>
  );
}
