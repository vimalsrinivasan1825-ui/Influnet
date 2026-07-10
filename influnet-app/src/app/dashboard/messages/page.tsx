'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StreamChat } from 'stream-chat';
import {
  Chat,
  Channel,
  MessageList,
  MessageComposer,
  Window,
  ChannelHeader,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/index.css';
import {
  MessageSquare,
  Plus,
  FolderKanban,
  MoreVertical,
  Trash2,
  Loader2,
} from 'lucide-react';

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

// ── Stream Connection Hook ──────────────────────────────────────────
function useStreamConnect(userId: string | null) {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const clientRef = useRef<StreamChat | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const connect = async () => {
      setStatus('connecting');
      try {
        const c = StreamChat.getInstance(STREAM_KEY);

        // If already connected as this user, reuse
        if (c.userID === userId) {
          clientRef.current = c;
          if (!cancelled) {
            setClient(c);
            setStatus('connected');
          }
          return;
        }

        // Disconnect previous user if different
        if (c.userID) {
          await c.disconnectUser();
        }

        const res = await fetch('/api/stream/token', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to get Stream token');
        const data = await res.json();

        await c.connectUser({ id: userId, name: data.name || 'User' }, data.token);
        clientRef.current = c;

        if (!cancelled) {
          setClient(c);
          setStatus('connected');
        }
      } catch (err) {
        console.error('[Stream] Connection failed:', err);
        if (!cancelled) setStatus('error');
      }
    };

    connect();

    return () => { cancelled = true; };
  }, [userId]);

  return { client, status };
}



// ── Main Messages Content ───────────────────────────────────────────
function MessagesContent() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeProjectTitle, setActiveProjectTitle] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpenConv, setMenuOpenConv] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeChannel, setActiveChannel] = useState<any>(null);

  const { client: streamClient, status: streamStatus } = useStreamConnect(userId);
  const supabase = createClient();

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenConv(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Init user
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user) setUserId(user.id);
      await fetchConversations();
      setLoading(false);
    })();
  }, []);

  // Set active conversation from URL param
  useEffect(() => {
    const convFromUrl = searchParams.get('conv');
    if (convFromUrl) {
      openConversation(convFromUrl);
    }
  }, [searchParams]);

  const fetchConversations = async () => {
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setProjects(data.projects || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Build Stream channel from a conversation
  const ensureChannel = async (convId: string, otherUserId: string, channelName?: string) => {
    if (!streamClient) return null;

    const channelId = `conv_${convId}`;

    // Ensure channel exists on server
    await fetch('/api/stream/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: convId,
        otherUserId,
        channelName: channelName || 'Chat',
      }),
    });

    // Get or create the channel client-side
    const channel = streamClient.channel('messaging', channelId);
    await channel.watch();
    return channel;
  };

  const openConversation = async (
    convId: string,
    otherUserId?: string,
    title?: string,
  ) => {
    setActiveConvId(convId);
    if (title) setActiveProjectTitle(title);

    // Find other user from conversations if not provided
    if (!otherUserId) {
      const conv = conversations.find((c) => c.id === convId);
      const other = conv?.participants?.find((p: any) => p.user_id !== userId);
      otherUserId = other?.user_id;
    }
    if (streamClient && otherUserId) {
      try {
        const channel = await ensureChannel(convId, otherUserId, title || 'Chat');
        if (channel) {
          setActiveChannel(channel);
          setActiveChannelId(`messaging:conv_${convId}`);
        }
      } catch (err) {
        console.error('[Stream] Failed to open channel:', err);
      }
    }
  };

  const startProjectConversation = async (project: any) => {
    if (project.conversation_id) {
      openConversation(
        project.conversation_id,
        project.partner?.id,
        project.title,
      );
      return;
    }

    const partnerId = project.partner?.id;
    if (!partnerId) return;

    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ other_user_id: partnerId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setActiveProjectTitle(project.title);
          await fetchConversations();
          openConversation(data.conversation.id, partnerId, project.title);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteConversation = async (convId: string) => {
    setMenuOpenConv(null);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        if (activeConvId === convId) {
          setActiveConvId(null);
          setActiveChannelId(null);
          setActiveChannel(null);
          setActiveProjectTitle(null);
        }
        await fetchConversations();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Loading
  if (loading) {
    return (
      <div
        style={{
          height: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafb',
        }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: '#ee3e96' }} />
      </div>
    );
  }



  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        overflow: 'hidden',
        background: '#fafafb',
        fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid #f1f5f9',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 16px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
            Messages
          </h2>
          {streamStatus === 'connecting' && (
            <Loader2 size={14} className="animate-spin" style={{ color: '#94a3b8' }} />
          )}
        </div>
        <div
          ref={menuRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {streamStatus === 'error' && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Chat connection issue — messages may not update in real-time
            </div>
          )}

          {/* Active Projects */}
          {projects.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  padding: '8px 8px 4px',
                }}
              >
                Active Projects
              </div>
              {projects.map((p) => (
                <button
                  key={`project-${p.project_id}`}
                  onClick={() => startProjectConversation(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: activeConvId === p.conversation_id ? '#fdf2f8' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (activeConvId !== p.conversation_id)
                      (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (activeConvId !== p.conversation_id)
                      (e.currentTarget as HTMLElement).style.background = '#fff';
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: '#f0fdf4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#16a34a',
                      flexShrink: 0,
                    }}
                  >
                    <FolderKanban size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                      {p.partner?.company_name || p.partner?.name || p.partner?.username || 'Partner'}
                      {p.conversation_id ? ' · Active' : ' · Start chat'}
                    </div>
                  </div>
                  {!p.conversation_id && (
                    <Plus size={12} color="#ee3e96" style={{ flexShrink: 0 }} />
                  )}
                </button>
              ))}
              <div
                style={{ height: 1, background: '#f1f5f9', margin: '4px 8px' }}
              />
            </>
          )}

          {/* Chats */}
          {conversations.length === 0 && projects.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: 'center',
                borderRadius: 12,
                background: '#fafafb',
                fontSize: 13,
                color: '#94a3b8',
                fontWeight: 600,
              }}
            >
              <MessageSquare
                size={24}
                style={{ opacity: 0.3, margin: '0 auto 8px', display: 'block' }}
              />
              No conversations yet
            </div>
          ) : (
            <>
              {conversations.length > 0 && (
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#94a3b8',
                    padding: '8px 8px 4px',
                  }}
                >
                  Chats
                </div>
              )}
              {conversations.map((c) => {
                const other = c.participants?.find((p: any) => p.user_id !== userId)?.profile;
                const isActive = activeConvId === c.id;
                const isMenuOpen = menuOpenConv === c.id;
                const lastMsg = c.messages?.[c.messages.length - 1];
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 10,
                      background: isActive ? '#fdf2f8' : 'transparent',
                    }}
                    onMouseEnter={() => {
                      if (activeConvId !== c.id) setMenuOpenConv(c.id);
                    }}
                    onMouseLeave={() => {
                      if (!isMenuOpen) setMenuOpenConv(null);
                    }}
                  >
                    <button
                      onClick={() =>
                        openConversation(
                          c.id,
                          other?.user_id,
                          other?.name || 'Chat',
                        )
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        flex: 1,
                        minWidth: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #ee3e96, #a855f7)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 900,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {(other?.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {other?.name || 'Unknown'}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {lastMsg
                            ? lastMsg.body || lastMsg.content || ''
                            : 'No messages yet'}
                        </div>
                      </div>
                    </button>

                    {/* Three-dot menu */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenConv(isMenuOpen ? null : c.id);
                        }}
                        onMouseEnter={() => setMenuOpenConv(c.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: 6,
                          color: '#94a3b8',
                          display: 'flex',
                          opacity: isMenuOpen ? 1 : 0.6,
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>
                      {isMenuOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: '100%',
                            zIndex: 20,
                            background: '#fff',
                            borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            border: '1px solid #f1f5f9',
                            minWidth: 140,
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(c.id);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '8px 12px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#dc2626',
                              fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLElement).style.background = '#fef2f2')
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLElement).style.background = 'transparent')
                            }
                          >
                            <Trash2 size={12} /> Delete Chat
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: '#fff',
        }}
      >
        {!activeConvId ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: '#fdf2f8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <MessageSquare size={28} color="#db2777" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Select a conversation
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              Choose a project or chat from the sidebar
            </p>
          </div>
        ) : streamStatus === 'connecting' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <Loader2 size={24} className="animate-spin" style={{ color: '#ee3e96' }} />
            <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Connecting...</p>
          </div>
        ) : streamClient && activeChannel ? (
          <Chat client={streamClient}>
            <Channel channel={activeChannel}>
              <Window>
                <ChannelHeader />
                <MessageList />
                <MessageComposer />
              </Window>
            </Channel>
          </Chat>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <Loader2 size={24} className="animate-spin" style={{ color: '#ee3e96' }} />
            <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              Loading conversation...
            </p>
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
        <div
          style={{
            height: 'calc(100vh - 56px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafb',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #f1f5f9',
              borderTopColor: '#ee3e96',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
