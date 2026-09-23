'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { resolveProfileLayout, type ResolvedProfileLayout } from '@influnet/core';
import type { RenderableProfileView } from '@/lib/public-profile/tier-projection';
import { groupBookedBrands, otherBrands, pickHeroPost, pickWork } from '@/lib/public-profile/profile-layout-view';
import { apiFetch } from '@/lib/api-client';
import { useLinkClick } from '@/lib/hooks/use-link-click';
import { CustomizePanel } from './customize-panel';
import {
  BrandsSection,
  CloserSection,
  HeroSection,
  RatesSection,
  StatsSection,
  TestimonialsSection,
  WorkSection,
  type CollaborationStats,
  type ProfileContext,
} from './sections';
import { fontVars } from './fonts';
import s from './editorial.module.css';

export type { CollaborationStats } from './sections';

export interface EditorialProfileProps {
  /** The full view or the Free projection — see lib/public-profile/tier-projection.ts. */
  data: RenderableProfileView;
  layout: ResolvedProfileLayout;
  isOwner: boolean;
  /** Is the PROFILE OWNER a Pro subscriber? Gilds the verified seal. Server-derived. */
  isPro?: boolean;
  ctaHref: string;
  ctaLabel: string;
  collaborationStats?: CollaborationStats | null;
  /** Inside the mobile app's WebView: no site chrome, CTAs or owner controls. */
  embedded?: boolean;
  /** Open the Customize panel on arrival (`?customize=1`, e.g. from a notification). */
  startCustomizing?: boolean;
  /**
   * Rendered inside another scrolling surface (the dashboard's search overlay,
   * the dashboard preview) rather than as the page. Nothing fixed to the
   * window — no owner bar, no sticky request bar — and no scroll-pinned
   * sections, since the window is not what scrolls.
   */
  inline?: boolean;
}

const same = (a: ResolvedProfileLayout, b: ResolvedProfileLayout) => JSON.stringify(a) === JSON.stringify(b);

export default function EditorialProfile({
  data,
  layout,
  isOwner,
  isPro = false,
  ctaHref,
  ctaLabel,
  collaborationStats = null,
  embedded = false,
  inline = false,
  startCustomizing = false,
}: EditorialProfileProps) {
  const router = useRouter();
  const [published, setPublished] = useState(layout);
  const [draft, setDraft] = useState(layout);
  const [customizing, setCustomizing] = useState(startCustomizing && isOwner && !embedded && !inline);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [askOn, setAskOn] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const trackLink = useLinkClick(isOwner ? null : data.username);

  const owner = isOwner && !embedded && !inline;
  const dirty = !same(draft, published);
  // While customizing, the page IS the preview.
  const active = owner && customizing ? draft : published;

  // Leaving with unpublished choices loses them — say so.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The sticky request bar appears once the opening has scrolled away.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || embedded || inline) return;
    // A plain scroll check, not an IntersectionObserver alone: some in-app
    // browsers deliver observer callbacks late or not at all, and a request
    // bar that never appears costs the creator the request.
    const check = () => setAskOn(el.getBoundingClientRect().bottom < 0);
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [embedded, inline, active.sections.hero]);

  const copyUrl = async () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(data.profileUrl);
      return done();
    } catch {
      /* fall through */
    }
    try {
      const field = document.createElement('textarea');
      field.value = data.profileUrl;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(field);
      if (ok) return done();
    } catch {
      /* nothing left to try */
    }
    toast.error(`Couldn't copy automatically. The link is ${data.profileUrl.replace(/^https?:\/\//, '')}`);
  };

  const publish = async () => {
    setPublishing(true);
    const res = await apiFetch<{ layout: ResolvedProfileLayout }>('/api/profile/layout', {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
    setPublishing(false);
    if (!res.ok || !res.data) {
      toast.error(res.error || 'Could not publish your layout. Try again.');
      return;
    }
    const saved = resolveProfileLayout(res.data.layout);
    setPublished(saved);
    setDraft(saved);
    toast.success('Published. Visitors now see this layout.');
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const res = await apiFetch('/api/profile/refresh', { method: 'POST' });
    setRefreshing(false);
    if (!res.ok) toast.error(res.error || 'Could not refresh your posts. Try again.');
    else router.refresh();
  };

  // "Preview as visitor" means exactly that: the visitor's button and the
  // floating request bar, with the link made inert so nobody requests themselves.
  const asVisitor = owner && previewing;
  const shownCtaHref = asVisitor ? '#preview' : ctaHref;
  const shownCtaLabel = asVisitor ? 'Send a request' : ctaLabel;

  const ctx: ProfileContext = useMemo(() => {
    const work = pickWork(data.showcase, active.featured);
    const brands = groupBookedBrands(data.portfolio);
    return {
      data,
      firstName: data.name.trim().split(/\s+/)[0] || data.name,
      isPro,
      embedded,
      inline,
      ctaHref: shownCtaHref,
      ctaLabel: shownCtaLabel,
      collaborationStats,
      work,
      picked: active.featured.length > 0 && work.length > 0,
      heroPost: pickHeroPost(data.showcase, active.heroPost),
      brands,
      otherBrands: otherBrands(data.pastCollaborations, brands),
      closingNote: active.closingNote,
      copied,
      copyUrl,
      trackLink,
    };
    // copyUrl/trackLink are stable enough for render; `copied` drives the label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, active, isPro, embedded, inline, shownCtaHref, shownCtaLabel, collaborationStats, copied]);

  const v = active.sections;

  return (
    <div className={`${fontVars} ${s.root}`}>
      {owner && !previewing && (
        <div className={s.ownerBar}>
          <span>{dirty ? 'Unpublished changes' : 'Your public page'}</span>
          <button type="button" className={`${s.ownerBtn} ${s.ownerBtnPrimary}`} onClick={() => setCustomizing(true)}>
            Customize
          </button>
          <button
            type="button"
            className={s.ownerBtn}
            onClick={() => {
              setCustomizing(false);
              setPreviewing(true);
            }}
          >
            Preview as visitor
          </button>
          <button type="button" className={s.ownerBtn} onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh posts'}
          </button>
          <Link className={s.ownerBtn} style={{ display: 'inline-flex', alignItems: 'center' }} href="/dashboard/settings">
            Edit details
          </Link>
        </div>
      )}
      {owner && previewing && (
        <div className={s.ownerBar}>
          <span>Previewing as a visitor</span>
          <button type="button" className={s.ownerBtn} onClick={() => setPreviewing(false)}>
            Back to editing
          </button>
        </div>
      )}

      <div ref={heroRef}>
        <HeroSection ctx={ctx} variant={v.hero} />
      </div>
      <StatsSection ctx={ctx} variant={v.stats} />
      <WorkSection ctx={ctx} variant={v.work} />
      <BrandsSection ctx={ctx} variant={v.brands} />
      <TestimonialsSection ctx={ctx} variant={v.testimonials} />
      <RatesSection ctx={ctx} variant={v.rates} />
      <CloserSection ctx={ctx} variant={v.closer} />

      <footer className={`${s.wrap} ${s.footer}`}>
        <span>© {new Date().getFullYear()} Influnet</span>
        {!embedded && <Link href="/">Get your own Influnet page</Link>}
      </footer>

      {!embedded && !inline && (!isOwner || asVisitor) && (
        <div className={`${s.ask} ${askOn ? s.askOn : ''}`} aria-hidden={!askOn}>
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl} alt="" />
          ) : (
            <span className={s.askFallback}>{data.name.charAt(0).toUpperCase()}</span>
          )}
          <span className={s.askName}>
            <b>{data.name}</b>
            <small>@{data.username}</small>
          </span>
          <Link className={`${s.btn} ${s.btnBrand}`} href={shownCtaHref} tabIndex={askOn ? 0 : -1}>
            {shownCtaLabel}
          </Link>
        </div>
      )}

      {owner && customizing && !previewing && (
        <CustomizePanel
          draft={draft}
          onChange={setDraft}
          showcase={data.showcase}
          dirty={dirty}
          publishing={publishing}
          onPublish={publish}
          onDiscard={() => setDraft(published)}
          onClose={() => setCustomizing(false)}
        />
      )}
    </div>
  );
}
