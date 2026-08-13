'use client';

/**
 * Telling the server that a visitor followed a link off a creator's profile.
 *
 * This is the browser half of the reach figure on Home (lib/profile-reach.ts).
 * The constraint that shapes it: the click IS a navigation. The tab is already
 * leaving, so an ordinary fetch is racing the unload and loses often enough to
 * make the number a lie.
 *
 * sendBeacon exists for exactly this — the browser takes the payload and
 * guarantees delivery after the page is gone. fetch(keepalive) is the fallback
 * for anything without it, and a plain fetch is the fallback after that.
 *
 * Nothing here waits, and nothing here can fail loudly: the return value is
 * ignored and every path swallows its errors, because a visitor going to
 * somebody's Instagram must never be held up by our analytics.
 *
 * ATTRIBUTION NOTE. sendBeacon cannot carry an Authorization header, so a
 * signed-in web visitor is recorded the same way a logged-out one is — as an
 * anonymous, IP-derived key (see viewerKeyFor). De-duplication still holds;
 * what is lost is knowing WHICH account clicked, which the reach card never
 * shows anyway. Mobile posts with its bearer token and is attributed properly.
 */
import { useCallback } from 'react';

export type TrackableLink =
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'twitter'
  | 'snapchat'
  | 'linkedin'
  | 'website'
  | 'profile'
  | 'other';

/**
 * @param username The creator whose profile the link is on. Null disables
 *                 tracking entirely — a preview or an unsaved profile has
 *                 nobody to credit the click to.
 */
export function useLinkClick(username: string | null | undefined) {
  return useCallback(
    (linkType: TrackableLink) => {
      if (!username || typeof window === 'undefined') return;

      const url = `/api/creators/${encodeURIComponent(username)}/link-click`;
      const payload = JSON.stringify({ link_type: linkType });

      try {
        if (navigator.sendBeacon) {
          // The Blob type matters: without an explicit JSON content type the
          // route's req.json() gets text/plain and parses nothing.
          navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
          return;
        }
        void fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* Analytics is never the reason a link doesn't open. */
      }
    },
    [username],
  );
}
