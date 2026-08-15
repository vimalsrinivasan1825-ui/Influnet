/**
 * Collaboration requests — redesigned with filter tabs and offer cards.
 *
 * A request only ever travels one way — a brand asks a creator — so the two
 * roles need opposite halves of the same list and never both. Creators see what
 * came in; brands see what they sent. The Incoming/Sent toggle that used to sit
 * here was offering everyone a tab that was always empty for them.
 *
 * UI changes (2026-08):
 *  - Filter chip rail: All / Pending / In Progress / Completed
 *  - Action-required (pending) requests shown as full offer cards with a CTA
 *  - Completed & cancelled requests collapsed into a tappable "Show N" row
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Inbox } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useLiveRefresh } from '@/lib/realtime';
import { formatCurrency, timeAgo } from '@/lib/format';
import { AppHeader } from '@/components/app-header';
import { ApprovalBanner } from '@/components/approval-banner';
import {
  Avatar,
  Badge,
  Card,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
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
  /** Only set when the sender is a business; null once Influnet approves them. */
  sender_business_approval_status?: string | null;
}

const STATE_TONE: Record<string, 'ok' | 'warn' | 'brand' | 'neutral' | 'danger'> = {
  pending: 'warn',
  in_progress: 'brand',
  in_discussion: 'brand',
  completed: 'ok',
  declined: 'danger',
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

type FilterKey = 'all' | 'pending' | 'active' | 'closed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'In Progress' },
  { key: 'closed', label: 'Completed' },
];

function isActionRequired(state: string) {
  return state === 'pending' || state === 'in_discussion';
}

function isActive(state: string) {
  return state === 'in_progress';
}

function isClosed(state: string) {
  return state === 'completed' || state === 'declined' || state === 'cancelled' || state === 'project_cancelled';
}

export default function RequestsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);
  const isCreator = useSession((s) => s.profile?.role) === 'influencer';

  const [filter, setFilter] = useState<FilterKey>('all');
  const [closedExpanded, setClosedExpanded] = useState(false);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.listCollabs<{ collabs: CollabRow[] }>(), { cacheKey: 'requests' }
  );

  // A request answered on the other side (or a new one arriving) repaints this
  // list while the user is looking at it, instead of on the next navigation.
  useLiveRefresh('requests', revalidate);

  const rows = (data?.collabs ?? []).filter((c) =>
    isCreator ? c.to_user_id === me : c.from_user_id === me
  );

  const { actionItems, activeItems, closedItems, filteredRows } = useMemo(() => {
    const actionItems = rows.filter((c) => isActionRequired(c.deal_state ?? c.status));
    const activeItems = rows.filter((c) => isActive(c.deal_state ?? c.status));
    const closedItems = rows.filter((c) => isClosed(c.deal_state ?? c.status));

    let filteredRows: CollabRow[];
    switch (filter) {
      case 'pending':
        filteredRows = actionItems;
        break;
      case 'active':
        filteredRows = activeItems;
        break;
      case 'closed':
        filteredRows = closedItems;
        break;
      default:
        filteredRows = rows;
    }

    return { actionItems, activeItems, closedItems, filteredRows };
  }, [rows, filter]);

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={
          <>
            <AppHeader title={isCreator ? 'Requests' : 'Sent requests'} showBell={false} />
            <ApprovalBanner />
          </>
        }
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
          <>
            {/* Filter rail */}
            <ChipRail>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.key === 'all' ? `${f.label} (${rows.length})` : f.key === 'pending' ? `${f.label} (${actionItems.length})` : f.key === 'active' ? `${f.label} (${activeItems.length})` : `${f.label} (${closedItems.length})`}
                  selected={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </ChipRail>

            {/* Action Required — full offer cards */}
            {(filter === 'all' || filter === 'pending') && actionItems.length > 0 ? (
              <>
                {filter === 'all' ? <SectionLabel>Action required</SectionLabel> : null}
                <View style={{ gap: t.spacing.md }}>
                  {actionItems.map((c) => {
                    const other = isCreator ? c.sender : c.receiver;
                    const state = c.deal_state ?? c.status;
                    const unverifiedSender =
                      isCreator && c.sender_business_approval_status && c.sender_business_approval_status !== 'approved';

                    return (
                      <Card key={c.id} style={{ gap: t.spacing.md }}>
                        {/* Header row */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                          <Avatar name={other?.name ?? undefined} />
                          <View style={{ flex: 1 }}>
                            <Txt variant="bodyStrong" numberOfLines={1}>
                              {other?.name || 'Someone'}
                            </Txt>
                            <Txt variant="caption" tone="muted">
                              {timeAgo(c.created_at)}
                              {unverifiedSender ? ' · Not yet verified' : ''}
                            </Txt>
                          </View>
                          <Badge label={STATE_LABEL[state] ?? state} tone={STATE_TONE[state] ?? 'neutral'} />
                        </View>

                        {/* Budget highlight */}
                        {c.budget ? (
                          <View
                            style={{
                              backgroundColor: t.color.brandSoft,
                              borderRadius: t.radii.md,
                              paddingHorizontal: t.spacing.md,
                              paddingVertical: t.spacing.sm,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Txt variant="caption" tone="soft">Proposed budget</Txt>
                            <Txt variant="bodyStrong" style={{ color: t.color.brand }}>
                              {formatCurrency(c.budget)}
                            </Txt>
                          </View>
                        ) : null}

                        {/* Project name */}
                        {c.project?.title ? (
                          <Txt variant="footnote" tone="muted" numberOfLines={1}>
                            Project: {c.project.title}
                          </Txt>
                        ) : null}

                        {/* CTA */}
                        <Pressable
                          onPress={() => router.push({ pathname: '/requests/[id]', params: { id: c.id } })}
                          style={({ pressed }) => ({
                            backgroundColor: t.color.brand,
                            borderRadius: t.radii.md,
                            paddingVertical: t.spacing.md,
                            alignItems: 'center',
                            opacity: pressed ? 0.9 : 1,
                          })}
                        >
                          <Txt variant="bodyStrong" tone="inverse">Review offer →</Txt>
                        </Pressable>

                        {unverifiedSender ? (
                          <Badge label="Unverified sender" tone="warn" />
                        ) : null}
                      </Card>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* In Progress */}
            {(filter === 'all' || filter === 'active') && activeItems.length > 0 ? (
              <>
                {filter === 'all' ? <SectionLabel>In progress</SectionLabel> : null}
                <ListGroup>
                  {activeItems.map((c, i) => {
                    const other = isCreator ? c.sender : c.receiver;
                    const state = c.deal_state ?? c.status;
                    return (
                      <ListRow
                        key={c.id}
                        title={other?.name || 'Someone'}
                        subtitle={`${c.budget ? `${formatCurrency(c.budget)} · ` : ''}${timeAgo(c.created_at)}`}
                        left={<Avatar name={other?.name ?? undefined} />}
                        right={
                          <Badge label={STATE_LABEL[state] ?? state} tone={STATE_TONE[state] ?? 'neutral'} />
                        }
                        index={i}
                        style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                        onPress={() => router.push({ pathname: '/requests/[id]', params: { id: c.id } })}
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}

            {/* Closed — collapsed by default */}
            {(filter === 'all' || filter === 'closed') && closedItems.length > 0 ? (
              <>
                <Pressable
                  onPress={() => setClosedExpanded((prev) => !prev)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: t.spacing.screen,
                    paddingVertical: t.spacing.md,
                    backgroundColor: pressed ? t.color.surfaceMuted : 'transparent',
                    borderRadius: t.radii.md,
                  })}
                >
                  <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {closedItems.length} completed / cancelled
                  </Txt>
                  {closedExpanded ? (
                    <ChevronUp size={14} color={t.color.contentMuted} />
                  ) : (
                    <ChevronDown size={14} color={t.color.contentMuted} />
                  )}
                </Pressable>

                {closedExpanded ? (
                  <ListGroup>
                    {closedItems.map((c, i) => {
                      const other = isCreator ? c.sender : c.receiver;
                      const state = c.deal_state ?? c.status;
                      return (
                        <ListRow
                          key={c.id}
                          title={other?.name || 'Someone'}
                          subtitle={`${c.budget ? `${formatCurrency(c.budget)} · ` : ''}${timeAgo(c.created_at)}`}
                          left={<Avatar name={other?.name ?? undefined} />}
                          right={
                            <Badge label={STATE_LABEL[state] ?? state} tone={STATE_TONE[state] ?? 'neutral'} />
                          }
                          index={i}
                          style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                          onPress={() => router.push({ pathname: '/requests/[id]', params: { id: c.id } })}
                        />
                      );
                    })}
                  </ListGroup>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
