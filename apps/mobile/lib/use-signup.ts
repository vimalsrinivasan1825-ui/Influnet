/**
 * Shared signup mechanics for both role wizards: live username availability,
 * and the create-auth-user → register-profile handoff.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { endpoints } from './api';
import { useSession } from './session';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

/**
 * Debounced availability check against /api/auth/check-username.
 * Mirrors the web's use-username-availability hook.
 */
export function useUsernameAvailability(username: string) {
  const [status, setStatus] = useState<Availability>('idle');

  useEffect(() => {
    const value = username.replace(/\s+/g, '').toLowerCase();

    if (!value) {
      setStatus('idle');
      return;
    }
    if (!/^[a-z0-9_.]{3,30}$/.test(value)) {
      setStatus('invalid');
      return;
    }

    setStatus('checking');
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.checkUsername(value);
      if (cancelled) return;

      // Mirrors apps/web/src/lib/hooks/use-username-availability.ts, which had
      // the same bug this fixes: any non-2xx (a network hiccup, a 429, a 500)
      // fell straight through to "taken" — permanently blocking signup on a
      // handle that was actually free, with no way to tell the two apart.
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = res.data as { available?: boolean; valid?: boolean } | null;
      if (data?.valid === false) {
        setStatus('invalid');
        return;
      }
      if (typeof data?.available !== 'boolean') {
        setStatus('error');
        return;
      }
      setStatus(data.available ? 'available' : 'taken');
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  return status;
}

export function useEmailAvailability(email: string) {
  const [status, setStatus] = useState<Availability>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const value = email.replace(/\s+/g, '').toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('idle');
      setMessage('');
      return;
    }

    setStatus('checking');
    setMessage('');
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.checkEmail(value);
      if (cancelled) return;

      if (!res.ok) {
        setStatus('error');
        setMessage('Network error, please try again.');
        return;
      }
      const data = res.data as { available?: boolean };
      setStatus(data.available ? 'available' : 'taken');
      setMessage(data.available ? 'Email is available' : 'This email is already in use');
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email]);

  return { status, message };
}

export function usePhoneAvailability(phone: string) {
  const [status, setStatus] = useState<Availability>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const value = phone.replace(/\s+/g, '');
    if (value.replace(/\D/g, '').length < 10) {
      setStatus('idle');
      setMessage('');
      return;
    }

    setStatus('checking');
    setMessage('');
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.checkPhone(value);
      if (cancelled) return;

      if (!res.ok) {
        setStatus('error');
        setMessage('Network error, please try again.');
        return;
      }
      const data = res.data as { available?: boolean };
      setStatus(data.available ? 'available' : 'taken');
      setMessage(data.available ? 'Phone number is available' : 'This phone number is already registered');
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  return { status, message };
}

export function useInstagramAvailability(handle: string, debounceMs = 600) {
  const [status, setStatus] = useState<Availability>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const value = handle.replace(/^@/, '').trim().toLowerCase();
    if (!value) {
      setStatus('idle');
      setMessage('');
      return;
    }

    setStatus('checking');
    setMessage('');
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.checkInstagram(value);
      if (cancelled) return;

      if (!res.ok) {
        setStatus('error');
        setMessage('Network error, please try again.');
        return;
      }
      const data = res.data as { available?: boolean; valid?: boolean; reason?: string };
      if (data.valid === false) {
        setStatus('invalid');
        setMessage(data.reason ?? 'Invalid handle');
        return;
      }
      if (typeof data.available !== 'boolean') {
        setStatus('error');
        setMessage('Could not check right now');
        return;
      }
      setStatus(data.available ? 'available' : 'taken');
      setMessage(data.available ? 'Handle is available' : 'This ID is already used');
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, debounceMs]);

  return { status, message };
}

export function useUsernameSuggestions(name: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = name.trim();
    if (!value || !enabled) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await endpoints.suggestUsername(value);
      if (cancelled) return;

      setLoading(false);
      if (res.ok && (res.data as any)?.suggestions) {
        setSuggestions((res.data as any).suggestions);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, enabled]);

  return { suggestions, loading };
}

export interface SignupResult {
  ok: boolean;
  error?: string;
  /** True when Supabase requires email confirmation before a session exists. */
  needsConfirmation?: boolean;
}

/**
 * True when there's already a live session for this exact email — meaning a
 * PRIOR attempt on this device already created the auth user (register may
 * or may not have finished), and this is a retry rather than a first try.
 *
 * Matters because signUp() on a duplicate email fails, and — worse — the
 * wizard's own pre-submit username recheck would report the handle this
 * session already owns as "taken by someone else" and bounce the user
 * backward, for an account that is in fact theirs. Callers should skip that
 * recheck and let completeSignup's resume branch finish the job instead.
 */
export async function hasSessionFor(email: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email?.toLowerCase() === email.trim().toLowerCase();
}

/**
 * Two steps, in order: create the auth user, then register the profile via the
 * API (which is the only thing allowed to write role and approval status).
 */
export async function completeSignup(
  email: string,
  password: string,
  payload: Record<string, unknown>
): Promise<SignupResult> {
  // The OTP token is deliberately kept out of auth metadata — that object is
  // permanent on the auth user, and a single-use verification token has no
  // business living there. Same split the web wizards make.
  const { phoneVerificationToken, ...metadata } = payload;

  // Resume path: signUp already succeeded on an earlier attempt (the network
  // stalled after, the app was backgrounded, whatever — the account is real
  // either way) and this device is still holding that session. Retrying
  // signUp here would just fail on the duplicate email, so finish
  // registration instead — /api/auth/register is idempotent when the
  // profile already exists, so this is safe whether or not the first
  // attempt got that far too.
  if (await hasSessionFor(email)) {
    const res = await endpoints.register({ ...payload, email: email.trim() });
    if (!res.ok) return { ok: false, error: res.error ?? 'Could not create your profile.' };
    void endpoints.startVerification({}).catch(() => {});
    await useSession.getState().loadProfile();
    return { ok: true };
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // Mirrors web: the wizard answers ride along as user metadata, so the
    // profile can still be reconstructed if register fails after the auth user
    // was created.
    options: { data: { ...metadata, email: email.trim() } },
  });

  if (error) return { ok: false, error: error.message };

  // Email-confirmation projects return a user with no session. The profile
  // can't be registered without a bearer token, so stop and say so plainly.
  //
  // The wizard answers are NOT lost by stopping here: they went to signUp above
  // as `options.data`, so they are on the auth user as user_metadata. On the
  // next sign-in, app/index.tsx sees a session with no profile and posts an
  // empty body to /api/auth/register, which rebuilds from exactly that metadata.
  // Web used to lean on localStorage for this, which only worked in the browser
  // that filled the form; reading the server's own copy works from any device
  // and needs no client storage at all.
  if (!data.session) {
    return { ok: true, needsConfirmation: true };
  }

  const res = await endpoints.register({ ...payload, email: email.trim() });
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not create your profile.' };

  // Kick off social verification so the trust badge starts processing straight
  // away, as web does. Fire-and-forget: never blocks signup, and it can be
  // re-run from the verification screen if it fails.
  void endpoints.startVerification({}).catch(() => {});

  await useSession.getState().loadProfile();
  return { ok: true };
}
