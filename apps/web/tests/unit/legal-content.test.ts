import { describe, it, expect } from 'vitest';
import { LEGAL_DOCS, getLegalDoc, unresolved } from '@/app/legal/legal-content';

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

  it('detects unfilled placeholders so the draft banner can appear', () => {
    for (const doc of LEGAL_DOCS) {
      expect(unresolved(doc).length).toBeGreaterThan(0);
    }
  });

  it('reports each distinct placeholder once, not once per occurrence', () => {
    const terms = getLegalDoc('terms')!;
    const gaps = unresolved(terms);
    expect(new Set(gaps).size).toBe(gaps.length);
  });

  it('finds placeholders in the updated date, not only the body', () => {
    const doc = getLegalDoc('contact')!;
    expect(unresolved(doc)).toContain('[[DATE PUBLISHED]]');
  });

  it('returns nothing for an unknown slug', () => {
    expect(getLegalDoc('nope')).toBeUndefined();
  });

  it('reports NO gaps once every placeholder is replaced', () => {
    // Proves the banner actually disappears on its own rather than needing a
    // flag flipped — which is the whole design of the guard.
    const filled = {
      slug: 'x',
      title: 'X',
      summary: 'done',
      updated: '2026-09-14',
      sections: [{ heading: 'All set', body: ['No markers here.'] }],
    };
    expect(unresolved(filled)).toEqual([]);
  });
});
