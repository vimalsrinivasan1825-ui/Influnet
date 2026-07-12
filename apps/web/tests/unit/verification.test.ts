import { describe, it, expect } from 'vitest';
import {
  decide,
  scoreBusinessSignals,
  scoreCreatorSignals,
  AUTO_APPROVE_THRESHOLD,
  ESCALATE_THRESHOLD,
} from '@/lib/verification';
import { buildBusinessSignals, buildCreatorSignals } from '@/lib/verification-scraper';

describe('scoreBusinessSignals', () => {
  it('scores a strong business high enough to auto-approve', () => {
    const s = scoreBusinessSignals({
      website_resolves: true,
      website_mentions_name: true,
      gst_format_valid: true,
      domain_age_days: 400,
      has_contactable_channel: true,
    });
    expect(s).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
  });

  it('scores an empty business at zero', () => {
    expect(scoreBusinessSignals({})).toBe(0);
  });
});

describe('scoreCreatorSignals', () => {
  it('scores an active multi-platform creator highly', () => {
    const s = scoreCreatorSignals({
      social_handles_live: { instagram: true, youtube: true },
      follower_count: 50000,
      last_post_days_ago: 2,
      bio_matches_niche: true,
    });
    expect(s).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
  });
});

describe('decide', () => {
  it('auto-approves high confidence', () => {
    const d = decide('business_owner', {
      website_resolves: true,
      website_mentions_name: true,
      gst_format_valid: true,
      domain_age_days: 400,
      has_contactable_channel: true,
    });
    expect(d.status).toBe('verified');
    expect(d.decided_by).toBe('ai');
  });

  it('escalates medium confidence to a human', () => {
    const d = decide('business_owner', { website_resolves: true, website_mentions_name: true }); // 0.6
    expect(d.score).toBeGreaterThanOrEqual(ESCALATE_THRESHOLD);
    expect(d.score).toBeLessThan(AUTO_APPROVE_THRESHOLD);
    expect(d.status).toBe('in_review');
  });

  it('asks for more info on low confidence — never rejects automatically', () => {
    const d = decide('influencer', {});
    expect(d.status).toBe('needs_more_info');
    // INVARIANT: the automated path can never reject.
    expect(d.status).not.toBe('rejected' as never);
  });

  it('escalates fraud signals instead of approving or rejecting', () => {
    const d = decide('influencer', {
      social_handles_live: { instagram: true, youtube: true, twitter: true },
      follower_count: 999999,
      last_post_days_ago: 1,
      bio_matches_niche: true,
      flags: ['all_handles_dead'],
    });
    expect(d.status).toBe('in_review');
  });
});

describe('scraper signal builders', () => {
  it('flags a malformed GST and missing website', () => {
    const s = buildBusinessSignals({ company_name: 'Acme', gst_number: 'NOPE' });
    expect(s.gst_format_valid).toBe(false);
    expect(s.flags).toContain('gst_format_invalid');
  });

  it('accepts a valid GSTIN and well-formed website mentioning the name', () => {
    const s = buildBusinessSignals({
      company_name: 'Acme',
      website: 'https://acme.com',
      gst_number: '27AAPFU0939F1ZV',
    });
    expect(s.gst_format_valid).toBe(true);
    expect(s.website_resolves).toBe(true);
    expect(s.website_mentions_name).toBe(true);
  });

  it('flags a creator with no social handles', () => {
    const s = buildCreatorSignals({ bio: 'hi' });
    expect(s.flags).toContain('no_social_handles');
    expect(Object.values(s.social_handles_live ?? {}).filter(Boolean)).toHaveLength(0);
  });

  it('detects bio/niche consistency', () => {
    const s = buildCreatorSignals({ bio: 'Daily fitness tips', niche: ['fitness'], instagram_handle: 'fitguy' });
    expect(s.bio_matches_niche).toBe(true);
    expect(s.social_handles_live?.instagram).toBe(true);
  });
});
