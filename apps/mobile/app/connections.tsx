import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  toConversationRows,
  type RawConversation,
  type RawConversationProject,
} from '@/lib/conversations';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SkeletonCard,
} from '@/components/ui';

export default function ConnectionsScreen() {
  const t = useTheme();
  const router = useRouter();
  const myUserId = useSession((s) => s.session?.user.id);

  // A connection is someone you have a conversation with — the same source the
  // web's connections page reads.
  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listConversations<{
      conversations: RawConversation[];
      projects: RawConversationProject[];
    }>(), { cacheKey: 'connections' }
  );

  // Only rows that resolved to a real person; a conversation whose participant
  // embed came back empty isn't a connection worth listing.
  const people = toConversationRows(data?.conversations, data?.projects, myUserId).filter(
    (row) => row.name
  );

  return (
    <ScreenScroll
      refreshing={refreshing}
      onRefresh={refresh}
      centerShort={people.length <= 3}
    >
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<Users size={24} color={t.color.brand} />}
          title="No connections yet"
          body="Accepted requests turn into connections you can message any time."
        />
      ) : (
        <ListGroup>
          {people.map((row, i) => (
            <ListRow
              key={row.id}
              title={row.name!}
              subtitle={row.projectTitle ? `Working on ${row.projectTitle}` : 'Connected'}
              left={<Avatar name={row.name ?? undefined} />}
              index={i}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
              onPress={() =>
                router.push({
                  pathname: '/conversations/[id]',
                  params: { id: row.id, name: row.name! },
                })
              }
            />
          ))}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
