"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Email opt-outs, per category.
 *
 * The unsubscribe link in every activity email points here, so this screen has
 * to be able to express everything that link can do — otherwise "manage all
 * email settings" is a dead end and people reach for the spam button instead.
 *
 * Account and security email is deliberately absent: it cannot be switched off,
 * and showing a disabled toggle for it invites the support ticket rather than
 * preventing it.
 */

type Category = "collab" | "project" | "payment" | "message" | "marketing";

const ROWS: Array<{ key: Category; title: string; description: string }> = [
  {
    key: "collab",
    title: "Collaboration requests",
    description: "Someone wants to work with you, accepted your request, or a request is about to expire.",
  },
  {
    key: "project",
    title: "Project updates",
    description: "A stage moved, it's your turn to act, or a project completed.",
  },
  {
    key: "payment",
    title: "Payments",
    description: "A payment cleared or failed on one of your projects.",
  },
  {
    key: "message",
    title: "Messages",
    description: "Unread chat messages. Rolled up — at most one per conversation per hour.",
  },
  {
    key: "marketing",
    title: "Product updates",
    description: "New features and tips. Off unless you turn it on.",
  },
];

const DEFAULTS: Record<Category, boolean> = {
  collab: true,
  project: true,
  payment: true,
  message: true,
  marketing: false,
};

export function EmailPreferencesPanel() {
  const [prefs, setPrefs] = useState<Record<Category, boolean> | null>(null);
  const [saving, setSaving] = useState<Category | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch<{ preferences: Record<Category, boolean>; migration_pending?: boolean }>(
        "/api/profile/email-preferences",
      );
      setPrefs(res.data?.preferences ?? DEFAULTS);
      setPending(!!res.data?.migration_pending);
    })();
  }, []);

  async function toggle(key: Category, next: boolean) {
    if (!prefs) return;
    const previous = prefs;
    // Optimistic: a toggle that waits for a round trip feels broken.
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);

    const res = await apiFetch<{ preferences: Record<Category, boolean> }>("/api/profile/email-preferences", {
      method: "PATCH",
      body: JSON.stringify({ [key]: next }),
    });
    setSaving(null);

    if (!res.ok) {
      setPrefs(previous);
      toast.error(res.error || "Could not save that — please try again.");
      return;
    }
    if (res.data?.preferences) setPrefs(res.data.preferences);
  }

  if (!prefs) {
    return (
      <div className="flex flex-col gap-3">
        {ROWS.map((r) => (
          <Skeleton key={r.key} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {pending && (
        <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          These settings are not being saved yet — the database is missing migration 100. Ask an admin to apply it.
        </p>
      )}

      {ROWS.map((row, i) => (
        <div
          key={row.key}
          className={`flex items-start justify-between gap-4 py-4 ${i > 0 ? "border-t border-hairline" : ""}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content">{row.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{row.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {saving === row.key && <Loader2 className="size-3.5 animate-spin text-content-muted" />}
            <Switch
              checked={prefs[row.key]}
              onCheckedChange={(next) => void toggle(row.key, next)}
              disabled={saving !== null}
              label={row.title}
            />
          </div>
        </div>
      ))}

      <p className="mt-4 flex items-start gap-2 border-t border-hairline pt-4 text-xs text-content-muted">
        <Mail className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Account and security email — password resets, email confirmation, verification results — is always sent and
          cannot be turned off.
        </span>
      </p>
    </div>
  );
}
