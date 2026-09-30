"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";

interface EmailState {
  verification_email: string | null;
  account_email: string | null;
  email_verified: boolean;
  domain: string | null;
  is_personal_email: boolean;
  matches_company: boolean;
  match_basis: "website" | "company_name" | null;
  suggested_domain: string | null;
}

export function BusinessEmailPanel({ onVerified }: { onVerified?: () => void }) {
  const [state, setState] = useState<EmailState | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (s: EmailState) => {
    setState(s);
    setEmail((cur) => cur || s.verification_email || "");
  };

  useEffect(() => {
    apiFetch<EmailState>("/api/verification/email-domain").then((res) => {
      if (res.ok && res.data) apply(res.data);
    });
  }, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      return await apiFetch<any>("/api/verification/email-domain", { method: "POST", body: JSON.stringify(body) });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const res = await act({ action: "initiate", email });
    if (res.ok && res.data) {
      apply(res.data);
      setCodeSent(true);
      setCode("");
    } else setError(res.error || "Could not send the code.");
  };

  const confirm = async () => {
    const res = await act({ action: "confirm", email, code });
    if (!res.ok) return setError(res.error || "Could not verify the code.");
    if (res.data?.verified) {
      apply(res.data);
      setCodeSent(false);
      onVerified?.();
    } else setError(res.data?.message || "That code is not right.");
  };

  if (!state) return null;

  const verified = state.email_verified;
  const companyDomain = state.suggested_domain;

  return (
    <SectionCard title="Business email">
      <div className="flex flex-col gap-3">
        <p className="-mt-1 text-xs text-content-muted">
          Verify one email address. An address on your company's own domain gives the highest verification score.
        </p>

        {verified && (
          <div className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-xs">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ok" />
            <div>
              <p className="font-semibold text-content">{state.verification_email} is verified</p>
              <p className="mt-0.5 text-content-muted">
                {state.matches_company
                  ? "It matches your company domain — this counts towards your verification score."
                  : state.is_personal_email
                    ? "This is a personal address, so it does not add to your score. Verify a company-domain address to raise it."
                    : "This domain does not match your company name or website, so it does not add to your score."}
              </p>
            </div>
          </div>
        )}

        {!codeSent ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={companyDomain ? `you@${companyDomain}` : "you@yourcompany.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button variant="brand" size="sm" disabled={busy || !email.trim()} onClick={sendCode} className="shrink-0">
                {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                {verified && email.trim().toLowerCase() === state.verification_email ? "Re-send code" : "Send code"}
              </Button>
            </div>
            {state.account_email && email.trim().toLowerCase() !== state.account_email.toLowerCase() && (
              <button
                type="button"
                onClick={() => setEmail(state.account_email!)}
                className="self-start text-xs font-semibold text-brand hover:underline"
              >
                No company email? Use {state.account_email} instead (lower score)
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-content-soft">We sent a 6-digit code to {email}. It expires in 15 minutes.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button variant="brand" size="sm" disabled={busy || code.length !== 6} onClick={confirm} className="shrink-0">
                {busy ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
                Verify
              </Button>
            </div>
            <button type="button" onClick={() => setCodeSent(false)} className="self-start text-xs font-semibold text-brand hover:underline">
              Use a different address
            </button>
          </div>
        )}

        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      </div>
    </SectionCard>
  );
}
