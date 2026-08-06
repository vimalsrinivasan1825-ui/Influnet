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

export function useSocialConnect(platform: string, handle: string): SocialConnectResult {
  const [state, setState] = useState<Settled & { handle: string | null }>({
    status: 'idle',
    profile: null,
    message: null,
    handle: null,
  });
  const cache = useRef(new Map<string, Settled>());
  const requestId = useRef(0);

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
    const cached = cache.current.get(key);
    if (cached) {
      setState({ ...cached, handle: value });
      return;
    }

    const id = ++requestId.current;
    setState({ status: 'checking', profile: null, message: null, handle: value });

    void (async () => {
      const res = await endpoints.socialPreview<{
        status?: SocialConnectStatus;
        profile?: SocialPreview | null;
        message?: string;
      }>(platform, value);
      if (id !== requestId.current) return;

      // The route reports its own verdict even on 4xx (a 404 carries
      // status:'notfound'). A response with no verdict at all is transport or
      // infrastructure failing, which is never a verdict on the handle.
      const settled: Settled = {
        status: res.data?.status ?? 'error',
        profile: res.data?.profile ?? null,
        message: res.data?.message ?? null,
      };

      if (settled.status !== 'error') cache.current.set(key, settled);
      setState({ ...settled, handle: value });
    })();
  }, [platform, value]);

  return { status: state.status, profile: state.profile, message: state.message, connect, reset };
}
