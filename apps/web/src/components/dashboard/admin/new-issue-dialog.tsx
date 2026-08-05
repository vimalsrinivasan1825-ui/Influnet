"use client";

/**
 * "New issue" as a real dialog rather than an inline card.
 *
 * The inline form this replaces sat in the toolbar row and pushed the list
 * down as it opened, which is fine for two fields and wrong the moment
 * screenshots are involved — thumbnails, upload progress and a remove control
 * need room, and a tester report is usually being copied from somewhere else
 * on screen. A modal gets that room and keeps the list where it was.
 *
 * Screenshots upload to Cloudinary the moment they're picked, not on submit:
 * an admin pasting three phone screenshots should find out immediately if one
 * fails, not after writing the whole report. The dialog therefore holds URLs,
 * and submitting is a plain JSON POST like it always was.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadToCloudinary } from "@/lib/storage/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_IMAGES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function NewIssueDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; description: string; images: string[] }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setImages([]);
    setUploading(0);
    setError("");
  }, []);

  // Escape closes, and the page behind must not scroll under the dialog —
  // same handling as the verification guide modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, saving]);

  if (!open) return null;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_IMAGES} screenshots.`);
      return;
    }

    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) {
      setError(`Only the first ${room} file${room === 1 ? "" : "s"} were added — the limit is ${MAX_IMAGES}.`);
    }

    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files can be attached.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is over 10 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const { url } = await uploadToCloudinary(file, "issue");
        // Content-addressed uploads mean picking the same screenshot twice
        // returns the same URL; storing it twice would render a duplicate.
        setImages((prev) => (prev.includes(url) ? prev : [...prev, url]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "That image could not be uploaded.");
      } finally {
        setUploading((n) => n - 1);
      }
    }

    // Lets the same file be re-picked after a failure — without this the input
    // holds the old value and change never fires again.
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    if (!title.trim() || !description.trim() || uploading > 0) return;
    setSaving(true);
    setError("");
    const ok = await onCreate({
      title: title.trim(),
      description: description.trim(),
      images,
    });
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    } else {
      setError("Could not create the issue. Check the details and try again.");
    }
  }

  const busy = saving || uploading > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses —
        // a drag that began inside the textarea must not close the dialog and
        // throw away a half-written report.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-issue-title"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-hairline bg-surface-card shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id="new-issue-title" className="text-base font-bold text-content">
            New issue
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-full p-1.5 text-content-muted transition-colors hover:bg-surface-subtle hover:text-content disabled:opacity-40"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="issue-title" className="text-xs font-bold text-content">
              Title
            </label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary — e.g. Chat fails to connect on iOS"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="issue-description" className="text-xs font-bold text-content">
              Description
            </label>
            <textarea
              id="issue-description"
              className="min-h-32 w-full rounded-xl border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-content shadow-none transition-colors placeholder:text-content-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, on which device, and what you expected instead…"
              maxLength={4000}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-content">
                Screenshots <span className="font-medium text-content-muted">· optional</span>
              </span>
              <span className="text-[0.6875rem] text-content-muted">
                {images.length}/{MAX_IMAGES}
              </span>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-hairline bg-surface-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Attached screenshot" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                      aria-label="Remove screenshot"
                      className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="surface"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={uploading > 0 || images.length >= MAX_IMAGES}
              className="self-start"
            >
              {uploading > 0 ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Uploading {uploading} image{uploading === 1 ? "" : "s"}…
                </>
              ) : (
                <>
                  <ImagePlus className="mr-1.5 size-4" />
                  {images.length ? "Add another" : "Add screenshots"}
                </>
              )}
            </Button>
          </div>

          {error && (
            <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={busy || !title.trim() || !description.trim()}
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Add issue
          </Button>
        </div>
      </div>
    </div>
  );
}
