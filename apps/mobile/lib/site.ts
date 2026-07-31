/**
 * Mirrors apps/web/src/lib/site.ts. Web reads its own origin (same-origin
 * requests); mobile only ever talks to the deployed web app, so its "own
 * origin" for a public profile link IS API_BASE_URL — the same rule
 * lib/api.ts already applies to every other request.
 */
import { API_BASE_URL } from './supabase';

/** Full shareable URL for a creator's or business's public profile. */
export function publicProfileUrl(kind: 'c' | 'b', username: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/${kind}/${username}`;
}

/** Display-only form for hint text: "influnet.in/c/username". */
export function publicProfileUrlDisplay(kind: 'c' | 'b', username: string): string {
  return publicProfileUrl(kind, username).replace(/^https?:\/\//, '');
}
