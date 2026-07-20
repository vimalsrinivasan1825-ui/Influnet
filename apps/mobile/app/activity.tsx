import { View } from 'react-native';
import { History } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import {
  Card,
  EmptyState,
  ErrorState,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface ActivityItem {
  id?: string;
  type: string;
  title?: string | null;
  description?: string | null;
  created_at?: string;
  occurred_at?: string;
}

export default function ActivityScreen() {
  const t = useTheme();

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.activity<{ activity: ActivityItem[] }>()
  );

  const items = data?.activity ?? [];

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History size={24} color={t.color.brand} />}
          title="Nothing here yet"
          body="Your requests, projects and profile changes build up a timeline here."
        />
      ) : (
        <Card>
          {items.map((item, i) => {
            const when = item.occurred_at ?? item.created_at;
            return (
              <View
                key={item.id ?? `${item.type}-${i}`}
                style={{ flexDirection: 'row', gap: t.spacing.md }}
              >
                {/* Continuous rail, same language as the stage timeline. */}
                <View style={{ width: 12, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: t.color.brand,
                      marginTop: 5,
                    }}
                  />
                  {i < items.length - 1 ? (
                    <View style={{ flex: 1, width: 1.5, backgroundColor: t.color.hairline, marginTop: 3 }} />
                  ) : null}
                </View>

                <View style={{ flex: 1, paddingBottom: i < items.length - 1 ? t.spacing.lg : 0, gap: 2 }}>
                  <Txt variant="callout">{item.title ?? item.description ?? item.type}</Txt>
                  <Txt variant="caption" tone="muted">
                    {timeAgo(when)}
                  </Txt>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </ScreenScroll>
  );
}
