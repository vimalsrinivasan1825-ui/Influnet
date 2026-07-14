"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Building2, ArrowRight, LogIn } from "lucide-react";

export default function SignupSelectionPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupSelectionContent />
    </React.Suspense>
  );
}

function SignupSelectionContent() {
  const searchParams = useSearchParams();
  const nextParam = (() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
  })();
  const nextQuery = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";

  const roles = [
    {
      href: `/signup/influencer${nextQuery}`,
      icon: <Sparkles className="size-5" />,
      title: "I'm a creator",
      body: "Get discovered by top brands and manage your collaborations.",
    },
    {
      href: `/signup/business${nextQuery}`,
      icon: <Building2 className="size-5" />,
      title: "I'm a business",
      body: "Find the right creators and run your influencer campaigns.",
    },
  ];

  return (
    <div className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-surface px-4 py-6">
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
        <div className="mb-8 text-center">
          <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
            <Image src="/influet_logo.png" alt="" width={36} height={36} className="size-9" />
            <span className="text-2xl font-extrabold tracking-tight text-content">influnet</span>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-content">Join Influnet</h1>
          <p className="mt-1.5 text-sm text-content-soft">Sign in, or create an account to get started.</p>
        </div>

        <div className="rounded-3xl border border-hairline bg-surface-card p-6 shadow-[var(--shadow-raised)] sm:p-8">
          {/* Returning users first — many arrive here from a "Work with me"
              button and already have an account. */}
          <Link
            href={`/login${nextQuery}`}
            className="group flex items-center gap-4 rounded-2xl border border-brand/30 bg-brand-soft p-5 transition-all hover:border-brand hover:bg-brand-soft/80"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-card text-brand shadow-[var(--shadow-card)]">
              <LogIn className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-extrabold tracking-tight text-brand-strong">
                I already have an account
              </span>
              <span className="mt-0.5 block text-sm text-content-soft">Sign in to continue where you left off.</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
          </Link>

          <div className="relative my-5 text-center">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-hairline" />
            </div>
            <span className="relative bg-surface-card px-3 text-xs font-bold uppercase tracking-wider text-content-muted">
              New here? Sign up
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {roles.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="group flex items-center gap-4 rounded-2xl border border-hairline-strong bg-surface-muted p-5 transition-all hover:border-brand hover:bg-brand-soft"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-card text-brand shadow-[var(--shadow-card)]">
                  {r.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-extrabold tracking-tight text-content group-hover:text-brand-strong">
                    {r.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-content-soft">{r.body}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-content-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
