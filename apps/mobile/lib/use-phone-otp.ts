/**
 * Mobile-number OTP (2Factor) mechanics for the signup wizards.
 *
 * Mirrors apps/web/src/components/signup/phone-otp-field.tsx. The provider key
 * lives only in the phone-otp Edge Function — the app just talks to
 * /api/phone-otp/*, and the token it ends up with is re-validated server-side
 * by /api/auth/register.
 */
import { useEffect, useRef, useState } from 'react';
import { endpoints } from './api';

/**
 * Whether signup must include mobile verification, read from the server rather
 * than baked into the build — see /api/auth/config for why.
 *
 * `null` means "still loading"; wizards should not decide anything yet.
 */
export function useOtpRequirement(): boolean | null {
  const [required, setRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await endpoints.getAuthConfig<{ phoneOtpEnabled?: boolean }>();
      if (cancelled) return;
      // Unreachable config → assume OFF. Assuming ON would strand the user on a
      // step they cannot complete; the server gate still refuses an unverified
      // number, so this cannot let anyone through that shouldn't be.
      setRequired(res.ok ? res.data?.phoneOtpEnabled === true : false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return required;
}

export interface PhoneOtpState {
  phone: string;
  setPhone: (v: string) => void;
  /** Non-null once the number is verified — pass to register. */
  token: string | null;
  sending: boolean;
  verifying: boolean;
  /** True once a code is out and the entry field should be shown. */
  codeSent: boolean;
  resendIn: number;
  error: string | null;
  notice: string | null;
  code: string;
  setCode: (v: string) => void;
  sendOtp: () => Promise<void>;
  verifyOtp: (code?: string) => Promise<void>;
}

export function usePhoneOtp(): PhoneOtpState {
  const [phone, setPhoneRaw] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    timer.current = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [resendIn]);

  /** Editing the number voids any verification — otherwise you could verify one
   *  number and register another. */
  const setPhone = (v: string) => {
    setPhoneRaw(v);
    setToken(null);
    setSessionId(null);
    setCode('');
    setError(null);
    setNotice(null);
  };

  async function sendOtp() {
    setSending(true);
    setError(null);
    setNotice(null);
    const res = await endpoints.sendPhoneOtp<{
      providerSessionId?: string;
      sessionId?: string;
      phoneE164?: string;
      resendAfterSec?: number;
    }>(phone);
    setSending(false);

    if (!res.ok) {
      setError(res.error ?? 'Could not send the code. Try again.');
      return;
    }
    setSessionId(res.data?.providerSessionId ?? res.data?.sessionId ?? null);
    setCode('');
    setResendIn(res.data?.resendAfterSec ?? 30);
    setNotice(`Code sent to ${res.data?.phoneE164 ? `+${res.data.phoneE164}` : 'your mobile'}.`);
  }

  async function verifyOtp(explicit?: string) {
    const otp = (explicit ?? code).replace(/\D/g, '');
    if (!sessionId || otp.length !== 6) return;

    setVerifying(true);
    setError(null);
    setNotice(null);
    const res = await endpoints.verifyPhoneOtp<{
      verified?: boolean;
      verificationToken?: string;
    }>({ phone, otp, providerSessionId: sessionId });
    setVerifying(false);

    if (!res.ok || !res.data?.verified) {
      const message = res.error ?? 'Incorrect code. Try again.';
      setError(message);
      setCode('');
      // A burned session (expired, or 5 failed attempts) can't be retried, so
      // drop it and let the user send a fresh code. The API client discards the
      // body on a non-2xx — `data` is null and the machine-readable `reason` is
      // gone with it — so this reads the message the Edge Function returns for
      // both of those cases ("OTP expired. / Too many attempts. Send a new code.").
      if (/send a new code/i.test(message)) {
        setSessionId(null);
        setResendIn(0);
      }
      return;
    }
    setToken(res.data.verificationToken ?? null);
  }

  return {
    phone,
    setPhone,
    token,
    sending,
    verifying,
    codeSent: !!sessionId,
    resendIn,
    error,
    notice,
    code,
    setCode,
    sendOtp,
    verifyOtp,
  };
}
