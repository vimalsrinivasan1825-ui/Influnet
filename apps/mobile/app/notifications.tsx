/**
 * The notification center.
 *
 * Laid out the way LinkedIn's is, because that's the pattern people already
 * read without thinking: what's new first, each row says at a glance what kind
 * of thing it is (an icon on its own colour), what happened (a bold line),
 * and what tapping does ("Review", "See who"). Unread rows are tinted.
 *
 * Every row goes to the exact place, not the general area —
 * `notificationHref()` reads the row's type as well as its stored link (see
 * lib/notification-link.ts for the verification case that used to land on
 * Settings).
 *
 * Creators also get a standing card at the top: how many people viewed their
 * profile this week, one tap from the list.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Eye } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { notificationHref } from '@/lib/notification-link';
import { notificationKind } from '@/lib/notification-kind';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useSession } from '@/lib/session';
import { EmptyState, ErrorState, ScreenScroll, SkeletonCard, Txt } from '@/components/ui';
import type { ApiResult } from '@influnet/api';

/** Businesses have no viewers list; skip the request rather than collect a 403. */
const NO_VIEWERS: ApiResult<ViewerSummary> = { ok: true, status: 204, data: null, error: null } as ApiResult<ViewerSummary>;

interface Notification {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
  link: string | null;
}

interface ViewerSummary {
  total: number;
  thisWeek?: number;
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const isCreator = useSession((s) => s.profile?.role) === 'influencer';

  // /api/notifications returns the rows as a bare array, not an envelope.
  // Accept either so a later route change to { notifications } can't silently
  // empty this screen again.
  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listNotifications<Notification[] | { notifications: Notification[] }>(), { cacheKey: 'notifications' }
  );
  const notifications = useMemo(() => (Array.isArray(data) ? data : (data?.notifications ?? [])), [data]);

  const viewers = useFetch<ViewerSummary>(
    useCallback(
      () => (isCreator ? endpoints.profileViewers<ViewerSummary>() : Promise.resolve(NO_VIEWERS)),
      [isCreator],
    ),
    { cacheKey: isCreator ? 'profile-viewers' : undefined },
  );

  // Opening the screen is the read receipt — no separate "mark all" chore.
  // Rows keep their unread look until the next refresh, so what was new when
  // you opened the screen still reads as new while you're on it.
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (!unread.length) return;
    // The route's schema is { action, notificationIds } and `action` is
    // required — the old `{ ids }` body failed validation with a 400 every
    // time, so nothing was ever marked read and the unread count only grew.
    void endpoints
      .markNotificationsRead({ action: 'mark_read', notificationIds: unread })
      .then(() => useNotificationSummary.getState().refresh());
  }, [notifications]);

  const fresh = notifications.filter((n) => !n.read_at);
  const earlier = notifications.filter((n) => n.read_at);
  const viewerTotal = viewers.data?.total ?? 0;
  const viewerWeek = viewers.data?.thisWeek;

  const renderRow = (n: Notification) => {
    const kind = notificationKind(n.type, t);
    const href = notificationHref(n);
    const unread = !n.read_at;
    return (
      <Pressable
        key={n.id}
        disabled={!href}
        onPress={href ? () => router.push(href) : undefined}
        accessibilityRole={href ? 'button' : undefined}
        accessibilityLabel={`${n.title ?? 'Update'}${n.body ? `. ${n.body}` : ''}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: t.spacing.md,
          paddingVertical: 14,
          paddingHorizontal: t.spacing.lg,
          backgroundColor: pressed ? t.color.surfaceMuted : unread ? kind.soft : t.color.surfaceCard,
          borderRadius: 20,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: unread ? t.color.surfaceCard : kind.soft,
          }}
        >
          <kind.Icon size={20} color={kind.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt style={{ fontSize: 15, lineHeight: 20, fontWeight: unread ? '700' : '600' }} numberOfLines={2}>
            {n.title ?? 'Update'}
          </Txt>
          {n.body ? (
            <Txt variant="footnote" tone="muted" numberOfLines={2}>
              {n.body}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Txt variant="caption" tone="muted">{timeAgo(n.created_at)}</Txt>
            {href ? (
              <>
                <Txt variant="caption" tone="muted">·</Txt>
                <Txt style={{ fontSize: 12.5, lineHeight: 16, fontWeight: '700', color: kind.color }}>{kind.action}</Txt>
              </>
            ) : null}
          </View>
        </View>
        {unread ? (
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.color.brand2, marginTop: 6 }} />
        ) : null}
      </Pressable>
    );
  };

  const section = (label: string, rows: Notification[]) =>
    rows.length ? (
      <View style={{ gap: 6 }}>
        <Txt style={{ fontSize: 13, lineHeight: 18, fontWeight: '700', color: t.color.contentMuted, marginLeft: 4 }}>
          {label}
        </Txt>
        <View style={{ gap: 6 }}>{rows.map(renderRow)}</View>
      </View>
    ) : null;

  return (
    <ScreenScroll
      refreshing={refreshing}
      onRefresh={() => {
        refresh();
        viewers.refresh();
      }}
      contentContainerStyle={{ gap: t.spacing.lg }}
    >
      {isCreator && viewerTotal > 0 ? (
        <Pressable
          onPress={() => router.push('/profile-viewers')}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            padding: t.spacing.lg,
            borderRadius: 24,
            backgroundColor: t.color.brand,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Eye size={20} color={t.color.white} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontSize: 16, lineHeight: 21, fontWeight: '800', color: t.color.white }}>
              {typeof viewerWeek === 'number' && viewerWeek > 0
                ? `${viewerWeek} ${viewerWeek === 1 ? 'person' : 'people'} viewed your profile this week`
                : `${viewerTotal} ${viewerTotal === 1 ? 'person has' : 'people have'} viewed your profile`}
            </Txt>
            <Txt style={{ fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.85)' }}>See who's been looking</Txt>
          </View>
          <ChevronRight size={20} color={t.color.white} />
        </Pressable>
      ) : null}

      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} color={t.color.brand} />}
          title="Nothing new"
          body="Requests, profile views, approvals and project updates land here."
        />
      ) : (
        <>
          {section('New', fresh)}
          {section('Earlier', earlier)}
        </>
      )}
    </ScreenScroll>
  );
}
