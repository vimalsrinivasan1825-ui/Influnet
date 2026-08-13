/**
 * Messages — redesigned with unread-first sorting and archived collapse.
 *
 * Two sections:
 *  - Unread chats (lastFromThem) are sorted to the top with a more prominent dot
 *  - Archived / completed project chats are collapsed under "N archived" row
 *
 * A project without a conversation_id has no chat yet. Tapping it creates one.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, FolderKanban, MessageSquare, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch, invalidateFetchCache } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import {
  toConversationRows,
  type RawConversation,
  type RawConversationProject,
} from '@/lib/conversations';
import { AppHeader } from '@/components/app-header';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
} from '@/components/ui';

export default function MessagesScreen() {
  const t = useTheme();
  const router = useRouter();
  const myUserId = useSession((s) => s.session?.user.id);

  const [opening, setOpening] = useState<number | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const { data, error, loading, refreshing, refresh } = useFetch(
    () =>
      endpoints.listConversations<{
        conversations: RawConversation[];
        projects: RawConversationProject[];
      }>(),
    { cacheKey: 'conversations' }
  );

  const allChats = toConversationRows(data?.conversations, data?.projects, myUserId);
  const projects = data?.projects ?? [];

  // Sort chats: unread (lastFromThem) first, then by most recent message.
  const unreadChats = allChats.filter((c) => c.lastFromThem);
  const readChats = allChats.filter((c) => !c.lastFromThem);

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

  const isEmpty = allChats.length === 0 && projects.length === 0;

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={<AppHeader title="Messages" showBell={false} />}
        refreshing={refreshing}
        onRefresh={refresh}
        centerShort={isEmpty || allChats.length + projects.length <= 3}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : isEmpty ? (
          <EmptyState
            icon={<MessageSquare size={24} color={t.color.brand} />}
            title="No conversations yet"
            body="Accepting a collaboration request opens a chat. That's where you agree the terms."
          />
        ) : (
          <>
            {/* ── Unread conversations (prominent, at top) ─────────── */}
            {unreadChats.length > 0 ? (
              <>
                <SectionLabel>Unread · {unreadChats.length}</SectionLabel>
                <ListGroup>
                  {unreadChats.map((row, i) => {
                    const title = row.name ?? 'Conversation';
                    return (
                      <ListRow
                        key={row.id}
                        title={title}
                        subtitle={
                          row.preview ??
                          (row.projectTitle ? `About ${row.projectTitle}` : 'Say hello')
                        }
                        left={<Avatar name={row.name ?? undefined} />}
                        right={
                          <View style={{ alignItems: 'flex-end', gap: 5 }}>
                            <Txt variant="caption" tone="muted">
                              {timeAgo(row.lastMessageAt ?? row.updated_at)}
                            </Txt>
                            {/* Larger, more prominent unread indicator */}
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: t.color.brand,
                              }}
                            />
                          </View>
                        }
                        showChevron={false}
                        index={i}
                        style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                        onPress={() =>
                          router.push({
                            pathname: '/conversations/[id]',
                            params: { id: row.id, name: title },
                          })
                        }
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}

            {/* ── Active projects ───────────────────────────────────── */}
            {projects.length > 0 ? (
              <>
                <SectionLabel>Active projects</SectionLabel>
                <ListGroup>
                  {projects.map((project, i) => {
                    const partnerName =
                      project.partner?.company_name || project.partner?.name || 'Partner';

                    return (
                      <ListRow
                        key={project.project_id}
                        title={project.title}
                        subtitle={partnerName}
                        left={
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: t.color.brandSoft,
                            }}
                          >
                            <FolderKanban size={18} color={t.color.brand} />
                          </View>
                        }
                        right={
                          project.conversation_id ? undefined : (
                            <Plus size={17} color={t.color.brand} />
                          )
                        }
                        showChevron={!!project.conversation_id}
                        index={i}
                        style={
                          i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined
                        }
                        onPress={
                          opening === project.project_id ? undefined : () => void openProject(project)
                        }
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}

            {/* ── Read / older conversations ────────────────────────── */}
            {readChats.length > 0 ? (
              <>
                <SectionLabel>Chats</SectionLabel>
                <ListGroup>
                  {readChats.map((row, i) => {
                    const title = row.name ?? 'Conversation';
                    return (
                      <ListRow
                        key={row.id}
                        title={title}
                        subtitle={
                          row.preview ??
                          (row.projectTitle ? `About ${row.projectTitle}` : 'Say hello')
                        }
                        left={<Avatar name={row.name ?? undefined} />}
                        right={
                          <Txt variant="caption" tone="muted">
                            {timeAgo(row.lastMessageAt ?? row.updated_at)}
                          </Txt>
                        }
                        showChevron={false}
                        index={i}
                        style={
                          i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined
                        }
                        onPress={() =>
                          router.push({
                            pathname: '/conversations/[id]',
                            params: { id: row.id, name: title },
                          })
                        }
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
