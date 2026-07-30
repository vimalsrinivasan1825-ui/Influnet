"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;

/** Mirrors NEXT_PUBLIC_PHONE_OTP_ENABLED; false → plain phone field, no gate. */
export const phoneOtpEnabled = process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true";

interface PhoneOtpFieldProps {
  phone: string;
  onPhoneChange: (phone: string) => void;
  /**
   * Fires with the verification token on success, and with `null` whenever
   * verification is invalidated (e.g. the number was edited). Parents gate
   * submission on this being non-null.
   */
  onVerifiedChange: (token: string | null) => void;
  verifiedToken: string | null;
  label?: string;
  disabled?: boolean;
}

export function PhoneOtpField({
  phone,
  onPhoneChange,
  onVerifiedChange,
  verifiedToken,
  label = "Mobile number",
  disabled = false,
}: PhoneOtpFieldProps) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [providerSessionId, setProviderSessionId] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  const verified = !!verifiedToken;
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneUsable = phoneDigits.length >= 10;

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** Editing the number must void an existing verification — otherwise someone
   *  could verify one number and submit another. */
  const handlePhoneChange = (next: string) => {
    onPhoneChange(next);
    if (verified) onVerifiedChange(null);
    setProviderSessionId(null);
    setDigits(Array(OTP_LENGTH).fill(""));
    setError("");
    setNotice("");
  };

  const sendOtp = async () => {
    setError("");
    setNotice("");
    setSending(true);
    try {
      const res = await fetch("/api/phone-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not send the code. Try again.");
        if (typeof data.retryAfterSec === "number") setResendIn(data.retryAfterSec);
        return;
      }
      setProviderSessionId(data.providerSessionId ?? data.sessionId ?? null);
      setDigits(Array(OTP_LENGTH).fill(""));
      setResendIn(data.resendAfterSec ?? 30);
      setNotice(`Code sent to ${data.phoneE164 ? `+${data.phoneE164}` : "your mobile"}.`);
      setTimeout(() => boxRefs.current[0]?.focus(), 50);
    } catch {
      setError("Network error — could not send the code.");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!providerSessionId) return;
      setError("");
      setNotice("");
      setVerifying(true);
      try {
        const res = await fetch("/api/phone-otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, otp: code, providerSessionId }),
        });
        const data = await res.json();
        if (!res.ok || !data.verified) {
          setError(data.error || "Incorrect code. Try again.");
          setDigits(Array(OTP_LENGTH).fill(""));
          setTimeout(() => boxRefs.current[0]?.focus(), 50);
          // A burned session can't be retried — force a fresh send.
          if (data.reason === "expired" || data.reason === "max_attempts") {
            setProviderSessionId(null);
            setResendIn(0);
          }
          return;
        }
        onVerifiedChange(data.verificationToken ?? null);
      } catch {
        setError("Network error — could not verify the code.");
      } finally {
        setVerifying(false);
      }
    },
    [phone, providerSessionId, onVerifiedChange],
  );

  const setDigitsAndMaybeSubmit = (next: string[]) => {
    setDigits(next);
    const code = next.join("");
    if (code.length === OTP_LENGTH && !next.includes("")) void verifyOtp(code);
  };

  const handleBoxChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    // Handles both single keystrokes and a pasted/autofilled full code.
    const next = [...digits];
    for (let i = 0; i < value.length && index + i < OTP_LENGTH; i++) {
      next[index + i] = value[i];
    }
    const landed = Math.min(index + value.length, OTP_LENGTH - 1);
    boxRefs.current[landed]?.focus();
    setDigitsAndMaybeSubmit(next);
  };

  const handleBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      boxRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) boxRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) boxRefs.current[index + 1]?.focus();
  };

  // Feature off → behave exactly like the old plain phone input.
  if (!phoneOtpEnabled) {
    return (
      <div>
        <Label>{label}</Label>
        <Input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+91 98765 43210"
          autoComplete="tel"
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div>
      <Label>
        {label} <span className="text-danger">*</span>
      </Label>

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            disabled={disabled || verified}
            aria-invalid={!!error}
          />
        </div>
        {verified ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 text-xs font-bold text-emerald-600">
            <ShieldCheck className="size-3.5" /> Verified
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={sendOtp}
            disabled={disabled || sending || !phoneUsable || resendIn > 0}
            className="shrink-0"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : resendIn > 0 ? (
              `Resend in ${resendIn}s`
            ) : providerSessionId ? (
              "Resend OTP"
            ) : (
              "Send OTP"
            )}
          </Button>
        )}
      </div>

      {/* Verifying locks the field, so without this a mistyped-but-verified
          number would be a dead end. */}
      {verified && (
        <button
          type="button"
          onClick={() => {
            onVerifiedChange(null);
            setProviderSessionId(null);
            setDigits(Array(OTP_LENGTH).fill(""));
            setError("");
            setNotice("");
          }}
          className="mt-1.5 text-xs font-semibold text-content-muted underline transition-colors hover:text-content"
        >
          Use a different number
        </button>
      )}

      {!verified && providerSessionId && (
        <div className="mt-3 rounded-xl border border-hairline-strong bg-surface-muted p-3">
          <p className="mb-2 text-xs font-semibold text-content-soft">
            Enter the 6-digit code sent to your mobile
          </p>
          <div className="flex items-center gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={OTP_LENGTH}
                value={d}
                onChange={(e) => handleBoxChange(i, e.target.value)}
                onKeyDown={(e) => handleBoxKeyDown(i, e)}
                disabled={verifying}
                aria-label={`Digit ${i + 1}`}
                className={cn(
                  "size-10 rounded-lg border border-hairline-strong bg-surface text-center text-lg font-bold text-content outline-none transition-all",
                  "focus:border-brand focus:ring-2 focus:ring-brand/30",
                  error && "border-danger",
                )}
              />
            ))}
            {verifying && <Loader2 className="ml-1 size-4 animate-spin text-content-muted" />}
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
      {!error && notice && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <Check className="size-3" /> {notice}
        </p>
      )}
      {!error && !notice && !verified && !providerSessionId && (
        <p className="mt-1.5 text-xs text-content-muted">
          We&apos;ll text you a code to confirm this number.
        </p>
      )}
    </div>
  );
}
