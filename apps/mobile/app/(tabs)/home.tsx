/**
 * Home — the action console.
 *
 * This screen used to render the creator's recent posts, latest videos,
 * audience split and brand ratings. All four are *identity* content, all four
 * already live on Profile, and none of them answer the only question Home is
 * for: what do I have to do next? Home was a second copy of the public profile
 * with a couple of numbers on top.
 *
 * It now reads top-down as: what is waiting on me → which projects need my
 * move → who I'm waiting on → what the money is doing. The showcase content
 * moved to Profile, where a creator goes to see how they look.
 *
 * "Whose move is it" comes from the API (`turn` / `next_action` per project),
 * which derives it from STAGE_ACTOR plus each side's sign-off in stage_progress
 * — see projectTurn() in @influnet/core.
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Clock,
  FolderKanban,
  Handshake,
  Inbox,
  MessageCircle,
  Send,
  TrendingUp,
} from 'lucide-react-native';
import { STAGES, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useFetch } from '@/lib/use-fetch';
import {
  formatCompactCurrency,
  formatCurrency,
  humanizeStage,
  timeAgo,
} from '@/lib/format';
import { AppHeader } from '@/components/app-header';
import { ApprovalBanner } from '@/components/approval-banner';
import { ActionCard } from '@/components/action-card';
import {
  Card,
  DonutChart,
  ErrorState,
  GradientCard,
  ListGroup,
  ListRow,
  ProgressBar,
  ProgressRing,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  StatCard,
  StatGrid,
  TrendBars,
  Txt,
  type BreakdownItem,
  type TrendPoint,
} from '@/components/ui';

/** One active project, with the API's verdict on whose move it is. */
interface OngoingProject {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  budget: number | null;
  updated_at: string;
  partner: string | null;
  my_side: 'business' | 'creator';
  /** 'you' — actionable now. 'them' — waiting. 'none' — finished. */
  turn: 'you' | 'them' | 'none';
  /** Short imperative for whoever the turn belongs to. */
  next_action: string;
  /** Days since anything happened on this project. */
  idle_days: number;
}

/**
 * The figures that answer "how is it actually going?" — computed server-side
 * in /api/home from rows it already had, so this costs no extra round trip.
 */
interface HomeAnalytics {
  month: {
    current: number;
    previous: number;
    /** Null when last month was zero — a percentage off nothing is not insight. */
    delta_pct: number | null;
    label: string;
  };
  avg_deal_size: number | null;
  /** Active work grouped into Setup / Production / Review / Payment. */
  phases: { label: string; value: number }[];
  /** Active projects nobody has touched in a week or more, worst first. */
  stalled: { id: string; title: string; partner: string | null; idle_days: number; turn: string }[];
  funnel: {
    received: number;
    accepted: number;
    completed: number;
    accept_rate: number | null;
    completion_rate: number | null;
  };
}

/**
 * Only what Home reads. The endpoint still returns the social snapshot, the
 * audience split and the reviews — Profile is what renders those now, and
 * listing them here again invites them back onto this screen.
 */
interface HomePayload {
  role: string;
  profile: { name: string; location: string | null; verified: boolean; verification_status: string };
  ongoing: OngoingProject[];
  /** Absent on an older backend; every reader below tolerates undefined. */
  analytics?: HomeAnalytics;
  counts: {
    ongoing: number;
    completed: number;
    your_turn: number;
    awaiting_me: number;
    awaiting_them: number;
    pending_requests: number;
  };
}

/** The two role dashboards differ only in what they name the same two series. */
interface DashboardPayload {
  stats?: { pipeline_value?: number; completed_value?: number };
  earnings_trend?: { week: string; amount: number }[];
  weekly_spend?: { week: string; amount: number }[];
  request_breakdown?: { name: string; value: number }[];
  pipeline_data?: { name: string; value: number }[];
}

interface HomeData {
  home: HomePayload;
  dashboard: DashboardPayload | null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** 0–1 through the twelve-stage lifecycle. Unknown stages read as not started. */
function stageProgress(stage: string): { index: number; ratio: number } {
  const index = STAGES.indexOf(stage as Stage);
  if (index < 0) return { index: 0, ratio: 0 };
  return { index, ratio: (index + 1) / STAGES.length };
}

export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  // Drives the dot on the header bell. Without this the bell was decorative —
  // AppHeader accepts `unread`, and nothing ever gave it a number.
  const unreadNotifications = useNotificationSummary(
    (s) => s.summary?.unread_notifications_count ?? 0,
  );
  const unreadMessages = useNotificationSummary((s) => s.summary?.unread_messages_count ?? 0);

  /**
   * Home first, then the dashboard its `role` selects. Sequential rather than
   * parallel on purpose: the session store may not have loaded a role yet on a
   * cold start, and picking the endpoint off the response is always right where
   * picking it off local state is a race.
   */
  const { data, error, loading, refreshing, refresh } = useFetch<HomeData>(async () => {
    const home = await endpoints.home<HomePayload>();
    if (!home.ok || !home.data) {
      return { ok: false, status: home.status, error: home.error, data: null };
    }

    const dashboard =
      home.data.role === 'influencer'
        ? await endpoints.influencerDashboard<DashboardPayload>()
        : await endpoints.businessDashboard<DashboardPayload>();

    // A failed dashboard costs the charts, not the screen.
    return {
      ok: true,
      status: home.status,
      error: null,
      data: { home: home.data, dashboard: dashboard.ok ? dashboard.data : null },
    };
  }, { cacheKey: 'home' });

  const home = data?.home;
  const dashboard = data?.dashboard;
  const counts = home?.counts;
  const isCreator = (home?.role ?? profile?.role) === 'influencer';
  const avatar = isCreator ? profile?.avatar_url : profile?.logo_url;

  // ── Whose move ──────────────────────────────────────────────────
  // Older builds of the API don't send `turn`; those projects fall into the
  // actionable list rather than vanishing from the screen entirely.
  const ongoing = home?.ongoing ?? [];
  const yourMove = ongoing.filter((p) => (p.turn ?? 'you') === 'you');
  const theirMove = ongoing.filter((p) => p.turn === 'them');

  // Decisions that live outside a project, most urgent first.
  const actions = [
    counts?.awaiting_me
      ? {
          key: 'awaiting',
          icon: <Handshake size={18} color={t.color.brand} />,
          title: `${counts.awaiting_me} ${counts.awaiting_me === 1 ? 'proposal needs' : 'proposals need'} your response`,
          body: 'Review the terms and accept or send changes.',
          tone: 'brand' as const,
          onPress: () => router.push('/projects'),
        }
      : null,
    counts?.pending_requests
      ? {
          key: 'requests',
          icon: <Inbox size={18} color={t.color.warn} />,
          title: `${counts.pending_requests} new collaboration ${counts.pending_requests === 1 ? 'request' : 'requests'}`,
          body: isCreator ? 'A brand wants to work with you.' : 'Waiting for your reply.',
          tone: 'warn' as const,
          onPress: () => router.push('/requests'),
        }
      : null,
    unreadMessages
      ? {
          key: 'messages',
          icon: <MessageCircle size={18} color={t.color.brand} />,
          title: `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`,
          body: 'Someone is waiting on a reply.',
          tone: 'brand' as const,
          onPress: () => router.push('/messages'),
        }
      : null,
    isCreator && home && !home.profile.verified
      ? {
          key: 'verify',
          icon: <BadgeCheck size={18} color={t.color.brand} />,
          title: 'Verify your Instagram',
          body: 'Verified creators get more requests. Takes about a minute.',
          tone: 'brand' as const,
          onPress: () => router.push('/verification'),
        }
      : null,
  ].filter(Boolean);

  // ── Chart series ────────────────────────────────────────────────
  const trendSource = dashboard?.earnings_trend ?? dashboard?.weekly_spend ?? [];
  const moneyTrend: TrendPoint[] = trendSource.map((w) => ({ label: w.week, value: w.amount }));
  const pipelineValue = dashboard?.stats?.pipeline_value ?? 0;
  const completedValue = dashboard?.stats?.completed_value ?? 0;

  const breakdownSource = dashboard?.request_breakdown ?? dashboard?.pipeline_data ?? [];
  const breakdown: BreakdownItem[] = breakdownSource.map((b) => ({
    label: b.name,
    value: b.value,
  }));
  const breakdownTotal = breakdown.reduce((sum, b) => sum + b.value, 0);

  // ── Analytics ───────────────────────────────────────────────────
  const analytics = home?.analytics;
  const stalled = analytics?.stalled ?? [];
  const phaseTrend: TrendPoint[] = (analytics?.phases ?? []).map((p) => ({
    label: p.label,
    value: p.value,
  }));
  const funnel = analytics?.funnel;

  const nothingPending = actions.length === 0 && yourMove.length === 0;

  return (
    <Screen padded={false}>
      <AppHeader
        subtitle={greeting()}
        title={home?.profile.name ?? profile?.name ?? 'Home'}
        avatarUri={avatar}
        avatarName={profile?.name}
        unread={unreadNotifications}
      />

      {/* Unapproved businesses land here first, so this is where web's shell
          banner belongs. Renders nothing for everyone else. */}
      <ApprovalBanner />

      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <>
            {/* ── The headline number, in the brand ramp ────────────── */}
            {/* Sits well clear of the header — pinned right under it the card
                and the title read as one crowded block. */}
            <GradientCard style={{ marginTop: t.spacing.xl }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}
              >
                <View style={{ gap: 3 }}>
                  <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {isCreator ? 'Pipeline value' : 'Committed spend'}
                  </Txt>
                  <Txt
                    variant="display"
                    tone="inverse"
                    style={{ fontVariant: ['tabular-nums'], letterSpacing: -1 }}
                  >
                    {formatCurrency(pipelineValue)}
                  </Txt>
                </View>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.22)',
                  }}
                >
                  <TrendingUp size={18} color={t.color.white} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {counts?.ongoing
                    ? `Across ${counts.ongoing} active ${counts.ongoing === 1 ? 'project' : 'projects'}`
                    : 'No active projects yet'}
                </Txt>
                {completedValue > 0 || (counts?.completed || 0) > 0 ? (
                  <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.95)', fontWeight: '600' }}>
                    {completedValue > 0 ? `${formatCurrency(completedValue)}` : `${counts?.completed || 0}`} completed
                  </Txt>
                ) : null}
              </View>
            </GradientCard>

            {/* ── Decisions that aren't tied to a project ───────────── */}
            {actions.length > 0 ? (
              <>
                <SectionLabel>Needs you</SectionLabel>
                <View style={{ gap: t.spacing.sm }}>
                  {actions.map((a) => (
                    <ActionCard
                      key={a!.key}
                      icon={a!.icon}
                      title={a!.title}
                      body={a!.body}
                      tone={a!.tone}
                      onPress={a!.onPress}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* ── The heart of the screen: projects held up by you ─── */}
            {/* Each row names the concrete next step for this stage, so the
                answer to "what now?" is on the row rather than two taps in. */}
            {yourMove.length > 0 ? (
              <>
                <SectionLabel>
                  {yourMove.length === 1 ? 'Your move' : `Your move · ${yourMove.length}`}
                </SectionLabel>
                <View style={{ gap: t.spacing.sm }}>
                  {yourMove.map((p) => {
                    const { index, ratio } = stageProgress(p.current_stage);

                    return (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.title}. Your move: ${p.next_action}`}
                        onPress={() => router.push(`/projects/${p.id}`)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                      >
                        <Card raised style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
                          <ProgressRing
                            progress={ratio}
                            size={54}
                            label={`${index + 1}/${STAGES.length}`}
                            caption="stage"
                          />
                          <View style={{ flex: 1, gap: 3 }}>
                            <Txt variant="bodyStrong" numberOfLines={1}>
                              {p.next_action}
                            </Txt>
                            <Txt variant="footnote" tone="soft" numberOfLines={1}>
                              {p.title}
                            </Txt>
                            <Txt variant="caption" tone="muted" numberOfLines={1}>
                              {p.partner ?? 'Partner'} · {humanizeStage(p.current_stage)}
                            </Txt>
                          </View>
                          <ChevronRight size={18} color={t.color.contentMuted} />
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* ── Going quiet ───────────────────────────────────────── */}
            {/* Ranked by silence, not by stage. A week of nothing is the
                clearest early signal that a collaboration is dying, and it is
                invisible in every other view — a stalled project still looks
                perfectly healthy sitting in its stage. */}
            {stalled.length > 0 ? (
              <>
                <SectionLabel>Going quiet</SectionLabel>
                <ListGroup>
                  {stalled.map((p, i) => (
                    <ListRow
                      key={p.id}
                      title={p.title}
                      subtitle={
                        p.turn === 'you'
                          ? `${p.partner ?? 'Partner'} · waiting on you`
                          : `${p.partner ?? 'Partner'} · nudge them`
                      }
                      index={i}
                      left={<AlertCircle size={18} color={t.color.warn} />}
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                      right={
                        <Txt variant="caption" style={{ color: t.color.warn, fontWeight: '600' }}>
                          {p.idle_days}d quiet
                        </Txt>
                      }
                      onPress={() => router.push(`/projects/${p.id}`)}
                    />
                  ))}
                </ListGroup>
              </>
            ) : null}

            {nothingPending ? (
              <Card style={{ gap: 4 }}>
                <Txt variant="bodyStrong">You're all caught up</Txt>
                <Txt variant="footnote" tone="muted">
                  {theirMove.length > 0
                    ? 'Nothing is waiting on you right now — the projects below are with your partners.'
                    : isCreator
                      ? 'No requests or approvals waiting. Keep your profile fresh so brands can find you.'
                      : "Nothing waiting on you. Here's where your campaigns stand."}
                </Txt>
              </Card>
            ) : null}

            {/* ── Live, but not yours to move ───────────────────────── */}
            {theirMove.length > 0 ? (
              <>
                <SectionLabel>Waiting on others</SectionLabel>
                <ListGroup>
                  {theirMove.map((p, i) => (
                    <ListRow
                      key={p.id}
                      title={p.title}
                      subtitle={`${p.partner ?? 'Partner'} · ${p.next_action}`}
                      index={i}
                      left={<Clock size={18} color={t.color.contentMuted} />}
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                      right={
                        <Txt variant="caption" tone="muted">
                          {timeAgo(p.updated_at)}
                        </Txt>
                      }
                      below={
                        <ProgressBar
                          progress={stageProgress(p.current_stage).ratio}
                          style={{ marginTop: t.spacing.sm }}
                        />
                      }
                      onPress={() => router.push(`/projects/${p.id}`)}
                    />
                  ))}
                </ListGroup>
              </>
            ) : null}

            {/* ── This month, against last ─────────────────────────── */}
            {/* The delta is the point: an absolute figure tells you nothing
                about direction, and direction is what a creator checking their
                phone actually wants to know. */}
            {analytics ? (
              <>
                <SectionLabel>{analytics.month.label}</SectionLabel>
                <Card style={{ gap: t.spacing.lg }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ gap: 3, flex: 1 }}>
                      <Txt variant="caption" tone="muted">
                        {isCreator ? 'Delivered this month' : 'Paid out this month'}
                      </Txt>
                      <Txt
                        variant="title2"
                        style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.4 }}
                      >
                        {formatCurrency(analytics.month.current)}
                      </Txt>

                      {analytics.month.delta_pct != null ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          {analytics.month.delta_pct >= 0 ? (
                            <ArrowUpRight size={13} color={t.color.ok} />
                          ) : (
                            <ArrowDownRight size={13} color={t.color.danger} />
                          )}
                          <Txt
                            variant="caption"
                            style={{
                              fontWeight: '600',
                              color: analytics.month.delta_pct >= 0 ? t.color.ok : t.color.danger,
                            }}
                          >
                            {Math.abs(analytics.month.delta_pct)}% vs last month
                          </Txt>
                        </View>
                      ) : (
                        <Txt variant="caption" tone="muted">
                          {analytics.month.previous > 0
                            ? `${formatCurrency(analytics.month.previous)} last month`
                            : 'First month with completed work'}
                        </Txt>
                      )}
                    </View>

                    {analytics.avg_deal_size ? (
                      <View style={{ gap: 3, alignItems: 'flex-end' }}>
                        <Txt variant="caption" tone="muted">
                          Avg deal
                        </Txt>
                        <Txt
                          variant="title3"
                          style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}
                        >
                          {formatCompactCurrency(analytics.avg_deal_size)}
                        </Txt>
                      </View>
                    ) : null}
                  </View>
                </Card>
              </>
            ) : null}

            {/* ── The six weeks behind the headline number ─────────── */}
            <SectionLabel>
              {isCreator ? 'Earnings · last 6 weeks' : 'Spend · last 6 weeks'}
            </SectionLabel>
            <Card>
              <View>
                <TrendBars
                  data={moneyTrend}
                  formatValue={formatCompactCurrency}
                  emptyLabel={
                    isCreator
                      ? 'No accepted budgets in the last six weeks'
                      : 'No committed budgets in the last six weeks'
                  }
                />
              </View>
            </Card>

            {/* ── Where the live work is sitting ────────────────────── */}
            {/* Four phases, not twelve stages: twelve bars on a phone is a wall
                of noise, and the useful question is which part of the process
                is backed up, not which exact step. */}
            {phaseTrend.some((p) => p.value > 0) ? (
              <>
                <SectionLabel>Where your work is sitting</SectionLabel>
                <Card>
                  <TrendBars
                    data={phaseTrend}
                    formatValue={(v) => String(v)}
                    emptyLabel="No active projects to place"
                  />
                </Card>
              </>
            ) : null}

            {/* ── Conversion ───────────────────────────────────────── */}
            {funnel && funnel.received > 0 ? (
              <>
                <SectionLabel>{isCreator ? 'Requests to delivered' : 'Outreach to delivered'}</SectionLabel>
                <Card style={{ gap: t.spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {[
                      { label: 'Received', value: funnel.received },
                      { label: 'Accepted', value: funnel.accepted },
                      { label: 'Delivered', value: funnel.completed },
                    ].map((step) => (
                      <View key={step.label} style={{ gap: 2 }}>
                        <Txt variant="caption" tone="muted">
                          {step.label}
                        </Txt>
                        <Txt variant="title3" style={{ fontVariant: ['tabular-nums'] }}>
                          {step.value}
                        </Txt>
                      </View>
                    ))}
                  </View>

                  <View style={{ height: 1, backgroundColor: t.color.hairline }} />

                  <View style={{ gap: t.spacing.sm }}>
                    {[
                      { label: 'Accepted', pct: funnel.accept_rate, of: 'of requests received' },
                      { label: 'Delivered', pct: funnel.completion_rate, of: 'of accepted deals' },
                    ]
                      // A rate with a zero denominator is hidden rather than
                      // shown as 0% — "0% delivered" with nothing accepted yet
                      // reads as failure where the truth is "not applicable".
                      .filter((r) => r.pct != null)
                      .map((r) => (
                        <View key={r.label} style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Txt variant="footnote" tone="soft">
                              {r.label} · {r.of}
                            </Txt>
                            <Txt
                              variant="footnote"
                              style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}
                            >
                              {r.pct}%
                            </Txt>
                          </View>
                          <ProgressBar progress={Math.min(1, (r.pct ?? 0) / 100)} />
                        </View>
                      ))}
                  </View>
                </Card>
              </>
            ) : null}

            {/* ── Pipeline composition, with the total in the middle ── */}
            {breakdownTotal > 0 ? (
              <>
                <SectionLabel>Pipeline</SectionLabel>
                <Card>
                  <DonutChart
                    data={breakdown}
                    centerValue={String(breakdownTotal)}
                    centerLabel={breakdownTotal === 1 ? 'total' : 'in total'}
                  />
                </Card>
              </>
            ) : null}

            <SectionLabel>At a glance</SectionLabel>
            <StatGrid>
              <StatCard
                label="Needs your move"
                value={counts?.your_turn ?? yourMove.length}
                icon={<Handshake size={15} color={t.color.contentMuted} />}
                onPress={() => router.push('/projects')}
              />
              <StatCard
                label="Active projects"
                value={counts?.ongoing ?? 0}
                icon={<FolderKanban size={15} color={t.color.contentMuted} />}
                onPress={() => router.push('/projects')}
              />
              <StatCard
                label="Completed"
                value={counts?.completed ?? 0}
                icon={<BadgeCheck size={15} color={t.color.contentMuted} />}
              />
              <StatCard
                label={isCreator ? 'Open requests' : 'Proposals out'}
                value={(isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0}
                icon={
                  isCreator ? (
                    <Inbox size={15} color={t.color.contentMuted} />
                  ) : (
                    <Send size={15} color={t.color.contentMuted} />
                  )
                }
                onPress={() => router.push(isCreator ? '/requests' : '/projects')}
              />
            </StatGrid>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
