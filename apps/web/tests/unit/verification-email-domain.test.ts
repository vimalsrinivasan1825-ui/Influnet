import { describe, it, expect } from 'vitest';
import { emailDomainMatch, buildBusinessSignals, isPersonalEmailDomain } from '@/lib/verification-scraper';
import { scoreBusinessSignals, scoreBreakdown, decide } from '@/lib/verification';

describe('emailDomainMatch', () => {
  it('matches the website domain exactly and on subdomains', () => {
    expect(emailDomainMatch({ website: 'https://www.acme.com', email: 'a@acme.com' }).matches).toBe(true);
    expect(emailDomainMatch({ website: 'acme.com', email: 'a@mail.acme.com' }).matches).toBe(true);
  });

  it('does not match a lookalike of the website domain', () => {
    expect(emailDomainMatch({ website: 'acme.com', email: 'a@notacme.com' }).matches).toBe(false);
    expect(emailDomainMatch({ website: 'acme.com', email: 'a@acme.com.evil.io' }).matches).toBe(false);
  });

  it('falls back to the company name when there is no website', () => {
    const m = emailDomainMatch({ companyName: 'Nomad Coffee Co.', email: 'r@nomadcoffee.in' });
    expect(m).toMatchObject({ matches: true, basis: 'company_name', personal: false });
    expect(emailDomainMatch({ companyName: 'Nomad Coffee Co.', email: 'r@other.in' }).matches).toBe(false);
  });

  it('website on file wins over the company name', () => {
    expect(emailDomainMatch({ companyName: 'Acme', website: 'acmeworld.com', email: 'a@acme.io' }).matches).toBe(false);
  });

  it('flags personal providers and never matches them', () => {
    const m = emailDomainMatch({ companyName: 'Gmail Traders', website: 'gmail.com', email: 'x@gmail.com' });
    expect(m).toMatchObject({ personal: true, matches: false });
    expect(isPersonalEmailDomain('Yahoo.co.in')).toBe(true);
  });

  it('tolerates missing or malformed email', () => {
    expect(emailDomainMatch({ companyName: 'Acme', email: null }).domain).toBeNull();
    expect(emailDomainMatch({ companyName: 'Acme', email: 'nope' }).matches).toBe(false);
  });
});

describe('business scoring with email domain', () => {
  it('only awards the bonus when the inbox is verified AND on the company domain', () => {
    const base = { website_resolves: true };
    const none = scoreBusinessSignals(base);
    expect(scoreBusinessSignals({ ...base, email_domain_matches_company: true })).toBe(none);
    expect(scoreBusinessSignals({ ...base, email_domain_verified: true })).toBe(none);
    expect(scoreBusinessSignals({ ...base, email_domain_verified: true, email_domain_matches_company: true })).toBeCloseTo(none + 0.25);
  });

  it('a verified personal email earns nothing but is not penalised or escalated', () => {
    const signals = buildBusinessSignals({ company_name: 'Acme', website: 'https://acme.com', email: 'me@gmail.com' });
    expect(signals.uses_personal_email).toBe(true);
    expect(signals.flags).toContain('personal_email_domain');
    const verified = { ...signals, email_domain_verified: true };
    expect(scoreBusinessSignals(verified)).toBe(scoreBusinessSignals(signals));
    expect(decide('business_owner', verified).status).not.toBe('rejected');
  });

  it('shows the item in the checklist', () => {
    const item = scoreBreakdown('business_owner', { email_domain_verified: true, email_domain_matches_company: true }).find(
      (i) => i.key === 'email_domain',
    );
    expect(item?.met).toBe(true);
  });
});

describe('businessEmailHint (signup)', () => {
  it('says nothing until there is a complete address', async () => {
    const { businessEmailHint } = await import('@influnet/core');
    expect(businessEmailHint({ companyName: 'Acme', email: 'me@' })).toBeNull();
  });

  it('warns on personal, praises a match, and stays neutral otherwise', async () => {
    const { businessEmailHint } = await import('@influnet/core');
    expect(businessEmailHint({ companyName: 'Acme Foods', email: 'me@gmail.com' })).toMatchObject({ tone: 'warn' });
    expect(businessEmailHint({ companyName: 'Acme Foods', email: 'me@acmefoods.in' })).toMatchObject({ tone: 'good' });
    expect(businessEmailHint({ companyName: 'Acme Foods', email: 'me@random.io' })).toMatchObject({ tone: 'info' });
  });
});
