"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { NICHES, LANGUAGES, COLLAB_TYPES, PRICE_TIERS, INDIAN_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CityInput } from "@/components/ui/city-input";
import { VerifyGuideModal } from "@/components/verification/verify-guide-modal";
import {
  useUsernameAvailability,
  useEmailAvailability,
  useUsernameSuggestions,
  useInstagramAvailability,
  useSocialConnect,
} from "@/lib/hooks/use-availability";
import { SocialConnectField } from "@/components/signup/social-connect-field";
import { SocialDisclosure } from "@/components/signup/social-disclosure";
import { PhoneOtpField, usePhoneOtpEnabled } from "@/components/signup/phone-otp-field";
import { cn } from "@/lib/utils";
import { publicProfileUrl, publicProfileUrlDisplay } from "@/lib/site";

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
const STEP_LABELS = ["Account", "Profile", "Creator", "Verify", "Collab"];

export default function InfluencerSignupPage() {
  return (
    <React.Suspense fallback={null}>
      <InfluencerSignupContent />
    </React.Suspense>
  );
}

/**
 * Pre-account Instagram ownership proof — runs BEFORE the account exists,
 * against the unauthenticated /api/auth/verify-instagram-bio endpoint (the
 * same one the mobile app's signup wizard uses). The account is only ever
 * created once this either passes or the user has another social handle to
 * fall back on — see canProceed() step 3/4 below.
 */
function InstagramVerifyStep({
  handle,
  username,
  name,
  verified,
  onVerified,
}: {
  handle: string;
  username: string;
  name: string;
  verified: boolean;
  onVerified: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const profileUrl = publicProfileUrl(username);
  const displayUrl = publicProfileUrlDisplay(username);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the link is also shown as plain text to select.
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/verify-instagram-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, username }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.verified) {
        onVerified();
      } else if (res.status === 429) {
        setMsg({ kind: "error", text: "Too many attempts — wait a moment and try again." });
      } else {
        setMsg({ kind: "error", text: data.message || "We couldn't find your link in that bio yet." });
      }
    } catch {
      setMsg({ kind: "error", text: "Something went wrong — try again." });
    } finally {
      setBusy(false);
    }
  };

  if (verified) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="relative flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-ok/30" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-ok-soft">
            <BadgeCheck className="size-9 text-ok" />
          </span>
        </div>
        <div>
          <p className="text-base font-extrabold text-content">@{handle} is yours</p>
          <p className="mt-1 text-sm text-content-soft">Verified from your profile link. Taking you to the next step…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-soft">
        Takes about a minute. Nothing is posted to your account — we only read your public profile.
        Leave the link there afterwards: it's the page you want brands to land on.
      </p>
      <ol className="flex flex-col gap-1.5 text-xs text-content-soft">
        <li>1. Copy your profile link below.</li>
        <li>
          2. Add it to your Instagram <strong>links</strong> — Edit profile → Links → Add external
          link (keep your account public).
        </li>
        <li>3. Come back and tap Verify.</li>
      </ol>
      {/* A link in the bio TEXT is not tappable on Instagram, so it earns the
          creator nothing. The links field is the clickable one — hence the
          suggestion to spend the bio on a call to action instead. */}
      <p className="rounded-lg border border-hairline bg-surface-muted/60 px-3 py-2 text-xs text-content-soft">
        Tip: in your bio itself, write something like{" "}
        <span className="font-semibold text-content">“Collabs → tap the link below”</span>. A link
        pasted into the bio text isn’t clickable on Instagram — the links field is.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs text-content">{displayUrl}</code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://instagram.com/${encodeURIComponent(handle)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-muted px-3 py-1.5 text-xs font-bold text-content-soft transition-colors hover:border-content-muted"
        >
          Open Instagram <ArrowRight className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-strong"
        >
          <PlayCircle className="size-3.5" /> Watch the guide
        </button>
      </div>
      <Button variant="brand" size="xl" disabled={busy} onClick={verify}>
        {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} I&apos;ve added it — Verify
      </Button>
      {msg && <p className="text-xs font-semibold text-danger">{msg.text}</p>}

      <VerifyGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        profileUrl={profileUrl}
        displayUrl={displayUrl}
        handle={handle}
        name={name}
      />
    </div>
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
  const phoneOtpEnabled = usePhoneOtpEnabled();
  const searchParams = useSearchParams();
  const nextParam = (() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  })();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
  // The handle Instagram verification last passed for. Compared against the
  // live handle rather than a plain boolean so editing the handle after
  // verifying automatically un-verifies it without extra plumbing.
  const [instagramVerifiedHandle, setInstagramVerifiedHandle] = useState<string | null>(null);
  const [youtubeHandle, setYoutubeHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [facebookHandle, setFacebookHandle] = useState("");
  const [snapchatHandle, setSnapchatHandle] = useState("");
  const [collabTypes, setCollabTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameSuggestionsFallback, setUsernameSuggestionsFallback] = useState<string[]>([]);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Load saved state on mount. Deliberately capped at step 3: step 4's
  // in-progress verification state (and step 5's submit) shouldn't silently
  // resume from a stale reload — landing back on step 3 with everything else
  // intact means re-doing Verify + Collab, which is quick.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("influencerSignupState");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.step && data.step <= 3) setStep(data.step);
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName) setLastName(data.lastName);
        if (data.username) setUsername(data.username);
        // email / phone / gender are deliberately NOT persisted (draft only
        // keeps non-sensitive fields) — see the save effect below.
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
        if (data.languages) setLanguages(data.languages);
        if (data.primaryNiche) setPrimaryNiche(data.primaryNiche);
        if (data.secondaryNiches) setSecondaryNiches(data.secondaryNiches);
        if (data.bio) setBio(data.bio);
        if (data.instagramHandle) setInstagramHandle(data.instagramHandle);
        if (data.youtubeHandle) setYoutubeHandle(data.youtubeHandle);
        if (data.twitterHandle) setTwitterHandle(data.twitterHandle);
        if (data.facebookHandle) setFacebookHandle(data.facebookHandle);
        if (data.snapchatHandle) setSnapchatHandle(data.snapchatHandle);
        if (data.collabTypes) setCollabTypes(data.collabTypes);
        if (data.priceRange) setPriceRange(data.priceRange);
      }
    } catch {}
  }, []);

  // Save state on change. Deliberately excludes email / phone / gender: they
  // are personal data, and persisting them in browser storage is what the
  // CodeQL "clear text storage of sensitive information" rule flags. A refresh
  // mid-wizard asks the user to re-enter those step-1 fields; everything else
  // is preserved. (The password is never persisted either.)
  useEffect(() => {
    sessionStorage.setItem(
      "influencerSignupState",
      JSON.stringify({
        step, firstName, lastName, username, city, state,
        languages, primaryNiche, secondaryNiches, bio, instagramHandle, youtubeHandle, twitterHandle,
        facebookHandle, snapchatHandle, collabTypes, priceRange,
      })
    );
  }, [
    step, firstName, lastName, username, city, state,
    languages, primaryNiche, secondaryNiches, bio, instagramHandle, youtubeHandle, twitterHandle,
    facebookHandle, snapchatHandle, collabTypes, priceRange,
  ]);

  const { status: usernameStatus, message: usernameMessage } = useUsernameAvailability(username);
  const { suggestions, loading: suggestionsLoading } = useUsernameSuggestions(`${firstName} ${lastName}`, username.length === 0);
  const { status: emailStatus, message: emailMessage } = useEmailAvailability(email);
  const { status: instagramAvailStatus, message: instagramAvailMessage } = useInstagramAvailability(instagramHandle);
  // Platform lookups now run only when the creator taps Connect. Availability
  // (is this handle already claimed on Influnet?) stays live-as-you-type — it's
  // our own database, it costs nothing, and it's the check that most needs to
  // be answered before someone finishes typing.
  const instagramConnect = useSocialConnect("instagram", instagramHandle);
  const youtubeConnect = useSocialConnect("youtube", youtubeHandle);
  const facebookConnect = useSocialConnect("facebook", facebookHandle);
  const twitterConnect = useSocialConnect("twitter", twitterHandle);
  const snapchatConnect = useSocialConnect("snapchat", snapchatHandle);

  // Fail open on network/server errors — the register RPC is the source of truth
  // and will still reject a taken name, so we never hard-block on a flaky check.
  const usernameOk = usernameStatus === "available" || usernameStatus === "error";
  const emailOk = emailStatus === "available" || emailStatus === "error";
  const emailValid = EMAIL_RE.test(email);
  const passwordOk = password.length >= 8;
  const cleanInstagramHandle = instagramHandle.trim().replace(/^@/, "").toLowerCase();
  // Fail open on the availability check same as username/email, and on a
  // provider outage ('error') now that Instagram is mandatory — an Apify
  // hiccup would otherwise close signup completely. A verdict about the
  // ACCOUNT is not fail-open: private or not-found still blocks, because
  // neither can ever pass the ownership check on the next step.
  const instagramOk =
    !!cleanInstagramHandle &&
    (instagramAvailStatus === "available" || instagramAvailStatus === "error") &&
    (instagramConnect.status === "connected" || instagramConnect.status === "error");
  const instagramVerified = !!cleanInstagramHandle && instagramVerifiedHandle === cleanInstagramHandle;

  // A handle that was typed must be one we actually found. 'error' passes:
  // that's our provider failing, not the creator's account, and holding a
  // signup hostage to an Apify outage costs us the creator, not the scraper.
  const platformFieldOk = (handle: string, status: string) =>
    !handle.trim() || status === "connected" || status === "error";
  const youtubeFieldOk = platformFieldOk(youtubeHandle, youtubeConnect.status);
  const facebookFieldOk = platformFieldOk(facebookHandle, facebookConnect.status);
  const twitterFieldOk = platformFieldOk(twitterHandle, twitterConnect.status);

  // Instagram is the one REQUIRED account, not merely one of several that
  // could satisfy "at least one handle". It's what the ownership step on the
  // next screen proves, and it's the account brands look for first. The other
  // four are optional and live behind "Add other handles".

  // The moment step 4 verifies, move on automatically — the manual "Continue"
  // button (enabled by the same instagramVerified flag via canProceed) is
  // still there as a fallback if this fires oddly. Cleared on unmount/dep
  // change so clicking Continue manually can't double-advance.
  useEffect(() => {
    if (step !== 4 || !instagramVerified) return;
    const timer = setTimeout(() => setStep(5), 1600);
    return () => clearTimeout(timer);
  }, [step, instagramVerified]);

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const canProceed = (): boolean => {
    if (step === 1)
      return (
        !!firstName && !!lastName && !!username && usernameOk && emailValid && emailOk && passwordOk &&
        // Mobile OTP is a hard gate when enabled — the server rejects an
        // unverified number anyway, so don't let the wizard advance.
        (!phoneOtpEnabled || !!phoneToken)
      );
    if (step === 2) return !!gender && !!city && !!state && languages.length > 0;
    // Instagram is required and must be one we actually found (the server's
    // own "at least one handle" rule — RegisterProfileSchema — is satisfied by
    // it too). Optional platforms only have to be valid if they were typed.
    if (step === 3)
      return (
        !!primaryNiche && !!bio && instagramOk &&
        youtubeFieldOk && facebookFieldOk && twitterFieldOk
      );
    // Instagram ownership must be proven before moving on — unless there's
    // no Instagram handle to prove (YouTube/Twitter carried step 3 instead).
    if (step === 4) return !cleanInstagramHandle || instagramVerified;
    if (step === 5) return collabTypes.length > 0 && !!priceRange;
    return true;
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

  /**
   * Creates the account from the final step (Collab). Instagram ownership
   * (if a handle was entered) was already proven back on step 4, against the
   * unauthenticated /api/auth/verify-instagram-bio endpoint — so unlike the
   * old flow, the handle rides along in this payload from the start instead
   * of being collected after the account exists.
   */
  const createAccount = async () => {
    setError("");
    setIsLoading(true);
    try {
      // Final guard: re-check availability right before creating the auth user.
      // The live check gates step 1, but the name could be claimed while the user
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
        instagramHandle: cleanInstagramHandle || undefined,
        youtubeHandle,
        twitterHandle,
        facebookHandle: facebookHandle.trim().replace(/^@/, "") || undefined,
        snapchatHandle: snapchatHandle.trim().replace(/^@/, "") || undefined,
        // Audience numbers from the Connect lookups the creator already ran —
        // otherwise a creator lands with NULL followers and ranks below
        // everyone in discovery until their first in-app refresh hours later.
        instagramFollowers: instagramConnect.profile?.followerCount ?? undefined,
        facebookFollowers: facebookConnect.profile?.followerCount ?? undefined,
        twitterFollowers: twitterConnect.profile?.followerCount ?? undefined,
        youtubeSubscribers: youtubeConnect.profile?.followerCount ?? undefined,
        collabTypes,
        priceRange,
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
          setError(resData.error || "Failed to create profile record");
          return;
        }
        // Turns the bio evidence already proven on step 4 into the durable
        // migration-058 ownership claim (syncOwnershipFromBio), which is what
        // the Verified-badge pipeline reads. Fire-and-forget, same as mobile's
        // finishRegistration — a failure here must not block onto the
        // dashboard; Settings can always re-run verification later.
        if (instagramVerified) {
          apiFetch("/api/verification", { method: "POST" }).catch(() => {});
        }
        sessionStorage.removeItem("influencerSignupState");
        router.push(nextParam);
      } else {
        // Email confirmation required: no session yet, so neither
        // register_profile nor the step-5 ownership handshake can run now.
        // The signup answers already live on the auth user as user_metadata;
        // the only thing that can't live there is the single-use phone-OTP
        // token, so it is stored SERVER-SIDE (pending_registrations, migration
        // 105) — never in localStorage. On first login, /api/auth/register
        // rebuilds the profile from the metadata and spends that token, on any
        // device, within its 30-minute window.
        sessionStorage.removeItem("influencerSignupState");
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

          {step === 1 && (
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

          {step === 2 && (
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
                  <CityInput value={city} onChange={setCity} />
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

          {step === 3 && (
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
              <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-soft">
                  Add your Instagram, then hit <strong>Connect</strong> so we can check it&apos;s
                  public and show you what we found. Nothing is posted to your accounts.
                </p>

                <SocialConnectField
                  platform="instagram"
                  value={instagramHandle}
                  onChange={setInstagramHandle}
                  connect={instagramConnect}
                  blockingMessage={
                    instagramAvailStatus === "taken"
                      ? "This handle is already claimed on Influnet"
                      : instagramAvailStatus === "invalid"
                        ? instagramAvailMessage
                        : null
                  }
                  helper="We'll verify you own this account next."
                />

                <SocialDisclosure
                  subtitle="Optional — click a logo to add that account. Brands see every one you connect."
                  items={[
                    {
                      platform: "youtube",
                      label: "YouTube",
                      filled: youtubeHandle.trim().length > 0,
                      body: (
                        <SocialConnectField
                          platform="youtube"
                          value={youtubeHandle}
                          onChange={setYoutubeHandle}
                          connect={youtubeConnect}
                          placeholder="channel"
                          optional
                        />
                      ),
                    },
                    {
                      platform: "facebook",
                      label: "Facebook",
                      filled: facebookHandle.trim().length > 0,
                      body: (
                        <SocialConnectField
                          platform="facebook"
                          value={facebookHandle}
                          onChange={setFacebookHandle}
                          connect={facebookConnect}
                          placeholder="yourpage"
                          optional
                        />
                      ),
                    },
                    {
                      platform: "twitter",
                      label: "X",
                      filled: twitterHandle.trim().length > 0,
                      body: (
                        <SocialConnectField
                          platform="twitter"
                          value={twitterHandle}
                          onChange={setTwitterHandle}
                          connect={twitterConnect}
                          placeholder="handle"
                          optional
                        />
                      ),
                    },
                    {
                      platform: "snapchat",
                      label: "Snapchat",
                      filled: snapchatHandle.trim().length > 0,
                      body: (
                        <SocialConnectField
                          platform="snapchat"
                          value={snapchatHandle}
                          onChange={setSnapchatHandle}
                          connect={snapchatConnect}
                          placeholder="username"
                          optional
                          linkOnly
                          helper="Shown as a link on your profile — Snapchat doesn't publish stats we can read."
                        />
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h2 className="border-b border-hairline pb-2 text-lg font-extrabold text-content">Verify your Instagram</h2>
              {cleanInstagramHandle ? (
                <>
                  <p className="text-sm text-content-soft">
                    Prove @{cleanInstagramHandle} is really you before we create your account.
                  </p>
                  <InstagramVerifyStep
                    handle={cleanInstagramHandle}
                    username={username}
                    name={`${firstName} ${lastName}`}
                    verified={instagramVerified}
                    onVerified={() => setInstagramVerifiedHandle(cleanInstagramHandle)}
                  />
                </>
              ) : (
                <p className="rounded-xl border border-hairline bg-surface-muted px-4 py-3 text-sm text-content-soft">
                  No Instagram handle to verify — you added another social handle on the last step, so
                  you're all set. Continue when ready.
                </p>
              )}
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

          <div className="mt-6 flex gap-3">
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
              <Button variant="brand" size="xl" className="flex-1" disabled={isLoading || !canProceed()} onClick={createAccount}>
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
