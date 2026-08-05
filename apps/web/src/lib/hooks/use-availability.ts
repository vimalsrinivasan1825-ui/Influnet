import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidIndianPhone } from '@influnet/core';

export type AvailabilityStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid'
  | 'error';

export interface AvailabilityResult {
  status: AvailabilityStatus;
  message: string | null;
}

export function useUsernameAvailability(username: string, debounceMs = 450): AvailabilityResult {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = username.replace(/\s+/g, '').toLowerCase();

    if (value.length < 3) {
      setStatus('idle');
      setMessage(null);
      return;
    }

    setStatus('checking');
    setMessage('Checking availability…');
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean; reason?: string; };
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setStatus('error');
          setMessage('Too many checks — try again in a moment.');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.valid === false) {
          setStatus('invalid');
          setMessage(data.reason ?? 'That username isn’t allowed.');
          return;
        }
        if (typeof data.available !== 'boolean') {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.available) {
          setStatus('available');
          setMessage('Username is available');
        } else {
          setStatus('taken');
          setMessage('That username is already taken');
        }
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setMessage('Could not check right now');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [username, debounceMs]);

  return { status, message };
}

export function useEmailAvailability(email: string, debounceMs = 600): AvailabilityResult {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = email.replace(/\s+/g, '').toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!EMAIL_RE.test(value)) {
      setStatus('idle');
      setMessage(null);
      return;
    }

    setStatus('checking');
    setMessage('Checking email…');
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean; reason?: string; };
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setStatus('error');
          setMessage('Too many checks — try again in a moment.');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.valid === false) {
          setStatus('invalid');
          setMessage(data.reason ?? 'Invalid email.');
          return;
        }
        if (typeof data.available !== 'boolean') {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.available) {
          setStatus('available');
          setMessage('Email is available');
        } else {
          setStatus('taken');
          setMessage('Email is already registered');
        }
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setMessage('Could not check right now');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [email, debounceMs]);

  return { status, message };
}

export function useInstagramAvailability(handle: string, debounceMs = 600): AvailabilityResult {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = handle.replace(/^@/, '').trim().toLowerCase();

    if (!value) {
      setStatus('idle');
      setMessage(null);
      return;
    }

    setStatus('checking');
    setMessage('Checking handle…');
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-instagram?handle=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean; reason?: string; };
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setStatus('error');
          setMessage('Too many checks — try again in a moment.');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.valid === false) {
          setStatus('invalid');
          setMessage(data.reason ?? 'Invalid handle.');
          return;
        }
        if (typeof data.available !== 'boolean') {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.available) {
          setStatus('available');
          setMessage('Handle is available');
        } else {
          setStatus('taken');
          setMessage('This ID is already used');
        }
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setMessage('Could not check right now');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [handle, debounceMs]);

  return { status, message };
}

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
  /** The handle the current status belongs to — null until one connects. */
  connectedHandle: string | null;
  /** Run the lookup for the handle currently in the field. */
  connect: () => void;
  /** Drop the result (used when the user edits the handle). */
  reset: () => void;
}

/**
 * Looks a handle up on a platform — ONLY when the user asks, by tapping Connect.
 *
 * The previous version fired the lookup 900ms after the user stopped typing.
 * That reads fine in a demo and is expensive in production: every pause mid-
 * handle spent a real, billed provider call on a half-typed username
 * ("mycreat", "mycreato", "mycreator"), and none of those partial results were
 * ever the answer. One deliberate tap costs one call.
 *
 * Editing the handle after connecting clears the result, so a creator can't
 * connect one account and submit a different one.
 *
 * Results are cached per handle for the life of the component, so stepping back
 * and forward through the wizard is free. Errors are deliberately NOT cached —
 * a provider outage has to stay retryable.
 */
export function useSocialConnect(platform: string, handle: string): SocialConnectResult {
  const [state, setState] = useState<{
    status: SocialConnectStatus;
    profile: SocialPreview | null;
    message: string | null;
    handle: string | null;
  }>({ status: 'idle', profile: null, message: null, handle: null });

  const requestId = useRef(0);
  const cache = useRef(new Map<string, { status: SocialConnectStatus; profile: SocialPreview | null; message: string | null }>());

  const value = handle.replace(/^@/, '').trim().toLowerCase();

  // The field no longer holds the handle we checked — the old verdict is about
  // a different account, so it must not linger next to the new text.
  useEffect(() => {
    setState((prev) => (prev.handle && prev.handle !== value ? { status: 'idle', profile: null, message: null, handle: null } : prev));
  }, [value]);

  const reset = useCallback(() => {
    requestId.current++;
    setState({ status: 'idle', profile: null, message: null, handle: null });
  }, []);

  const connect = useCallback(() => {
    if (!value) return;

    const cached = cache.current.get(`${platform}:${value}`);
    if (cached) {
      setState({ ...cached, handle: value });
      return;
    }

    const id = ++requestId.current;
    setState({ status: 'checking', profile: null, message: null, handle: value });

    (async () => {
      try {
        const res = await fetch(
          `/api/auth/social-preview?platform=${encodeURIComponent(platform)}&handle=${encodeURIComponent(value)}`,
        );
        if (id !== requestId.current) return;

        const data = (await res.json().catch(() => ({}))) as {
          status?: SocialConnectStatus;
          profile?: SocialPreview | null;
          message?: string;
        };

        // The route reports its own verdict; a non-ok response without one is
        // an infrastructure failure, which is never a verdict on the handle.
        const status: SocialConnectStatus = data.status ?? (res.ok ? 'error' : 'error');
        const settled = {
          status,
          profile: data.profile ?? null,
          message: data.message ?? null,
        };

        if (status !== 'error') cache.current.set(`${platform}:${value}`, settled);
        setState({ ...settled, handle: value });
      } catch {
        if (id !== requestId.current) return;
        setState({ status: 'error', profile: null, message: null, handle: value });
      }
    })();
  }, [platform, value]);

  return {
    status: state.status,
    profile: state.profile,
    message: state.message,
    connectedHandle: state.status === 'connected' ? state.handle : null,
    connect,
    reset,
  };
}

export function usePhoneAvailability(phone: string, debounceMs = 600): AvailabilityResult {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = phone.replace(/\s+/g, '');

    // Still short of a full number — idle, not an error. Someone mid-keystroke
    // on digit 6 is not wrong yet.
    if (value.replace(/\D/g, '').length < 10) {
      setStatus('idle');
      setMessage(null);
      return;
    }

    // Ten-plus digits but not a real Indian mobile number — a 26-digit paste,
    // or a shape none of the accepted patterns match. This used to fall
    // through to the network call, which itself only checked the same lower
    // bound (`digitsOnly.length < 10`) and answered "available" for garbage —
    // that combination is what let an obviously invalid number reach signup
    // reading as valid. Caught here now, before spending a request.
    if (!isValidIndianPhone(value)) {
      setStatus('invalid');
      setMessage('Enter a valid 10-digit mobile number');
      return;
    }

    setStatus('checking');
    setMessage('Checking mobile…');
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-phone?phone=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean; reason?: string; };
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setStatus('error');
          setMessage('Too many checks — try again in a moment.');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.valid === false) {
          setStatus('invalid');
          setMessage(data.reason ?? 'Invalid mobile number.');
          return;
        }
        if (typeof data.available !== 'boolean') {
          setStatus('error');
          setMessage('Could not check right now');
          return;
        }
        if (data.available) {
          setStatus('available');
          setMessage('Mobile is available');
        } else {
          setStatus('taken');
          setMessage('Mobile is already registered');
        }
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setMessage('Could not check right now');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [phone, debounceMs]);

  return { status, message };
}

export function useUsernameSuggestions(name: string, isUsernameEmpty: boolean, debounceMs = 800) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const value = name.trim();
    // Only fetch suggestions if they haven't typed a custom username yet, and their name is long enough
    if (!isUsernameEmpty || value.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/suggest-username?name=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { suggestions?: string[] };
        if (id !== requestId.current) return;
        
        if (res.ok && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions);
        } else {
          setSuggestions([]);
        }
      } catch {
        if (id !== requestId.current) return;
        setSuggestions([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [name, isUsernameEmpty, debounceMs]);

  return { suggestions, loading };
}
