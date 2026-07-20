import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import type { Conversation } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { AppHeader } from '@/components/app-header';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenScroll,
  SkeletonCard,
  Txt,
  VerifiedBadge,
} from '@/components/ui';

export default function MessagesScreen() {
  const t = useTheme();
  const router = useRouter();

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listConversations<{ conversations: Conversation[] }>()
  );

  const conversations = data?.conversations ?? [];

  return (
    <Screen padded={false}>
      <AppHeader title="Messages" showBell={false} />

      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} color={t.color.brand} />}
            title="No conversations yet"
            body="Accepting a collaboration request opens a chat. That's where you agree the terms."
          />
        ) : (
          <ListGroup>
            {conversations.map((c, i) => {
              const other = c.other_user;
              const unread = c.unread_count > 0;

              return (
                <ListRow
                  key={c.id}
                  title={other?.company_name || other?.name || 'Conversation'}
                  subtitle={
                    c.last_message?.deleted
                      ? 'Message deleted'
                      : (c.last_message?.body ?? 'Say hello')
                  }
                  left={
                    <View>
                      <Avatar uri={other?.avatar_url} name={other?.name} />
                      {other?.is_verified ? (
                        <View style={{ position: 'absolute', bottom: -2, right: -2 }}>
                          <VerifiedBadge size={14} />
                        </View>
                      ) : null}
                      {other?.is_online ? (
                        <View
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: 11,
                            height: 11,
                            borderRadius: 6,
                            backgroundColor: t.color.ok,
                            borderWidth: 2,
                            borderColor: t.color.surfaceCard,
                          }}
                        />
                      ) : null}
                    </View>
                  }
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Txt variant="caption" tone="muted">
                        {timeAgo(c.last_message?.created_at ?? c.updated_at)}
                      </Txt>
                      {unread ? (
                        <View
                          style={{
                            minWidth: 20,
                            height: 20,
                            paddingHorizontal: 6,
                            borderRadius: 10,
                            backgroundColor: t.color.brand,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Txt variant="caption" style={{ color: t.color.white, fontSize: 11 }}>
                            {c.unread_count > 99 ? '99+' : c.unread_count}
                          </Txt>
                        </View>
                      ) : null}
                    </View>
                  }
                  showChevron={false}
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                  onPress={() =>
                    router.push({
                      pathname: `/conversations/${c.id}`,
                      params: { name: other?.company_name || other?.name || 'Chat' },
                    })
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </ScreenScroll>
    </Screen>
  );
}
