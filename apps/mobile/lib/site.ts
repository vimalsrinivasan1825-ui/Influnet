/**
 * Mirrors apps/web/src/lib/site.ts. Web reads its own origin (same-origin
 * requests); mobile only ever talks to the deployed web app, so its "own
 * origin" for a public profile link IS API_BASE_URL — the same rule
 * lib/api.ts already applies to every other request.
 */
import { API_BASE_URL } from './supabase';

/**
 * Full shareable URL for a creator's or business's public profile.
 *
 * No /c or /b segment — see the note on the web copy in
 * apps/web/src/lib/site.ts. Keep the two in step.
 */
export function publicProfileUrl(username: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/${username}`;
}

/** Display-only form for hint text: "influnet.in/username". */
export function publicProfileUrlDisplay(username: string): string {
  return publicProfileUrl(username).replace(/^https?:\/\//, '');
}
