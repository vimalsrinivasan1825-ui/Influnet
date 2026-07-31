"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import CreatorProfileViewComponent, {
  type CreatorProfileViewProps,
} from "@/components/public-profile/creator-profile-view";

/**
 * Renders a creator's public profile (same view model as /c/[username]) as an
 * in-app overlay, so jumping to a search result never leaves the dashboard.
 * Closeable at any time — Escape, the close button, or clicking the backdrop.
 */
export function CreatorProfileOverlay({
  username,
  onClose,
}: {
  username: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | ({ status: "ready" } & CreatorProfileViewProps)
  >({ status: "loading" });

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const res = await apiFetch<CreatorProfileViewProps>(
        `/api/creators/${encodeURIComponent(username)}`,
      );
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", ...res.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [username, onClose]);

  if (!username) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex justify-center overflow-y-auto bg-content/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div className="relative w-full max-w-5xl">
        <button
          onClick={onClose}
          aria-label="Close profile"
          className="fixed right-4 top-4 z-[310] flex size-10 items-center justify-center rounded-full bg-surface-card text-content shadow-[var(--shadow-pop)] transition-colors hover:bg-surface-muted sm:right-6 sm:top-6"
        >
          <X className="size-5" />
        </button>

        <div onClick={(e) => e.stopPropagation()} className="min-h-screen">
          {state.status === "loading" && (
            <div className="flex min-h-screen items-center justify-center">
              <Loader2 className="size-6 animate-spin text-content-muted" />
            </div>
          )}
          {state.status === "error" && (
            <div className="flex min-h-screen items-center justify-center px-4">
              <p className="text-sm text-content-muted">
                Couldn&rsquo;t load this profile. It may no longer exist.
              </p>
            </div>
          )}
          {state.status === "ready" && (
            <CreatorProfileViewComponent
              data={state.data}
              isOwner={state.isOwner}
              ctaHref={state.ctaHref}
              ctaLabel={state.ctaLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
}
