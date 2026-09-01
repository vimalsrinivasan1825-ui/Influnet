"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { StreamChat } from "stream-chat";
import {
  Chat,
  Channel,
  MessageList,
  MessageComposer,
  Window,
  ChannelHeader,
} from "stream-chat-react";
import "stream-chat-react/dist/css/index.css";
import { MessageSquare, Plus, FolderKanban, MoreVertical, Pin, PinOff, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { DealPanel } from "@/components/dashboard/deal-panel";
import { cn } from "@/lib/utils";

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

interface Participant {
  user_id: string;
  profile?: { user_id?: string; name?: string; avatar_url?: string | null };
}
interface Conversation {
  id: string;
  participants?: Participant[];
  messages?: { body?: string; content?: string }[];
  /** The caller's own pin state — /api/conversations sets this per row. */
  pinned?: boolean;
  updated_at?: string;
}
interface ProjectConversation {
  project_id: string;
  conversation_id?: string | null;
  title: string;
  partner?: { id?: string; name?: string; company_name?: string; username?: string; avatar_url?: string | null };
}

// ── Stream Connection Hook ──────────────────────────────────────────
function useStreamConnect(userId: string | null) {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const clientRef = useRef<StreamChat | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const connect = async () => {
      setStatus("connecting");
      try {
        const c = StreamChat.getInstance(STREAM_KEY);
        if (c.userID === userId) {
          clientRef.current = c;
          if (!cancelled) {
            setClient(c);
            setStatus("connected");
          }
          return;
        }
        if (c.userID) await c.disconnectUser();

        const res = await apiFetch<{ token: string; name?: string }>("/api/stream/token", {
          method: "POST",
        });
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to get Stream token");
        const data = res.data;

        await c.connectUser({ id: userId, name: data.name || "User" }, data.token);
        clientRef.current = c;
        if (!cancelled) {
          setClient(c);
          setStatus("connected");
        }
      } catch (err) {
        console.error("[Stream] Connection failed:", err);
        if (!cancelled) setStatus("error");
      }
    };

    connect();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { client, status };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-content-muted">
      {children}
    </div>
  );
}

// ── Main Messages Content ───────────────────────────────────────────
function MessagesContent() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [, setActiveChannelId] = useState<string | null>(null);
  const [, setActiveProjectTitle] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpenConv, setMenuOpenConv] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeChannel, setActiveChannel] = useState<ReturnType<StreamChat["channel"]> | null>(null);
  // Who this conversation is with, resolved from our own tables. The Stream
  // channel name is shared by both members, so it can never be the partner's
  // name — that is what made each side see themselves in the header.
  const [activePartner, setActivePartner] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  const { client: streamClient, status: streamStatus } = useStreamConnect(userId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenConv(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (user) setUserId(user.id);
      await fetchConversations();
      setLoading(false);
    })();
  }, []);

  // Deep-link from a notification (?conv=…). This has to wait for BOTH the
  // conversation list and the Stream client: openConversation() resolves the
  // other participant from `conversations`, so firing it on mount — while the
  // list was still empty — selected nothing and left the pane stuck on
  // "Loading conversation…" with no clue which chat was meant.
  const deepLinked = useRef<string | null>(null);
  useEffect(() => {
    const convFromUrl = searchParams.get("conv");
    if (!convFromUrl || loading || !streamClient) return;
    if (deepLinked.current === convFromUrl) return;

    const conv = conversations.find((c) => c.id === convFromUrl);
    const project = projects.find((p) => p.conversation_id === convFromUrl);
    const otherId =
      conv?.participants?.find((p) => p.user_id !== userId)?.user_id ?? project?.partner?.id;
    if (!conv && !project) return; // list not settled yet, or not ours

    deepLinked.current = convFromUrl;
    const other = conv?.participants?.find((p) => p.user_id !== userId)?.profile;
    openConversation(convFromUrl, otherId, project?.title || other?.name || "Chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, streamClient, conversations, projects, userId]);

  useEffect(() => {
    if (!streamClient || (conversations.length === 0 && projects.length === 0)) return;

    const userIds = new Set<string>();
    conversations.forEach((c) => {
      const other = c.participants?.find((p) => p.user_id !== userId);
      if (other?.user_id) userIds.add(other.user_id);
    });
    projects.forEach((p) => {
      if (p.partner?.id) userIds.add(p.partner.id);
    });

    const usersToQuery = Array.from(userIds);
    if (usersToQuery.length === 0) return;

    const initPresence = async () => {
      try {
        const res = await streamClient.queryUsers({ id: { $in: usersToQuery } }, { id: 1 }, { presence: true });
        const initOnline: Record<string, boolean> = {};
        res.users.forEach((u) => {
          initOnline[u.id] = !!u.online;
        });
        setOnlineUsers((prev) => ({ ...prev, ...initOnline }));
      } catch (e) {
        console.error("Failed to query user presence:", e);
      }
    };
    initPresence();

    const handlePresence = (e: any) => {
      if (e.user && e.user.id) {
        setOnlineUsers((prev) => ({ ...prev, [e.user.id]: !!e.user.online }));
      }
    };

    streamClient.on("user.presence.changed", handlePresence);
    return () => {
      streamClient.off("user.presence.changed", handlePresence);
    };
  }, [streamClient, conversations, projects, userId]);

  const fetchConversations = async () => {
    try {
      const res = await apiFetch<{ conversations: Conversation[]; projects: ProjectConversation[] }>(
        "/api/conversations",
      );
      if (res.ok && res.data) {
        // Pinned first, then whatever order the route returned (newest activity).
        const convs = [...(res.data.conversations || [])].sort(
          (a, b) => Number(!!b.pinned) - Number(!!a.pinned),
        );
        setConversations(convs);
        setProjects(res.data.projects || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const ensureChannel = async (convId: string, otherUserId: string) => {
    if (!streamClient) return null;
    const channelId = `conv_${convId}`;
    await apiFetch("/api/stream/channel", {
      method: "POST",
      body: JSON.stringify({ conversationId: convId, otherUserId }),
    });
    const channel = streamClient.channel("messaging", channelId);
    await channel.watch();
    return channel;
  };

  const openConversation = async (convId: string, otherUserId?: string, title?: string) => {
    setActiveConvId(convId);
    if (title) setActiveProjectTitle(title);

    const conv = conversations.find((c) => c.id === convId);
    const otherProfile = conv?.participants?.find((p) => p.user_id !== userId)?.profile;
    const projectPartner = projects.find((p) => p.conversation_id === convId)?.partner;
    setActivePartner(
      otherProfile?.name || projectPartner?.company_name || projectPartner?.name || null,
    );

    if (!otherUserId) {
      otherUserId = conv?.participants?.find((p) => p.user_id !== userId)?.user_id;
    }
    if (streamClient && otherUserId) {
      try {
        const channel = await ensureChannel(convId, otherUserId);
        if (channel) {
          setActiveChannel(channel);
          setActiveChannelId(`messaging:conv_${convId}`);
        }
      } catch (err) {
        console.error("[Stream] Failed to open channel:", err);
      }
    }
  };

  const startProjectConversation = async (project: ProjectConversation) => {
    if (project.conversation_id) {
      openConversation(project.conversation_id, project.partner?.id, project.title);
      return;
    }
    const partnerId = project.partner?.id;
    if (!partnerId) return;
    try {
      const res = await apiFetch<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ other_user_id: partnerId }),
      });
      if (res.ok && res.data?.conversation) {
        setActiveProjectTitle(project.title);
        await fetchConversations();
        openConversation(res.data.conversation.id, partnerId, project.title);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const togglePin = async (convId: string, next: boolean) => {
    setMenuOpenConv(null);
    const res = await apiFetch(`/api/conversations/${convId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: next }),
    });
    if (!res.ok) {
      toast.error(res.error || "Could not update the pin.");
      return;
    }
    await fetchConversations();
  };

  const deleteConversation = async (convId: string) => {
    setMenuOpenConv(null);
    try {
      const res = await apiFetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (res.ok) {
        if (activeConvId === convId) {
          setActiveConvId(null);
          setActiveChannelId(null);
          setActiveChannel(null);
          setActiveProjectTitle(null);
          setActivePartner(null);
        }
        await fetchConversations();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-surface">
        <Loader2 className="size-7 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-surface">
      {/* Sidebar — full-width on mobile; hides when a conversation is open so
          the chat gets the whole screen (single-pane). Two-pane on md+. */}
      <div
        className={cn(
          "flex w-full max-w-[20rem] shrink-0 flex-col border-r border-hairline bg-surface-card max-md:max-w-none",
          activeConvId && "max-md:hidden",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-base font-extrabold tracking-tight text-content">Messages</h2>
          {streamStatus === "connecting" && <Loader2 className="size-3.5 animate-spin text-content-muted" />}
        </div>

        <div ref={menuRef} className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
          {streamStatus === "error" && (
            <div className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
              Chat connection issue — messages may not update in real time.
            </div>
          )}

          {/* Active projects */}
          {projects.length > 0 && (
            <>
              <SectionLabel>Active projects</SectionLabel>
              {projects.map((p) => (
                <button
                  key={`project-${p.project_id}`}
                  onClick={() => startProjectConversation(p)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                    activeConvId === p.conversation_id ? "bg-brand-soft" : "hover:bg-surface-muted",
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
                    <FolderKanban className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-[0.8125rem] font-bold text-content">{p.title}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-[0.6875rem] font-medium text-content-soft">
                        {p.partner?.company_name || p.partner?.name || p.partner?.username || "Partner"}
                        {p.conversation_id ? " · Active" : " · Start chat"}
                      </span>
                      {p.partner?.id && onlineUsers[p.partner.id] && (
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" title="Online" />
                      )}
                    </span>
                  </span>
                  {!p.conversation_id && <Plus className="size-3.5 shrink-0 text-brand" />}
                </button>
              ))}
              <div className="mx-2 my-1 h-px bg-hairline" />
            </>
          )}

          {/* Chats */}
          {conversations.length === 0 && projects.length === 0 ? (
            <div className="rounded-xl bg-surface-muted px-5 py-8 text-center text-sm font-semibold text-content-muted">
              <MessageSquare className="mx-auto mb-2 size-6 opacity-40" />
              No conversations yet
            </div>
          ) : (
            <>
              {conversations.length > 0 && (
                <SectionLabel>{conversations.some((c) => c.pinned) ? "Pinned" : "Chats"}</SectionLabel>
              )}
              {conversations.map((c, i) => {
                const other = c.participants?.find((p) => p.user_id !== userId)?.profile;
                const isActive = activeConvId === c.id;
                const isMenuOpen = menuOpenConv === c.id;
                const lastMsg = c.messages?.[c.messages.length - 1];
                const firstUnpinned =
                  !c.pinned && i > 0 && !!conversations[i - 1]?.pinned;
                return (
                  <div key={c.id} className="contents">
                  {firstUnpinned && <SectionLabel>Chats</SectionLabel>}
                  <div
                    className={cn(
                      "group relative flex items-center rounded-xl",
                      isActive && "bg-brand-soft",
                    )}
                  >
                    <button
                      onClick={() => openConversation(c.id, other?.user_id, other?.name || "Chat")}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
                    >
                      <div className="relative">
                        <Avatar name={other?.name} src={other?.avatar_url} size="sm" />
                        {other?.user_id && onlineUsers[other.user_id] && (
                          <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-card bg-brand" title="Online" />
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 truncate text-[0.8125rem] font-bold text-content">
                          {c.pinned && <Pin className="size-3 shrink-0 text-content-muted" />}
                          <span className="truncate">{other?.name || "Unknown"}</span>
                        </span>
                        <span className="block truncate text-[0.6875rem] font-medium text-content-soft">
                          {lastMsg ? lastMsg.body || lastMsg.content || "" : "No messages yet"}
                        </span>
                      </span>
                    </button>

                    <div className="relative shrink-0 pr-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenConv(isMenuOpen ? null : c.id);
                        }}
                        className={cn(
                          "rounded-md p-1.5 text-content-muted transition-opacity hover:text-content",
                          isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <MoreVertical className="size-3.5" />
                      </button>
                      {isMenuOpen && (
                        <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[9rem] overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-[var(--shadow-pop)]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(c.id, !c.pinned);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-content transition-colors hover:bg-surface-muted"
                          >
                            {c.pinned ? (
                              <>
                                <PinOff className="size-3.5" /> Unpin
                              </>
                            ) : (
                              <>
                                <Pin className="size-3.5" /> Pin to top
                              </>
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(c.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft"
                          >
                            <Trash2 className="size-3.5" /> Delete chat
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Chat area — on mobile it's hidden until a conversation is open, then
          fills the screen. Always visible alongside the list on md+. */}
      <div
        className={cn(
          "str-chat flex min-w-0 flex-1 flex-col bg-surface-card",
          !activeConvId && "max-md:hidden",
        )}
      >
        {activeConvId && (
          <button
            onClick={() => setActiveConvId(null)}
            className="flex items-center gap-2 border-b border-hairline px-4 py-3 text-sm font-semibold text-content-soft transition-colors hover:text-content md:hidden"
          >
            <ArrowLeft className="size-4" /> Back to conversations
          </button>
        )}
        {/* The deal card rides above the chat: the request that started this
            conversation, and the accept → negotiate → propose → start-project
            steps, so nothing about the deal happens off-screen. */}
        {activeConvId && (
          <DealPanel
            key={activeConvId}
            conversationId={activeConvId}
            onProjectCreated={fetchConversations}
          />
        )}
        {!activeConvId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <MessageSquare className="size-7" />
            </span>
            <p className="text-sm font-bold text-content">Select a conversation</p>
            <p className="mt-1 text-xs text-content-muted">Choose a project or chat from the sidebar.</p>
          </div>
        ) : streamStatus === "connecting" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 animate-spin text-brand" />
            <p className="text-sm font-semibold text-content-soft">Connecting…</p>
          </div>
        ) : streamClient && activeChannel ? (
          <Chat client={streamClient}>
            <Channel channel={activeChannel}>
              <Window>
                {/* Title comes from our data, not the channel, so each side
                    sees the OTHER person. Falls back to a neutral label rather
                    than undefined — that would let Stream fall through to the
                    shared channel name, which is exactly the poisoned value
                    this fix exists to bypass on already-created channels. */}
                <ChannelHeader title={activePartner ?? "Chat"} />
                <MessageList />
                <MessageComposer />
              </Window>
            </Channel>
          </Chat>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 animate-spin text-brand" />
            <p className="text-sm font-semibold text-content-soft">Loading conversation…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-surface">
          <div className="size-8 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
