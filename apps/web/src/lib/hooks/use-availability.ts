import { useEffect, useRef, useState } from 'react';

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

export function usePhoneAvailability(phone: string, debounceMs = 600): AvailabilityResult {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = phone.replace(/\s+/g, '');
    if (value.replace(/\D/g, '').length < 10) {
      setStatus('idle');
      setMessage(null);
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
