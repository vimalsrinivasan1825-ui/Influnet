"use client";

/**
 * Opt-out for admin broadcasts, per category (migration 157).
 *
 * Transactional notifications are deliberately absent: a stage change, a
 * payment or a message is the product working, not marketing, and hiding those
 * behind a switch is how people miss money.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type Category = "announcements" | "promotions" | "tips";

const CATEGORIES: { key: Category; title: string; hint: string }[] = [
  { key: "announcements", title: "Product announcements", hint: "New features and important changes" },
  { key: "promotions", title: "Offers", hint: "Discounts and Pro offers" },
  { key: "tips", title: "Tips and guides", hint: "Ideas for getting more out of Influnet" },
];

type Prefs = Record<string, { push: boolean; email: boolean }>;

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch<{ preferences: Prefs }>("/api/profile/notification-preferences");
      setPrefs(res.ok ? (res.data?.preferences ?? {}) : {});
    })();
  }, []);

  const set = useCallback(async (category: Category, patch: { push?: boolean; email?: boolean }) => {
    setPrefs((p) => ({ ...(p ?? {}), [category]: { ...(p?.[category] ?? { push: true, email: true }), ...patch } }));
    const res = await apiFetch("/api/profile/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ category, ...patch }),
    });
    if (!res.ok) {
      // Put the switch back where it was.
      setPrefs((p) => ({
        ...(p ?? {}),
        [category]: { ...(p?.[category] ?? { push: true, email: true }), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, !v])) },
      }));
    }
  }, []);

  if (!prefs) return <Skeleton className="h-28 w-full rounded-xl" />;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-end gap-6 pb-1 pr-1 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-content-muted">
        <span className="w-10 text-center">App</span>
        <span className="w-10 text-center">Email</span>
      </div>
      {CATEGORIES.map((c) => {
        const value = prefs[c.key] ?? { push: true, email: true };
        return (
          <div key={c.key} className="flex items-center justify-between gap-4 border-b border-hairline py-3 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content">{c.title}</p>
              <p className="text-xs text-content-muted">{c.hint}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex w-10 justify-center">
                <Switch checked={value.push} onCheckedChange={(on) => set(c.key, { push: on })} label={`${c.title} in the app`} />
              </div>
              <div className="flex w-10 justify-center">
                <Switch checked={value.email} onCheckedChange={(on) => set(c.key, { email: on })} label={`${c.title} by email`} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="mt-2 text-xs text-content-muted">
        Messages, project updates and payment alerts always come through — those are the product working.
      </p>
    </div>
  );
}
