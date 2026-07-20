import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import type { Conversation } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SkeletonCard,
  VerifiedBadge,
} from '@/components/ui';

export default function ConnectionsScreen() {
  const t = useTheme();
  const router = useRouter();

  // A connection is someone you have a conversation with — the same source the
  // web's connections page reads.
  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listConversations<{ conversations: Conversation[] }>()
  );

  const people = (data?.conversations ?? []).filter((c) => c.other_user);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
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
          {people.map((c, i) => {
            const other = c.other_user!;
            return (
              <ListRow
                key={c.id}
                title={other.company_name || other.name}
                subtitle={other.display_role ?? (other.username ? `@${other.username}` : null)}
                left={
                  <View>
                    <Avatar uri={other.avatar_url} name={other.name} />
                    {other.is_verified ? (
                      <View style={{ position: 'absolute', bottom: -2, right: -2 }}>
                        <VerifiedBadge size={14} />
                      </View>
                    ) : null}
                  </View>
                }
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                onPress={() =>
                  router.push({
                    pathname: `/conversations/${c.id}`,
                    params: { name: other.company_name || other.name },
                  })
                }
              />
            );
          })}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
