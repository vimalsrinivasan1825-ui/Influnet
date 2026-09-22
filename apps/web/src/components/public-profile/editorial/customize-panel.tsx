'use client';

import {
  MAX_CLOSING_NOTE,
  MAX_FEATURED_POSTS,
  PROFILE_LAYOUT_LABELS,
  PROFILE_LAYOUT_ORDER,
  PROFILE_LAYOUT_VARIANTS,
  profilePostKey,
  type ProfileLayoutSection,
  type ResolvedProfileLayout,
} from '@influnet/core';
import type { ShowcaseItem } from '@/lib/public-profile/creator-profile';
import s from './editorial.module.css';

/**
 * The owner's editor. Every change here is a live preview on the page behind
 * it; nothing reaches visitors until Publish.
 */
export function CustomizePanel({
  draft,
  onChange,
  showcase,
  dirty,
  publishing,
  onPublish,
  onDiscard,
  onClose,
}: {
  draft: ResolvedProfileLayout;
  onChange: (next: ResolvedProfileLayout) => void;
  showcase: ShowcaseItem[];
  dirty: boolean;
  publishing: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const withThumbs = showcase.filter((i) => i.thumbUrl && i.url);
  const pickedKeys = draft.featured.map((l) => profilePostKey(l));
  const heroKey = profilePostKey(draft.heroPost);
  const heroUsesPost = draft.sections.hero !== 'card';

  const setVariant = (section: ProfileLayoutSection, variant: string) =>
    onChange({ ...draft, sections: { ...draft.sections, [section]: variant } });

  const togglePick = (item: ShowcaseItem) => {
    const idx = pickedKeys.indexOf(item.key);
    if (idx >= 0) {
      onChange({ ...draft, featured: draft.featured.filter((_, i) => i !== idx) });
    } else if (draft.featured.length < MAX_FEATURED_POSTS) {
      onChange({ ...draft, featured: [...draft.featured, item.url!] });
    }
  };

  return (
    <aside className={s.panel} role="dialog" aria-label="Customize your profile">
      <div className={s.panelHead}>
        <div>
          <h2>Customize</h2>
          <p>Pick a design for each section. You&apos;ll see it on your page as you go. Visitors see it once you publish.</p>
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={s.panelBody}>
        {PROFILE_LAYOUT_ORDER.map((section) => {
          const labels = PROFILE_LAYOUT_LABELS[section];
          return (
            <div className={s.pgroup} key={section}>
              <h3>{labels.title}</h3>
              <div className={s.choices} role="group" aria-label={`${labels.title} design`}>
                {(PROFILE_LAYOUT_VARIANTS[section] as readonly string[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={s.choice}
                    aria-pressed={draft.sections[section] === v}
                    onClick={() => setVariant(section, v)}
                  >
                    {(labels.variants as Record<string, string>)[v]}
                  </button>
                ))}
              </div>

              {section === 'hero' && heroUsesPost && withThumbs.length > 0 && (
                <>
                  <p className={s.hint} style={{ marginBottom: 8 }}>
                    Post shown large.{' '}
                    {draft.heroPost ? (
                      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...draft, heroPost: null })}>
                        Use my most watched
                      </button>
                    ) : (
                      'Your most-watched post is used until you pick one.'
                    )}
                  </p>
                  <div className={s.picker}>
                    {withThumbs.slice(0, 12).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={s.pick}
                        aria-pressed={heroKey === item.key}
                        aria-label={`Show "${item.title}" in the opening`}
                        onClick={() => onChange({ ...draft, heroPost: item.url })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.thumbUrl!} alt="" loading="lazy" />
                        {item.viewsLabel && <span className={s.pickViews}>▶ {item.viewsLabel}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {section === 'work' && withThumbs.length > 0 && (
                <>
                  <p className={s.hint} style={{ marginBottom: 8 }}>
                    {draft.featured.length
                      ? `${draft.featured.length} of ${MAX_FEATURED_POSTS} picked, shown in the order you tap them. `
                      : `Tap up to ${MAX_FEATURED_POSTS} posts to feature. Until you do, your most-watched posts are shown. `}
                    {draft.featured.length > 0 && (
                      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...draft, featured: [] })}>
                        Clear picks
                      </button>
                    )}
                  </p>
                  <div className={s.picker}>
                    {withThumbs.map((item) => {
                      const n = pickedKeys.indexOf(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={s.pick}
                          aria-pressed={n >= 0}
                          aria-label={`${n >= 0 ? 'Remove' : 'Feature'} "${item.title}"`}
                          onClick={() => togglePick(item)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.thumbUrl!} alt="" loading="lazy" />
                          {n >= 0 && <span className={s.pickBadge}>{n + 1}</span>}
                          {item.viewsLabel && <span className={s.pickViews}>▶ {item.viewsLabel}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {section === 'closer' && (
                <>
                  <textarea
                    className={s.textarea}
                    style={{ marginTop: 12 }}
                    maxLength={MAX_CLOSING_NOTE}
                    placeholder="Planning a campaign? Ask me."
                    value={draft.closingNote ?? ''}
                    onChange={(e) => onChange({ ...draft, closingNote: e.target.value || null })}
                    aria-label="Closing note"
                  />
                  <p className={s.hint}>
                    {(draft.closingNote ?? '').length}/{MAX_CLOSING_NOTE}. Leave it empty to use the default line.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className={s.panelFoot}>
        <button type="button" className={`${s.btn} ${s.btnLine}`} onClick={onDiscard} disabled={!dirty || publishing}>
          Discard
        </button>
        <button type="button" className={`${s.btn} ${s.btnBrand}`} onClick={onPublish} disabled={!dirty || publishing}>
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </aside>
  );
}
