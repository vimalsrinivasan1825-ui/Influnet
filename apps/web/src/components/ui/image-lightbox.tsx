"use client";

/**
 * Full-size image viewer that stays inside the app.
 *
 * Thumbnails used to be plain links that opened the original in a new tab,
 * which drops the admin out of the list they were working through and shows
 * them a raw Cloudinary URL. This keeps them where they were: Escape or a
 * click on the backdrop returns to exactly the same scroll position.
 *
 * Arrow keys and the on-screen chevrons step through the set, so a report with
 * several screenshots can be read without closing and reopening.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { cloudinaryFull, cloudinaryThumb } from "@/lib/storage/cloudinary-url";

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: string[];
  /** Which image to show; null closes the viewer. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const open = index !== null && index >= 0 && index < images.length;

  const step = useCallback(
    (delta: number) => {
      if (index === null || images.length < 2) return;
      // Wraps, so the arrows never dead-end on the first or last image.
      onIndexChange((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, step]);

  if (!open) return null;
  const current = images[index];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {/* The escape hatch for anyone who genuinely does want the raw file —
            saving it, or opening it on a second monitor. */}
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original in a new tab"
          className="rounded-full bg-white/12 p-2 text-white transition-colors hover:bg-white/22"
        >
          <ExternalLink className="size-4.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full bg-white/12 p-2 text-white transition-colors hover:bg-white/22"
        >
          <X className="size-4.5" />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous screenshot"
            className="absolute left-3 rounded-full bg-white/12 p-2.5 text-white transition-colors hover:bg-white/22 sm:left-6"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next screenshot"
            className="absolute right-3 rounded-full bg-white/12 p-2.5 text-white transition-colors hover:bg-white/22 sm:right-6"
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="absolute bottom-5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white">
            {index + 1} / {images.length}
          </span>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current}
        src={cloudinaryFull(current)}
        alt={`Screenshot ${index + 1} of ${images.length}`}
        className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
      />
    </div>
  );
}

/**
 * A thumbnail that shows the WHOLE image, and reports its own failure.
 *
 * `object-contain`, not `object-cover`, and that is the entire point of this
 * component. A phone screenshot is around 1080x2340; a square cover-crop of
 * one shows a thin slice of its top, and the top of a screenshot is usually
 * chrome or empty background — the first version of this looked like a
 * completely blank tile for exactly that reason, on an image that had loaded
 * perfectly (measured: the top square of the first real upload averaged
 * rgb(243,243,247) across 44 distinct colours). Letterboxing it small is
 * worth far more here than filling the box: the admin needs to recognise
 * which screenshot this is, and the lightbox is one click away for detail.
 *
 * The tile backing is dark for the same reason the crop was wrong: app screenshots
 * are overwhelmingly white, and a white image letterboxed onto a white card
 * has no visible edges — you cannot tell where the screenshot stops. A near
 * black backing makes the content read as a distinct object at thumbnail size.
 *
 * The failure state matters for the same reason: a bare <img> that doesn't
 * load leaves an empty bordered box, indistinguishable from the blank-crop
 * problem above, and says nothing about whether the upload failed, the row is
 * bad, or the network is.
 */
export function ImageThumb({
  url,
  onClick,
  className = "",
}: {
  url: string;
  onClick: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-hairline-strong bg-surface-muted px-2 text-center ${className}`}
      >
        <span className="text-[0.625rem] font-semibold leading-tight text-content-muted">
          Image unavailable
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.625rem] font-semibold text-brand underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open link
        </a>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View screenshot"
      className={`group block overflow-hidden rounded-lg border border-hairline bg-[#12161f] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cloudinaryThumb(url)}
        alt="Screenshot attached to this issue"
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </button>
  );
}
