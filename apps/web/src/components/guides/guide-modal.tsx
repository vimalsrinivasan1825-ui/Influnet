"use client";

/**
 * The guide modal — the player plus the chrome that frames it: title, a
 * "Step n of m" strip, play/pause, and (for guides that teach a specific
 * action) a button that jumps to the real thing.
 *
 * Mounted once by <GuideRoot>. It reads which guide to show from `useGuides`.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, X } from "lucide-react";
import { captionSteps, guideById } from "@influnet/core";
import { apiFetch } from "@/lib/api-client";
import { GuidePlayer } from "./guide-player";
import { DEFAULT_CONTEXT, type GuideContext } from "./screens";
import { useGuides } from "./use-guides";

/** Per-guide "now do it" shortcut into the real product. */
const CTA: Record<string, { label: string; href: string }> = {
  "connect-instagram": { label: "Verify now", href: "/dashboard/profile#instagram-ownership" },
  "connect-socials": { label: "Open profile editor", href: "/dashboard/profile" },
  "discover-people": { label: "Open discover", href: "/dashboard" },
  "edit-profile": { label: "Edit my profile", href: "/dashboard/profile" },
  "send-message": { label: "Open messages", href: "/dashboard/messages" },
  "send-request": { label: "Open messages", href: "/dashboard/messages" },
  "respond-request": { label: "Open requests", href: "/dashboard/requests" },
  "propose-project": { label: "Open messages", href: "/dashboard/messages" },
  "run-project": { label: "Open projects", href: "/dashboard/projects" },
  "sign-off-stage": { label: "Open projects", href: "/dashboard/projects" },
  payments: { label: "Open projects", href: "/dashboard/projects" },
  "get-premium": { label: "See Pro", href: "/dashboard/billing" },
  "get-help": { label: "Open support", href: "/dashboard/support" },
  notifications: { label: "Open activity", href: "/dashboard/activity" },
};

export function GuideModal() {
  const router = useRouter();
  const { openId, close } = useGuides();
  const script = openId ? guideById(openId) : undefined;

  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<GuideContext>(DEFAULT_CONTEXT);

  const steps = useMemo(() => (script ? captionSteps(script) : []), [script]);

  useEffect(() => {
    if (!openId) return;
    setPlaying(true);
    setStep(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId, close]);

  // Personalise once per open — name, handle, plan, link.
  useEffect(() => {
    if (!openId) return;
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch<any>("/api/profile");
        if (!alive || !res.ok || !res.data) return;
        const p = res.data;
        const handle: string | null =
          p.instagram_handle || p.username || null;
        const slug: string | null = p.username || null;
        setCtx({
          name: p.name || DEFAULT_CONTEXT.name,
          handle: (handle || DEFAULT_CONTEXT.handle).replace(/^@/, ""),
          avatarUrl: p.avatar_url || p.logo_url || null,
          profileUrl: slug ? `https://influnet.in/c/${slug}` : DEFAULT_CONTEXT.profileUrl,
          displayUrl: slug ? `influnet.in/c/${slug}` : DEFAULT_CONTEXT.displayUrl,
          role: p.role ?? DEFAULT_CONTEXT.role,
          plan: p.tier === "pro" || p.verified_badge ? "pro" : "free",
        });
      } catch {
        /* keep DEFAULT_CONTEXT */
      }
    })();
    return () => {
      alive = false;
    };
  }, [openId]);

  if (!openId || !script) return null;

  const cta = CTA[script.id];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={script.title}
      onClick={close}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-content">{script.title}</p>
            <p className="truncate text-xs text-content-muted">
              {steps.length > 0
                ? `Step ${step + 1} of ${steps.length} · ${steps[step]?.label ?? ""}`
                : script.blurb}
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
              onClick={close}
              aria-label="Close"
              className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <GuidePlayer script={script} context={ctx} playing={playing} onStep={setStep} />

          {steps.length > 1 && (
            <div className="mt-3 flex items-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s.at}
                  className={
                    i === step
                      ? "h-1.5 w-6 rounded-full bg-brand transition-all"
                      : "h-1.5 w-1.5 rounded-full bg-hairline-strong transition-all"
                  }
                />
              ))}
            </div>
          )}

          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed text-content-soft">
            {script.blurb}
          </p>

          {cta && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  close();
                  router.push(cta.href);
                }}
                className="flex h-9 w-full items-center justify-center rounded-lg bg-brand text-sm font-bold text-white transition-colors hover:bg-brand-strong"
              >
                {cta.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
