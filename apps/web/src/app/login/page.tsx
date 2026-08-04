"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginContent />
    </React.Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = (() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
  })();
  // Reflected from the URL (e.g. the "check your email" hint after signup).
  // React escapes it, but cap the length so it can't be abused for phishing.
  const message = searchParams.get("message")?.slice(0, 120) || null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const sb = createClient();
      const { data, error: authError } = await sb.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (data.session && data.user) {
        // Recover a registration that couldn't complete at signup time. When
        // email confirmation is enabled, signUp returns no session, so the
        // profile can't be created until first login. Modern signups store the
        // phone-OTP token SERVER-SIDE (pending_registrations, migration 105)
        // and store nothing here — the !profile recovery below then rebuilds
        // from user_metadata + that row on any device.
        //
        // This legacy block replays payloads written to localStorage before
        // that migration: such a value is a full registration JSON, and posting
        // it straight back still works (register_profile is idempotent, ON
        // CONFLICT). New signups never write it, so it quietly stops firing.
        try {
          const pending = localStorage.getItem("influnet_pending_registration");
          if (pending) {
            const res = await fetch("/api/auth/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: pending,
            });
            if (res.ok) {
              localStorage.removeItem("influnet_pending_registration");
              void fetch("/api/verification", {
                method: "POST",
                headers: { Authorization: `Bearer ${data.session.access_token}` },
              }).catch(() => {});
            } else if (res.status === 403) {
              // Mobile verification lapsed before the email was confirmed (the
              // token is good for 30 minutes). Say so instead of dropping the
              // user into the app with no profile row.
              const body = await res.json().catch(() => ({}));
              if (body?.reason === "phone_unverified") {
                setError(
                  "Your mobile verification expired before you confirmed your email. Please sign up again to re-verify your number.",
                );
                localStorage.removeItem("influnet_pending_registration");
                await sb.auth.signOut();
                return;
              }
            }
          }
        } catch {
          /* best-effort; fall through to normal routing */
        }

        let { data: profile } = await sb
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        // Still no profile. The localStorage replay above only fires in the
        // browser that filled the wizard — confirm the email on a different
        // device (or sign up on mobile, which stashes nothing) and there is
        // nothing to replay. Without this the user lands in the dashboard with
        // no profile row: the shell guards every read on `if (profile)`, so it
        // renders a signed-in app with no role, no name and no way back.
        //
        // The answers aren't gone: both wizards pass them to signUp as
        // `options.data`, so they're on the auth user server-side. An empty POST
        // asks the API to rebuild from those.
        if (!profile) {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.session.access_token}`,
            },
            body: "{}",
          });

          if (res.ok) {
            void fetch("/api/verification", {
              method: "POST",
              headers: { Authorization: `Bearer ${data.session.access_token}` },
            }).catch(() => {});
            ({ data: profile } = await sb
              .from("profiles")
              .select("role")
              .eq("id", data.user.id)
              .maybeSingle());
          } else {
            const body = await res.json().catch(() => ({}));
            // Mobile verification can't be inherited — the token is single-use
            // and short-lived, and rebuilding must never be a way around the
            // OTP gate. Send them to the wizard to re-verify rather than
            // creating a profile with an unverified number.
            setError(
              body?.reason === "phone_unverified"
                ? "Your mobile verification expired before you confirmed your email. Please sign up again to re-verify your number."
                : body?.error ||
                  "We couldn't finish setting up your account. Please sign up again.",
            );
            await sb.auth.signOut();
            return;
          }
        }

        const role = (profile as { role?: string } | null)?.role;
        if (role === "influencer") router.push(nextParam || "/dashboard");
        else if (role === "admin") router.push(nextParam || "/dashboard/admin");
        else router.push(nextParam || "/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-surface px-4 py-6">
      {/* Ambient brand glows */}
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

      <div className="relative z-10 flex max-h-full w-full max-w-md flex-col overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mb-8 text-center">
          <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
            <Image src="/influet_logo.png" alt="" width={36} height={36} className="size-9" />
            <span className="text-2xl font-extrabold tracking-tight text-content">influnet</span>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-content">Welcome back</h1>
          <p className="mt-1.5 text-sm text-content-soft">Sign in to your account to continue.</p>
        </div>

        <div className="rounded-3xl border border-hairline bg-surface-card p-8 shadow-[var(--shadow-raised)]">
          {message && !error && (
            <div className="mb-5 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button type="submit" variant="brand" size="xl" className="mt-1 w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-7 border-t border-hairline pt-5 text-center">
            <Link
              href="/reset-password"
              className="text-sm font-bold text-brand transition-colors hover:text-brand-strong"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm font-medium text-content-soft">
          Don&rsquo;t have an account?{" "}
          <Link
            href={nextParam ? `/signup?next=${encodeURIComponent(nextParam)}` : "/signup"}
            className="font-bold text-brand transition-colors hover:text-brand-strong"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
