"use client";

/**
 * Compact step-by-step guide for new creators who haven't completed verification
 * yet. Shows three clear steps: copy public link → paste in Instagram bio →
 * come back and verify.
 *
 * Only renders for creators who:
 *   1. Have an Instagram handle set.
 *   2. Have NOT completed the Instagram ownership handshake.
 *   3. Have NOT dismissed it (7-day snooze via localStorage).
 *
 * Mounted on the creator home screen (apps/web/src/app/dashboard/home/page.tsx)
 * just below the profile card, so it's the first thing a new creator sees after
 * signing up — right where the "Copy link" button already lives.
 *
 * Dismissal is a 7-day snooze (same as VerifyOwnershipNudge) because skipping
 * it permanently would defeat the purpose: verification is what unlocks the
 * verified badge and the trust signal businesses see.
 *
 * Props received from the parent to avoid duplicate API calls — the home screen
 * already fetches /api/home and knows the verification status.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Copy, Check, ArrowRight, Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = "influnet_verification_guide_dismissed_at";

export function VerificationGuide({
  publicPath,
}: {
  /** The creator's /c/[username] path — passed from the parent's /api/home response. */
  publicPath: string | null;
}) {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check if dismissed recently
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed && Date.now() - Number(dismissed) < SNOOZE_MS) {
        setVisible(false);
        return;
      }
    } catch { /* localStorage unavailable */ }
    setVisible(true);
  }, []);

  // 7-day snooze
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
  };

  const copyLink = async () => {
    if (!publicPath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  if (visible !== true) return null;

  const fullUrl = publicPath
    ? `${window.location.origin}${publicPath}`
    : null;

  return (
    <Card className="overflow-hidden border-brand/20">
      <div className="flex items-start justify-between gap-4 bg-brand-soft/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-content">
              Get verified in 3 easy steps
            </p>
            <p className="mt-0.5 text-xs text-content-soft">
              A verified badge helps brands trust you. Here&apos;s how to unlock yours.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss guide"
          className="shrink-0 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-black/5 hover:text-content"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-0 divide-y divide-hairline">
        {/* Step 1: Copy your link */}
        <div className="flex items-start gap-3 px-5 py-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-[0.6875rem] font-extrabold text-white">
            1
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-content">Copy your public profile link</p>
            <p className="text-xs text-content-soft">
              This link shows brands your stats, portfolio, and past work.
            </p>
            {fullUrl && (
              <div className="mt-2 flex items-center gap-2 overflow-hidden">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-content-muted">
                  {fullUrl}
                </code>
                <Button
                  variant="surface"
                  size="sm"
                  onClick={copyLink}
                  className="shrink-0"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Add to the Instagram links field (the clickable one) */}
        <div className="flex items-start gap-3 px-5 py-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-[0.6875rem] font-extrabold text-white">
            2
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-content">Add it to your Instagram links</p>
            <p className="text-xs text-content-soft">
              Go to your Instagram profile, tap &quot;Edit profile&quot;, then <strong>Links → Add
              external link</strong> and paste it there. Keep your account public so we can find it.
              In your bio, add something like &quot;Collabs → tap the link below&quot; — a link typed
              into the bio text isn&apos;t clickable, but the links field is.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-content-muted">
              <Smartphone className="size-3.5" />
              <span>Make sure your Instagram handle matches what&apos;s in your profile settings.</span>
            </div>
          </div>
        </div>

        {/* Step 3: Come back and verify */}
        <div className="flex items-start gap-3 px-5 py-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-[0.6875rem] font-extrabold text-white">
            3
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-content">Come back and verify</p>
            <p className="text-xs text-content-soft">
              Once the link is saved, head to your <strong>Settings → Verification</strong> page
              and click &quot;Verify I own my handle.&quot; The badge shows up right after.
            </p>
            <Link
              href="/dashboard/settings#instagram-ownership"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand transition-colors hover:text-brand-strong"
            >
              Go to verification <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
