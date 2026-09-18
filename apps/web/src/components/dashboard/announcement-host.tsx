"use client";

/**
 * In-app announcements from the admin's broadcasts (migration 157).
 *
 * `banner` shows above the page and stays until dismissed; `modal` takes the
 * screen once. `toast` is not handled here — those arrive as ordinary
 * notifications through the existing bell and Realtime feed.
 *
 * Seen / dismissed / clicked are recorded so the admin's broadcast page can
 * show whether anyone actually read it.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Megaphone, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface Announcement {
  broadcast_id: string;
  delivery_id: number;
  kind: string;
  style: "toast" | "banner" | "modal";
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  cta_label: string | null;
  guide_id: string | null;
}

export function AnnouncementHost() {
  const [items, setItems] = useState<Announcement[]>([]);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{ announcements: Announcement[] }>("/api/announcements");
      if (cancelled || !res.ok) return;
      const list = (res.data?.announcements ?? []).filter((a) => a.style !== "toast");
      setItems(list);
      // Being shown at all counts as seen.
      for (const a of list) {
        void apiFetch("/api/announcements", {
          method: "POST",
          body: JSON.stringify({ broadcastId: a.broadcast_id, action: "seen" }),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(async (a: Announcement, action: "dismissed" | "clicked") => {
    setItems((prev) => prev.filter((x) => x.broadcast_id !== a.broadcast_id));
    await apiFetch("/api/announcements", {
      method: "POST",
      body: JSON.stringify({ broadcastId: a.broadcast_id, action }),
    });
    if (action === "clicked" && a.deep_link) router.push(a.deep_link);
  }, [router]);

  if (items.length === 0) return null;

  const modal = items.find((a) => a.style === "modal");
  const banners = items.filter((a) => a.style === "banner");

  return (
    <>
      {banners.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-4 sm:px-6 lg:px-8">
          {banners.map((a) => (
            <div
              key={a.broadcast_id}
              className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3.5"
            >
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Megaphone className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-content">{a.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-content-soft">{a.body}</p>
                {a.deep_link && (
                  <Button variant="brand" size="sm" className="mt-2" onClick={() => close(a, "clicked")}>
                    {a.cta_label || "Take a look"}
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(a, "dismissed")}
                aria-label="Dismiss"
                className="shrink-0 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-black/5 hover:text-content"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-content/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
            {modal.image_url && (
              <div className="relative h-40 w-full bg-surface-muted">
                <Image src={modal.image_url} alt="" fill sizes="28rem" className="object-cover" unoptimized />
              </div>
            )}
            <div className="p-6">
              <p className="text-lg font-extrabold tracking-tight text-content">{modal.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-content-soft">{modal.body}</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" size="lg" onClick={() => close(modal, "dismissed")}>
                  Not now
                </Button>
                {modal.deep_link && (
                  <Button variant="brand" size="lg" onClick={() => close(modal, "clicked")}>
                    {modal.cta_label || "Take a look"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
