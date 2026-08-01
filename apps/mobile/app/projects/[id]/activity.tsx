import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { Card, ErrorState, ScreenScroll, SkeletonCard, Txt } from '@/components/ui';

interface ProjectActivityEvent {
  id: string;
  summary: string;
  created_at: string;
  actor: { id: string; name: string | null } | null;
}

/**
 * The project's full audit trail. Used to render inline on the project
 * screen regardless of length — split out because it's detail someone checks
 * occasionally, not the thing they open the project to see.
 */
export default function ProjectActivityScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.projectActivity<{ activity: ProjectActivityEvent[] }>(id),
    { cacheKey: `project-activity:${id}` }
  );

  const activity = data?.activity ?? [];

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : activity.length ? (
        <Card style={{ gap: t.spacing.md }}>
          {activity.map((event) => (
            <View key={event.id} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  marginTop: 5,
                  backgroundColor: t.color.hairlineStrong,
                }}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="footnote">{event.summary}</Txt>
                <Txt variant="caption" tone="muted">
                  {event.actor?.name ? `${event.actor.name} · ` : ''}
                  {timeAgo(event.created_at)}
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Txt variant="footnote" tone="muted" center>
          No activity yet.
        </Txt>
      )}
    </ScreenScroll>
  );
}
