import { describe, it, expect } from 'vitest';
import { extractSearchHandle, usernameFromProfileUrl } from '@/lib/search-query';

/**
 * Search is a lookup, not a browse tool: someone arrives already knowing who
 * they want, and what they have on hand is usually a link — the creator's
 * Instagram URL, or the Influnet profile link the creator sent them. Pasting
 * either used to search the whole URL verbatim and match nothing.
 */
describe('extractSearchHandle', () => {
  it('reduces an Influnet profile link to the username', () => {
    for (const url of [
      'https://influnet.io/priya',
      'http://influnet.in/priya',
      'https://www.influnet.com/priya',
      'influnet.in/priya',
      'https://influnet.io/priya/',
      'https://influnet.io/priya?utm_source=ig',
      'https://influnet.io/priya#about',
      // Trailing segments under the username are still that creator's page.
      'https://influnet.io/priya/media-kit',
      // Legacy paths — these are in real Instagram profiles right now.
      'https://influnet.io/c/priya',
      'https://influnet.io/b/priya',
      'https://influnet.io/c/priya/media-kit',
      // A link copied out of staging or a preview deploy.
      'https://staging.influnet.io/priya',
    ]) {
      expect(extractSearchHandle(url), url).toBe('priya');
    }
  });

  it('still handles Instagram URLs and bare handles', () => {
    expect(extractSearchHandle('https://instagram.com/priya.sharma')).toBe('priya.sharma');
    expect(extractSearchHandle('https://www.instagram.com/priya.sharma/')).toBe('priya.sharma');
    expect(extractSearchHandle('@priya')).toBe('priya');
    expect(extractSearchHandle('  priya  ')).toBe('priya');
  });

  /**
   * Mis-stripping is worse than not stripping: turning a verification code or
   * an app route into a "username" sends someone searching for a creator that
   * cannot exist. These must pass through untouched.
   */
  it('refuses to treat non-profile paths as usernames', () => {
    for (const url of [
      'https://influnet.io/vf/abc123', // verification link, not a profile
      'https://influnet.io/dashboard/home',
      'https://influnet.io/influnet/vimal2123', // link-in-bio slug, resolved by RPC
      'https://influnet.io/reset-password', // hyphens aren't valid usernames
      'https://influnet.io/settings',
      'https://influnet.io/c', // no username after the legacy prefix
      'https://influnet.io/',
    ]) {
      expect(extractSearchHandle(url), url).toBe(url);
    }
  });

  it('leaves other people’s domains alone', () => {
    expect(extractSearchHandle('https://linktr.ee/priya')).toBe('https://linktr.ee/priya');
    expect(extractSearchHandle('https://notinflunet.com/priya')).toBe('https://notinflunet.com/priya');
  });

  it('passes ordinary text searches straight through', () => {
    expect(extractSearchHandle('priya sharma')).toBe('priya sharma');
    expect(extractSearchHandle('')).toBe('');
  });
});

describe('usernameFromProfileUrl', () => {
  it('returns null for anything that is not one of our profile links', () => {
    expect(usernameFromProfileUrl('priya')).toBeNull();
    expect(usernameFromProfileUrl('not a url')).toBeNull();
    expect(usernameFromProfileUrl('https://linktr.ee/priya')).toBeNull();
  });

  it('lower-cases the username it extracts', () => {
    expect(usernameFromProfileUrl('https://influnet.io/PRIYA')).toBe('priya');
  });
});
