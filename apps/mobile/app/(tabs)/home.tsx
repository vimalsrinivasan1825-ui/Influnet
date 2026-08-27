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
 * move → where the work sits → what the money is doing → who is noticing me.
 * The showcase content moved to Profile, where a creator goes to see how they
 * look.
 *
 * ── WHY IT IS SHAPED LIKE THIS ────────────────────────────────────────
 *
 * The first version of this rewrite was honest and unreadable: eleven sections,
 * every one full-width, every one in an identical card. Nothing was more
 * important than anything else, so a busy account scrolled for a minute to see
 * everything and a new account saw a wall of zeros. Four changes fixed it, and
 * each is worth keeping:
 *
 *  1. ONE review card, not one card per waiting decision (see ReviewQueue).
 *  2. The month's delta lives ON the headline number, not in a card of its own
 *     underneath it — a figure and its direction are one thought.
 *  3. ONE money card. The trend, the settled/pending split and the period
 *     control used to be three separate sections saying overlapping things.
 *  4. Stalled projects are a WARNING ON a row in the "with others" list, not a
 *     second list of the same projects above it.
 *  5. NOTHING IS SAID TWICE. A later pass added a "two-column mid section" that
 *     re-rendered the same `reviewItems` <ReviewQueue> already draws at the top
 *     — same counts, same rows, a second "Review now" aimed at the same place.
 *     Two cards a scroll apart both claiming "you have 3 things to review" make
 *     a creator wonder whether there are six. It also put two flex:1 cards side
 *     by side on a 375pt screen, which is a browser layout, not a phone one.
 *     Reach is full width now and uses BarList like everything else.
 *
 * Colour is systematic, not decorative: PipelineStrip and STAT_TINT below draw
 * from ONE six-hue table, keyed by meaning, matching the web dashboard's — so
 * amber means the same thing in every card here and in a browser.
 *
 * "Whose move is it" comes from the API (`turn` / `next_action` per project),
 * which derives it from STAGE_ACTOR plus each side's sign-off in stage_progress
 * — see projectTurn() in @influnet/core.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  FolderKanban,
  Handshake,
  Inbox,
  MessageCircle,
  TrendingUp,
  Users,
} from 'lucide-react-native';
import { STAGES, flowOf, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useFetch } from '@/lib/use-fetch';
import {
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  humanizeStage,
  timeAgo,
} from '@/lib/format';
import { useVerificationNudge } from '@/lib/use-verification-nudge';
import { AppHeader } from '@/components/app-header';
import { ApprovalBanner } from '@/components/approval-banner';
import { PlatformMark, platformColor, platformLabel } from '@/components/platform-mark';
import { PipelineStrip, type PipelineStep } from '@/components/pipeline-strip';
import { ReviewQueue, type ReviewItem } from '@/components/review-queue';
import { VerifiedCelebration } from '@/components/verified-celebration';
import {
  VerificationStatusCard,
  type VerificationSummary,
} from '@/components/verification-status-card';
import {
  BarList,
  Card,
  ErrorState,
  GradientCard,
  ListGroup,
  ListRow,
  ProgressBar,
  ProgressRing,
  Screen,
  ScreenScroll,
  SectionLabel,
  SegmentedControl,
  SkeletonCard,
  StatCard,
  StatGrid,
  TrendBars,
  Txt,
  type BarListItem,
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

/** Who has been looking. Null when the backend cannot read it — see /api/home. */
interface HomeAttention {
  profile_views: number;
  profile_views_prior: number;
  profile_views_delta_pct: number | null;
  /** Distinct brands, all time. Null for a business account. */
  business_viewers: number | null;
  window_days: number;
}

/** Clicks OUT of the public profile, by destination. */
interface HomeReach {
  people: number;
  clicks: number;
  delta_pct: number | null;
  channels: { link_type: string; clicks: number; people: number }[];
  window_days: number;
}

/** Settled and outstanding money, in rupees. */
interface HomeMoney {
  earned: number;
  pending: number;
  windows: { week: number; month: number; year: number };
  /**
   * False when nothing has ever settled through the platform. The trend chart
   * falls back to agreed budgets in that case, and this is what lets the card
   * say so instead of calling budgets "earnings".
   */
  settled_payments_exist: boolean;
}

/**
 * Only what Home reads. The endpoint still returns the social snapshot, the
 * audience split and the reviews — Profile is what renders those now, and
 * listing them here again invites them back onto this screen.
 */
interface HomePayload {
  role: string;
  profile: {
    name: string;
    location: string | null;
    verified: boolean;
    verification_status: string;
    /**
     * The full verification picture, added so Home can tell "you have a task"
     * apart from "we're still scoring you". Absent on an older backend — every
     * reader below tolerates undefined and falls back to the `verified` bit.
     */
    verification?: VerificationSummary;
  };
  ongoing: OngoingProject[];
  /** All four absent on an older backend; every reader below tolerates that. */
  analytics?: HomeAnalytics;
  attention?: HomeAttention | null;
  reach?: HomeReach | null;
  money?: HomeMoney | null;
  pipeline?: PipelineStep[];
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

type MoneyWindow = 'week' | 'month' | 'year';

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

/**
 * Presentation for each place a visitor can be sent — label, mark and bar
 * colour all come from components/platform-mark, which is the RN twin of the
 * web dashboard's. Home used to keep its own label table here and draw grey
 * lucide outlines beside grey bars, so Instagram and "somebody's website" were
 * the same row with different words. That is the "everything looks the same"
 * complaint, and it is fixed by using the platform's own identity.
 */

/**
 * One hue per counter tile.
 *
 * Deliberately the SAME six values PipelineStrip uses, rather than a second
 * palette invented for this grid: a screen where amber means Review in one card
 * and "acceptance rate" in the next is a screen where colour means nothing.
 * These stay off the role accent too — `brand` recolours per role, and a tile
 * that changes hue depending on who signed in cannot be a stable identity.
 */
const STAT_TINT = {
  views: '#9E77ED',
  brands: '#12B76A',
  requests: '#0BA5EC',
  projects: '#6172F3',
  completed: '#16A34A',
  moves: '#F79009',
} as const;

export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  // Both "seen it" flags are per account, not per install — a shared device
  // must not swallow the second person's badge moment.
  const userId = useSession((s) => s.session?.user.id);
  // Drives the dot on the header bell. Without this the bell was decorative —
  // AppHeader accepts `unread`, and nothing ever gave it a number.
  const unreadNotifications = useNotificationSummary(
    (s) => s.summary?.unread_notifications_count ?? 0,
  );
  const unreadMessages = useNotificationSummary((s) => s.summary?.unread_messages_count ?? 0);

  const [moneyWindow, setMoneyWindow] = useState<MoneyWindow>('month');

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

  // ── Verification ────────────────────────────────────────────────
  // An older backend sends only the badge bit. Reconstructing the summary from
  // it keeps this screen working there, at the cost of falling back to the old
  // "you have a task" reading — which is what that backend can actually tell us.
  const verification: VerificationSummary | null = home
    ? (home.profile.verification ?? {
        status: (home.profile.verification_status ??
          'unverified') as VerificationSummary['status'],
        badge: home.profile.verified,
        ownership_verified: false,
        score: null,
        threshold: 0.85,
        checked_at: null,
        checklist: null,
      })
    : null;
  const { nudge, markCelebrated, dismiss } = useVerificationNudge(
    userId,
    isCreator ? verification : null,
  );

  // ── Whose move ──────────────────────────────────────────────────
  // Older builds of the API don't send `turn`; those projects fall into the
  // actionable list rather than vanishing from the screen entirely.
  const ongoing = home?.ongoing ?? [];
  const yourMove = ongoing.filter((p) => (p.turn ?? 'you') === 'you');
  const theirMove = ongoing.filter((p) => p.turn === 'them');

  const analytics = home?.analytics;
  const attention = home?.attention ?? null;
  const reach = home?.reach ?? null;
  const money = home?.money ?? null;
  const funnel = analytics?.funnel;

  /**
   * Days-since-anything-happened, per project, so the "with others" list can
   * mark the dying ones in place. The API sends its own top-3 `stalled` list;
   * this map is what turns that into a property of a row rather than a second
   * list of the same projects.
   */
  const stalledDays = new Map((analytics?.stalled ?? []).map((s) => [s.id, s.idle_days]));

  // Decisions that live outside a project, most urgent first. The order is the
  // card's order AND what its single button aims at, so it has to be right.
  const reviewItems: ReviewItem[] = [
    counts?.awaiting_me
      ? {
          key: 'awaiting',
          icon: <Handshake size={17} color={t.color.brand} />,
          count: counts.awaiting_me,
          title: `${counts.awaiting_me} ${counts.awaiting_me === 1 ? 'proposal' : 'proposals'} to review`,
          body: 'Accept the terms or send changes.',
          tone: 'brand' as const,
          onPress: () => router.push('/projects'),
        }
      : null,
    counts?.pending_requests
      ? {
          key: 'requests',
          icon: <Inbox size={17} color={t.color.warn} />,
          count: counts.pending_requests,
          title: `${counts.pending_requests} collaboration ${counts.pending_requests === 1 ? 'request' : 'requests'}`,
          body: isCreator ? 'A brand wants to work with you.' : 'Waiting for your reply.',
          tone: 'warn' as const,
          onPress: () => router.push('/requests'),
        }
      : null,
    unreadMessages
      ? {
          key: 'messages',
          icon: <MessageCircle size={17} color={t.color.brand} />,
          count: unreadMessages,
          title: `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`,
          body: 'Someone is waiting on a reply.',
          tone: 'brand' as const,
          onPress: () => router.push('/messages'),
        }
      : null,
    // Only when there is genuinely something to DO — i.e. the bio-link proof is
    // still missing. Someone who already did it during signup gets the progress
    // card below instead of being sent back to a finished task.
    isCreator && nudge === 'action'
      ? {
          key: 'verify',
          icon: <BadgeCheck size={17} color={t.color.brand} />,
          count: 1,
          title: 'Verify your Instagram',
          body: 'Verified creators get more requests.',
          tone: 'brand' as const,
          onPress: () => router.push('/verification'),
        }
      : null,
  ].filter(Boolean) as ReviewItem[];

  // ── Chart series ────────────────────────────────────────────────
  const trendSource = dashboard?.earnings_trend ?? dashboard?.weekly_spend ?? [];
  const moneyTrend: TrendPoint[] = trendSource.map((w) => ({ label: w.week, value: w.amount }));
  const pipelineValue = dashboard?.stats?.pipeline_value ?? 0;
  const completedValue = dashboard?.stats?.completed_value ?? 0;

  /**
   * Six funnel steps from the API, falling back to the four phases an older
   * backend sends. The fallback keeps the strip populated rather than making
   * the section vanish on a backend that is one deploy behind.
   */
  const pipelineSteps: PipelineStep[] =
    home?.pipeline ??
    (analytics?.phases ?? []).map((p) => ({ key: p.label, label: p.label, count: p.value }));
  const pipelineHasWork = pipelineSteps.some((s) => s.count > 0);

  /**
   * Settled money is only meaningful once something has settled. Until then the
   * dashboard's trend is agreed budgets wearing an "earnings" label, and this
   * card says which of the two it is showing rather than quietly conflating
   * money that arrived with money that was promised.
   */
  const hasSettled = money?.settled_payments_exist ?? false;
  const windowValue = money ? money.windows[moneyWindow] : 0;

  const reachChannels: BarListItem[] = (reach?.channels ?? []).map((c) => ({
    label: platformLabel(c.link_type),
    value: c.clicks,
    color: platformColor(c.link_type),
    icon: <PlatformMark platform={c.link_type} size={22} />,
  }));

  const nothingPending = reviewItems.length === 0 && yourMove.length === 0;

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

      {/* The badge is granted by a background pipeline, usually while the app
          is shut. Home is the first place its owner comes back to, so it is
          where the news gets delivered — once. */}
      <VerifiedCelebration
        visible={nudge === 'celebrate'}
        name={(home?.profile.name ?? profile?.name ?? '').trim().split(/\s+/)[0] || null}
        onDismiss={markCelebrated}
        onSeeProfile={() => {
          markCelebrated();
          router.push('/profile');
        }}
      />

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
                <View style={{ gap: 3, flex: 1 }}>
                  <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {isCreator ? 'Pipeline value' : 'Committed spend'}
                  </Txt>
                  {/* A seven-figure pipeline is ₹12,50,000 — eleven glyphs at
                      32pt, which wrapped mid-number against the trend chip.
                      Shrink to fit rather than wrap: a headline figure broken
                      across two lines stops reading as one number. */}
                  <Txt
                    variant="display"
                    tone="inverse"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ fontVariant: ['tabular-nums'], letterSpacing: -1 }}
                  >
                    {formatCurrency(pipelineValue)}
                  </Txt>
                </View>

                {/* The month's direction belongs here, against the number it
                    describes. It used to sit in a card of its own two screens
                    down, where it explained nothing. */}
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
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
                  {analytics?.month.delta_pct != null ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt
                        variant="caption"
                        style={{ color: t.color.white, fontWeight: '700' }}
                      >
                        {analytics.month.delta_pct >= 0 ? '+' : '−'}
                        {Math.abs(analytics.month.delta_pct)}%
                      </Txt>
                      <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                        vs last month
                      </Txt>
                    </View>
                  ) : null}
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

            {/* ── Everything waiting on a decision, in one card ─────── */}
            <ReviewQueue items={reviewItems} />

            {/* ── Verification, once the proof is in ────────────────── */}
            {/* Outside the review queue on purpose: nothing here is waiting on
                the creator, so putting it in the queue would be crying wolf.
                It is status, and it says so. */}
            {nudge === 'progress' && verification ? (
              <>
                <SectionLabel>Verification</SectionLabel>
                <VerificationStatusCard
                  summary={verification}
                  onPress={() => router.push('/verification')}
                  onDismiss={dismiss}
                />
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
            {/* Silence is marked on the row rather than broken out into its own
                "Going quiet" section above. A week of nothing is the clearest
                early sign a collaboration is dying — but it is a property of
                these projects, and listing the same project twice on one screen
                made the shorter list feel like different work. */}
            {theirMove.length > 0 ? (
              <>
                <SectionLabel>Waiting on others</SectionLabel>
                <ListGroup>
                  {theirMove.map((p, i) => {
                    const idle = stalledDays.get(p.id);
                    return (
                      <ListRow
                        key={p.id}
                        title={p.title}
                        subtitle={`${p.partner ?? 'Partner'} · ${p.next_action}`}
                        index={i}
                        left={
                          idle ? (
                            <AlertCircle size={18} color={t.color.warn} />
                          ) : (
                            <Clock size={18} color={t.color.contentMuted} />
                          )
                        }
                        style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                        right={
                          idle ? (
                            <Txt variant="caption" style={{ color: t.color.warn, fontWeight: '600' }}>
                              {idle}d quiet
                            </Txt>
                          ) : (
                            <Txt variant="caption" tone="muted">
                              {timeAgo(p.updated_at)}
                            </Txt>
                          )
                        }
                        below={
                          <ProgressBar
                            progress={stageProgress(p.current_stage).ratio}
                            style={{ marginTop: t.spacing.sm }}
                          />
                        }
                        onPress={() => router.push(`/projects/${p.id}`)}
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}

            {/* ── Project pipeline ──────────────────────────────────── */}
            {/* PipelineStrip owns the icons and colours, keyed off each step's
                `key` — see the note there on why keying off array position was
                wrong and why these have to match the web dashboard's table. */}
            {pipelineHasWork ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Project pipeline
                  </Txt>
                  <Pressable onPress={() => router.push('/projects')} accessibilityRole="button">
                    <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '600' }}>
                      View all projects
                    </Txt>
                  </Pressable>
                </View>
                <Card padded={false}>
                  <View style={{ padding: t.spacing.lg }}>
                    <PipelineStrip
                      steps={pipelineSteps}
                      onPressStep={(key) =>
                        router.push(key === 'requests' ? '/requests' : '/projects')
                      }
                    />
                  </View>
                </Card>
              </>
            ) : null}

            {/* ── Money: one card, was three ────────────────────────── */}
            <SectionLabel>{isCreator ? 'Earnings' : 'Spend'}</SectionLabel>
            <Card style={{ gap: t.spacing.lg }}>
              {hasSettled && money ? (
                <>
                  <SegmentedControl<MoneyWindow>
                    segments={[
                      { value: 'week', label: 'This week' },
                      { value: 'month', label: 'This month' },
                      { value: 'year', label: 'This year' },
                    ]}
                    value={moneyWindow}
                    onChange={setMoneyWindow}
                  />

                  <View style={{ gap: 2 }}>
                    <Txt
                      variant="display"
                      style={{ fontVariant: ['tabular-nums'], letterSpacing: -1 }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCurrency(windowValue)}
                    </Txt>
                    <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {isCreator ? 'Settled to you' : 'Paid out'}
                    </Txt>
                  </View>

                  {/* Outstanding sits BESIDE settled, never added into it. A
                      card that shows one number for "money" and quietly means
                      both is the fastest way to lose a creator's trust.
                      Its own amber-tinted row with its own icon, matching the
                      web card — pinned to the right of the settled figure it
                      read as a second, smaller version of the same number. */}
                  {money.pending > 0 ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        backgroundColor: t.color.warnSoft,
                        borderRadius: t.radii.md,
                        paddingHorizontal: t.spacing.md,
                        paddingVertical: t.spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: t.radii.sm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: t.color.white,
                        }}
                      >
                        <CreditCard size={16} color={t.color.warn} />
                      </View>
                      <View style={{ gap: 1 }}>
                        <Txt
                          variant="title3"
                          style={{ fontVariant: ['tabular-nums'], color: t.color.warn }}
                        >
                          {formatCurrency(money.pending)}
                        </Txt>
                        <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                          {isCreator ? 'Awaiting payment' : 'Due to pay'}
                        </Txt>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={{ gap: 4 }}>
                  <Txt
                    variant="title1"
                    style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
                  >
                    {formatCurrency(analytics?.month.current ?? 0)}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {isCreator ? 'Delivered' : 'Committed'} in {analytics?.month.label ?? 'this month'} ·
                    agreed value
                  </Txt>
                </View>
              )}

              <TrendBars
                data={moneyTrend}
                formatValue={formatCompactCurrency}
                emptyLabel={
                  isCreator
                    ? 'No accepted budgets in the last six weeks'
                    : 'No committed budgets in the last six weeks'
                }
              />

              {!hasSettled && moneyTrend.some((w) => w.value > 0) ? (
                <Txt variant="caption" tone="muted">
                  No payment has settled through Influnet yet, so this shows agreed deal value
                  rather than money received.
                </Txt>
              ) : null}
            </Card>

            {/* ── Where your visitors go ─────────────────────────────── */}
            {/*
              This was a two-column row — reach on the left, a compact copy of
              the review queue on the right — and both halves were wrong.

              The right half rendered the SAME `reviewItems` already rendered in
              full by <ReviewQueue> at the top of this screen: the same counts,
              the same rows, and a second "Review now" button aimed at the same
              destination. Two cards claiming "you have 3 things to review" one
              scroll apart is not emphasis, it's a bug that makes a creator
              wonder whether there are six.

              The left half was a web layout on a phone. Two flex:1 columns on a
              375pt screen leaves ~165pt per card, and the reach breakdown had
              to fit a mark, a 36pt label column, a bar and a value inside that
              — which is why it carried its own hand-rolled shrunken bar list
              instead of using BarList. Full width, it is just BarList, with the
              platform's own colour on each bar.
            */}
            {isCreator && reach && reach.clicks > 0 ? (
              <>
                <SectionLabel>Where your visitors go</SectionLabel>
                <Card style={{ gap: t.spacing.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Txt variant="title1" style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
                          {formatCount(reach.clicks)}
                        </Txt>
                        {reach.delta_pct != null ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <ArrowUpRight
                              size={13}
                              color={reach.delta_pct >= 0 ? t.color.ok : t.color.danger}
                            />
                            <Txt
                              variant="caption"
                              style={{
                                fontWeight: '700',
                                color: reach.delta_pct >= 0 ? t.color.ok : t.color.danger,
                              }}
                            >
                              {Math.abs(reach.delta_pct)}%
                            </Txt>
                          </View>
                        ) : null}
                      </View>
                      <Txt variant="caption" tone="muted">
                        Taps on your links · {formatCount(reach.people)} people
                      </Txt>
                    </View>

                    <View
                      style={{
                        backgroundColor: t.color.brandSoft,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: t.radii.pill,
                      }}
                    >
                      <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '700' }}>
                        {reach.window_days}d
                      </Txt>
                    </View>
                  </View>

                  <BarList data={reachChannels} formatValue={formatCount} />

                  {attention?.business_viewers != null ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${attention.business_viewers} business owners viewed your profile`}
                      onPress={() => router.push('/profile')}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.sm,
                        paddingTop: t.spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: t.color.hairline,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Eye size={15} color={t.color.brand} />
                      <Txt variant="footnote" tone="soft" style={{ flex: 1 }}>
                        {formatCount(attention.business_viewers)} business owners viewed you
                      </Txt>
                      <ChevronRight size={15} color={t.color.contentMuted} />
                    </Pressable>
                  ) : null}
                </Card>
              </>
            ) : null}

            {/* ── At a glance ───────────────────────────────────────── */}
            {/* Every tile carries its icon in a roundel of its own hue, the
                way the web dashboard's counter row does. The hues are STAT_TINT
                — the same six the pipeline strip uses — so a colour means the
                same thing everywhere on this screen. */}
            <SectionLabel>At a glance</SectionLabel>
            <StatGrid>
              {attention ? (
                <StatCard
                  label="Profile views"
                  value={formatCount(attention.profile_views)}
                  icon={<Eye size={15} color={STAT_TINT.views} />}
                  tint={STAT_TINT.views}
                  delta={attention.profile_views_delta_pct}
                  hint={attention.profile_views_delta_pct == null ? `last ${attention.window_days}d` : undefined}
                />
              ) : null}

              {isCreator && attention?.business_viewers != null ? (
                <StatCard
                  label="Brands who looked"
                  value={formatCount(attention.business_viewers)}
                  icon={<Users size={15} color={STAT_TINT.brands} />}
                  tint={STAT_TINT.brands}
                  hint="all time"
                />
              ) : null}

              <StatCard
                label="Collab requests"
                value={(isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0}
                icon={<Inbox size={15} color={STAT_TINT.requests} />}
                tint={STAT_TINT.requests}
                hint={((isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0) > 0 ? 'pending' : undefined}
                onPress={() => router.push('/requests')}
              />

              <StatCard
                label="Projects"
                value={counts?.ongoing ?? 0}
                icon={<FolderKanban size={15} color={STAT_TINT.projects} />}
                tint={STAT_TINT.projects}
                hint={counts?.ongoing ? 'active' : undefined}
                onPress={() => router.push('/projects')}
              />

              <StatCard
                label="Completed"
                value={counts?.completed ?? 0}
                icon={<BadgeCheck size={15} color={STAT_TINT.completed} />}
                tint={STAT_TINT.completed}
              />

              {funnel?.accept_rate != null ? (
                <StatCard
                  label={isCreator ? 'Accepted' : 'Acceptance'}
                  value={`${funnel.accept_rate}%`}
                  icon={<Handshake size={15} color={STAT_TINT.moves} />}
                  tint={STAT_TINT.moves}
                  hint={`of ${funnel.received} received`}
                />
              ) : (
                <StatCard
                  label="Needs your move"
                  value={counts?.your_turn ?? yourMove.length}
                  icon={<Handshake size={15} color={STAT_TINT.moves} />}
                  tint={STAT_TINT.moves}
                  onPress={() => router.push('/projects')}
                />
              )}
            </StatGrid>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
