"use client";

/**
 * "How to verify" — the guide animation in a modal, with the two actions it
 * teaches wired to the real thing: copy the actual profile link, and jump
 * straight to the ownership panel. A guide that leaves you to go and find the
 * button yourself is half a guide.
 */

import { useEffect, useState } from "react";
import { Check, Copy, Pause, Play, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUIDE_STEPS, VerifyGuideAnimation } from "./verify-guide-animation";

export function VerifyGuideModal({
  open,
  onClose,
  profileUrl,
  displayUrl,
  handle,
  name,
}: {
  open: boolean;
  onClose: () => void;
  /** Full link that goes in the bio. */
  profileUrl: string;
  /** Same link, protocol stripped, for display. */
  displayUrl: string;
  handle: string;
  name: string;
}) {
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Don't let the dashboard scroll behind the modal.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is on screen to select manually */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="How to verify your Instagram"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-content">How to verify</p>
            <p className="truncate text-xs text-content-muted">
              Step {step + 1} of {GUIDE_STEPS.length} · {GUIDE_STEPS[step]?.label}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <VerifyGuideAnimation
            displayUrl={displayUrl}
            handle={handle}
            name={name}
            playing={playing}
            onStep={setStep}
          />

          <div className="mt-3 flex items-center gap-1.5">
            {GUIDE_STEPS.map((s, i) => (
              <span
                key={s.t}
                className={
                  i === step
                    ? "h-1.5 w-6 rounded-full bg-brand transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-hairline-strong transition-all"
                }
              />
            ))}
          </div>

          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed text-content-soft">
            Your profile link is what proves the account is yours. Leave it in your bio — it is
            the page you want brands to land on anyway, and we can re-check it later.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="surface" size="sm" className="flex-1" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy my link"}
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="flex-1"
              onClick={() => {
                onClose();
                document.getElementById("instagram-ownership")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <ShieldCheck className="size-4" /> Verify now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
