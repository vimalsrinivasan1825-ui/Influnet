import { describe, it, expect } from 'vitest';
import { describeViewer } from '@/lib/profile-viewers';

// Same wording as migration 194's profile_viewer_descriptor(), which writes the
// notification. A viewer past the plan's limit is described, never named.
describe('describeViewer', () => {
  it('describes a brand by industry and city', () => {
    expect(describeViewer({ role: 'business_owner', category: 'Food & Beverage', city: 'Bengaluru' }))
      .toBe('A brand in Food & Beverage from Bengaluru');
  });

  it('describes a creator by their first niche and city', () => {
    expect(describeViewer({ role: 'influencer', category: 'Fashion', city: 'Chennai' }))
      .toBe('A Fashion creator from Chennai');
  });

  it('drops whatever the viewer never filled in', () => {
    expect(describeViewer({ role: 'business_owner', category: '  ', city: null })).toBe('A brand');
    expect(describeViewer({ role: 'influencer', category: null, city: 'Pune' })).toBe('A creator from Pune');
  });

  it('falls back to "Someone" when the role is unknown', () => {
    expect(describeViewer(undefined)).toBe('Someone');
    expect(describeViewer({ role: null, category: 'Tech', city: 'Delhi' })).toBe('Someone from Delhi');
  });
});
