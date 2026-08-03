"use client";

/**
 * Lightweight feedback control.
 *
 * Deliberately not a floating bubble on every screen — an always-present
 * widget is noise, and it competes with the support flow for the same click.
 * This is a small trigger the dashboard mounts once; support is where you go
 * when you are stuck, feedback is where you go when the product is merely
 * annoying.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "idea", label: "An idea" },
  { value: "confusion", label: "Something confusing" },
  { value: "bug", label: "Something broken" },
  { value: "praise", label: "Something good" },
];

export function FeedbackWidget({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSending(true);
    setError("");
    const res = await apiFetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ kind, message, surface: pathname }),
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error || "Could not send your feedback");
      return;
    }
    track("feedback_submitted", { kind });
    setDone(true);
    setMessage("");
    // Close on a delay so the thank-you is actually readable.
    setTimeout(() => {
      setOpen(false);
      setDone(false);
    }, 1600);
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("text-content-muted", className)}
        onClick={() => setOpen(true)}
      >
        <MessageSquareHeart /> Give feedback
      </Button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-extrabold text-content">Tell us what you think</h3>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setOpen(false)}
          aria-label="Close feedback"
        >
          <X />
        </Button>
      </div>

      {done ? (
        <p className="py-6 text-center text-sm font-semibold text-ok">
          Thank you — this goes straight to the team.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors",
                  kind === k.value
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-hairline text-content-soft hover:border-content-muted",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="What's on your mind?"
            className="mt-3 w-full resize-y rounded-xl border border-hairline bg-surface-card px-3 py-2 text-sm text-content outline-none focus:border-brand"
          />

          {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

          <Button
            variant="brand"
            size="lg"
            className="mt-3 w-full"
            disabled={sending || message.trim().length < 3}
            onClick={submit}
          >
            Send feedback
          </Button>
        </>
      )}
    </div>
  );
}
