/**
 * Looks a handle up on Instagram once the user stops typing, so signup can
 * show them WHICH account they just claimed before it is attached to their
 * profile.
 *
 * Two jobs, one request:
 *   - catch typos. "@priyasharma" vs "@priya.sharma" are different people, and
 *     a handle is otherwise just a string the user can get silently wrong.
 *     Showing the photo and follower count makes a wrong account obvious.
 *   - refuse private accounts up front. Neither the scraper nor the bio-code
 *     ownership check can read one, so a private handle can never complete
 *     verification — better to say so while it is still one field to fix.
 *
 * Results are cached per handle for the life of the screen. /api/auth/scrape-
 * instagram is unauthenticated, spends provider credit per call and is capped
 * at 5/min per IP, so re-typing the same handle (or stepping back and forward
 * through the wizard) must not spend another call. Transient errors are
 * deliberately NOT cached — those have to stay retryable.
 */
import { useEffect, useRef, useState } from 'react';
import { endpoints } from './api';

export interface InstagramPreview {
  fullName: string | null;
  biography: string | null;
  followerCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean | null;
  isPrivate: boolean | null;
}

export type InstagramPreviewStatus =
  | 'idle'
  | 'checking'
  | 'found'
  | 'private'
  | 'notfound'
  | 'error';

interface Settled {
  status: InstagramPreviewStatus;
  profile: InstagramPreview | null;
}

export function useInstagramPreview(handle: string, enabled = true, debounceMs = 900) {
  const [status, setStatus] = useState<InstagramPreviewStatus>('idle');
  const [profile, setProfile] = useState<InstagramPreview | null>(null);
  const cache = useRef(new Map<string, Settled>());

  useEffect(() => {
    const value = handle.replace(/^@/, '').trim().toLowerCase();

    // Instagram handles are >= 1 char, but firing on one or two would spend a
    // provider call on every keystroke of a handle nobody has finished typing.
    if (!enabled || value.length < 3) {
      setStatus('idle');
      setProfile(null);
      return;
    }

    const cached = cache.current.get(value);
    if (cached) {
      setStatus(cached.status);
      setProfile(cached.profile);
      return;
    }

    setStatus('checking');
    setProfile(null);
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.scrapeInstagram<{ profile: InstagramPreview | null }>(value);
      if (cancelled) return;

      let settled: Settled;
      if (!res.ok) {
        settled = { status: 'error', profile: null };
      } else {
        const p = res.data?.profile ?? null;
        settled = !p
          ? { status: 'notfound', profile: null }
          : p.isPrivate
            ? { status: 'private', profile: p }
            : { status: 'found', profile: p };
      }

      if (settled.status !== 'error') cache.current.set(value, settled);
      setStatus(settled.status);
      setProfile(settled.profile);
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, enabled, debounceMs]);

  return { status, profile };
}
