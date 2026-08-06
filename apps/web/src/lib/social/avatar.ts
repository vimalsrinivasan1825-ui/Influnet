import { logger } from '../logger';

/**
 * Instagram avatars can't be loaded by a browser. The CDN answers our server
 * fine — that's how the scrape works at all — but the same URL from a page,
 * with or without a referrer, is refused: those URLs are signed and bound to
 * the fetch that produced them. The signup card was therefore showing a broken
 * image exactly where it says "is this you?", which is the one thing that card
 * exists to answer.
 *
 * So the bytes come back with the JSON, inlined as a data: URI. One extra
 * ~10KB server fetch on a route that already spends a provider call, and the
 * card renders the same on web and in the app without a caching layer or a
 * public image proxy to abuse.
 *
 * Only Meta's CDNs are inlined. YouTube's avatars (yt3.googleusercontent.com)
 * load directly in a browser and are passed through untouched — inlining them
 * would be bytes spent for nothing.
 */

const INLINE_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i];

/** Profile pictures are ~5–40KB. Anything larger isn't one. */
const MAX_BYTES = 400_000;
const TIMEOUT_MS = 6_000;

export async function inlineAvatar(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // The URL comes from the provider payload, never from the caller — but this
  // still refuses anything but https on a known image host, so a compromised
  // or spoofed provider response can't turn this into a request-forgery tool
  // pointed at internal addresses.
  if (url.protocol !== 'https:') return null;
  if (!INLINE_HOSTS.some((h) => h.test(url.hostname))) return rawUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return rawUrl;

    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return rawUrl;

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return rawUrl;

    return `data:${type.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`;
  } catch (err) {
    // A missing avatar is cosmetic; the handle, name and follower count still
    // answer "is this you?". Hand back the original URL and let the card fall
    // back to its placeholder.
    logger.warn('[social] avatar inline failed', { host: url.hostname, err: String(err) });
    return rawUrl;
  } finally {
    clearTimeout(timer);
  }
}
