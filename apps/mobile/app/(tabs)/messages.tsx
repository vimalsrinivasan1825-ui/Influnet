/**
 * Messages — an inbox, in the shape every phone already taught its owner.
 *
 * ── WHAT THE ROWS OWE YOU ─────────────────────────────────────────────
 *
 * Who, what they last said, when, whether it is your turn, and how much of it
 * there is — in one glance. Three signals carry "your turn", and they are
 * deliberately redundant because peripheral vision only reliably catches one
 * of them at a time:
 *
 *   the card TINTS toward the role accent   — catchable while scrolling past
 *   the text goes heavier and darker        — catchable when skimming names
 *   a counted badge                         — the exact answer, once you look
 *
 * A message you sent is prefixed "You:", so a quiet thread is obviously
 * waiting on them rather than looking like they never replied.
 *
 * ── WHERE THE NUMBERS COME FROM ───────────────────────────────────────
 *
 * The list is /api/conversations. The unread COUNT and the online dot are
 * Stream, via useInboxLive — Postgres holds pre-Stream history only, so it can
 * say who spoke last but never how many are unread, and presence is a
 * websocket fact that no table knows. Both degrade to nothing: when Stream is
 * unconfigured or unreachable the rows keep their names, previews, times and
 * the from-them bolding, and simply carry no badge and no dot.
 *
 * ── THE HEADER DOES NOT SCROLL ────────────────────────────────────────
 *
 * Title and search sit OUTSIDE `ScreenScroll` rather than in its `header`
 * slot. An inbox is the one screen where you scroll a long way and still want
 * to search from where you are, and a search field that has to be scrolled
 * back to is a search field people stop using.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderKanban, MessageSquare, Pin, Search, UserPlus, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch, invalidateFetchCache } from '@/lib/use-fetch';
import { formatInboxTime } from '@/lib/format';
import { useInboxLive, type InboxLive } from '@/lib/use-inbox-live';
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
  PressableScale,
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
  const isCreator = useSession((s) => s.profile?.role) === 'influencer';

  const [opening, setOpening] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const { data, error, loading, refreshing, refresh } = useFetch(
    () =>
      endpoints.listConversations<{
        conversations: RawConversation[];
        projects: RawConversationProject[];
      }>(),
    { cacheKey: 'conversations' },
  );

  // Unread counts and presence, straight off the chat socket. Additive: an
  // empty map is the normal state on an environment without Stream.
  const live = useInboxLive();

  // Already newest-first out of toConversationRows. Nothing re-sorts it — an
  // inbox that promotes unread above recent is an inbox where the reply you
  // just got is not where you last saw it.
  const allChats = toConversationRows(data?.conversations, data?.projects, myUserId);

  // Only projects with no conversation yet. The rest are the same threads
  // `allChats` already lists, and listing a thread twice makes the shorter
  // list feel like different work.
  const chatlessProjects = (data?.projects ?? []).filter(
    (p) => !p.conversation_id && p.partner?.id,
  );

  const q = query.trim().toLowerCase();
  const { chats, projects } = useMemo(() => {
    if (!q) return { chats: allChats, projects: chatlessProjects };
    const match = (...fields: (string | null | undefined)[]) =>
      fields.some((f) => f?.toLowerCase().includes(q));
    return {
      chats: allChats.filter((c) => match(c.name, c.preview, c.projectTitle)),
      projects: chatlessProjects.filter((p) =>
        match(p.title, p.partner?.company_name, p.partner?.name),
      ),
    };
    // allChats/chatlessProjects are derived fresh from `data` each render, so
    // `data` is the real dependency — listing the arrays would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data]);

  /**
   * Threads with something unread.
   *
   * Prefers Stream's count and falls back to the from-them bit, so the header
   * subtitle says the same thing the rows do on every environment rather than
   * reading zero wherever Stream is off.
   */
  const unreadCount = allChats.filter(
    (c) => (live.get(c.id)?.unread ?? (c.lastFromThem ? 1 : 0)) > 0,
  ).length;

  /** Pin / unpin from a long-press. Free caps at 3 — a 402 says so. */
  async function togglePin(row: ConversationRow) {
    const res = await endpoints.setConversationPinned(row.id, !row.pinned);
    if (!res.ok) {
      Alert.alert(
        res.status === 402 ? 'Pin limit reached' : 'Could not update',
        res.error ?? 'Please try again.',
      );
      return;
    }
    invalidateFetchCache('conversations');
    refresh();
  }

  function onLongPressRow(row: ConversationRow) {
    Alert.alert(row.name ?? 'Chat', undefined, [
      { text: row.pinned ? 'Unpin' : 'Pin to top', onPress: () => void togglePin(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

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

  const hasAnything = allChats.length > 0 || chatlessProjects.length > 0;
  const noResults = !!q && chats.length === 0 && projects.length === 0;

  return (
    <Screen padded={false}>
      {/* Pinned. Outside the scroller on purpose — see the note at the top. */}
      <View style={{ backgroundColor: t.color.surface }}>
        <AppHeader
          title="Messages"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} unread`
              : isCreator
                ? 'Stay in touch with brands'
                : 'Stay in touch with creators'
          }
          showBell={false}
        />

        {hasAnything ? (
          <View style={{ paddingHorizontal: t.spacing.screen, paddingBottom: t.spacing.md }}>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search conversations"
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
          </View>
        ) : null}
      </View>

      <ScreenScroll
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
            {noResults ? (
              <Card>
                <Txt variant="footnote" tone="muted" center>
                  Nothing matches “{query.trim()}”.
                </Txt>
              </Card>
            ) : null}

            {chats.some((c) => c.pinned) && !q ? (
              <SectionLabel>Pinned</SectionLabel>
            ) : null}
            {chats.map((row, i) => {
              const prev = chats[i - 1];
              const firstUnpinned = !q && !row.pinned && (i === 0 || prev?.pinned);
              return (
                <View key={row.id}>
                  {firstUnpinned && chats.some((c) => c.pinned) ? (
                    <SectionLabel>All conversations</SectionLabel>
                  ) : null}
                  <ConversationCard
                    row={row}
                    live={live}
                    onPress={() =>
                      router.push({
                        pathname: '/conversations/[id]',
                        params: { id: row.id, name: row.name ?? 'Chat' },
                      })
                    }
                    onLongPress={() => onLongPressRow(row)}
                  />
                </View>
              );
            })}

            {/* Projects with nobody talking in them yet. A different action —
                these CREATE a conversation rather than opening one — so they
                are named as such rather than mixed into the list above. */}
            {projects.length > 0 ? (
              <>
                <SectionLabel>Project chats not started</SectionLabel>
                {projects.map((p) => (
                  <PressableScale
                    key={p.project_id}
                    onPress={() => openProject(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Start a chat about ${p.title}`}
                  >
                    <Card
                      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
                    >
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: t.color.brandSoft,
                        }}
                      >
                        <FolderKanban size={20} color={t.color.brand} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {p.partner?.company_name || p.partner?.name || 'Partner'}
                        </Txt>
                        <Txt variant="footnote" tone="muted" numberOfLines={1}>
                          {opening === p.project_id ? 'Opening…' : p.title}
                        </Txt>
                      </View>
                    </Card>
                  </PressableScale>
                ))}
              </>
            ) : null}

            {/* Always last, always present. "Who else could I be talking to"
                is a live question at any list length. */}
            <SectionLabel>Start a new chat</SectionLabel>
            <PressableScale
              onPress={() => router.push('/search')}
              accessibilityRole="button"
              accessibilityLabel="Start a new conversation"
            >
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  backgroundColor: t.color.brandSoft,
                  borderColor: t.color.brandRing,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.color.surfaceCard,
                  }}
                >
                  <UserPlus size={20} color={t.color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                    Start a new conversation
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {isCreator
                      ? 'Reply to a brand or follow up on a campaign'
                      : 'Connect with creators and start collaborating'}
                  </Txt>
                </View>
              </Card>
            </PressableScale>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

/**
 * One conversation.
 *
 * The tint is the whole point of the card shape. Rows on a shared surface can
 * only mark unread with type weight; a card can change colour, and a colour
 * change is the only unread signal that survives being scrolled past at speed.
 * It uses the ROLE accent — pink for a brand, purple for a creator — so it is
 * the same "this concerns you" colour the rest of the app uses.
 */
function ConversationCard({
  row,
  live,
  onPress,
  onLongPress,
}: {
  row: ConversationRow;
  live: InboxLive;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();

  const state = live.get(row.id);
  // Stream's count where we have it; the from-them bit where we don't. The
  // fallback drives the tint but shows no number, because "some" is what that
  // bit means and rendering it as "1" would be a figure we cannot support.
  const unreadCount = state?.unread ?? 0;
  const unread = unreadCount > 0 || (state === undefined && row.lastFromThem);

  const preview = row.preview
    ? `${row.lastFromThem ? '' : 'You: '}${row.preview}`
    : row.projectTitle
      ? `About ${row.projectTitle}`
      : 'No messages yet';

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? 'Chat'}${row.pinned ? ', pinned' : ''}${
        unreadCount > 0 ? `, ${unreadCount} unread` : unread ? ', unread' : ''
      }. ${preview}`}
    >
      <Card
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          backgroundColor: unread ? t.color.brandSoft : t.color.surfaceCard,
        }}
      >
        <View>
          {/* Seeded on the user id so this person is this colour everywhere. */}
          <Avatar name={row.name} seed={row.otherUserId} size={50} />
          {state?.online ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 13,
                height: 13,
                borderRadius: 7,
                backgroundColor: t.color.ok,
                // Ringed in the card's own colour so it reads as a cut-out
                // rather than as a sticker floating over the avatar.
                borderWidth: 2.5,
                borderColor: unread ? t.color.brandSoft : t.color.surfaceCard,
              }}
            />
          ) : null}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.sm }}>
            <Txt
              variant="bodyStrong"
              numberOfLines={1}
              style={{ flex: 1, fontWeight: unread ? '700' : '600' }}
            >
              {row.name ?? 'Chat'}
            </Txt>
            {row.pinned ? (
              <Pin size={12} color={t.color.contentMuted} fill={t.color.contentMuted} />
            ) : null}
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

            {unreadCount > 0 ? (
              <View
                style={{
                  minWidth: 21,
                  height: 21,
                  paddingHorizontal: 6,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.color.brand,
                }}
              >
                <Txt
                  variant="caption"
                  style={{ color: t.color.white, fontSize: 11, fontWeight: '700' }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Txt>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}
