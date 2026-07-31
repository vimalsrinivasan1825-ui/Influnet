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
  // The OTP token is deliberately kept out of auth metadata — that object is
  // permanent on the auth user, and a single-use verification token has no
  // business living there. Same split the web wizards make.
  const { phoneVerificationToken, ...metadata } = payload;

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
