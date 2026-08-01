"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Eye, EyeOff, Loader2, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NICHES, LANGUAGES, COLLAB_TYPES, PRICE_TIERS, INDIAN_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useUsernameAvailability, useEmailAvailability, useUsernameSuggestions, useInstagramAvailability } from "@/lib/hooks/use-availability";
import { PhoneOtpField, phoneOtpEnabled } from "@/components/signup/phone-otp-field";
import { cn } from "@/lib/utils";
import { publicProfileUrlDisplay } from "@/lib/site";

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

type Step = 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = ["Connect", "Account", "Profile", "Creator", "Collab"];

const compactNum = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
      : String(n);

export default function InfluencerSignupPage() {
  return (
    <React.Suspense fallback={null}>
      <InfluencerSignupContent />
    </React.Suspense>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-xs font-bold transition-all",
        active
          ? "border-brand bg-brand-soft text-brand-strong"
          : "border-hairline-strong bg-surface-muted text-content-soft hover:border-content-muted",
      )}
    >
      {children}
    </button>
  );
}

function InfluencerSignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = (() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  })();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [primaryNiche, setPrimaryNiche] = useState("");
  const [secondaryNiches, setSecondaryNiches] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [youtubeHandle, setYoutubeHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [collabTypes, setCollabTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameSuggestionsFallback, setUsernameSuggestionsFallback] = useState<string[]>([]);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("influencerSignupState");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.step) setStep(data.step);
        if (data.followerCount !== undefined) setFollowerCount(data.followerCount);
        if (data.prefilled !== undefined) setPrefilled(data.prefilled);
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName) setLastName(data.lastName);
        if (data.username) setUsername(data.username);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.gender) setGender(data.gender);
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
        if (data.languages) setLanguages(data.languages);
        if (data.primaryNiche) setPrimaryNiche(data.primaryNiche);
        if (data.secondaryNiches) setSecondaryNiches(data.secondaryNiches);
        if (data.bio) setBio(data.bio);
        if (data.instagramHandle) setInstagramHandle(data.instagramHandle);
        if (data.youtubeHandle) setYoutubeHandle(data.youtubeHandle);
        if (data.twitterHandle) setTwitterHandle(data.twitterHandle);
        if (data.collabTypes) setCollabTypes(data.collabTypes);
        if (data.priceRange) setPriceRange(data.priceRange);
      }
    } catch {}
  }, []);

  // Save state on change
  useEffect(() => {
    sessionStorage.setItem(
      "influencerSignupState",
      JSON.stringify({
        step, followerCount, prefilled, firstName, lastName, username, email, phone, gender, city, state,
        languages, primaryNiche, secondaryNiches, bio, instagramHandle, youtubeHandle, twitterHandle,
        collabTypes, priceRange,
      })
    );
  }, [
    step, followerCount, prefilled, firstName, lastName, username, email, phone, gender, city, state,
    languages, primaryNiche, secondaryNiches, bio, instagramHandle, youtubeHandle, twitterHandle,
    collabTypes, priceRange,
  ]);

  const { status: instagramStatus, message: instagramMessage } = useInstagramAvailability(instagramHandle);
  const { status: usernameStatus, message: usernameMessage } = useUsernameAvailability(username);
  const { suggestions, loading: suggestionsLoading } = useUsernameSuggestions(`${firstName} ${lastName}`, username.length === 0);
  const { status: emailStatus, message: emailMessage } = useEmailAvailability(email);

  // Fail open on network/server errors — the register RPC is the source of truth
  // and will still reject a taken name, so we never hard-block on a flaky check.
  const usernameOk = usernameStatus === "available" || usernameStatus === "error";
  const emailOk = emailStatus === "available" || emailStatus === "error";
  const emailValid = EMAIL_RE.test(email);
  const passwordOk = password.length >= 8;

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const canProceed = (): boolean => {
    if (step === 1) return instagramStatus !== "taken";
    if (step === 2)
      return (
        !!firstName && !!lastName && !!username && usernameOk && emailValid && emailOk && passwordOk &&
        // Mobile OTP is a hard gate when enabled — the server rejects an
        // unverified number anyway, so don't let the wizard advance.
        (!phoneOtpEnabled || !!phoneToken)
      );
    if (step === 3) return !!gender && !!city && !!state && languages.length > 0;
    if (step === 4) return !!primaryNiche && !!bio && (!!instagramHandle || !!youtubeHandle || !!twitterHandle);
    if (step === 5) return collabTypes.length > 0 && !!priceRange;
    return false;
  };

  const handleConnectInstagram = async () => {
    setConnectError("");
    if (!instagramHandle) {
      setConnectError("Please enter an Instagram handle");
      return;
    }
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/auth/scrape-instagram?handle=${encodeURIComponent(instagramHandle)}`);
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error || "Failed to fetch profile");
        return;
      }
      if (data.profile) {
        if (data.profile.fullName) {
          const parts = data.profile.fullName.split(' ');
          if (!firstName && parts.length > 0) setFirstName(parts[0]);
          if (!lastName && parts.length > 1) setLastName(parts.slice(1).join(' '));
        }
        if (data.profile.biography && !bio) setBio(data.profile.biography);
        if (data.profile.followerCount !== undefined && data.profile.followerCount !== null) {
          setFollowerCount(data.profile.followerCount);
        }
        setPrefilled(true);
        setStep(2);
      }
    } catch (err) {
      setConnectError("Network error. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Someone else took `username` between step 2 and here. Rather than dead-
  // ending on the last step with a "go back to step 2" instruction the
  // creator has to act on manually, jump the wizard back there ourselves,
  // focus the field, and offer two alternatives that are actually free right
  // now — asking someone to walk backwards through a wizard they just
  // finished is exactly where signups get abandoned.
  const recoverFromTakenUsername = async (message: string) => {
    setError(message);
    setStep(2);
    setUsernameSuggestionsFallback([]);

    try {
      const res = await fetch(`/api/auth/suggest-username?name=${encodeURIComponent(`${firstName} ${lastName}`)}`);
      const data = await res.json();
      if (data.suggestions) {
        setUsernameSuggestionsFallback(data.suggestions);
      }
    } catch { /* ignore */ }

    // Let the step-2 UI mount before focusing.
    setTimeout(() => usernameInputRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    setError("");
    setIsLoading(true);
    try {
      // Final guard: re-check availability right before creating the auth user.
      // The live check gates step 2, but the name could be claimed while the user
      // lingers on later steps — catching it here avoids an orphaned auth account.
      try {
        const check = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
        const checkData = await check.json();
        if (checkData.valid === false || checkData.available === false) {
          if (checkData.valid === false) {
            setError(checkData.reason || "That username isn’t allowed.");
          } else {
            await recoverFromTakenUsername("That username was just taken by someone else — pick another.");
          }
          return;
        }
      } catch {
        // Network hiccup — fall through; register_profile still enforces uniqueness.
      }

      const sb = createClient();
      const payload = {
        name: `${firstName} ${lastName}`,
        role: "influencer",
        username,
        email,
        phone,
        gender,
        city,
        state,
        languages,
        niche: [primaryNiche, ...secondaryNiches],
        bio,
        instagramHandle,
        youtubeHandle,
        twitterHandle,
        collabTypes,
        priceRange,
        instagramFollowers: followerCount ?? undefined,
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
          // becomes permanent auth metadata and is stashed in localStorage.
          body: JSON.stringify({ ...payload, phoneVerificationToken: phoneToken }),
        });
        if (!res.ok) {
          const resData = await res.json();
          setError(resData.error || "Failed to create profile record");
          return;
        }
        // Kick off verification in the background so the trust badge starts
        // processing immediately. Fire-and-forget — never blocks signup, and a
        // failure here is harmless (the user can re-run it from Settings).
        void fetch("/api/verification", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        }).catch(() => {});
        sessionStorage.removeItem("influencerSignupState");
        router.push(nextParam);
      } else {
        // Email confirmation required: no session yet, so register_profile can't
        // run now. Stash the payload so login can replay it once confirmed —
        // otherwise all of this wizard's data would be lost.
        // Clear the session storage now that we are done.
        sessionStorage.removeItem("influencerSignupState");
        // The OTP token rides along so login can replay it, but it only lives
        // 30 minutes — hence the sharper message when the gate is on.
        try {
          localStorage.setItem(
            "influnet_pending_registration",
            JSON.stringify({ ...payload, phoneVerificationToken: phoneToken }),
          );
        } catch { /* ignore */ }
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
          <h1 className="text-2xl font-extrabold tracking-tight text-content">Create your account</h1>
          <p className="mt-1.5 text-sm text-content-soft">Join as a creator.</p>
        </div>

        {/* Stepper */}
        <div className="mb-5 px-2">
          <div className="mb-2 flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-sm font-bold transition-all",
                    s <= step ? "bg-brand text-white" : "bg-surface-muted text-content-muted",
                  )}
                >
                  {s}
                </div>
                {s < 5 && (
                  <div className={cn("h-0.5 flex-1 rounded-full transition-all", s < step ? "bg-brand" : "bg-hairline-strong")} />
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

          {prefilled && step >= 2 && step <= 4 && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span>
                We pre-filled your details from Instagram
                {followerCount ? ` · ${compactNum(followerCount)} followers` : ""}. Review and edit anything below.
              </span>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Connect your Instagram</h2>
              <p className="text-sm text-content-soft">
                Enter your handle, and we'll automatically pull in your profile details to speed up signup.
              </p>
              {connectError && (
                <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
                  <AlertTriangle className="size-4 shrink-0" /> {connectError}
                </div>
              )}
              <div>
                <Label>Instagram handle</Label>
                <div className="relative">
                  <Input 
                    value={instagramHandle} 
                    onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ''))} 
                    placeholder="username" 
                    className="pr-10"
                    aria-invalid={instagramStatus === "taken" || instagramStatus === "invalid"}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                    {instagramStatus === "checking" && <Loader2 className="size-4 animate-spin text-content-muted" />}
                    {instagramStatus === "available" && <Check className="size-4 text-emerald-500" />}
                    {(instagramStatus === "taken" || instagramStatus === "invalid") && <X className="size-4 text-danger" />}
                  </span>
                </div>
                {instagramMessage && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs font-semibold",
                      instagramStatus === "available" && "text-emerald-600",
                      (instagramStatus === "taken" || instagramStatus === "invalid") && "text-danger",
                      (instagramStatus === "checking" || instagramStatus === "error") && "text-content-muted",
                    )}
                  >
                    {instagramMessage}
                  </p>
                )}
              </div>
              <Button 
                variant="surface" 
                className="w-full relative overflow-hidden" 
                onClick={handleConnectInstagram} 
                disabled={isConnecting || !instagramHandle || instagramStatus === "checking" || instagramStatus === "taken" || instagramStatus === "invalid"}
              >
                {isConnecting ? (
                  <>
                    <div className="absolute inset-0 bg-brand/10 animate-pulse" />
                    <Loader2 className="animate-spin mr-2 size-4 relative z-10" /> 
                    <span className="relative z-10 font-medium">Fetching profile...</span>
                  </>
                ) : (
                  "Auto-fill my details"
                )}
              </Button>
              <div className="relative my-2 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-hairline"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface-card px-2 text-content-muted">Or</span>
                </div>
              </div>
              <Button 
                variant="ghost" 
                className="w-full text-content-soft" 
                onClick={() => setStep(2)}
                disabled={instagramStatus === "checking" || instagramStatus === "taken" || instagramStatus === "invalid"}
              >
                Skip and fill manually
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Account details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>
              <div>
                <Label>Username</Label>
                <div className="relative">
                  <Input
                    ref={usernameInputRef}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                      setUsernameSuggestionsFallback([]);
                    }}
                    placeholder="Choose username"
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
                <p className="mt-1 text-xs text-content-muted">
                  Your public profile will be {publicProfileUrlDisplay(username || "username")}
                </p>
              </div>
              <div>
                <Label>Email address</Label>
                <div className="relative">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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
                {password.length > 0 && (() => {
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
                      <p className="mt-1 text-xs font-semibold text-content-muted">
                        {passwordOk ? `Password strength: ${s.label}` : "Use at least 8 characters"}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Profile details</h2>
              <div>
                <Label>Gender</Label>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" />
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
                <Label>Languages</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <Chip key={lang} active={languages.includes(lang)} onClick={() => setLanguages(toggleArrayItem(languages, lang))}>
                      {lang}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Creator positioning</h2>
              <div>
                <Label>Primary niche</Label>
                <Select value={primaryNiche} onChange={(e) => setPrimaryNiche(e.target.value)}>
                  <option value="">Select primary niche</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Secondary niches (optional)</Label>
                <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-hairline bg-surface-muted/50 p-2">
                  {NICHES.filter((n) => n !== primaryNiche).map((niche) => (
                    <Chip key={niche} active={secondaryNiches.includes(niche)} onClick={() => setSecondaryNiches(toggleArrayItem(secondaryNiches, niche))}>
                      {niche}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label>Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell brands about yourself…" rows={3} />
              </div>
              <div>
                <Label>Instagram handle</Label>
                <Input value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ""))} placeholder="@username" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>YouTube (optional)</Label>
                  <Input value={youtubeHandle} onChange={(e) => setYoutubeHandle(e.target.value)} placeholder="@channel" />
                </div>
                <div>
                  <Label>Twitter (optional)</Label>
                  <Input value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} placeholder="@handle" />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Collaboration preferences</h2>
              <div>
                <Label>Content types</Label>
                <div className="flex flex-wrap gap-2">
                  {COLLAB_TYPES.map((type) => (
                    <Chip key={type} active={collabTypes.includes(type)} onClick={() => setCollabTypes(toggleArrayItem(collabTypes, type))}>
                      {type}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label>Price range</Label>
                <div className="grid grid-cols-2 gap-3">
                  {PRICE_TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setPriceRange(tier.value)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-all",
                        priceRange === tier.value
                          ? "border-brand bg-brand-soft"
                          : "border-hairline-strong bg-surface-muted hover:border-content-muted",
                      )}
                    >
                      <div className={cn("text-sm font-extrabold", priceRange === tier.value ? "text-brand-strong" : "text-content")}>
                        {tier.label}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-content-muted">{tier.range}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1 owns its own actions (Auto-fill / Skip and fill manually),
              so the shared nav row only appears from step 2 onward. */}
          <div className={cn("mt-6 gap-3", step === 1 ? "hidden" : "flex")}>
            {step > 1 && (
              <Button variant="surface" size="xl" className="flex-1" onClick={() => setStep((step - 1) as Step)}>
                Back
              </Button>
            )}
            {step < 5 ? (
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
                  "Create account"
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
          Want to join as a business?{" "}
          <Link href="/signup/business" className="font-bold text-brand transition-colors hover:text-brand-strong">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
