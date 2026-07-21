/**
 * Shared signup mechanics for both role wizards: live username availability,
 * and the create-auth-user → register-profile handoff.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { endpoints } from './api';
import { useSession } from './session';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * Debounced availability check against /api/auth/check-username.
 * Mirrors the web's use-username-availability hook.
 */
export function useUsernameAvailability(username: string) {
  const [status, setStatus] = useState<Availability>('idle');

  useEffect(() => {
    const value = username.trim().toLowerCase();

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
      const available = (res.data as { available?: boolean } | null)?.available;
      setStatus(res.ok && available ? 'available' : 'taken');
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  return status;
}

export interface SignupResult {
  ok: boolean;
  error?: string;
  /** True when Supabase requires email confirmation before a session exists. */
  needsConfirmation?: boolean;
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
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) return { ok: false, error: error.message };

  // Email-confirmation projects return a user with no session. The profile
  // can't be registered without a bearer token, so stop and say so plainly.
  if (!data.session) {
    return { ok: true, needsConfirmation: true };
  }

  const res = await endpoints.register(payload);
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not create your profile.' };

  await useSession.getState().loadProfile();
  return { ok: true };
}
