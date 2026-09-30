import { describe, it, expect } from 'vitest';
import {
  extractSearchHandle,
  resolveLookupUsername,
  usernameFromProfileUrl,
} from '@/lib/search-query';

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

/**
 * The rule that makes Find creator a lookup rather than a search.
 *
 * Every `toBeNull()` below is a case the product REFUSES to answer. If one of
 * them starts resolving, the box has quietly become a directory again —
 * a partial word matching somebody is exactly the behaviour that was removed.
 */
describe('resolveLookupUsername', () => {
  it('accepts a bare username, an @handle, and either case', () => {
    expect(resolveLookupUsername('priya')).toBe('priya');
    expect(resolveLookupUsername('@priya')).toBe('priya');
    expect(resolveLookupUsername('  @PRIYA  ')).toBe('priya');
  });

  it('accepts our own profile links, including the legacy paths', () => {
    for (const url of [
      'https://influnet.io/priya',
      'influnet.in/priya',
      'https://influnet.io/priya/media-kit',
      'https://influnet.io/c/priya',
      'https://influnet.io/b/priya',
      'https://staging.influnet.io/priya',
      'https://influnet.io/priya?utm_source=ig',
    ]) {
      expect(resolveLookupUsername(url), url).toBe('priya');
    }
  });

  it('refuses free text, so a name or a phrase finds nobody', () => {
    expect(resolveLookupUsername('priya sharma')).toBeNull();
    expect(resolveLookupUsername('travel creators in Chennai')).toBeNull();
    expect(resolveLookupUsername('')).toBeNull();
    expect(resolveLookupUsername('   ')).toBeNull();
  });

  it('treats a single valid word as a USERNAME, never as a topic', () => {
    // 'food' is a legal username, so it resolves — and the route then matches
    // it exactly, finding the creator called @food or nobody at all. It does
    // NOT return food creators. This is the case people assume is a topic
    // search, and the assertion exists to keep it from becoming one.
    expect(resolveLookupUsername('food')).toBe('food');
  });

  it('refuses links we do not own rather than mining a word out of them', () => {
    // The Instagram namespace is not ours: resolving this would look up
    // whoever happens to hold the same string on Influnet.
    expect(resolveLookupUsername('https://instagram.com/priya')).toBeNull();
    expect(resolveLookupUsername('https://linktr.ee/priya')).toBeNull();
    expect(resolveLookupUsername('https://notinflunet.com/priya')).toBeNull();
    expect(resolveLookupUsername('notinflunet.com/priya')).toBeNull();
  });

  it('refuses reserved names and anything the username schema rejects', () => {
    expect(resolveLookupUsername('dashboard')).toBeNull();
    expect(resolveLookupUsername('admin')).toBeNull();
    expect(resolveLookupUsername('https://influnet.io/dashboard/projects')).toBeNull();
    expect(resolveLookupUsername('a')).toBeNull();
  });

  it('differs from extractSearchHandle, which is the loose parser', () => {
    // extractSearchHandle passes unknown text through so it can be matched
    // loosely. The lookup resolver must not — that difference is the feature.
    expect(extractSearchHandle('priya sharma')).toBe('priya sharma');
    expect(resolveLookupUsername('priya sharma')).toBeNull();
  });
});
