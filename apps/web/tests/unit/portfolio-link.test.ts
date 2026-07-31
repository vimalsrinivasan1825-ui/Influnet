/**
 * resolvePortfolioLink() — the parser behind "paste a link to add past work".
 *
 * This takes a URL from a user and runs on the server, which is the setup for
 * SSRF. The design defence is that we never fetch what was pasted: input is
 * reduced to an opaque ID, matched against a strict character class, and
 * interpolated into a hard-coded host. The tests that matter here are the ones
 * asserting that internal and malformed targets never survive that reduction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePortfolioLink } from '@/lib/portfolio-link';

// The only network call in the module is YouTube's oEmbed title lookup. Stubbed
// so tests never touch the network, and so a title failure can be exercised.
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ title: 'Monsoon skincare routine' }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YouTube links', () => {
  it('accepts every URL shape YouTube hands out', async () => {
    const id = 'dQw4w9WgXcQ';
    const shapes = [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
    ];

    for (const url of shapes) {
      const r = await resolvePortfolioLink(url);
      expect(r.platform).toBe('youtube');
      // Normalised: whatever was pasted, one canonical URL is stored.
      expect(r.url).toBe(`https://www.youtube.com/watch?v=${id}`);
      expect(r.thumbnailUrl).toBe(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    }
  });

  it('derives the thumbnail without any network call', async () => {
    // The thumbnail is a predictable path, so it cannot fail or be slow. Only
    // the optional title lookup is allowed to touch the network.
    const r = await resolvePortfolioLink('https://youtu.be/dQw4w9WgXcQ');
    expect(r.thumbnailUrl).toContain('img.youtube.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('youtube.com/oembed');
  });

  it('keeps the entry when the title lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const r = await resolvePortfolioLink('https://youtu.be/dQw4w9WgXcQ');
    // A dead oEmbed costs the suggested title, never the portfolio entry.
    expect(r.title).toBeNull();
    expect(r.platform).toBe('youtube');
    expect(r.thumbnailUrl).not.toBeNull();
  });

  it('rejects a YouTube URL with no video in it', async () => {
    await expect(resolvePortfolioLink('https://www.youtube.com/@someChannel')).rejects.toThrow(
      /no video/i,
    );
  });

  it('rejects a malformed video id rather than building a bogus thumbnail URL', async () => {
    // 11 chars exactly, URL-safe base64 — anything else is not a video id.
    await expect(
      resolvePortfolioLink('https://www.youtube.com/watch?v=../../etc/passwd'),
    ).rejects.toThrow();
  });
});

describe('Instagram links', () => {
  it('accepts posts, reels and IGTV, normalising to /p/', async () => {
    for (const url of [
      'https://www.instagram.com/p/CxYzAbCdEfG/',
      'https://instagram.com/reel/CxYzAbCdEfG/',
      'https://www.instagram.com/reels/CxYzAbCdEfG',
      'https://www.instagram.com/tv/CxYzAbCdEfG/',
    ]) {
      const r = await resolvePortfolioLink(url);
      expect(r.platform).toBe('instagram');
      expect(r.url).toBe('https://www.instagram.com/p/CxYzAbCdEfG/');
    }
  });

  it('returns no thumbnail, and makes no attempt to fetch one', async () => {
    /**
     * Instagram's oEmbed needs a Facebook app token and scraping the post page
     * from a datacenter IP returns a login wall. Shipping a fetch that works on
     * a laptop and fails in production is worse than not having one: the UI
     * draws a branded tile instead.
     */
    const r = await resolvePortfolioLink('https://www.instagram.com/p/CxYzAbCdEfG/');
    expect(r.thumbnailUrl).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a bare profile link', async () => {
    await expect(resolvePortfolioLink('https://www.instagram.com/meera.iyer/')).rejects.toThrow(
      /specific post or reel/i,
    );
  });
});

describe('SSRF surface', () => {
  const internalTargets = [
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://localhost:5432',
    'http://127.0.0.1/admin',
    'http://[::1]:8080/',
    'http://10.0.0.5/internal',
    'http://192.168.1.1/router',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://2130706433/', // 127.0.0.1 as a decimal integer
  ];

  it('never fetches an internal address', async () => {
    for (const target of internalTargets) {
      // These parse as valid URLs and are accepted as plain 'other' links —
      // stored as text, never dereferenced. The guarantee under test is that
      // no outbound request is made to any of them.
      const r = await resolvePortfolioLink(target).catch(() => null);
      if (r) expect(r.platform).toBe('other');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-http schemes outright', async () => {
    for (const scheme of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
    ]) {
      await expect(resolvePortfolioLink(scheme)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not fooled by a lookalike host', async () => {
    // youtube.com.evil.test is NOT youtube.com — the check is an exact set
    // membership on the parsed hostname, not a substring match.
    const r = await resolvePortfolioLink('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ');
    expect(r.platform).toBe('other');
    expect(fetchMock).not.toHaveBeenCalled();

    const r2 = await resolvePortfolioLink('https://evil.test/?x=instagram.com/p/abcdef');
    expect(r2.platform).toBe('other');
  });

  it('upgrades http to https rather than storing a downgraded link', async () => {
    const r = await resolvePortfolioLink('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.url.startsWith('https://')).toBe(true);
  });
});

describe('input handling', () => {
  it('accepts a protocol-less paste', async () => {
    const r = await resolvePortfolioLink('youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.platform).toBe('youtube');
  });

  it('rejects empty and unparseable input with a readable message', async () => {
    await expect(resolvePortfolioLink('')).rejects.toThrow(/paste a link/i);
    await expect(resolvePortfolioLink('   ')).rejects.toThrow(/paste a link/i);
    await expect(resolvePortfolioLink('not a url at all')).rejects.toThrow(/doesn't look like a link/i);
  });

  it('caps a stored plain link at the column width', async () => {
    const long = 'https://example.test/' + 'a'.repeat(4000);
    const r = await resolvePortfolioLink(long);
    expect(r.url.length).toBeLessThanOrEqual(2048);
  });
});
