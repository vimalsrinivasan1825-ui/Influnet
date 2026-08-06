// Snapchat — PLACEHOLDER handler. Accepts and links a handle; reads nothing.
//
// WHY THIS IS A PLACEHOLDER AND NOT AN OVERSIGHT
// Snapchat has no public follower/engagement surface comparable to the other
// platforms. snapchat.com/add/<username> renders a profile card for Public
// Profiles only, and even then exposes a subscriber count sporadically —
// personal accounts (most creators) expose nothing at all but the display name
// and Snapcode. There is no public API; the Marketing API is ads-side and does
// not read creator profiles.
//
// So this handler deliberately does the honest thing: it validates the shape of
// a username and hands back a link, and `supported: false` tells every caller
// not to present it as verified or to expect metrics. That flag is what stops a
// blank Snapchat metric from being read as "0 subscribers" anywhere in the app.
//
// TO MAKE THIS REAL, replace fetchProfile with a fetch of the Public Profile
// card and keep the same return shape:
//   - flip `supported` to true and set isPrivate=true for accounts that render
//     no public card (that is Snapchat's equivalent of a private account);
//   - populate followerCount from the subscriber count only when the page
//     actually states one — never infer a 0, since "not shown" and "zero" are
//     different facts and a published 0 subscribers reads as a dead account.
// Nothing else in the app needs to change: the registry, the preview route, the
// snapshot writer and both signup wizards already route Snapchat through here.

import type { SocialHandler, SocialProfile } from './types';

const PLATFORM = 'snapchat' as const;

/** Accepts a bare username, @username, or a snapchat.com/add/<user> link. */
function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  if (/snapchat\.com/i.test(value)) {
    try {
      const u = new URL(value.startsWith('http') ? value : `https://${value}`);
      const parts = u.pathname.split('/').filter(Boolean);
      // /add/<user>, /t/<user> and a bare /<user> are all in the wild.
      value = (parts[0] === 'add' || parts[0] === 't' ? parts[1] : parts[0]) ?? '';
    } catch {
      return null;
    }
  }

  value = value.replace(/^@/, '').replace(/\/+$/, '').split('?')[0].trim();
  // Snapchat usernames: 3–15 chars, must start with a letter, then letters,
  // digits, hyphens, underscores and periods.
  if (!/^[A-Za-z][A-Za-z0-9._-]{2,14}$/.test(value)) return null;
  return value.toLowerCase();
}

function profileUrl(handle: string): string {
  return `https://www.snapchat.com/add/${handle}`;
}

export const snapchatHandler: SocialHandler = {
  platform: PLATFORM,
  supported: false,
  isConfigured: () => false,
  normalizeHandle,
  profileUrl,
  /**
   * Always null: a link-only platform must never return a profile object, or a
   * caller could mistake an empty shell for a successful lookup and mark the
   * handle as checked.
   */
  fetchProfile: async (): Promise<SocialProfile | null> => null,
};
