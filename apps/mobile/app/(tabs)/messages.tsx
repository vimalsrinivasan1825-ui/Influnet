/**
 * Messages — an inbox, in the shape every phone already taught its owner.
 *
 * ── WHAT WAS WRONG WITH THE PREVIOUS VERSION ──────────────────────────
 *
 * It rendered three separate rounded cards — "Unread · N", "Active projects",
 * "Chats" — each a `ListGroup` with its own border and its own margin. That is
 * a *settings* layout. An inbox is one continuous, recency-ordered list, and
 * splitting it three ways cost the only thing an inbox is for: the newest thing
 * is not reliably at the top, because a two-day-old unread sat above a reply
 * that arrived a minute ago.
 *
 * Worse, the split double-listed real conversations. `projects` from
 * /api/conversations is EVERY active project, whether or not a chat exists;
 * `allChats` already carries those same projects' conversations, enriched with
 * the project's title and partner. So any project with a chat appeared twice —
 * once under "Active projects" and again under "Chats" — as two rows that open
 * the identical thread. Only projects with NO conversation belong in their own
 * section now, because those are genuinely a different action: they *create*
 * something instead of opening it.
 *
 * The header comment also promised an "archived / completed collapse" that was
 * never built; `archivedExpanded` and its two chevron icons sat unused. Gone.
 *
 * ── WHAT AN INBOX ROW OWES YOU ────────────────────────────────────────
 *
 * Who, what they last said, when, and whether it is your turn — in one glance,
 * without a chevron or a card border between rows. Unread is carried by *weight
 * and colour on the text itself* plus a brand dot, not by a separate section:
 * bold-vs-regular is legible peripherally, which is how you find the unread one
 * while scrolling. A message you sent is prefixed "You:", so a quiet thread is
 * obviously waiting on them rather than looking like they never replied.
 *
 * Rows are edge-to-edge with a hairline inset past the avatar, the standard
 * that makes a list read as one surface instead of a stack of tiles.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderKanban, MessageSquare, Plus, Search, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch, invalidateFetchCache } from '@/lib/use-fetch';
import { formatInboxTime } from '@/lib/format';
import {
  toConversationRows,
  type ConversationRow,
  type RawConversation,
  type RawConversationProject,
} from '@/lib/conversations';
import { AppHeader } from '@/components/app-header';
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
} from '@/components/ui';

/** Avatar size, and therefore where the row's hairline starts. */
const AVATAR = 52;

export default function MessagesScreen() {
  const t = useTheme();
  const router = useRouter();
  const myUserId = useSession((s) => s.session?.user.id);

  const [opening, setOpening] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const { data, error, loading, refreshing, refresh } = useFetch(
    () =>
      endpoints.listConversations<{
        conversations: RawConversation[];
        projects: RawConversationProject[];
      }>(),
    { cacheKey: 'conversations' }
  );

  // Already newest-first out of toConversationRows. Nothing re-sorts it — an
  // inbox that promotes unread above recent is an inbox where the reply you
  // just got is not where you last saw it.
  const allChats = toConversationRows(data?.conversations, data?.projects, myUserId);

  // Only projects with no conversation yet. The rest are the same threads
  // `allChats` already lists — see the note at the top of this file.
  const chatlessProjects = (data?.projects ?? []).filter(
    (p) => !p.conversation_id && p.partner?.id
  );

  const q = query.trim().toLowerCase();
  const { chats, projects } = useMemo(() => {
    if (!q) return { chats: allChats, projects: chatlessProjects };
    const match = (...fields: (string | null | undefined)[]) =>
      fields.some((f) => f?.toLowerCase().includes(q));
    return {
      chats: allChats.filter((c) => match(c.name, c.preview, c.projectTitle)),
      projects: chatlessProjects.filter((p) =>
        match(p.title, p.partner?.company_name, p.partner?.name)
      ),
    };
    // allChats/chatlessProjects are derived fresh from `data` each render, so
    // `data` is the real dependency — listing the arrays would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data]);

  const unreadCount = allChats.filter((c) => c.lastFromThem).length;

  /** Open a project's chat, creating the conversation if it doesn't exist yet. */
  async function openProject(project: RawConversationProject) {
    const partnerName = project.partner?.company_name || project.partner?.name || 'Chat';

    if (project.conversation_id) {
      router.push({
        pathname: '/conversations/[id]',
        params: { id: project.conversation_id, name: partnerName },
      });
      return;
    }

    if (!project.partner?.id) return;
    setOpening(project.project_id);

    const res = await endpoints.createConversation<{ conversation: { id: string } }>({
      other_user_id: project.partner.id,
    });
    setOpening(null);

    if (res.ok && res.data?.conversation?.id) {
      invalidateFetchCache('conversations');
      router.push({
        pathname: '/conversations/[id]',
        params: { id: res.data.conversation.id, name: partnerName },
      });
    }
  }

  /** One conversation, WhatsApp-shaped. */
  function ChatRow({ row, last }: { row: ConversationRow; last: boolean }) {
    const title = row.name ?? 'Conversation';
    const unread = row.lastFromThem;

    // "You: …" only when there IS a message and it was mine. No message at all
    // is a different state and gets its own italic-weight placeholder.
    const preview = row.preview
      ? unread
        ? row.preview
        : `You: ${row.preview}`
      : row.projectTitle
        ? `About ${row.projectTitle}`
        : 'No messages yet';

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}${unread ? ', unread' : ''}. ${preview}`}
        onPress={() =>
          router.push({ pathname: '/conversations/[id]', params: { id: row.id, name: title } })
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          backgroundColor: pressed ? t.color.surfaceMuted : t.color.surfaceCard,
        })}
      >
        <Avatar name={title} size={AVATAR} />

        {/* The text column owns the hairline so it starts past the avatar —
            a separator that runs under the picture chops the list into tiles. */}
        <View
          style={{
            flex: 1,
            gap: 3,
            paddingVertical: 2,
            borderBottomWidth: last ? 0 : 1,
            borderBottomColor: t.color.hairline,
            paddingBottom: last ? 2 : t.spacing.md,
            marginBottom: last ? 0 : -t.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Txt
              variant="bodyStrong"
              numberOfLines={1}
              style={{ flex: 1, fontWeight: unread ? '700' : '600' }}
            >
              {title}
            </Txt>
            <Txt
              variant="caption"
              style={{
                color: unread ? t.color.brand : t.color.contentMuted,
                fontWeight: unread ? '700' : '500',
              }}
            >
              {formatInboxTime(row.lastMessageAt ?? row.updated_at)}
            </Txt>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Txt
              variant="footnote"
              numberOfLines={1}
              style={{
                flex: 1,
                color: unread ? t.color.content : t.color.contentMuted,
                fontWeight: unread ? '600' : '400',
              }}
            >
              {preview}
            </Txt>
            {unread ? (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: t.color.brand,
                }}
              />
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  const hasAnything = allChats.length > 0 || chatlessProjects.length > 0;
  const noResults = !!q && chats.length === 0 && projects.length === 0;

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={
          <AppHeader
            title="Messages"
            subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
            showBell={false}
          />
        }
        refreshing={refreshing}
        onRefresh={refresh}
        centerShort={!loading && !error && !hasAnything}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !hasAnything ? (
          <EmptyState
            icon={<MessageSquare size={24} color={t.color.brand} />}
            title="No conversations yet"
            body="Accepting a collaboration request opens a chat. That's where you agree the terms."
          />
        ) : (
          <>
            {/* Search earns its place once the list is longer than a screen;
                below that it is chrome in front of the thing you came for. */}
            {allChats.length + chatlessProjects.length >= 6 ? (
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder="Search messages"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                left={<Search size={17} color={t.color.contentMuted} />}
                right={
                  query ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      hitSlop={10}
                      onPress={() => setQuery('')}
                    >
                      <X size={17} color={t.color.contentMuted} />
                    </Pressable>
                  ) : undefined
                }
              />
            ) : null}

            {noResults ? (
              <Card>
                <Txt variant="footnote" tone="muted" center>
                  Nothing matches “{query.trim()}”.
                </Txt>
              </Card>
            ) : null}

            {/* One list, one surface, newest first. */}
            {chats.length > 0 ? (
              <Card padded={false}>
                {chats.map((row, i) => (
                  <ChatRow key={row.id} row={row} last={i === chats.length - 1} />
                ))}
              </Card>
            ) : null}

            {/* Projects with nobody talking yet. A distinct ACTION — this
                creates the conversation — so it earns a distinct section, and
                a green folder rather than a face, because there is no thread
                behind it to have a face. */}
            {projects.length > 0 ? (
              <>
                <SectionLabel>Start a chat</SectionLabel>
                <Card padded={false}>
                  {projects.map((project, i) => {
                    const partnerName =
                      project.partner?.company_name || project.partner?.name || 'Partner';
                    const last = i === projects.length - 1;
                    const busy = opening === project.project_id;

                    return (
                      <Pressable
                        key={project.project_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Start a chat with ${partnerName} about ${project.title}`}
                        disabled={busy}
                        onPress={() => void openProject(project)}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing.md,
                          paddingHorizontal: t.spacing.lg,
                          paddingVertical: t.spacing.md,
                          opacity: busy ? 0.6 : 1,
                          backgroundColor: pressed ? t.color.surfaceMuted : t.color.surfaceCard,
                        })}
                      >
                        <View
                          style={{
                            width: AVATAR,
                            height: AVATAR,
                            borderRadius: AVATAR / 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: t.color.okSoft,
                          }}
                        >
                          <FolderKanban size={22} color={t.color.ok} />
                        </View>

                        <View
                          style={{
                            flex: 1,
                            gap: 3,
                            paddingVertical: 2,
                            borderBottomWidth: last ? 0 : 1,
                            borderBottomColor: t.color.hairline,
                            paddingBottom: last ? 2 : t.spacing.md,
                            marginBottom: last ? 0 : -t.spacing.md,
                          }}
                        >
                          <Txt variant="bodyStrong" numberOfLines={1}>
                            {project.title}
                          </Txt>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                            <Txt variant="footnote" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                              {partnerName} · {busy ? 'Opening…' : 'Tap to start'}
                            </Txt>
                            <Plus size={17} color={t.color.brand} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
