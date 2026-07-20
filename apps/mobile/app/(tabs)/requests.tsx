import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import type { CollabRequest } from '@influnet/types';
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
  SegmentedControl,
  SkeletonCard,
  VerifiedBadge,
} from '@/components/ui';

/** The list rows carry the annotations the collabs route adds. */
type AnnotatedCollab = CollabRequest & {
  deal_state: string;
  project: { id: string; title: string; status: string } | null;
};

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

  const [tab, setTab] = useState<'incoming' | 'sent'>('incoming');

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listCollabs<{ collabs: AnnotatedCollab[] }>()
  );

  const { incoming, sent } = useMemo(() => {
    const all = data?.collabs ?? [];
    return {
      incoming: all.filter((c) => c.to_user_id === me),
      sent: all.filter((c) => c.from_user_id === me),
    };
  }, [data, me]);

  const rows = tab === 'incoming' ? incoming : sent;
  const pendingIncoming = incoming.filter((c) => c.status === 'pending').length;

  return (
    <Screen padded={false}>
      <AppHeader title="Requests" showBell={false} />

      <View style={{ paddingHorizontal: t.spacing.screen, paddingBottom: t.spacing.sm }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'incoming', label: 'Incoming', count: pendingIncoming },
            { value: 'sent', label: 'Sent' },
          ]}
        />
      </View>

      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
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
            title={tab === 'incoming' ? 'No requests yet' : "You haven't sent any requests"}
            body={
              tab === 'incoming'
                ? 'When a brand wants to work with you, it lands here.'
                : 'Find a creator who fits and send them the brief.'
            }
            actionLabel={tab === 'sent' ? 'Find creators' : undefined}
            onAction={() => router.push('/discover')}
          />
        ) : (
          <ListGroup>
            {rows.map((c, i) => {
              const other = tab === 'incoming' ? c.from_user : c.to_user;
              const state = c.deal_state ?? c.status;
              return (
                <ListRow
                  key={c.id}
                  title={other?.company_name || other?.name || 'Someone'}
                  subtitle={`${c.budget ? `${formatCurrency(c.budget)} · ` : ''}${timeAgo(c.created_at)}`}
                  left={
                    <View>
                      <Avatar uri={other?.avatar_url} name={other?.name ?? other?.company_name} />
                      {other?.verified ? (
                        <View style={{ position: 'absolute', bottom: -2, right: -2 }}>
                          <VerifiedBadge size={14} />
                        </View>
                      ) : null}
                    </View>
                  }
                  right={
                    <Badge
                      label={STATE_LABEL[state] ?? state}
                      tone={STATE_TONE[state] ?? 'neutral'}
                    />
                  }
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                  onPress={() => router.push(`/requests/${c.id}`)}
                />
              );
            })}
          </ListGroup>
        )}
      </ScreenScroll>
    </Screen>
  );
}
