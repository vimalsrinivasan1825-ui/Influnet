"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { INDUSTRIES, BUSINESS_TYPES, BUDGET_RANGES, INDIAN_STATES } from "@/lib/constants";
import { isValidGstin, isValidWebsite, normalizeWebsite } from "@influnet/core";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CityInput } from "@/components/ui/city-input";
import { PhoneOtpField, usePhoneOtpEnabled } from "@/components/signup/phone-otp-field";
import { cn } from "@/lib/utils";
import { useUsernameAvailability, useEmailAvailability, useUsernameSuggestions } from "@/lib/hooks/use-availability";
import { Check, X } from "lucide-react";

type Step = 1 | 2 | 3 | 4;
const STEP_LABELS = ["Account", "Company", "Verify", "Intent"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 0–4 password strength score with a matching label + bar color. */
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const meta = [
    { label: "Too short", color: "bg-danger" },
    { label: "Weak", color: "bg-danger" },
    { label: "Fair", color: "bg-amber-500" },
    { label: "Good", color: "bg-amber-500" },
    { label: "Strong", color: "bg-emerald-500" },
  ][score];
  return { score, ...meta };
}

export default function BusinessSignupPage() {
  return (
    <React.Suspense fallback={null}>
      <BusinessSignupContent />
    </React.Suspense>
  );
}

function BusinessSignupContent() {
  const router = useRouter();
  const phoneOtpEnabled = usePhoneOtpEnabled();
  const searchParams = useSearchParams();
  const nextParam = (() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  })();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameSuggestionsFallback, setUsernameSuggestionsFallback] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [marketingBudget, setMarketingBudget] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("businessSignupState");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.step) setStep(data.step);
        if (data.fullName) setFullName(data.fullName);
        if (data.companyName) setCompanyName(data.companyName);
        if (data.username) setUsername(data.username);
        // email / phone are deliberately NOT persisted (draft only keeps
        // non-sensitive fields) — see the save effect below.
        if (data.businessType) setBusinessType(data.businessType);
        if (data.industry) setIndustry(data.industry);
        if (data.website) setWebsite(data.website);
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
        if (data.registeredAddress) setRegisteredAddress(data.registeredAddress);
        if (data.gstNumber) setGstNumber(data.gstNumber);
        if (data.marketingBudget) setMarketingBudget(data.marketingBudget);
      }
    } catch {}
  }, []);

  // Save state on change. Deliberately excludes email / phone: they are
  // personal data, and persisting them in browser storage is what the CodeQL
  // "clear text storage of sensitive information" rule flags. A refresh
  // mid-wizard asks the user to re-enter those step-1 fields; everything else
  // is preserved. (The password is never persisted either.)
  useEffect(() => {
    sessionStorage.setItem(
      "businessSignupState",
      JSON.stringify({
        step, fullName, companyName, username, businessType, industry,
        website, city, state, registeredAddress, gstNumber, marketingBudget
      })
    );
  }, [
    step, fullName, companyName, username, businessType, industry,
    website, city, state, registeredAddress, gstNumber, marketingBudget
  ]);

  const { status: usernameStatus, message: usernameMessage } = useUsernameAvailability(username);
  const { suggestions, loading: suggestionsLoading } = useUsernameSuggestions(companyName || fullName, username.length === 0);
  const { status: emailStatus, message: emailMessage } = useEmailAvailability(email);

  const usernameOk = usernameStatus === "available" || usernameStatus === "error";
  const emailOk = emailStatus === "available" || emailStatus === "error";
  const emailValid = EMAIL_RE.test(email);
  const passwordOk = password.length >= 8;
  // Both fields are optional, so blank stays valid — only a filled-in value is checked.
  //
  // Both feed their own inline error message ONLY — neither may gate
  // canProceed(). They used to: a website not yet resolving as one, or a
  // GSTIN not yet at its full 15 characters, blocked Next on a step whose
  // fields are labelled optional — someone who merely hadn't finished typing
  // could not get past step 2 or step 3 at all.
  const websiteValid = isValidWebsite(website);
  const gstValid = !gstNumber.trim() || isValidGstin(gstNumber);

  const canProceed = (): boolean => {
    // Mobile OTP is a hard gate when enabled — the server rejects an unverified
    // number anyway, so don't let the wizard advance past it.
    if (step === 1)
      return (
        !!fullName && !!companyName && !!username && usernameOk && emailValid && emailOk && passwordOk &&
        (!phoneOtpEnabled || !!phoneToken)
      );
    if (step === 2) return !!businessType && !!industry;
    if (step === 3) return !!city && !!state && !!registeredAddress;
    if (step === 4) return !!marketingBudget;
    return false;
  };

  const handleSubmit = async () => {
    setError("");
    setIsLoading(true);
    try {
      const sb = createClient();
      const payload = {
        name: fullName,
        role: "business_owner",
        companyName,
        username,
        phone,
        businessType,
        industry,
        // Only sent when actually valid — an incomplete value is treated the
        // same as blank rather than reaching the server to fail validation
        // there instead (WebsiteSchema / GstNumberSchema both enforce the
        // same rule), now that it can no longer block Next.
        website: websiteValid && website.trim() ? normalizeWebsite(website) : undefined,
        city,
        state,
        registeredAddress,
        gstNumber: gstValid && gstNumber.trim() ? gstNumber.trim().toUpperCase() : undefined,
        marketingBudget,
        location: `${city}, ${state}`,
      };

      const { data, error: authError } = await sb.auth.signUp({
        email,
        password,
        options: { data: payload },
      });
      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          // The OTP token is deliberately NOT part of `payload` — that object
          // becomes permanent auth metadata and is stashed server-side.
          body: JSON.stringify({ ...payload, phoneVerificationToken: phoneToken ?? undefined }),
        });
        if (!res.ok) {
          const resData = await res.json();
          if (resData.reason === "username_taken") {
            recoverFromTakenUsername(resData.error || "That username is already taken");
            return;
          }
          setError(resData.error || "Failed to create profile record");
          return;
        }
        // Fire-and-forget verification kick — starts the trust badge processing
        // without blocking signup (re-runnable from Settings if it fails).
        void fetch("/api/verification", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        }).catch(() => {});
        sessionStorage.removeItem("businessSignupState");
        router.push(nextParam);
      } else {
        // Email confirmation required: no session yet, so register_profile can't
        // run now. The signup answers already live on the auth user as
        // user_metadata; the only thing that can't live there is the single-use
        // phone-OTP token, so it is stored SERVER-SIDE (pending_registrations,
        // migration 105) — never in localStorage. On first login,
        // /api/auth/register rebuilds the profile from the metadata and spends
        // that token, on any device, within its 30-minute window.
        sessionStorage.removeItem("businessSignupState");
        try {
          await fetch("/api/auth/pending-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: data.user?.id,
              phone,
              phone_verification_token: phoneToken,
            }),
          });
        } catch { /* best-effort — the account still exists; Settings can recover it */ }
        const message = phoneOtpEnabled
          ? "Check your email to confirm your account — please do it within 30 minutes so your mobile verification is still valid"
          : "Check your email to confirm your account";
        router.push(
          `/login?message=${encodeURIComponent(message)}&next=${encodeURIComponent(nextParam)}`,
        );
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const recoverFromTakenUsername = async (message: string) => {
    setError(message);
    setStep(1);
    setUsernameSuggestionsFallback([]);

    try {
      const res = await fetch(`/api/auth/suggest-username?name=${encodeURIComponent(companyName || fullName)}`);
      const data = await res.json();
      if (data.suggestions) {
        setUsernameSuggestionsFallback(data.suggestions);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-surface px-4 py-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        <div
          className="absolute -left-40 -top-40 size-[32rem] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 size-[32rem] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--brand-2), transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex max-h-full w-full max-w-lg flex-col overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mb-5 text-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-2.5">
            <Image src="/influet_logo.png" alt="" width={36} height={36} className="size-9" />
            <span className="text-2xl font-extrabold tracking-tight text-content">influnet</span>
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-content">Create your business account</h1>
          <p className="mt-1.5 text-sm text-content-soft">Join as a business partner.</p>
        </div>

        {/* Stepper */}
        <div className="mb-5 px-2">
          <div className="mb-2 flex items-center justify-between">
            {[1, 2, 3, 4].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-sm font-bold transition-all",
                    s <= step ? "bg-brand text-white" : "bg-surface-muted text-content-muted",
                  )}
                >
                  {s}
                </div>
                {s < 4 && (
                  <div
                    className={cn("h-0.5 flex-1 rounded-full transition-all", s < step ? "bg-brand" : "bg-hairline-strong")}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between text-[0.625rem] font-bold uppercase tracking-wider text-content-muted">
            {STEP_LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-hairline bg-surface-card p-6 shadow-[var(--shadow-raised)] sm:p-7">
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Account details</h2>
              <div>
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <Label>Company name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" />
              </div>
              <div>
                <Label>Username</Label>
                <div className="relative">
                  <Input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                      setUsernameSuggestionsFallback([]);
                    }}
                    placeholder="company_name"
                    className="pr-10"
                    aria-invalid={usernameStatus === "taken" || usernameStatus === "invalid"}
                    autoComplete="off"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && <Loader2 className="size-4 animate-spin text-content-muted" />}
                    {usernameStatus === "available" && <Check className="size-4 text-emerald-500" />}
                    {(usernameStatus === "taken" || usernameStatus === "invalid") && <X className="size-4 text-danger" />}
                  </span>
                </div>
                {(suggestions.length > 0 || usernameSuggestionsFallback.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-content-muted">Try:</span>
                    {(suggestions.length > 0 ? suggestions : usernameSuggestionsFallback).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setUsername(s);
                          setUsernameSuggestionsFallback([]);
                        }}
                        className="rounded-lg border border-hairline-strong bg-surface-muted px-2.5 py-1 text-xs font-bold text-brand-strong transition-colors hover:border-brand hover:bg-brand-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {usernameMessage && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs font-semibold",
                      usernameStatus === "available" && "text-emerald-600",
                      (usernameStatus === "taken" || usernameStatus === "invalid") && "text-danger",
                      (usernameStatus === "checking" || usernameStatus === "error") && "text-content-muted",
                    )}
                  >
                    {usernameMessage}
                  </p>
                )}
              </div>
              <div>
                <Label>Work email</Label>
                <div className="relative">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-invalid={(email.length > 0 && !emailValid) || emailStatus === "taken" || emailStatus === "invalid"}
                    autoComplete="email"
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                    {emailStatus === "checking" && <Loader2 className="size-4 animate-spin text-content-muted" />}
                    {emailStatus === "available" && <Check className="size-4 text-emerald-500" />}
                    {(emailStatus === "taken" || emailStatus === "invalid") && <X className="size-4 text-danger" />}
                  </span>
                </div>
                {email.length > 0 && !emailValid && (
                  <p className="mt-1.5 text-xs font-semibold text-danger">Enter a valid email address</p>
                )}
                {emailMessage && emailValid && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs font-semibold",
                      emailStatus === "available" && "text-emerald-600",
                      (emailStatus === "taken" || emailStatus === "invalid") && "text-danger",
                      (emailStatus === "checking" || emailStatus === "error") && "text-content-muted",
                    )}
                  >
                    {emailMessage}
                  </p>
                )}
              </div>
              <PhoneOtpField
                phone={phone}
                onPhoneChange={setPhone}
                verifiedToken={phoneToken}
                onVerifiedChange={setPhoneToken}
              />
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted transition-colors hover:text-content"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {password.length > 72 && (
                  <p className="mt-1.5 text-xs font-semibold text-danger">Password must be 72 characters or fewer</p>
                )}
                {password.length > 0 && password.length <= 72 && (() => {
                  const s = passwordStrength(password);
                  return (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-colors",
                              i < s.score ? s.color : "bg-hairline-strong",
                            )}
                          />
                        ))}
                      </div>
                      <p className="mt-1 text-[0.6875rem] font-semibold text-content-muted">{s.label}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Company details</h2>
              <div>
                <Label>Industry</Label>
                <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Business type</Label>
                <Select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                  <option value="">Select business type</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Website (optional)</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" />
                {!websiteValid && (
                  <p className="mt-1.5 text-xs font-semibold text-danger">Enter a valid website, e.g. yourcompany.com</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Verification & address</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City</Label>
                  <CityInput value={city} onChange={setCity} placeholder="City" />
                </div>
                <div>
                  <Label>State</Label>
                  <Select value={state} onChange={(e) => setState(e.target.value)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Registered address</Label>
                <Textarea value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} placeholder="Full registered address" rows={3} />
              </div>
              <div>
                <Label>GST number (optional)</Label>
                <Input
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                />
                {!gstValid && (
                  <p className="mt-1.5 text-xs font-semibold text-danger">
                    Enter a valid 15-character GST number, e.g. 22AAAAA0000A1Z5
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Collaboration intent</h2>
              <div>
                <Label>Monthly marketing budget</Label>
                <div className="grid grid-cols-2 gap-3">
                  {BUDGET_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setMarketingBudget(range)}
                      className={cn(
                        "rounded-xl border px-3.5 py-3 text-left text-sm font-bold transition-all",
                        marketingBudget === range
                          ? "border-brand bg-brand-soft text-brand-strong"
                          : "border-hairline-strong bg-surface-muted text-content-soft hover:border-content-muted",
                      )}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-brand/15 bg-brand-soft px-4 py-3">
                <p className="text-sm leading-relaxed text-content-soft">
                  Your account will be reviewed by our team. Outbound campaign requests unlock once approved.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            {step > 1 && (
              <Button variant="surface" size="xl" className="flex-1" onClick={() => setStep((step - 1) as Step)}>
                Back
              </Button>
            )}
            {step < 4 ? (
              <Button variant="brand" size="xl" className="flex-1" disabled={!canProceed()} onClick={() => setStep((step + 1) as Step)}>
                Continue
              </Button>
            ) : (
              <Button variant="brand" size="xl" className="flex-1" disabled={isLoading || !canProceed()} onClick={handleSubmit}>
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" /> Creating account…
                  </>
                ) : (
                  "Submit for review"
                )}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-medium text-content-soft">
          Already have an account?{" "}
          <Link
            href={nextParam && nextParam !== "/dashboard" ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
            className="font-bold text-brand transition-colors hover:text-brand-strong"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm font-medium text-content-soft">
          Want to join as a creator?{" "}
          <Link href="/signup/influencer" className="font-bold text-brand transition-colors hover:text-brand-strong">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
