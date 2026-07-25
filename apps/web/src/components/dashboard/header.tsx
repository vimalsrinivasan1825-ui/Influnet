"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, Menu, MessageSquare, LogOut, Settings, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationStore } from "@/store/notification-store";
import { useAuthStore } from "@/store/auth-store";
import { Avatar } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import type { UserRole } from "@/types";

interface DashboardHeaderProps {
  userName: string;
  avatarUrl?: string | null;
  role?: UserRole | null;
  onOpenMobile: () => void;
}

export default function DashboardHeader({
  userName,
  avatarUrl,
  role = null,
  onOpenMobile,
}: DashboardHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const {
    summary,
    notifications,
    unread_notifications_count,
    setNotifications,
    markAsRead,
  } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);
  const [openPanel, setOpenPanel] = useState<"notif" | "user" | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      /* fall through — clear local state regardless */
    }
    logout();
    router.push("/login");
  };

  // The search affordance has always shown a "/" hint — wire it up. Ignored
  // while typing in a field so it never swallows a real slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<any[]>("/api/notifications");
        if (res.ok && Array.isArray(res.data)) {
          setNotifications(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      }
    })();
  }, [setNotifications]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !notifRef.current?.contains(t) &&
        !userRef.current?.contains(t)
      ) {
        setOpenPanel(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggleNotifications = async () => {
    const next = openPanel === "notif" ? null : "notif";
    setOpenPanel(next);
    if (next === "notif" && unread_notifications_count > 0) {
      const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length > 0) {
        markAsRead(unreadIds);
        try {
          await apiFetch("/api/notifications", {
            method: "PATCH",
            body: JSON.stringify({ action: "mark_read", notificationIds: unreadIds }),
          });
        } catch (err) {
          console.error("Failed to mark notifications as read", err);
        }
      }
    }
  };

  const unreadMessages = summary.unread_messages_count || 0;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-hairline bg-surface-card/85 px-3 backdrop-blur-xl sm:px-5">
      <button
        onClick={onOpenMobile}
        aria-label="Open menu"
        className="rounded-lg p-2 text-content-soft transition-colors hover:bg-surface-muted hover:text-content md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <p className="hidden text-sm text-content-soft sm:block">
        Welcome back,{" "}
        <span className="font-bold text-content">{userName}</span>
      </p>

      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="ml-auto hidden items-center gap-2 rounded-xl border border-hairline bg-surface-muted px-3 py-2 text-sm text-content-muted transition-colors hover:border-hairline-strong hover:text-content-soft lg:flex lg:w-64"
      >
        <Search className="size-4" />
        <span>Search…</span>
        <kbd className="ml-auto rounded border border-hairline-strong bg-surface-card px-1.5 py-0.5 text-[0.625rem] font-semibold">
          /
        </kbd>
      </button>

      {/* Mobile: the full bar doesn't fit, so just the icon. */}
      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="ml-auto rounded-xl p-2.5 text-content-soft transition-colors hover:bg-surface-muted hover:text-content lg:hidden"
      >
        <Search className="size-5" />
      </button>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} role={role} />

      <div className="ml-auto flex items-center gap-1 lg:ml-3">
        <Link
          href="/dashboard/messages"
          aria-label="Messages"
          className="relative rounded-xl p-2.5 text-content-soft transition-colors hover:bg-surface-muted hover:text-content"
        >
          <MessageSquare className="size-5" />
          {unreadMessages > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.5625rem] font-bold text-white">
              {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
          )}
        </Link>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotifications}
            aria-label="Notifications"
            className={cn(
              "relative rounded-xl p-2.5 transition-colors",
              openPanel === "notif"
                ? "bg-surface-muted text-content"
                : "text-content-soft hover:bg-surface-muted hover:text-content",
            )}
          >
            <Bell className="size-5" />
            {unread_notifications_count > 0 && (
              <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand-2 px-1 text-[0.5625rem] font-bold text-white">
                {unread_notifications_count > 9 ? "9+" : unread_notifications_count}
              </span>
            )}
          </button>

          {openPanel === "notif" && (
            <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <h3 className="text-sm font-bold text-content">Notifications</h3>
                {unread_notifications_count > 0 && (
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.625rem] font-bold text-brand-strong">
                    {unread_notifications_count} new
                  </span>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-content-muted">
                    You&rsquo;re all caught up.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <Link
                      key={n.id}
                      href={n.link || "#"}
                      onClick={() => setOpenPanel(null)}
                      className={cn(
                        "block border-b border-hairline px-4 py-3 transition-colors last:border-0 hover:bg-surface-muted",
                        !n.read_at && "bg-brand-soft/40",
                      )}
                    >
                      <p className="text-sm font-semibold text-content">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-content-soft">{n.body}</p>
                      <span className="mt-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-content-muted">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative ml-1 pl-2" ref={userRef}>
          <button
            onClick={() => setOpenPanel(openPanel === "user" ? null : "user")}
            className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-muted"
            aria-label="Account menu"
          >
            <Avatar name={userName} src={avatarUrl} size="sm" />
          </button>

          {openPanel === "user" && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                <Avatar name={userName} src={avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-content">{userName}</p>
                  <p className="text-xs text-content-muted">Signed in</p>
                </div>
              </div>
              <div className="p-1.5">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setOpenPanel(null)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-content-soft transition-colors hover:bg-surface-muted hover:text-content"
                >
                  <Settings className="size-4" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
