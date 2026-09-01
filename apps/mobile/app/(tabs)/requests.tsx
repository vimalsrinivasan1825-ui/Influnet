/**
 * Collaboration requests.
 *
 * A request only ever travels one way — a brand asks a creator — so the two
 * roles need opposite halves of the same list and never both. Creators see what
 * came in; brands see what they sent. The Incoming/Sent toggle that used to sit
 * here was offering everyone a tab that was always empty for them.
 *
 * ── THE SCREEN SCALES WITH THE ACCOUNT ────────────────────────────────
 *
 * Three shapes, and which one you get is decided by how much there is, not by
 * a setting:
 *
 *   nothing      A destination, not an apology: what a request is, and the one
 *                action that produces the first one. No filter rail, no
 *                summary — four counters reading zero above an empty list is
 *                the wall-of-zeros problem the Home redesign exists to kill.
 *   one or two   The cards, at the top, and nothing else. A four-column
 *                summary above a single card says "1 / 1 / 0 / 0": three zeros
 *                and a restatement of the card underneath it.
 *   several      The full screen — summary, filter rail, grouped sections.
 *
 * The thresholds live in the components that own them (OVERVIEW_MIN_ROWS in
 * requests-overview.tsx) so the rule sits with the thing it governs.
 *
 * ── ONE CARD SHAPE ────────────────────────────────────────────────────
 *
 * Every request draws as the same `RequestCard`, whatever state it is in. This
 * screen used to render a pending request as a full card with a budget panel
 * and a CTA, and a live one as a bare list row — the same object from the same
 * endpoint in two layouts, so scanning meant re-learning the screen halfway
 * down. What varies now is what the card CONTAINS: a live collaboration shows
 * its stage strip, an unanswered one has no stage to show.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronDown, ChevronUp, Search, Send } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useLiveRefresh } from '@/lib/realtime';
import { AppHeader } from '@/components/app-header';
import { ApprovalBanner } from '@/components/approval-banner';
import { RequestCard, type RequestCardData } from '@/components/request-card';
import {
  OVERVIEW_MIN_ROWS,
  RequestsOverview,
  RequestsTip,
} from '@/components/requests-overview';
import {
  Appear,
  Button,
  Card,
  Chip,
  ChipRail,
  DashedRule,
  ErrorState,
  PressableScale,
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
  /**
   * `current_stage` and `flow_key` are absent on an older backend, and both
   * readers below tolerate that by drawing no strip — which is correct, since
   * a strip with no stage would claim the work had not started.
   */
  project: {
    id: string;
    title: string;
    status: string;
    current_stage?: string | null;
    flow_key?: string | null;
  } | null;
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

function isActionRequired(state: string) {
  return state === 'pending' || state === 'in_discussion';
}

function isActive(state: string) {
  return state === 'in_progress';
}

function isClosed(state: string) {
  return (
    state === 'completed' ||
    state === 'declined' ||
    state === 'cancelled' ||
    state === 'project_cancelled'
  );
}

/** Dismissed once, per account — the tip explains the screen, which is news once. */
const TIP_DISMISSED_PREFIX = 'influnet:requests-tip-dismissed:';

export default function RequestsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);
  const userId = useSession((s) => s.session?.user.id);
  const isCreator = useSession((s) => s.profile?.role) === 'influencer';

  const [filter, setFilter] = useState<FilterKey>('all');
  const [closedExpanded, setClosedExpanded] = useState(false);

  // `null` while unread: rendering the tip before storage answers flashes it at
  // someone who dismissed it weeks ago. Same pattern as the verification nudge.
  const [tipDismissed, setTipDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setTipDismissed(null);
      return;
    }
    void (async () => {
      const seen = await AsyncStorage.getItem(TIP_DISMISSED_PREFIX + userId).catch(() => null);
      if (!cancelled) setTipDismissed(seen === '1');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismissTip = useCallback(() => {
    setTipDismissed(true);
    if (userId) void AsyncStorage.setItem(TIP_DISMISSED_PREFIX + userId, '1').catch(() => {});
  }, [userId]);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(
    () => endpoints.listCollabs<{ collabs: CollabRow[] }>(),
    { cacheKey: 'requests' },
  );

  // A request answered on the other side (or a new one arriving) repaints this
  // list while the user is looking at it, instead of on the next navigation.
  useLiveRefresh('requests', revalidate);

  const rows = useMemo(
    () =>
      (data?.collabs ?? []).filter((c) => (isCreator ? c.to_user_id === me : c.from_user_id === me)),
    [data, isCreator, me],
  );

  const { actionItems, activeItems, closedItems } = useMemo(() => {
    const stateOf = (c: CollabRow) => c.deal_state ?? c.status;
    return {
      actionItems: rows.filter((c) => isActionRequired(stateOf(c))),
      activeItems: rows.filter((c) => isActive(stateOf(c))),
      closedItems: rows.filter((c) => isClosed(stateOf(c))),
    };
  }, [rows]);

  /** Map a row onto everything the card needs, so the JSX below stays flat. */
  const toCard = useCallback(
    (c: CollabRow): RequestCardData => {
      const other = isCreator ? c.sender : c.receiver;
      const state = c.deal_state ?? c.status;
      return {
        id: c.id,
        budget: c.budget,
        created_at: c.created_at,
        partnerName: other?.name ?? null,
        state,
        stateLabel: STATE_LABEL[state] ?? state,
        stateTone: STATE_TONE[state] ?? 'neutral',
        project: c.project
          ? {
              title: c.project.title,
              current_stage: c.project.current_stage,
              flow_key: c.project.flow_key,
            }
          : null,
        // Creator-side only, and it fails safe: /api/collabs reports 'unknown'
        // rather than null when it cannot read the status, and anything that is
        // not 'approved' shows the warning.
        unverifiedSender:
          isCreator &&
          !!c.sender_business_approval_status &&
          c.sender_business_approval_status !== 'approved',
      };
    },
    [isCreator],
  );

  const openRequest = useCallback(
    (id: string) => router.push({ pathname: '/requests/[id]', params: { id } }),
    [router],
  );

  // ── How much screen this account has earned ─────────────────────
  // See the note at the top of the file. Both are about whether a control has
  // anything to control, not about taste.
  const showOverview = rows.length >= OVERVIEW_MIN_ROWS;
  const groupsWithRows = [actionItems, activeItems, closedItems].filter((g) => g.length > 0).length;
  const showFilters = groupsWithRows >= 2;

  // A filter that is no longer offered must not still be applied — hiding the
  // rail while `filter` is stuck on 'closed' would leave the list empty with no
  // visible way to fix it.
  useEffect(() => {
    if (!showFilters && filter !== 'all') setFilter('all');
  }, [showFilters, filter]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'pending':
        return actionItems;
      case 'active':
        return activeItems;
      case 'closed':
        return closedItems;
      default:
        return rows;
    }
  }, [filter, rows, actionItems, activeItems, closedItems]);

  // Sections only when the list is grouped AND unfiltered. Under a filter the
  // heading would name the filter back at you.
  const grouped = filter === 'all' && showFilters;

  let step = 0;
  const nextStep = () => step++;

  const cardsFor = (list: CollabRow[]) =>
    list.map((c) => (
      <RequestCard
        key={c.id}
        data={toCard(c)}
        isCreator={isCreator}
        onPress={() => openRequest(c.id)}
      />
    ));

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
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : rows.length === 0 ? (
          <EmptyRequests isCreator={isCreator} />
        ) : (
          <>
            {showFilters ? (
              <Appear index={nextStep()}>
                <ChipRail>
                  <Chip
                    label={`All (${rows.length})`}
                    selected={filter === 'all'}
                    onPress={() => setFilter('all')}
                  />
                  {actionItems.length > 0 ? (
                    <Chip
                      label={`Pending (${actionItems.length})`}
                      selected={filter === 'pending'}
                      onPress={() => setFilter('pending')}
                    />
                  ) : null}
                  {activeItems.length > 0 ? (
                    <Chip
                      label={`In progress (${activeItems.length})`}
                      selected={filter === 'active'}
                      onPress={() => setFilter('active')}
                    />
                  ) : null}
                  {closedItems.length > 0 ? (
                    <Chip
                      label={`Completed (${closedItems.length})`}
                      selected={filter === 'closed'}
                      onPress={() => setFilter('closed')}
                    />
                  ) : null}
                </ChipRail>
              </Appear>
            ) : null}

            {showOverview ? (
              <Appear index={nextStep()}>
                <RequestsOverview
                  total={rows.length}
                  pending={actionItems.length}
                  active={activeItems.length}
                  closed={closedItems.length}
                  isCreator={isCreator}
                />
              </Appear>
            ) : null}

            {showOverview && tipDismissed === false ? (
              <Appear index={nextStep()}>
                <RequestsTip isCreator={isCreator} onDismiss={dismissTip} />
              </Appear>
            ) : null}

            {grouped ? (
              <>
                {/* Live work first. It is the half of this screen with
                    something happening on it, and the pending half is one
                    scroll away either way. */}
                {activeItems.length > 0 ? (
                  <Appear index={nextStep()}>
                    <SectionLabel>In progress</SectionLabel>
                    <View style={{ gap: t.spacing.md }}>{cardsFor(activeItems)}</View>
                  </Appear>
                ) : null}

                {actionItems.length > 0 ? (
                  <Appear index={nextStep()}>
                    <SectionLabel>
                      {isCreator ? 'Waiting on you' : 'Pending response'}
                    </SectionLabel>
                    <View style={{ gap: t.spacing.md }}>{cardsFor(actionItems)}</View>
                  </Appear>
                ) : null}

                {/* Finished work stays collapsed. It is the largest group on a
                    mature account and the least likely to be what anyone came
                    for, so it costs one row until asked for. */}
                {closedItems.length > 0 ? (
                  <Appear index={nextStep()}>
                    <PressableScale
                      onPress={() => setClosedExpanded((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={`${closedItems.length} finished requests`}
                    >
                      <Card
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: t.spacing.md,
                        }}
                      >
                        <Txt variant="footnote" tone="soft">
                          {closedItems.length} finished
                        </Txt>
                        {closedExpanded ? (
                          <ChevronUp size={16} color={t.color.contentMuted} />
                        ) : (
                          <ChevronDown size={16} color={t.color.contentMuted} />
                        )}
                      </Card>
                    </PressableScale>

                    {closedExpanded ? (
                      <View style={{ gap: t.spacing.md, marginTop: t.spacing.md }}>
                        {cardsFor(closedItems)}
                      </View>
                    ) : null}
                  </Appear>
                ) : null}
              </>
            ) : (
              <Appear index={nextStep()}>
                <View style={{ gap: t.spacing.md }}>{cardsFor(visible)}</View>
              </Appear>
            )}

            <Appear index={nextStep()}>
              <FindCreators isCreator={isCreator} />
            </Appear>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

/**
 * Nothing has been sent, or nothing has come in.
 *
 * Not an `EmptyState` with a shrug icon. The two roles are in genuinely
 * different situations and the same words serve neither: a brand with no
 * requests has an action available right now, while a creator with none cannot
 * make a brand write to them and has to be told the thing that actually moves
 * the odds — which, per the verification work, is the badge and a connected
 * channel.
 */
function EmptyRequests({ isCreator }: { isCreator: boolean }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
      <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing['2xl'] }}>
        {/* The same three-node diagram as the empty pipeline on Home: a shape
            that says "this is a thing that moves" before there is anything to
            move. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: t.spacing.xs,
          }}
        >
          <EmptyNode size={38} opacity={0.35} />
          <EmptyConnector />
          <EmptyNode size={50} opacity={1} />
          <EmptyConnector />
          <EmptyNode size={38} opacity={0.35} />
        </View>

        <Txt variant="title3" center>
          {isCreator ? 'No requests yet' : 'No requests sent yet'}
        </Txt>
        <Txt variant="footnote" tone="muted" center style={{ maxWidth: 280 }}>
          {isCreator
            ? 'Get verified and connect a channel — brands filter for both before they ever message.'
            : 'Find a creator whose audience fits, and the request you send them starts here.'}
        </Txt>

        <Button
          label={isCreator ? 'Get verified' : 'Find a creator'}
          onPress={() => router.push(isCreator ? '/verification' : '/search')}
          icon={
            isCreator ? undefined : <Search size={16} color={t.color.white} />
          }
          inline
          size="md"
          style={{ marginTop: t.spacing.sm }}
        />
      </Card>

      <FindCreators isCreator={isCreator} />
    </View>
  );
}

function EmptyNode({ size, opacity }: { size: number; opacity: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.color.brandSoft,
        borderWidth: 1,
        borderColor: t.color.brandRing,
        opacity,
      }}
    >
      <Send size={Math.round(size * 0.42)} color={t.color.brand} />
    </View>
  );
}

function EmptyConnector() {
  const t = useTheme();
  return (
    <View style={{ width: 26 }}>
      <DashedRule color={t.color.brandRing} />
    </View>
  );
}

/**
 * The campaigns nudge that closes the screen.
 *
 * Present in every state including the full one, because "who else could I be
 * working with" is a live question at any list length — and it is the one route
 * off this screen that leads somewhere new rather than back into a request
 * that already exists.
 */
function FindCreators({ isCreator }: { isCreator: boolean }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <PressableScale
      onPress={() => router.push('/campaigns' as never)}
      accessibilityRole="button"
      accessibilityLabel={isCreator ? 'Browse open campaigns' : 'Browse campaigns and find creators'}
    >
      <Card style={{ backgroundColor: t.color.brandSoft, borderColor: t.color.brandRing, gap: 4 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
          {isCreator ? 'Want more requests?' : 'Looking for the right creator?'}
        </Txt>
        <Txt variant="footnote" tone="soft">
          {isCreator
            ? 'Open campaigns are the fastest way to be found by brands who are hiring now.'
            : 'Browse open campaigns and connect with creators who match your brand.'}
        </Txt>
        <Txt
          variant="footnote"
          style={{ color: t.color.brand, fontWeight: '700', marginTop: t.spacing.sm }}
        >
          Browse campaigns →
        </Txt>
      </Card>
    </PressableScale>
  );
}
