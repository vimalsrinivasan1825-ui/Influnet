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
 *
 * "Whose move is it" comes from the API (`turn` / `next_action` per project),
 * which derives it from STAGE_ACTOR plus each side's sign-off in stage_progress
 * — see projectTurn() in @influnet/core.
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  ChevronRight,
  Clock,
  Eye,
  FolderKanban,
  Globe,
  Handshake,
  Inbox,
  Link2,
  MessageCircle,
  Send,
  TrendingUp,
  Video,
  Users,
} from 'lucide-react-native';
import { STAGES, type Stage } from '@influnet/core';
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

/** Presentation for each place a visitor can be sent. */
const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  twitter: 'X',
  snapchat: 'Snapchat',
  linkedin: 'LinkedIn',
  website: 'Website',
  profile: 'Profile',
  other: 'Other',
};

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
    label: CHANNEL_LABEL[c.link_type] ?? 'Other',
    value: c.clicks,
    icon:
      c.link_type === 'instagram' ? (
        <Camera size={14} color={t.color.contentMuted} />
      ) : c.link_type === 'youtube' ? (
        <Video size={14} color={t.color.contentMuted} />
      ) : c.link_type === 'website' ? (
        <Globe size={14} color={t.color.contentMuted} />
      ) : (
        <Link2 size={14} color={t.color.contentMuted} />
      ),
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
                  <Txt
                    variant="display"
                    tone="inverse"
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

            {/* ── Project pipeline — with "View all" link and colored step indicators ─ */}
            {pipelineHasWork ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>Project pipeline</Txt>
                  <Pressable onPress={() => router.push('/projects')}>
                    <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '600' }}>View all projects</Txt>
                  </Pressable>
                </View>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.lg, gap: 4 }}
                  >
                    {pipelineSteps.map((step, idx) => {
                      // Each step gets a distinct accent colour so the pipeline
                      // reads as a progression, not a monochrome badge row.
                      const stepColors = ['#ee3e96', '#d97706', '#7c3aed', '#2563eb', '#059669', '#16a34a'];
                      const color = stepColors[idx % stepColors.length];
                      const active = step.count > 0;
                      return (
                        <Pressable
                          key={step.key}
                          onPress={() => router.push(step.key === 'requests' ? '/requests' : '/projects')}
                          style={({ pressed }) => ({
                            alignItems: 'center',
                            minWidth: 72,
                            paddingVertical: t.spacing.md,
                            paddingHorizontal: t.spacing.sm,
                            borderRadius: t.radii.md,
                            backgroundColor: active ? `${color}12` : t.color.surfaceMuted,
                            borderBottomWidth: 3,
                            borderBottomColor: active ? color : t.color.hairline,
                            opacity: pressed ? 0.8 : 1,
                            marginRight: idx < pipelineSteps.length - 1 ? t.spacing.sm : 0,
                          })}
                        >
                          <Txt
                            variant="title3"
                            style={{ color: active ? color : t.color.contentMuted, fontVariant: ['tabular-nums'] }}
                          >
                            {step.count}
                          </Txt>
                          <Txt variant="caption" tone={active ? 'soft' : 'muted'} numberOfLines={1}>
                            {step.label}
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
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

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <View style={{ gap: 2 }}>
                      <Txt
                        variant="title1"
                        style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
                      >
                        {formatCurrency(windowValue)}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {isCreator ? 'Settled to you' : 'Paid out'}
                      </Txt>
                    </View>

                    {/* Outstanding sits beside settled, never added into it. A
                        card that shows one number for "money" and quietly means
                        both is the fastest way to lose a creator's trust. */}
                    {money.pending > 0 ? (
                      <View style={{ gap: 2, alignItems: 'flex-end' }}>
                        <Txt
                          variant="title3"
                          style={{ fontVariant: ['tabular-nums'], color: t.color.warn }}
                        >
                          {formatCurrency(money.pending)}
                        </Txt>
                        <Txt variant="caption" tone="muted">
                          {isCreator ? 'Awaiting payment' : 'Due to pay'}
                        </Txt>
                      </View>
                    ) : null}
                  </View>
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

            {/* ── Two-column mid section: Reach (left) + Review queue (right) ── */}
            {/* Matches the AI reference: the two cards sit side by side so the
                first viewport shows the most critical information without scrolling. */}
            {(isCreator && reach && reach.clicks > 0) || reviewItems.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
                {/* Left: Your reach */}
                {isCreator && reach && reach.clicks > 0 ? (
                  <Card style={{ flex: 1, gap: t.spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Txt variant="footnote" style={{ fontWeight: '600' }}>Your reach</Txt>
                      <View style={{ backgroundColor: t.color.brandSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: t.radii.pill }}>
                        <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '600' }}>30d</Txt>
                      </View>
                    </View>

                    <View>
                      <Txt variant="title2" style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
                        {formatCount(reach.clicks)}
                      </Txt>
                      {reach.delta_pct != null ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <ArrowUpRight size={11} color={reach.delta_pct >= 0 ? t.color.ok : t.color.danger} />
                          <Txt variant="caption" style={{ color: reach.delta_pct >= 0 ? t.color.ok : t.color.danger, fontWeight: '600' }}>
                            {Math.abs(reach.delta_pct)}%
                          </Txt>
                        </View>
                      ) : null}
                      <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>Clicked your link</Txt>
                    </View>

                    {/* Compact bar list */}
                    <View style={{ gap: 8 }}>
                      {reachChannels.slice(0, 4).map((ch) => (
                        <View key={ch.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {ch.icon}
                          <Txt variant="caption" tone="muted" style={{ width: 36 }} numberOfLines={1}>{ch.label}</Txt>
                          <View style={{ flex: 1, height: 5, backgroundColor: t.color.hairline, borderRadius: 3, overflow: 'hidden' }}>
                            <View
                              style={{
                                height: '100%',
                                borderRadius: 3,
                                backgroundColor: t.color.brand,
                                width: `${Math.round((ch.value / (reachChannels[0]?.value || 1)) * 100)}%`,
                              }}
                            />
                          </View>
                          <Txt variant="caption" style={{ fontWeight: '600', width: 30, textAlign: 'right' }}>
                            {formatCount(ch.value)}
                          </Txt>
                        </View>
                      ))}
                    </View>

                    {/* Business viewers row */}
                    {isCreator && attention?.business_viewers != null ? (
                      <Pressable
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingTop: t.spacing.sm,
                          borderTopWidth: 1,
                          borderTopColor: t.color.hairline,
                        }}
                        onPress={() => router.push('/profile')}
                      >
                        <Eye size={14} color={t.color.brand} />
                        <Txt variant="caption" tone="soft" style={{ flex: 1 }}>
                          {formatCount(attention.business_viewers)} business owners viewed
                        </Txt>
                        <ChevronRight size={13} color={t.color.contentMuted} />
                      </Pressable>
                    ) : null}
                  </Card>
                ) : null}

                {/* Right: ReviewQueue inline (compact) */}
                {reviewItems.length > 0 ? (
                  <Card style={{ flex: 1, gap: t.spacing.sm }}>
                    <Txt variant="footnote" style={{ fontWeight: '600' }}>
                      You have {reviewItems.reduce((s, i) => s + i.count, 0)} things to review
                    </Txt>

                    <View style={{ gap: t.spacing.xs }}>
                      {reviewItems.slice(0, 3).map((item) => {
                        const tones = {
                          brand: { fg: t.color.brand, bg: t.color.brandSoft },
                          warn: { fg: t.color.warn, bg: t.color.warnSoft },
                          ok: { fg: t.color.ok, bg: t.color.okSoft },
                        } as const;
                        const c = tones[item.tone];
                        return (
                          <Pressable
                            key={item.key}
                            onPress={item.onPress}
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingVertical: t.spacing.sm,
                              borderRadius: t.radii.sm,
                              backgroundColor: pressed ? t.color.surfaceMuted : 'transparent',
                            })}
                          >
                            <View style={{ width: 30, height: 30, borderRadius: t.radii.sm, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                              {item.icon}
                            </View>
                            <Txt variant="caption" style={{ flex: 1, fontWeight: '500' }} numberOfLines={2}>{item.title}</Txt>
                            <ChevronRight size={13} color={t.color.contentMuted} />
                          </Pressable>
                        );
                      })}
                    </View>

                    <Pressable
                      onPress={reviewItems[0].onPress}
                      style={({ pressed }) => ({
                        backgroundColor: t.color.brand,
                        borderRadius: t.radii.md,
                        paddingVertical: t.spacing.sm,
                        alignItems: 'center',
                        opacity: pressed ? 0.9 : 1,
                      })}
                    >
                      <Txt variant="caption" tone="inverse" style={{ fontWeight: '700' }}>Review now →</Txt>
                    </Pressable>
                  </Card>
                ) : null}
              </View>
            ) : null}

            {/* ── At a glance — multi-color stat grid ──────────────── */}
            <SectionLabel>At a glance</SectionLabel>
            <StatGrid>
              {attention ? (
                <StatCard
                  label="Profile views"
                  value={formatCount(attention.profile_views)}
                  icon={<Eye size={15} color="#7c3aed" />}
                  delta={attention.profile_views_delta_pct}
                  hint={attention.profile_views_delta_pct == null ? `last ${attention.window_days}d` : undefined}
                />
              ) : null}

              {isCreator && attention?.business_viewers != null ? (
                <StatCard
                  label="Brands who looked"
                  value={formatCount(attention.business_viewers)}
                  icon={<Users size={15} color="#059669" />}
                  hint="all time"
                />
              ) : null}

              <StatCard
                label="Collab requests"
                value={(isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0}
                icon={<Inbox size={15} color="#ee3e96" />}
                hint={((isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0) > 0 ? 'pending' : undefined}
                onPress={() => router.push('/requests')}
              />

              <StatCard
                label="Projects"
                value={counts?.ongoing ?? 0}
                icon={<FolderKanban size={15} color="#2563eb" />}
                hint={counts?.ongoing ? 'active' : undefined}
                onPress={() => router.push('/projects')}
              />

              <StatCard
                label="Completed"
                value={counts?.completed ?? 0}
                icon={<BadgeCheck size={15} color="#16a34a" />}
              />

              {funnel?.accept_rate != null ? (
                <StatCard
                  label={isCreator ? 'Accepted' : 'Acceptance'}
                  value={`${funnel.accept_rate}%`}
                  icon={<Handshake size={15} color="#d97706" />}
                  hint={`of ${funnel.received} received`}
                />
              ) : (
                <StatCard
                  label="Needs your move"
                  value={counts?.your_turn ?? yourMove.length}
                  icon={<Handshake size={15} color="#d97706" />}
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
