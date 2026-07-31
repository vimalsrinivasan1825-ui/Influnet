"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Clock, XCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StreamChat } from "stream-chat";
import { apiFetch } from "@/lib/api-client";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";
import { useNotificationStore, NotificationItem } from "@/store/notification-store";
import { useAuthStore } from "@/store/auth-store";
import type { UserRole } from "@/types";

const THEME_CLASS: Record<UserRole, string> = {
  business_owner: "theme-brand",
  influencer: "theme-creator",
  admin: "theme-admin",
};

/**
 * Which notification types are worth interrupting someone for.
 *
 * 'message' is deliberately absent: Stream Chat already surfaces new messages
 * (badge, and the conversation itself if it's open), so a toast per chat
 * message would be a second, noisier copy of something the user can already
 * see. Everything else here is a state change on a deal that the user cannot
 * find out about any other way without reloading.
 *
 * Keys mirror NotificationType in @/lib/notify.
 */
const TOASTABLE: Record<string, string> = {
  collab_request: "New collaboration request",
  collab_accepted: "Request accepted",
  collab_declined: "Request declined",
  project_stage: "Project updated",
  project_cancel: "Project cancellation",
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, setUser, setToken, setLoading } = useAuthStore();
  const { summary, setSummary, setUnreadMessages, addNotification } = useNotificationStore();
  const [role, setRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the per-status dismissal of the verification banner. Keyed by status
  // so a later state change (e.g. rejected) surfaces a fresh banner.
  useEffect(() => {
    if (!approvalStatus) return;
    setBannerDismissed(localStorage.getItem(`influnet_verif_banner:${approvalStatus}`) === "1");
  }, [approvalStatus]);

  const dismissBanner = () => {
    if (approvalStatus) localStorage.setItem(`influnet_verif_banner:${approvalStatus}`, "1");
    setBannerDismissed(true);
  };

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
              // Must go through the RPC: migration 053 revoked direct selects on
              // business_profiles beyond (user_id, company_name, industry).
              const { data: bizJson } = await sb.rpc("get_own_business_profile");
              const biz = bizJson as { approval_status?: string } | null;

              if (biz?.approval_status) {
                setApprovalStatus(biz.approval_status);
              }
            }

            // No role-based redirect here any more: /dashboard renders the
            // right analytics view for both roles itself, so the shell no
            // longer needs to bounce creators to a separate URL. The old
            // /dashboard/influencer route redirects here server-side.
          }
        } else {
          localStorage.removeItem("influnet_user");
          setUser(null);
          setToken(null);
          router.push("/login");
          return;
        }

        setLoading(false);
        setIsLoaded(true);

        if (token) {
          const notifRes = await apiFetch<any>("/api/notifications/summary");
          if (notifRes.ok && notifRes.data) {
            // The message count is owned by the Stream effect below; the server
            // always returns 0 for it, so don't let this clobber a live count.
            setSummary({
              ...notifRes.data,
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

  // Read inside the realtime handler without making the subscription depend on
  // it — otherwise every navigation would tear down and rebuild the channel.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Same treatment, same reason. The effect below owns the Stream Chat
  // connection as well as the realtime channel, so anything in its dependency
  // list can force a chat reconnect. `router` is only ever used inside a toast
  // callback; listing it would let a router identity change disconnect and
  // re-establish the chat client for no reason at all.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

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
          const notif = payload.new as NotificationItem;
          addNotification(notif);
          refreshSummary();

          // An in-app toast is the only thing that tells someone already using
          // the app that the other side just moved. The bell count changing is
          // too quiet to notice; a push notification isn't delivered to a
          // foregrounded browser tab.
          const heading = TOASTABLE[notif.type];
          if (!heading) return; // 'message' and anything unknown: stay quiet.

          // Don't toast about the page they're already looking at — they can
          // see the change happen. Compare paths only, so a query string
          // (?conv=…) doesn't defeat the check.
          const target = notif.link ? notif.link.split("?")[0].split("#")[0] : null;
          if (target && target === pathnameRef.current) return;

          toast(notif.title || heading, {
            description: notif.body || undefined,
            duration: 6000,
            ...(notif.link
              ? {
                  action: {
                    label: "View",
                    onClick: () => routerRef.current.push(notif.link as string),
                  },
                }
              : {}),
          });
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

  // Soft verification banner for unapproved businesses. Dismissible, per status.
  //
  // `pending_review` no longer blocks anything: a business awaiting review can
  // reach out immediately, and the creator sees the sender's approval status on
  // the incoming request instead (see /api/collabs). Only `rejected` is refused
  // server-side — a real negative decision, not "hasn't been looked at yet".
  // Mirrored on mobile by <ApprovalBanner />.
  const showVerifBanner =
    isLoaded &&
    role === "business_owner" &&
    (approvalStatus === "pending_review" || approvalStatus === "rejected") &&
    !bannerDismissed;
  const isRejected = approvalStatus === "rejected";

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
          role={role}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1">
          {showVerifBanner && (
            <div className="px-4 pt-4 sm:px-6 lg:px-8">
              <div
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${
                  isRejected
                    ? "border-danger/20 bg-danger-soft"
                    : "border-warn/25 bg-warn-soft"
                }`}
              >
                <div
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    isRejected ? "bg-danger/10 text-danger" : "bg-warn/15 text-warn"
                  }`}
                >
                  {isRejected ? <XCircle className="size-5" /> : <Clock className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-content">
                    {isRejected ? "Your account wasn’t approved" : "Your profile is being verified"}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-content-soft">
                    {isRejected
                      ? "Our review team didn’t approve your business account. You can look around, but reaching out to creators is disabled. Think this is a mistake? Contact support and we’ll take another look."
                      : "You can reach out to creators right away — creators will see your account is still being reviewed by our team until it's approved, usually within 1–2 business days."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissBanner}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-lg p-1.5 text-content-muted transition-colors hover:bg-black/5 hover:text-content"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
