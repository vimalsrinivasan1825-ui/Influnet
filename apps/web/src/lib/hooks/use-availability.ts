import { useEffect, useRef, useState } from 'react';
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

export interface InstagramPreview {
  fullName: string | null;
  biography: string | null;
  followerCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean | null;
  isPrivate: boolean | null;
}

export type InstagramPreviewStatus = 'idle' | 'checking' | 'found' | 'private' | 'notfound' | 'error';

/**
 * Looks a handle up on Instagram once the user stops typing — catches typos
 * (shows the photo/follower count so a wrong account is obvious) and refuses
 * private accounts up front, since neither the scraper nor the bio-code
 * ownership check can read one. Mirrors apps/mobile/lib/use-instagram-preview.ts,
 * which calls the same unauthenticated, rate-limited (5/min/IP) endpoint.
 *
 * Results are cached per handle for the life of the component so re-typing
 * the same handle, or stepping back and forward through the wizard, doesn't
 * spend another provider call. Errors are deliberately not cached — those
 * must stay retryable.
 */
export function useInstagramPreview(handle: string, debounceMs = 900) {
  const [status, setStatus] = useState<InstagramPreviewStatus>('idle');
  const [profile, setProfile] = useState<InstagramPreview | null>(null);
  const requestId = useRef(0);
  const cache = useRef(new Map<string, { status: InstagramPreviewStatus; profile: InstagramPreview | null }>());

  useEffect(() => {
    const value = handle.replace(/^@/, '').trim().toLowerCase();

    if (value.length < 3) {
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
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/scrape-instagram?handle=${encodeURIComponent(value)}`);
        if (id !== requestId.current) return;

        let settled: { status: InstagramPreviewStatus; profile: InstagramPreview | null };
        if (!res.ok) {
          settled = { status: 'error', profile: null };
        } else {
          const data = (await res.json()) as { profile: InstagramPreview | null };
          const p = data?.profile ?? null;
          settled = !p
            ? { status: 'notfound', profile: null }
            : p.isPrivate
              ? { status: 'private', profile: p }
              : { status: 'found', profile: p };
        }

        if (settled.status !== 'error') cache.current.set(value, settled);
        setStatus(settled.status);
        setProfile(settled.profile);
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setProfile(null);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [handle, debounceMs]);

  return { status, profile };
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
