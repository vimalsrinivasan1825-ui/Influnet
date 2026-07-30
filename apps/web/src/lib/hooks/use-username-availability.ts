import { useEffect, useRef, useState } from 'react';

export type UsernameStatus =
  | 'idle' // too short / nothing to check yet
  | 'checking' // request in flight (debounced)
  | 'available'
  | 'taken'
  | 'invalid' // fails format / reserved rules
  | 'error'; // network / server problem — don't block, but don't confirm

export interface UsernameAvailability {
  status: UsernameStatus;
  /** Human-readable message for the current status, or null when idle. */
  message: string | null;
}

/**
 * Debounced, race-safe live username availability check against
 * GET /api/auth/check-username. Returns a status the form can render and gate
 * "Continue" on. Stays out of the way until the handle is at least 3 chars.
 */
export function useUsernameAvailability(username: string, debounceMs = 450): UsernameAvailability {
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    const value = username.trim().toLowerCase();

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
        const data = (await res.json()) as {
          available?: boolean;
          valid?: boolean;
          reason?: string;
        };
        if (id !== requestId.current) return; // superseded by a newer keystroke

        if (res.status === 429) {
          setStatus('error');
          setMessage('Too many checks — try again in a moment.');
          return;
        }
        // Any other non-2xx says nothing about the handle. Falling through here
        // would report a transient server error as "already taken" and block
        // signup on a name that is actually free.
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
