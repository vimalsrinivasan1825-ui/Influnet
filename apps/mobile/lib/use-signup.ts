/**
 * Shared signup mechanics for both role wizards: live username availability,
 * and the create-auth-user → register-profile handoff.
 */
import { useEffect, useState } from 'react';
import { isValidIndianPhone } from '@influnet/core';
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
    // Ten-plus digits but not a real Indian mobile shape — a long paste, or a
    // count that doesn't match any accepted prefix. Same fix as the web hook:
    // this used to fall straight through to the network call, and the API's
    // own check was a lower bound only, so it read back as "available".
    if (!isValidIndianPhone(value)) {
      setStatus('invalid');
      setMessage('Enter a valid 10-digit mobile number');
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
 * Registers the profile against an already-live session and finishes up.
 * Shared tail for both the first-time path and the two resume paths below —
 * whichever got us a session, registration and everything after it is
 * identical. /api/auth/register is idempotent when the profile already
 * exists, so calling it again on a resume is safe, not just harmless.
 */
async function finishRegistration(payload: Record<string, unknown>, email: string): Promise<SignupResult> {
  const res = await endpoints.register({ ...payload, email: email.trim() });
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not create your profile.' };

  // Kick off social verification so the trust badge starts processing straight
  // away, as web does. Fire-and-forget: never blocks signup, and it can be
  // re-run from the verification screen if it fails.
  void endpoints.startVerification({}).catch(() => {});

  try {
    await useSession.getState().loadProfile();
  } catch {
    // A local cache refresh failing here must never undo a signup that the
    // server just confirmed — the profile is already written; app/index.tsx
    // picks it up on the next load regardless of whether this one succeeded.
  }
  return { ok: true };
}

/**
 * Two steps, in order: create the auth user, then register the profile via the
 * API (which is the only thing allowed to write role and approval status).
 *
 * Resume-safe against a retried tap: if this device still holds a session
 * for the email, or Supabase reports the email as already registered (this
 * device's session was lost — an app restart, a cleared token — but the
 * account from an earlier attempt is real), this finishes registration
 * instead of either failing outright or leaving the caller to show a
 * confusing "taken" error for an account that belongs to the same person
 * retrying.
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

  if (await hasSessionFor(email)) {
    return finishRegistration(payload, email);
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // Mirrors web: the wizard answers ride along as user metadata, so the
    // profile can still be reconstructed if register fails after the auth user
    // was created.
    options: { data: { ...metadata, email: email.trim() } },
  });

  if (error) {
    // "User already registered" (Supabase's wording varies slightly by
    // version) means an earlier attempt already created this exact account —
    // not a real failure. Sign in instead of giving up: the password just
    // typed into this same form is the one that attempt set, so if it's
    // truly the same person this succeeds and the retry finishes cleanly.
    // If it doesn't match, the sign-in's own error is what actually surfaces.
    const isDuplicateEmail = /already registered|already exists|user already/i.test(error.message);
    if (!isDuplicateEmail) return { ok: false, error: error.message };

    const signIn = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signIn.error || !signIn.data.session) {
      return {
        ok: false,
        error: 'An account with this email already exists. Try signing in instead.',
      };
    }
    return finishRegistration(payload, email);
  }

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

  return finishRegistration(payload, email);
}
