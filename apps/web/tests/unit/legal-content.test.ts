import { describe, it, expect } from 'vitest';
import { LEGAL_DOCS, getLegalDoc, unresolved } from '@/app/legal/legal-content';
// The published text the landing site serves at influnet.io/terms, /privacy, /refunds.
import { LEGAL_DOCS as LANDING } from '../../../landing/src/lib/legal-data';

describe('legal documents', () => {
  it('ships the four pages Razorpay onboarding checks for', () => {
    const slugs = LEGAL_DOCS.map((d) => d.slug).sort();
    expect(slugs).toEqual(['contact', 'privacy', 'refunds', 'terms']);
  });

  it('names a grievance officer — an Indian legal requirement, not a nicety', () => {
    const privacy = getLegalDoc('privacy')!;
    const headings = privacy.sections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes('grievance'))).toBe(true);
  });

  it('is the same text as the landing site — one binding policy, not two', () => {
    // The app opens these pages and the store listings link to them; if they
    // said something different from influnet.io, which one binds?
    for (const slug of ['terms', 'privacy', 'refunds'] as const) {
      expect(getLegalDoc(slug)).toEqual(LANDING[slug]);
    }
  });

  it('is published: no page has an unfilled placeholder', () => {
    // A store reviewer opens these from the app. Any [[MARKER]] left would
    // also put the draft banner back on the page.
    for (const doc of LEGAL_DOCS) {
      expect(unresolved(doc), doc.slug).toEqual([]);
    }
  });

  it('detects a placeholder, including one in the updated date', () => {
    const draft = {
      slug: 'x',
      title: 'X',
      summary: 'draft',
      updated: '[[DATE PUBLISHED]]',
      sections: [{ heading: 'Who', body: ['[[LEGAL ENTITY NAME]] and [[LEGAL ENTITY NAME]] again.'] }],
    };
    // Each distinct marker once, not once per occurrence.
    expect(unresolved(draft).sort()).toEqual(['[[DATE PUBLISHED]]', '[[LEGAL ENTITY NAME]]']);
  });

  it('returns nothing for an unknown slug', () => {
    expect(getLegalDoc('nope')).toBeUndefined();
  });
});
