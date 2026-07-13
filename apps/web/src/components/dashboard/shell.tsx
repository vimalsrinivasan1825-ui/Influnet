"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StreamChat } from "stream-chat";
import { apiFetch } from "@/lib/api-client";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";
import { useNotificationStore, NotificationItem } from "@/store/notification-store";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";

const THEME_CLASS: Record<UserRole, string> = {
  business_owner: "theme-brand",
  influencer: "theme-creator",
  admin: "theme-admin",
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, token, setUser, setToken, setLoading } = useAuthStore();
  const { summary, setSummary, setUnreadMessages, addNotification } = useNotificationStore();
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the desktop collapse preference.
  useEffect(() => {
    setCollapsed(localStorage.getItem("influnet_sidebar_collapsed") === "1");
  }, []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("influnet_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    const sb = createClient();

    const loadSession = async () => {
      try {
        // Cached display info for instant paint; the token always comes from
        // the live Supabase session below, never from storage.
        const stored = localStorage.getItem("influnet_user");
        let token: string | null = null;

        if (stored) {
          const user = JSON.parse(stored);
          setUser(user);
          setRole(user.role);
          setUserName(user.name || "User");
          setAvatarUrl(user.avatarUrl || user.logoUrl || null);
        }

        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session) {
          token = session.access_token;
          setToken(token);

          const { data: profile } = await sb
            .from("profiles")
            .select("role, name")
            .eq("id", session.user.id)
            .single();

          if (profile) {
            const p = profile as { role: UserRole; name: string | null };
            setRole(p.role);
            setUserName(p.name || "User");
            setUser({ ...session.user, role: p.role, name: p.name } as any);

            if (p.role === "business_owner") {
              const { data: bizProfile } = await sb
                .from("business_profiles")
                .select("approval_status")
                .eq("user_id", session.user.id)
                .single();

              if (bizProfile) {
                const bp = bizProfile as { approval_status: string };
                setApprovalStatus(bp.approval_status);
              }
            }

            const currentPath = window.location.pathname;
            if (p.role === "influencer" && currentPath === "/dashboard") {
              router.push("/dashboard/influencer");
            } else if (
              p.role === "business_owner" &&
              currentPath === "/dashboard/influencer"
            ) {
              router.push("/dashboard");
            }
          }
        } else if (!stored) {
          router.push("/login");
          return;
        }

        setLoading(false);
        setIsLoaded(true);

        if (token) {
          const notifRes = await fetch("/api/notifications/summary", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (notifRes.ok) {
            const notifData = await notifRes.json();
            // The message count is owned by the Stream effect below; the server
            // always returns 0 for it, so don't let this clobber a live count.
            setSummary({
              ...notifData,
              unread_messages_count:
                useNotificationStore.getState().summary.unread_messages_count,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
        setLoading(false);
        setIsLoaded(true);
      }
    };

    loadSession();
  }, [router, setUser, setToken, setLoading, setSummary]);

  useEffect(() => {
    if (!user?.id || !token) return;
    const sb = createClient();

    let streamClient: StreamChat | null = null;
    let cancelled = false;

    // Refresh the notification + pending-request counts from our API, while
    // preserving the Stream-owned message count so it isn't stomped by the
    // server's hardcoded 0.
    const refreshSummary = async () => {
      try {
        const notifRes = await apiFetch<any>("/api/notifications/summary");
        if (notifRes.ok && notifRes.data) {
          setSummary({
            ...notifRes.data,
            unread_messages_count:
              useNotificationStore.getState().summary.unread_messages_count,
          });
        }
      } catch (err) {
        console.error("Failed to update notifications summary:", err);
      }
    };

    // Push the live Stream unread total into the store. Prefer the count on the
    // event payload, falling back to the connected user's tracked total.
    const syncMessageCount = (event?: { total_unread_count?: number }) => {
      const count =
        event?.total_unread_count ??
        (streamClient?.user as { total_unread_count?: number } | undefined)
          ?.total_unread_count ??
        0;
      setUnreadMessages(count);
    };

    const channel = sb
      .channel("global-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          addNotification(payload.new as NotificationItem);
          refreshSummary();
        },
      )
      .subscribe();

    const initStream = async () => {
      try {
        const streamKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
        if (!streamKey) return;

        streamClient = StreamChat.getInstance(streamKey);

        // The Stream client is a shared singleton (the Messages page uses it
        // too). Only (re)connect if it isn't already this user — but ALWAYS
        // attach the listeners and do an initial read below, so the badge stays
        // live even when the connection was opened elsewhere.
        if (streamClient.userID !== user.id) {
          const res = await apiFetch<{ token: string }>("/api/stream/token", {
            method: "POST",
          });
          if (!res.ok || !res.data?.token) return;
          if (streamClient.userID) await streamClient.disconnectUser();
          await streamClient.connectUser({ id: user.id }, res.data.token);
        }
        if (cancelled) return;

        // Reconcile the badge with the real unread total right after connecting,
        // so pre-existing unread messages show up without opening the module.
        syncMessageCount();

        streamClient.on("notification.message_new", syncMessageCount);
        streamClient.on("notification.mark_read", syncMessageCount);
        streamClient.on("message.new", syncMessageCount);
        streamClient.on("message.read", syncMessageCount);
      } catch (err) {
        console.error("Failed to init Stream Chat for notifications:", err);
      }
    };
    initStream();

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
      if (streamClient) {
        streamClient.off("notification.message_new", syncMessageCount);
        streamClient.off("notification.mark_read", syncMessageCount);
        streamClient.off("message.new", syncMessageCount);
        streamClient.off("message.read", syncMessageCount);
        // Do NOT disconnectUser here: the Messages page shares this singleton
        // connection, and disconnecting would break its live chat.
      }
    };
  }, [user?.id, token, setSummary, setUnreadMessages, addNotification]);

  const themeClass = role ? THEME_CLASS[role] : "theme-brand";

  // Gate screen for unapproved businesses (pending review or rejected).
  if (
    isLoaded &&
    role === "business_owner" &&
    (approvalStatus === "pending_review" || approvalStatus === "rejected")
  ) {
    const isRejected = approvalStatus === "rejected";
    return (
      <div className={`${themeClass} flex min-h-screen items-center justify-center bg-surface px-4`}>
        <div className="w-full max-w-md text-center">
          <div
            className={`mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border ${
              isRejected
                ? "border-danger/20 bg-danger-soft text-danger"
                : "border-warn/20 bg-warn-soft text-warn"
            }`}
          >
            {isRejected ? <XCircle className="size-8" /> : <Clock className="size-8" />}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-content">
            {isRejected ? "Account not approved" : "Account under review"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-content-soft">
            {isRejected
              ? "Your business account wasn't approved by our review team. If you think this is a mistake, contact support and we'll take another look."
              : "Our team is reviewing your business account. You'll get dashboard access as soon as it's approved — usually within 1–2 business days."}
          </p>
          <div
            className={`mx-auto mt-5 max-w-sm rounded-xl border px-4 py-3 text-sm font-semibold ${
              isRejected
                ? "border-danger/20 bg-danger-soft text-danger"
                : "border-warn/20 bg-warn-soft text-warn"
            }`}
          >
            {isRejected
              ? "Status: Rejected — contact support for help."
              : "Status: Pending review — we'll email you once approved."}
          </div>
          <div className="mt-6">
            <Button
              variant="surface"
              size="xl"
              onClick={async () => {
                await createClient().auth.signOut();
                localStorage.clear();
                router.push("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`${themeClass} flex min-h-screen items-center justify-center bg-surface`}>
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/influet_logo.png"
            alt=""
            width={44}
            height={44}
            className="size-11 animate-pulse"
          />
          <p className="text-sm font-medium text-content-muted">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClass} flex min-h-screen bg-surface text-content`}>
      <DashboardSidebar
        role={role || "influencer"}
        unreadMessages={summary.unread_messages_count || 0}
        pendingRequests={summary.pending_requests_count || 0}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          userName={userName}
          avatarUrl={avatarUrl}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
