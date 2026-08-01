"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Copy, Check, PartyPopper, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { apiFetch } from "@/lib/api-client";

/**
 * The one-time "Account created!" card.
 *
 * `seen` comes from the account (profiles.welcome_seen_at). It used to be
 * tracked in localStorage alone, which is per-browser — so the card came back
 * on every new device, in private windows, and after clearing site data. It
 * also only recorded itself in the close handler, so navigating away meant it
 * returned on the next login.
 *
 * `seen` is undefined until migration 074 is applied; the localStorage check is
 * kept as the fallback for that window, and as a belt-and-braces guard against
 * a flash before the flag is persisted.
 */
export function WelcomeModal({
  username,
  seen,
  onOpenChange,
}: {
  username: string | null;
  seen?: boolean;
  // Lets the page hold off on other first-run surfaces (e.g. the media-kit
  // nudge) until this one is out of the way, instead of both competing for
  // attention on the very first screen a creator sees.
  onOpenChange?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const hasUsername = !!username;

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (username) setLink(`${window.location.origin}/${username}`);

    // The account already knows this card has been shown.
    if (seen) return;

    // Without a username there is no real link to hand out yet — the modal
    // still shows (see below) but points at settings instead of a /c/[username]
    // URL that would 404. Don't burn the one-time "seen" flag either way; the
    // dismiss key is per-username so a creator who later sets one still gets
    // the normal card.
    const key = `influnet_welcome_shown_${username ?? "no-username"}`;
    if (localStorage.getItem(key) === "true") return;

    setIsOpen(true);
    // Recorded as soon as it is SHOWN, not when it is dismissed — otherwise
    // navigating away brings it back next time.
    localStorage.setItem(key, "true");
    void apiFetch("/api/profile/welcome", { method: "POST" });

    // Fire confetti 3 times
    let count = 0;
    const interval = setInterval(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        zIndex: 1000,
      });
      count++;
      if (count >= 3) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [username, seen]);

  const handleClose = () => setIsOpen(false);

  // Escape closes it — the only way out before was the one button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <Reveal
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface-card p-6 shadow-pop sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-black/5 hover:text-content"
        >
          <X className="size-4" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <PartyPopper className="size-8" />
          </div>
          <h2 id="welcome-modal-title" className="mb-2 text-2xl font-extrabold text-content">Account created!</h2>

          {hasUsername ? (
            <>
              <p className="mb-6 text-sm text-content-soft">
                Paste this link in your Instagram or YouTube bio so brands can request collaborations directly from you.
              </p>
              <div className="mb-6 flex w-full items-center gap-2 rounded-xl border border-hairline-strong bg-surface p-2 pl-4">
                <span className="flex-1 truncate text-sm font-medium text-content">{link}</span>
                <Button
                  variant={copied ? "secondary" : "brand"}
                  size="sm"
                  onClick={handleCopy}
                  className={`shrink-0 ${copied ? "bg-ok text-white hover:bg-ok" : ""}`}
                >
                  {copied ? (
                    <><Check className="mr-1.5 size-4" /> Copied</>
                  ) : (
                    <><Copy className="mr-1.5 size-4" /> Copy Link</>
                  )}
                </Button>
              </div>
              <Button variant="surface" size="xl" className="w-full" onClick={handleClose}>
                Got it, take me to dashboard
              </Button>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-content-soft">
                Pick a username to get your public link — paste it in your Instagram or YouTube
                bio so brands can request collaborations directly from you.
              </p>
              <ButtonLink
                href="/dashboard/settings"
                variant="brand"
                size="xl"
                className="w-full"
                onClick={handleClose}
              >
                Choose your username
              </ButtonLink>
              <Button variant="link" size="sm" className="mt-2" onClick={handleClose}>
                Skip for now
              </Button>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
