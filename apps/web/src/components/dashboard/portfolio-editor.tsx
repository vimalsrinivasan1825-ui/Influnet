"use client";

/**
 * Selected work — the creator's portfolio, managed from the web dashboard.
 *
 * The counterpart to the mobile add screen, over the same /api/portfolio
 * routes. Paste a link and the server derives the platform, the thumbnail and
 * (for YouTube) the real title, so the common case is one field.
 *
 * The list mixes two provenances that must never be mistaken for each other:
 * completed Influnet projects carry the trust mark and cannot be edited or
 * deleted here (they are derived from the project record, not rows), while
 * self-added entries are labelled as the creator's own claim. Same rule the
 * public profile and the mobile grid enforce — see migration 087.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Input, Label } from "@/components/ui/input";

interface PortfolioItem {
  id: string;
  source: "manual" | "platform";
  verified: boolean;
  title: string;
  brand_name: string | null;
  platform: "instagram" | "youtube" | "other";
  content_url: string | null;
  thumbnail_url: string | null;
  views: number | null;
  happened_at: string | null;
}

/** Mirrors the hosts lib/portfolio-link.ts accepts, for the pre-flight hint. */
function platformHint(url: string): string | null {
  const u = url.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return "YouTube — the title and thumbnail come across automatically.";
  }
  if (u.includes("instagram.com")) {
    return "Instagram — add a title below; Instagram doesn't hand thumbnails to apps.";
  }
  return null;
}

export function PortfolioEditor() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<{ items: PortfolioItem[] }>("/api/portfolio");
    if (res.ok && res.data) setItems(res.data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!url.trim() || saving) return;
    setSaving(true);

    const res = await apiFetch("/api/portfolio", {
      method: "POST",
      body: JSON.stringify({
        url: url.trim(),
        title: title.trim() || undefined,
        brand_name: brand.trim() || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      // The route returns a real sentence for every 4xx — a bad link, a
      // duplicate, a full portfolio — so show that rather than a generic error.
      toast.error(res.error || "Could not add that link.");
      return;
    }

    setUrl("");
    setTitle("");
    setBrand("");
    toast.success("Added to your portfolio");
    void load();
  }

  async function remove(item: PortfolioItem) {
    const res = await apiFetch(`/api/portfolio?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(res.error || "Could not remove that item.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const hint = platformHint(url);

  return (
    <SectionCard title="Selected work">
      <div className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-content-muted">
          The work you want brands to see first. Paste a link to any post or video you
          made. Collaborations you finish on Influnet are added here automatically, with
          the verified mark.
        </p>

        {/* ── Add ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
          <div>
            <Label>Link to the post or video</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-content-muted">
              {hint ?? "An Instagram post or reel, or a YouTube video."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What was this piece of work?"
              />
            </div>
            <div>
              <Label>Brand</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Who was it for? (optional)"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={add} disabled={!url.trim() || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add to portfolio
                </>
              )}
            </Button>
            <p className="text-xs text-content-muted">Shows as self-reported.</p>
          </div>
        </div>

        {/* ── The wall ────────────────────────────────────────────── */}
        {loading ? (
          <p className="text-sm text-content-muted">Loading your work…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-content-muted">
            Nothing added yet — your public profile falls back to your most recent posts
            until you choose what to show.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-col overflow-hidden rounded-lg border bg-surface ${
                  item.verified ? "border-[#FF0B8D]/40" : "border-border"
                }`}
              >
                <div className="grid aspect-[16/10] place-items-center bg-surface-muted">
                  {item.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : item.verified ? (
                    <BadgeCheck className="h-6 w-6 text-[#FF0B8D]/70" />
                  ) : (
                    <Link2 className="h-5 w-5 text-content-muted" />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
                  {item.brand_name && (
                    <p className="text-xs text-content-muted">{item.brand_name}</p>
                  )}

                  {item.verified ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[0.68rem] font-bold text-[#FF0B8D]">
                      <BadgeCheck className="h-3 w-3" />
                      Verified on Influnet
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-content-muted">
                      <Link2 className="h-3 w-3" />
                      Self-reported
                    </span>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-2">
                    {item.content_url ? (
                      <a
                        href={item.content_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-xs text-content-muted underline-offset-2 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span />
                    )}

                    {/* Platform entries are derived from a project record —
                        there is no row to delete, and removing the project's
                        history is not this screen's job. */}
                    {item.source === "manual" && (
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        aria-label={`Remove ${item.title}`}
                        className="inline-flex items-center gap-1 text-xs text-danger hover:opacity-80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
