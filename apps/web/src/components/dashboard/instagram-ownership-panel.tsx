"use client";

// Bio-link ownership handshake (see docs §2.12). Proves the user controls the
// Instagram handle without OAuth: we hand them their own PUBLIC PROFILE LINK,
// they put it in their IG bio, we scrape and confirm. Ownership is what unlocks
// auto-verification (anti-impersonation).
//
// The marker used to be a throwaway `vf_` code. It is now the creator's profile
// link, because that is a link they want in their bio permanently — so the step
// stops being a chore they undo the moment it passes.

import { useEffect, useState } from "react";
import { BadgeCheck, Check, Copy, Loader2, PlayCircle, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { VerifyGuideModal } from "@/components/verification/verify-guide-modal";
import { publicProfileUrl, publicProfileUrlDisplay } from "@/lib/site";

type Status = "loading" | "none" | "pending" | "verified";

export function InstagramOwnershipPanel({
  handle,
  username,
  name,
  onVerified,
}: {
  handle: string;
  /** Influnet username — the profile link is built from it. */
  username?: string | null;
  name?: string | null;
  onVerified?: () => void;
}) {
  const clean = handle.trim().replace(/^@/, "");
  const [status, setStatus] = useState<Status>("loading");
  const [verifyUrl, setVerifyUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Shown before the server has issued anything, so the guide and the panel
  // agree on what the creator is about to paste.
  const previewUrl = username ? publicProfileUrl(username) : "";
  const previewDisplay = username ? publicProfileUrlDisplay(username) : "";
  const shownUrl = verifyUrl || previewUrl;

  useEffect(() => {
    if (!clean) {
      setStatus("none");
      return;
    }
    (async () => {
      const res = await apiFetch<{ status: string }>(
        `/api/verification/ownership?platform=instagram&handle=${encodeURIComponent(clean)}`,
      );
      setStatus(res.ok && res.data?.status === "verified" ? "verified" : "none");
    })();
  }, [clean]);

  const initiate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ code: string; profile_url?: string; verify_url: string }>(
        "/api/verification/ownership",
        {
          method: "POST",
          body: JSON.stringify({ action: "initiate", platform: "instagram", handle: clean }),
        },
      );
      if (!res.ok || !res.data) {
        setMsg({ kind: "error", text: res.error || "Could not start verification" });
        return;
      }
      // The server is the source of truth for the marker — never assume the
      // locally-built preview matches (a username edit mid-session would break it).
      setVerifyUrl(res.data.profile_url || res.data.verify_url || res.data.code);
      setStatus("pending");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ verified: boolean; message?: string }>("/api/verification/ownership", {
        method: "POST",
        body: JSON.stringify({ action: "confirm", platform: "instagram", handle: clean }),
      });
      if (res.ok && res.data?.verified) {
        setStatus("verified");
        setMsg({ kind: "ok", text: "Ownership confirmed. Leave the link in your bio — it points brands at your profile. Running your verification…" });
        // Ownership proven → kick the metrics verification so the badge can be granted.
        apiFetch("/api/verification", { method: "POST" }).catch(() => {});
        onVerified?.();
      } else {
        setMsg({ kind: "error", text: res.data?.message || res.error || "Not found yet — try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shownUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  return (
    <SectionCard
      id="instagram-ownership"
      title="Verify Instagram ownership"
      action={
        username ? (
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            <PlayCircle className="size-4" /> Watch the guide
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <p className="-mt-1 text-xs text-content-muted">
          Prove the account is yours so we can grant your verified badge. No password needed — you
          just put your Influnet profile link in your bio.
        </p>

        {status === "loading" && <span className="text-sm text-content-muted">Loading…</span>}

        {status === "none" && !clean && (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-muted">
            Add your Instagram handle above and save, then verify ownership here.
          </p>
        )}

        {status === "verified" && (
          <div className="flex items-center gap-2 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-semibold text-ok">
            <BadgeCheck className="size-5 shrink-0" /> @{clean} is verified as yours.
          </div>
        )}

        {status === "none" && clean && (
          <Button variant="brand" size="sm" disabled={busy} onClick={initiate}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify I own @{clean}
          </Button>
        )}

        {status === "pending" && (
          <div className="flex flex-col gap-3">
            {/* Lead with the thing people worry about before touching their bio —
                that nothing gets posted — before asking them to do it. */}
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-soft">
              Takes about a minute. Nothing is posted to your account — we only read your public
              bio. Leave the link there afterwards: it is the page you want brands to land on.
            </p>
            <ol className="flex flex-col gap-1.5 text-xs text-content-soft">
              <li>1. Copy your profile link below.</li>
              <li>2. Paste it into your Instagram bio (keep your account public).</li>
              <li>3. Come back and tap Verify.</li>
            </ol>
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs text-content">{shownUrl}</code>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="brand" size="sm" disabled={busy} onClick={confirm}>
                {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} I&apos;ve added it — Verify
              </Button>
              <Button variant="surface" size="sm" disabled={busy} onClick={() => setGuideOpen(true)}>
                <PlayCircle /> Show me how
              </Button>
            </div>
          </div>
        )}

        {msg && (
          <p
            className={
              msg.kind === "error"
                ? "text-xs text-danger"
                : msg.kind === "ok"
                  ? "text-xs font-semibold text-ok"
                  : "text-xs text-content-muted"
            }
          >
            {msg.text}
          </p>
        )}
      </div>

      {username && (
        <VerifyGuideModal
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          profileUrl={shownUrl || previewUrl}
          displayUrl={previewDisplay}
          handle={clean || "yourhandle"}
          name={name || "Your name"}
        />
      )}
    </SectionCard>
  );
}
