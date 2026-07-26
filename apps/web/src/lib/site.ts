// Single source of truth for the app's public origin, so the domain a creator
// is shown at signup, in settings, and in the welcome modal can never disagree
// with each other or with the link that actually gets served.
//
// NEXT_PUBLIC_APP_URL is validated in env.ts; read directly here so this stays
// usable from client components without pulling in the server-only env module.

const DEFAULT_ORIGIN = 'http://localhost:3000';

/** Full origin, e.g. "https://influnet.app". No trailing slash. */
export function publicOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
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

/** Full shareable URL for a creator's or business's public profile. */
export function publicProfileUrl(kind: 'c' | 'b', username: string): string {
  return `${publicOrigin()}/${kind}/${username}`;
}

/** Display-only form for hint text: "influnet.app/c/username". */
export function publicProfileUrlDisplay(kind: 'c' | 'b', username: string): string {
  return `${publicOriginDisplay()}/${kind}/${username}`;
}
