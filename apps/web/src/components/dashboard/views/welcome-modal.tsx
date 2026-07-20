"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Copy, Check, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export function WelcomeModal({ username, seen }: { username: string; seen?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLink(`${window.location.origin}/c/${username}`);

    // The account already knows this card has been shown.
    if (seen) return;

    const key = `influnet_welcome_shown_${username}`;
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

  if (!isOpen) return null;

  const handleClose = () => setIsOpen(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Reveal className="w-full max-w-md overflow-hidden rounded-3xl bg-surface-card p-6 shadow-pop sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <PartyPopper className="size-8" />
          </div>
          <h2 className="mb-2 text-2xl font-extrabold text-content">Account created!</h2>
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
        </div>
      </Reveal>
    </div>
  );
}
