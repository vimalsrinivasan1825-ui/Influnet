/**
 * Collaboration requests.
 *
 * A request only ever travels one way — a brand asks a creator — so the two
 * roles need opposite halves of the same list and never both. Creators see what
 * came in; brands see what they sent. The Incoming/Sent toggle that used to sit
 * here was offering everyone a tab that was always empty for them.
 */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { formatCurrency, timeAgo } from '@/lib/format';
import { AppHeader } from '@/components/app-header';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenScroll,
  SkeletonCard,
} from '@/components/ui';

/**
 * A row from /api/collabs.
 *
 * The route embeds the two profiles as `sender` and `receiver` — NOT as the
 * `from_user` / `to_user` that @influnet/types declares. Reading the declared
 * names is why every row rendered as "Someone". Each embed selects only
 * `name, role`, so there is no avatar or company name to show here.
 */
interface CollabRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  budget: number | null;
  status: string;
  created_at: string;
  sender?: { name: string | null; role: string | null } | null;
  receiver?: { name: string | null; role: string | null } | null;
  deal_state?: string;
  project: { id: string; title: string; status: string } | null;
}

const STATE_TONE: Record<string, 'ok' | 'warn' | 'brand' | 'neutral' | 'danger'> = {
  pending: 'warn',
  in_progress: 'brand',
  in_discussion: 'brand',
  completed: 'ok',
  declined: 'neutral',
  cancelled: 'neutral',
  project_cancelled: 'neutral',
};

const STATE_LABEL: Record<string, string> = {
  pending: 'Awaiting reply',
  in_progress: 'In progress',
  in_discussion: 'In discussion',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  project_cancelled: 'Project cancelled',
};

export default function RequestsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);
  const isCreator = useSession((s) => s.profile?.role) === 'influencer';

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listCollabs<{ collabs: CollabRow[] }>(), { cacheKey: 'requests' }
  );

  // Creators read the inbox; brands read their outbox. Falling back to "show
  // everything" while the profile is still loading would flash the wrong half.
  const rows = (data?.collabs ?? []).filter((c) =>
    isCreator ? c.to_user_id === me : c.from_user_id === me
  );

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={<AppHeader title={isCreator ? 'Requests' : 'Sent requests'} showBell={false} />}
        refreshing={refreshing}
        onRefresh={refresh}
        centerShort={rows.length <= 3}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} color={t.color.brand} />}
            title={isCreator ? 'No requests yet' : "You haven't sent any requests"}
            body={
              isCreator
                ? 'When a brand wants to work with you, it lands here.'
                : 'Requests you send to creators will show up here, with their replies.'
            }
          />
        ) : (
          <ListGroup>
            {rows.map((c, i) => {
              // The other party is whichever end of the request isn't you.
              const other = isCreator ? c.sender : c.receiver;
              const state = c.deal_state ?? c.status;

              return (
                <ListRow
                  key={c.id}
                  title={other?.name || 'Someone'}
                  subtitle={`${c.budget ? `${formatCurrency(c.budget)} · ` : ''}${timeAgo(c.created_at)}`}
                  left={<Avatar name={other?.name ?? undefined} />}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge
                        label={STATE_LABEL[state] ?? state}
                        tone={STATE_TONE[state] ?? 'neutral'}
                      />
                    </View>
                  }
                  index={i}
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                  onPress={() => router.push({ pathname: '/requests/[id]', params: { id: c.id } })}
                />
              );
            })}
          </ListGroup>
        )}
      </ScreenScroll>
    </Screen>
  );
}
