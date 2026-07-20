"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FolderKanban,
  History,
  Home,
  LayoutDashboard,
  MessageSquare,
  Search,
  Send,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface Item {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: "Go to" | "Projects" | "People";
  icon?: React.ElementType;
  avatar?: string;
}

const sections = (role: UserRole | null): Item[] => {
  const dashboardHref = role === "influencer" ? "/dashboard/influencer" : "/dashboard";
  const base: Item[] = [
    { id: "s-home", label: "Home", href: "/dashboard/home", group: "Go to", icon: Home },
    { id: "s-dash", label: "Dashboard", href: dashboardHref, group: "Go to", icon: LayoutDashboard },
    { id: "s-profile", label: "Public profile", href: "/dashboard/profile", group: "Go to", icon: UserRound },
    { id: "s-msg", label: "Messages", href: "/dashboard/messages", group: "Go to", icon: MessageSquare },
    { id: "s-req", label: "Requests", href: "/dashboard/requests", group: "Go to", icon: Send },
    { id: "s-proj", label: "Projects", href: "/dashboard/projects", group: "Go to", icon: FolderKanban },
    { id: "s-conn", label: "Connections", href: "/dashboard/connections", group: "Go to", icon: Users },
    { id: "s-act", label: "My activity", href: "/dashboard/activity", group: "Go to", icon: History },
    { id: "s-set", label: "Settings", href: "/dashboard/settings", group: "Go to", icon: Settings },
  ];
  if (role === "business_owner") {
    base.splice(6, 0, {
      id: "s-disc",
      label: "Discover creators",
      href: "/dashboard/discover",
      group: "Go to",
      icon: Search,
    });
  }
  return base;
};

/**
 * Search across the app: jump to a section, or find one of your own projects or
 * collaborators by name.
 *
 * Scoped deliberately to things the signed-in user already has access to — it
 * reuses the existing projects/conversations endpoints rather than exposing a
 * new platform-wide search surface.
 */
export function CommandPalette({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: UserRole | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [records, setRecords] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Your own data is fetched once per open-session and reused while typing.
  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const [projRes, convRes] = await Promise.all([
        apiFetch<{ projects: any[] }>("/api/projects"),
        apiFetch<{ conversations: any[]; projects: any[] }>("/api/conversations"),
      ]);

      const items: Item[] = [];

      for (const p of projRes.data?.projects ?? []) {
        items.push({
          id: `p-${p.id}`,
          label: p.title,
          sub: [p.status, p.budget ? `₹${Number(p.budget).toLocaleString("en-IN")}` : null]
            .filter(Boolean)
            .join(" · "),
          href: `/dashboard/projects/${p.id}`,
          group: "Projects",
          icon: FolderKanban,
        });
      }

      // The conversations payload includes YOU as a participant, so the other
      // party has to be picked by id — otherwise you appear in your own results.
      const {
        data: { user },
      } = await createClient().auth.getUser();

      const seen = new Set<string>();
      for (const c of convRes.data?.conversations ?? []) {
        const other = c.participants?.find((x: any) => x.user_id !== user?.id);
        const name = other?.profile?.name;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        items.push({
          id: `c-${c.id}`,
          label: name,
          sub: "Open conversation",
          href: `/dashboard/messages?conv=${c.id}`,
          group: "People",
          avatar: name,
        });
      }

      setRecords(items);
      setLoaded(true);
    })();
  }, [open, loaded]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after paint so the dialog is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const pool = [...sections(role), ...records];
    const q = query.trim().toLowerCase();
    if (!q) return pool.filter((i) => i.group === "Go to").slice(0, 8);
    return pool
      .filter(
        (i) => i.label.toLowerCase().includes(q) || (i.sub ?? "").toLowerCase().includes(q),
      )
      // Prefix matches first — typing "pro" should surface "Projects" above a
      // project that merely contains the word.
      .sort((a, b) => {
        const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 12);
  }, [query, records, role]);

  useEffect(() => setCursor(0), [query]);

  const go = useCallback(
    (item: Item) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll("[data-row]")
      [cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-content/40 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <Search className="size-4 shrink-0 text-content-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search sections, projects and people…"
            className="w-full bg-transparent text-sm text-content outline-none placeholder:text-content-muted"
          />
          <kbd className="rounded border border-hairline-strong bg-surface-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-content-muted">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-content-muted">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((item, i) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {showGroup && (
                    <div className="px-3 pb-1 pt-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-content-muted">
                      {item.group}
                    </div>
                  )}
                  <button
                    data-row
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                      i === cursor ? "bg-brand-soft" : "hover:bg-surface-muted",
                    )}
                  >
                    {item.avatar ? (
                      <Avatar name={item.avatar} size="sm" />
                    ) : (
                      Icon && (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-content-soft">
                          <Icon className="size-4" />
                        </span>
                      )
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-content">
                        {item.label}
                      </span>
                      {item.sub && (
                        <span className="block truncate text-xs text-content-muted">{item.sub}</span>
                      )}
                    </span>
                    {i === cursor && <ArrowRight className="size-3.5 shrink-0 text-brand" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
