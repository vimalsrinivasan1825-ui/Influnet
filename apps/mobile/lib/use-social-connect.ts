/**
 * Looks a handle up on a platform — ONLY when the user taps Connect.
 *
 * Replaces use-instagram-preview.ts's typing debounce. That version fired the
 * lookup 900ms after the last keystroke, which meant a creator typing
 * "priya.sharma" could spend three billed provider calls on "priya", "priya.sh"
 * and "priya.sharm" before reaching the handle they actually meant. None of
 * those partial answers were ever useful, and on a phone keyboard the pauses
 * are longer and more frequent than on a laptop.
 *
 * Two jobs, unchanged, now on one deliberate tap:
 *   - catch typos. "@priyasharma" vs "@priya.sharma" are different people;
 *     showing the photo and follower count makes a wrong account obvious.
 *   - refuse private accounts up front. Neither the scraper nor the bio-code
 *     ownership check can read one, so a private handle can never complete
 *     verification — better said while it's still one field to fix.
 *
 * Editing the handle after connecting clears the result, so what's on screen
 * always describes what's in the field.
 *
 * Results are cached per (platform, handle) for the life of the screen; errors
 * are deliberately NOT cached, since a provider outage must stay retryable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { endpoints } from './api';

export interface SocialPreview {
  displayName: string | null;
  biography: string | null;
  followerCount: number | null;
  avatarUrl: string | null;
  isVerified: boolean | null;
  isPrivate: boolean | null;
}

export type SocialConnectStatus =
  | 'idle'
  | 'checking'
  | 'connected'
  | 'private'
  | 'notfound'
  | 'invalid'
  | 'unsupported'
  | 'error';

export interface SocialConnectResult {
  status: SocialConnectStatus;
  profile: SocialPreview | null;
  message: string | null;
  connect: () => void;
  reset: () => void;
}

interface Settled {
  status: SocialConnectStatus;
  profile: SocialPreview | null;
  message: string | null;
}

/**
 * The route answers about the LOOKUP ("found"); this UI asks about the
 * CONNECTION ("connected"). Those two vocabularies have to meet somewhere.
 *
 * They didn't, and the failure was silent and total: /api/auth/social-preview
 * returns `found` for a readable public account, every consumer here gates on
 * `connected`, so tapping Connect on a perfectly good handle produced no card,
 * no error, and a Continue button that stayed dead. The result was even cached,
 * so tapping again did nothing at all. Web already mapped it
 * (apps/web/src/lib/hooks/use-availability.ts); mobile did not.
 *
 * Anything unrecognised — including `unavailable`, which means OUR provider
 * isn't configured — is an error rather than a verdict on the handle, so it
 * stays retryable and is never cached.
 */
function toConnectStatus(routeStatus: unknown): SocialConnectStatus {
  switch (routeStatus) {
    case 'found':
      return 'connected';
    case 'private':
    case 'notfound':
    case 'invalid':
    case 'unsupported':
      return routeStatus;
    default:
      return 'error';
  }
}

export function useSocialConnect(platform: string, handle: string): SocialConnectResult {
  const [state, setState] = useState<Settled & { handle: string | null }>({
    status: 'idle',
    profile: null,
    message: null,
    handle: null,
  });
  const cache = useRef(new Map<string, Settled>());
  const requestId = useRef(0);
  // Read inside connect() without making the callback depend on state — a new
  // connect identity on every status change would churn every field's props.
  const stateRef = useRef(state);
  stateRef.current = state;

  const value = handle.replace(/^@/, '').trim().toLowerCase();

  useEffect(() => {
    setState((prev) =>
      prev.handle && prev.handle !== value
        ? { status: 'idle', profile: null, message: null, handle: null }
        : prev,
    );
  }, [value]);

  const reset = useCallback(() => {
    requestId.current++;
    setState({ status: 'idle', profile: null, message: null, handle: null });
  }, []);

  const connect = useCallback(() => {
    if (!value) return;

    const key = `${platform}:${value}`;
    // Tapping again on a handle that already has an answer means "check it
    // again" — the button even says Recheck. Serving the cache there made it a
    // no-op: the account had gone public, or the earlier lookup was wrong, and
    // the UI kept insisting on the stale verdict. The cache still does its real
    // job, which is making a return trip through the wizard free.
    const isRecheck = stateRef.current.handle === value && stateRef.current.status !== 'idle';
    const cached = isRecheck ? undefined : cache.current.get(key);
    if (cached) {
      setState({ ...cached, handle: value });
      return;
    }

    const id = ++requestId.current;
    setState({ status: 'checking', profile: null, message: null, handle: value });

    void (async () => {
      const res = await endpoints.socialPreview(platform, value);
      if (id !== requestId.current) return;

      // The route reports its own verdict even on 4xx (a 404 carries
      // status:'notfound'), so read `payload` — the client nulls `data` on a
      // non-2xx, and going through it turned every "no such account" into a
      // generic "couldn't reach Instagram". A response with no verdict at all
      // is transport or infrastructure failing, which is never a verdict on
      // the handle.
      const body = (res.payload ?? {}) as {
        status?: string;
        profile?: SocialPreview | null;
        message?: string;
      };
      const settled: Settled = {
        status: toConnectStatus(body.status),
        profile: body.profile ?? null,
        message: body.message ?? null,
      };

      if (settled.status !== 'error') cache.current.set(key, settled);
      setState({ ...settled, handle: value });
    })();
  }, [platform, value]);

  return { status: state.status, profile: state.profile, message: state.message, connect, reset };
}
