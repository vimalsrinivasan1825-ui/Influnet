// Single source of truth for the app's public origin, so the domain a creator
// is shown at signup, in settings, and in the welcome modal can never disagree
// with each other or with the link that actually gets served.
//
// NEXT_PUBLIC_APP_URL is validated in env.ts; read directly here so this stays
// usable from client components without pulling in the server-only env module.

const DEFAULT_ORIGIN = 'http://localhost:3000';

/** Full origin, e.g. "https://influnet.app". No trailing slash. */
export function publicOrigin(): string {
  // The host the page is actually being served from is ground truth, so it
  // wins over the build-time constant. NEXT_PUBLIC_* values are inlined when
  // the bundle is built, so a single build served from localhost, dev and
  // production would otherwise show all three the SAME domain — whichever one
  // happened to be set at build time. That is how a local dev server ended up
  // telling creators their profile link was influnet.com/<username>, a URL
  // that did not resolve to the app they were looking at.
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return DEFAULT_ORIGIN;
}

/** Origin with the protocol stripped, for compact display: "influnet.app". */
export function publicOriginDisplay(): string {
  return publicOrigin().replace(/^https?:\/\//, '');
}

/**
 * Server-side origin, taken from the request that is being handled.
 *
 * publicOrigin() cannot see the request, so on the server it falls back to the
 * build-time NEXT_PUBLIC_APP_URL — which is wrong the moment one build serves
 * more than one host. Anything a user will COMPARE against what they see in
 * the browser must use this instead. Ownership verification is the sharp case:
 * the marker is stored server-side and later matched against the creator's
 * Instagram bio, so if the server issues influnet.com/<username> while the
 * browser tells them to paste localhost:3000/<username>, verification can
 * never succeed. Same derivation the public profile page already uses.
 */
export function originFromHeaders(h: Headers): string {
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host || !isTrustedHost(host)) return publicOrigin();
  const proto = h.get('x-forwarded-proto') ?? (isLocalHost(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

/**
 * Hosts we will echo back into a response. Everything else falls back to the
 * configured origin.
 *
 * Host and X-Forwarded-Host are CLIENT-CONTROLLED — a proxy sets them, but
 * nothing stops a request arriving with either one forged. That matters here
 * because the ownership bio marker is `<origin>/<username>`, and a caller
 * controls their own username too, so an unchecked host would let them mint an
 * arbitrary `A/B` marker and pick one that already appears in someone ELSE's
 * Instagram bio (bios are full of things like linktr.ee/<name>). Confirm then
 * scrapes the victim's bio, finds the string, and hands the attacker a
 * verified claim on a handle that is not theirs — the exact impersonation the
 * ownership handshake exists to prevent.
 */
export function isTrustedHost(host: string): boolean {
  if (isLocalHost(host)) return true;
  const h = host.toLowerCase().split(':')[0];

  // The configured canonical origin is always trusted.
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      if (new URL(configured).hostname.toLowerCase() === h) return true;
    } catch {
      /* malformed config — fall through to the suffix list */
    }
  }

  return TRUSTED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

/** Domains this app is actually deployed under. */
const TRUSTED_HOST_SUFFIXES = [
  'influnet.io',
  'influnet.com',
  'influnet.in',
  'azurecontainerapps.io',
  'vercel.app',
];

/**
 * Full shareable URL for a creator's or business's public profile.
 *
 * No /c or /b segment: usernames are unique across both tables (migration
 * 021), so the prefix told a visitor nothing and the type is resolved by
 * app/[username]/page.tsx instead. The old paths still redirect here.
 */
export function publicProfileUrl(username: string): string {
  return `${publicOrigin()}/${username}`;
}

/** Display-only form for hint text: "influnet.app/username". */
export function publicProfileUrlDisplay(username: string): string {
  return `${publicOriginDisplay()}/${username}`;
}
