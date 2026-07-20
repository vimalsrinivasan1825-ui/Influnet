import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
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

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listNotifications<{ notifications: Notification[] }>()
  );

  const notifications = data?.notifications ?? [];

  // Opening the screen is the read receipt — no separate "mark all" chore.
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length) void endpoints.markNotificationsRead({ ids: unread });
  }, [notifications]);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
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
          {notifications.map((n, i) => (
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
              showChevron={!!n.link}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
              onPress={n.link ? () => router.push(n.link as never) : undefined}
            />
          ))}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
