import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { toMobileHref } from '@/lib/notification-link';
import { useNotificationSummary } from '@/lib/notification-summary';
import {
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SkeletonCard,
} from '@/components/ui';

interface Notification {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
  link: string | null;
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();

  // /api/notifications returns the rows as a bare array, not an envelope.
  // Accept either so a later route change to { notifications } can't silently
  // empty this screen again.
  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listNotifications<Notification[] | { notifications: Notification[] }>(), { cacheKey: 'notifications' }
  );

  const notifications = Array.isArray(data) ? data : (data?.notifications ?? []);

  // Opening the screen is the read receipt — no separate "mark all" chore.
  // Refresh the shared summary afterwards so the bell's dot clears now rather
  // than on the next 60s poll.
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

  return (
    <ScreenScroll
      refreshing={refreshing}
      onRefresh={refresh}
      centerShort={notifications.length <= 3}
    >
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} color={t.color.brand} />}
          title="Nothing new"
          body="Requests, approvals and stage updates land here."
        />
      ) : (
        <ListGroup>
          {notifications.map((n, i) => {
            // Stored links are web dashboard paths; only follow the ones that
            // map onto a screen this app has.
            const href = toMobileHref(n.link);

            return (
              <ListRow
                key={n.id}
                title={n.title ?? 'Update'}
                subtitle={`${n.body ? `${n.body} · ` : ''}${timeAgo(n.created_at)}`}
                left={
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: n.read_at ? 'transparent' : t.color.brand,
                    }}
                  />
                }
                showChevron={!!href}
                index={i}
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                onPress={href ? () => router.push(href) : undefined}
              />
            );
          })}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
