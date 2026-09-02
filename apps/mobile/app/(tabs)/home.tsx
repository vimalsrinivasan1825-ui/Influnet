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
 * "Whose move is it" comes from the API (`turn` / `next_action` per project),
 * which derives it from STAGE_ACTOR plus each side's sign-off in stage_progress
 * — see projectTurn() in @influnet/core.
 *
 * ── THE FLAT REDESIGN ─────────────────────────────────────────────────
 *
 * Three things changed together, and they only work together:
 *
 *  1. **No gradients.** The pipeline-value card was a filled brand ramp and the
 *     page sat on a brand wash. Both were the accent used as *scenery*: a
 *     coloured haze you cannot press, behind content whose contrast it lowers.
 *     Every surface is now flat — white cards, hairline borders, one grey page.
 *
 *  2. **The accent leads instead.** Freed from the background, pink (brands) /
 *     purple (creators) now marks the things you act on: the headline's second
 *     line, every primary button, the bell when it has something, the
 *     highest-priority tile. This is the "dominate with the role colour" ask,
 *     and flattening the backgrounds is what makes it possible — an accent
 *     cannot dominate a screen that is already tinted with it.
 *
 *  3. **Colour still MEANS something.** The counter tiles keep the six-hue
 *     STAT_TINT table below, so amber reads the same here as it does in the
 *     pipeline strip and on the web dashboard. One exception, made
 *     deliberately: Profile views takes the role accent, because it is the tile
 *     that leads the grid and the accent is what says "this one first".
 *
 * ── AND THE EMPTY CASE ────────────────────────────────────────────────
 *
 * Everything above assumes an account with history. The account that has none
 * is the one this screen used to fail hardest: a headline saying "you're all
 * caught up", an empty pipeline, and six bold zeros — an accurate screen that
 * tells someone on day one they have reached the end of something.
 *
 * `mood` below is what decides between those worlds, and the three pieces that
 * answer it are components/home-setup-card.tsx (progress instead of absence),
 * the `dormant` state in ui/stat-card.tsx (an instruction instead of a zero),
 * and the headline in components/home-header.tsx.
 */
import { useState } from 'react';
import { View } from 'react-native';
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
  Megaphone,
  MessageCircle,
  TrendingUp,
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
import { useFirstMilestone } from '@/lib/use-first-milestone';
import { HomeHeader, type HomeMood } from '@/components/home-header';
import {
  HomeBrowseCampaigns,
  HomeEmptyPipeline,
  HomeSetupCard,
  buildSetupSteps,
} from '@/components/home-setup-card';
import { HomeMilestoneCard } from '@/components/home-milestone-card';
import { HomeCampaignsRail, type RailCampaign } from '@/components/home-campaigns-rail';
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
  Appear,
  BarList,
  Card,
  ErrorState,
  ListGroup,
  ListRow,
  PressableScale,
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

/**
 * Thirty days of daily counts per tile, oldest first — the sparkline data.
 *
 * Absent entirely on an older backend, which is why every read below goes
 * through `series?.x` and StatCard treats undefined as "draw no chart" rather
 * than "draw a flat line". A flat line is a claim about the data; no line is
 * the truth, which is that this deploy cannot tell us.
 */
interface HomeSeries {
  window_days: number;
  /** Null — not zero-filled — when the view table could not be read. */
  profile_views: number[] | null;
  requests: number[];
  projects_started: number[];
  completed: number[];
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
  /**
   * The most recent settled payment, named — the first-payment milestone card
   * reads this for its body. Absent on an older backend. See /api/home.
   */
  last_payment?: { amount: number; partner: string | null } | null;
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
  /**
   * The public-facing record, read here for exactly one purpose: deciding which
   * setup steps are already done (see buildSetupSteps). Both roles' shapes are
   * optional on every field because this is the one place Home reads a profile
   * it does not own the schema of.
   */
  public_profile?: {
    username?: string | null;
    bio?: string | null;
    niche?: string[] | null;
    instagram_handle?: string | null;
    youtube_handle?: string | null;
    industry?: string | null;
    website?: string | null;
    approval_status?: string | null;
  } | null;
  ongoing: OngoingProject[];
  /** All absent on an older backend; every reader below tolerates that. */
  analytics?: HomeAnalytics;
  attention?: HomeAttention | null;
  series?: HomeSeries | null;
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
  /**
   * Live campaigns for the rail. Empty array and null mean different things and
   * are both handled: empty means the board really has nothing (the section is
   * removed), null means the request failed and the section is removed too —
   * but only the section, never the screen.
   */
  campaigns: RailCampaign[] | null;
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
 * One hue per counter tile.
 *
 * Deliberately the SAME values PipelineStrip uses, rather than a second palette
 * invented for this grid: a screen where amber means Review in one card and
 * "acceptance rate" in the next is a screen where colour means nothing. These
 * stay off the role accent — `brand` recolours per role, and a tile that
 * changes hue depending on who signed in cannot be a stable identity.
 *
 * `views` is the one exception and it is not an oversight: it takes the role
 * accent at the call site below. It is the first tile in the grid and the
 * accent is the app's way of saying "start here", so spending it on the lead
 * tile is the accent doing its job rather than decorating a seventh thing.
 */
const STAT_TINT = {
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
  // Drives the count on the header bell. Without this the bell was decorative —
  // HomeHeader accepts `unread`, and nothing ever gave it a number.
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

    const creator = home.data.role === 'influencer';

    /**
     * Both follow-ups in parallel — they depend on `role`, not on each other.
     *
     * The campaign query differs by side and that is the whole point of it: a
     * creator wants the open board (work they can apply for), while a brand
     * wants THEIR campaigns (work they are running). Showing a brand other
     * brands' listings on their own home screen is a competitor feed, not a
     * feature.
     */
    const [dashboard, campaigns] = await Promise.all([
      creator
        ? endpoints.influencerDashboard<DashboardPayload>()
        : endpoints.businessDashboard<DashboardPayload>(),
      endpoints.campaigns<{ campaigns: RailCampaign[] }>(creator ? undefined : { mine: true }),
    ]);

    // A failed dashboard costs the charts; a failed campaign list costs the
    // rail. Neither costs the screen.
    return {
      ok: true,
      status: home.status,
      error: null,
      data: {
        home: home.data,
        dashboard: dashboard.ok ? dashboard.data : null,
        // `{campaigns}` — this route's own envelope, not a shared one. See the
        // envelope note in AGENTS.md.
        campaigns: campaigns.ok ? (campaigns.data?.campaigns ?? []) : null,
      },
    };
  }, { cacheKey: 'home' });

  const home = data?.home;
  const dashboard = data?.dashboard;

  /**
   * The rail's rows. A brand's own list is filtered to `live` — a draft or an
   * expired campaign is not something to "discover", and drafts in particular
   * are visible to nobody else, so surfacing them in a discovery rail teaches
   * the wrong thing about what the section is.
   */
  const railCampaigns = (data?.campaigns ?? [])
    .filter((c) => !c.status || c.status === 'live')
    .slice(0, 8);
  const counts = home?.counts;
  const isCreator = (home?.role ?? profile?.role) === 'influencer';

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
  const series = home?.series ?? null;
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
          icon: <Handshake size={20} color={t.color.brand} />,
          count: counts.awaiting_me,
          title: `${counts.awaiting_me} ${counts.awaiting_me === 1 ? 'proposal' : 'proposals'} to review`,
          short: `${counts.awaiting_me} ${counts.awaiting_me === 1 ? 'proposal' : 'proposals'}`,
          body: 'Accept the terms or send changes.',
          tone: 'brand' as const,
          onPress: () => router.push('/projects'),
        }
      : null,
    counts?.pending_requests
      ? {
          key: 'requests',
          icon: <Inbox size={20} color={t.color.warn} />,
          count: counts.pending_requests,
          title: `${counts.pending_requests} collaboration ${counts.pending_requests === 1 ? 'request' : 'requests'}`,
          short: `${counts.pending_requests} ${counts.pending_requests === 1 ? 'request' : 'requests'}`,
          body: isCreator ? 'A brand wants to work with you.' : 'Waiting for your reply.',
          tone: 'warn' as const,
          onPress: () => router.push('/requests'),
        }
      : null,
    unreadMessages
      ? {
          key: 'messages',
          icon: <MessageCircle size={20} color={t.color.brand} />,
          count: unreadMessages,
          title: `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`,
          short: `${unreadMessages} ${unreadMessages === 1 ? 'message' : 'messages'}`,
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
          icon: <BadgeCheck size={20} color={t.color.brand} />,
          count: 1,
          title: 'Verify your Instagram',
          short: 'Verify',
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

  const pendingTotal = reviewItems.reduce((sum, i) => sum + i.count, 0);
  const nothingPending = reviewItems.length === 0 && yourMove.length === 0;

  // ── Which of the two worlds is this? ────────────────────────────
  //
  // `first-run` is the strict reading of "this account has never done
  // anything": no project of any kind, no request ever received, nothing
  // waiting. It is deliberately strict — a single completed project is enough
  // history to earn the ordinary screen, and being shown a setup checklist
  // after you have already delivered work is insulting in a way an empty
  // dashboard is not.
  const hasAnyActivity =
    (counts?.ongoing ?? 0) > 0 ||
    (counts?.completed ?? 0) > 0 ||
    (funnel?.received ?? 0) > 0 ||
    pendingTotal > 0;

  const mood: HomeMood = !home
    ? 'clear'
    : pendingTotal > 0 || yourMove.length > 0
      ? 'waiting'
      : !hasAnyActivity
        ? 'first-run'
        : ongoing.length > 0
          ? 'active'
          : 'clear';

  const pub = home?.public_profile ?? null;
  const setupSteps = buildSetupSteps({
    isCreator,
    // Business accounts have no bio; their equivalent "did you fill this in"
    // signal is the industry they picked at signup.
    hasBio: isCreator ? !!pub?.bio : !!pub?.industry,
    hasNiche: (pub?.niche?.length ?? 0) > 0,
    hasSocial: !!pub?.instagram_handle || !!pub?.youtube_handle,
    verified: verification?.badge ?? false,
    approved: (pub?.approval_status ?? 'approved') === 'approved',
    hasActivity: hasAnyActivity,
  });
  const showSetup = mood === 'first-run' && setupSteps.some((s) => !s.done);

  /**
   * The 0 → first transition, announced once. See lib/use-first-milestone.ts.
   *
   * `profileViews` is passed through `attention` rather than `series`, because
   * the tile's own figure is the one the card is congratulating them on and the
   * two must not be able to disagree. Null attention (an unreadable view table)
   * stays null all the way down — it must never read as a first view.
   */
  const { milestone, acknowledge } = useFirstMilestone(userId, {
    profileViews: attention ? attention.profile_views : null,
    requestsReceived: funnel?.received ?? null,
    projects: (counts?.ongoing ?? 0) + (counts?.completed ?? 0),
    earned: money?.earned ?? null,
    paymentAmount: money?.last_payment?.amount ?? null,
    paymentFrom: money?.last_payment?.partner ?? null,
    isCreator,
  });

  // Entrance ordering. One running counter rather than hard-coded indices, so
  // a section that does not render does not leave a hole in the stagger — the
  // cards that DO appear arrive back-to-back regardless of which ones those are.
  let step = 0;
  const nextStep = () => step++;

  return (
    <Screen padded={false}>
      <HomeHeader
        name={home?.profile.name ?? profile?.name ?? null}
        greeting={greeting()}
        mood={mood}
        pending={pendingTotal + yourMove.length}
        isCreator={isCreator}
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
            {/* ── The first time something happened ─────────────────── */}
            {/* Above everything, including the setup card: this is news, and
                the setup card is a chore. Fires at most four times in an
                account's life — see lib/use-first-milestone.ts. */}
            {milestone ? (
              <Appear index={nextStep()}>
                <HomeMilestoneCard milestone={milestone} onAcknowledge={acknowledge} />
              </Appear>
            ) : null}

            {/* ── Day one: progress, not absence ────────────────────── */}
            {/* First on the screen and above everything else, because on a
                brand-new account it is the only card with anything in it.
                See the note at the top of home-setup-card.tsx. */}
            {showSetup ? (
              <Appear index={nextStep()}>
                <HomeSetupCard steps={setupSteps} name={home?.profile.name ?? profile?.name} />
              </Appear>
            ) : null}

            {/* ── Everything waiting on a decision, in one card ─────── */}
            {/* Leads the screen now. The headline above already says how many
                things need attention; this is that sentence's detail, and
                putting a money figure between the two made the header read as
                a caption for the wrong card. */}
            {reviewItems.length > 0 ? (
              <Appear index={nextStep()}>
                <ReviewQueue items={reviewItems} />
              </Appear>
            ) : null}

            {/* ── Verification, once the proof is in ────────────────── */}
            {/* Outside the review queue on purpose: nothing here is waiting on
                the creator, so putting it in the queue would be crying wolf.
                It is status, and it says so. */}
            {nudge === 'progress' && verification ? (
              <Appear index={nextStep()}>
                <SectionLabel>Verification</SectionLabel>
                <VerificationStatusCard
                  summary={verification}
                  onPress={() => router.push('/verification')}
                  onDismiss={dismiss}
                />
              </Appear>
            ) : null}

            {/* ── The heart of the screen: projects held up by you ─── */}
            {/* Each row names the concrete next step for this stage, so the
                answer to "what now?" is on the row rather than two taps in. */}
            {yourMove.length > 0 ? (
              <Appear index={nextStep()}>
                <SectionLabel>
                  {yourMove.length === 1 ? 'Your move' : `Your move · ${yourMove.length}`}
                </SectionLabel>
                <View style={{ gap: t.spacing.sm }}>
                  {yourMove.map((p) => {
                    const { index, ratio } = stageProgress(p.current_stage);

                    return (
                      <PressableScale
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.title}. Your move: ${p.next_action}`}
                        onPress={() => router.push(`/projects/${p.id}`)}
                      >
                        {/* The one card on the screen that carries the accent
                            on its border. These are the rows that are actually
                            blocked on this person, and the accent is how the
                            screen says so without a second badge. */}
                        <Card
                          raised
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: t.spacing.lg,
                            borderColor: t.color.brandRing,
                          }}
                        >
                          {/* No caption. The row underneath already names
                              the stage in words ("Content production"), so
                              "stage" under the figure was labelling something
                              stated twice over — and it pushed the number off
                              centre to do it. */}
                          <ProgressRing
                            progress={ratio}
                            size={54}
                            label={`${index + 1}/${STAGES.length}`}
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
                          <ChevronRight size={18} color={t.color.brand} />
                        </Card>
                      </PressableScale>
                    );
                  })}
                </View>
              </Appear>
            ) : null}

            {/* ── Caught up ─────────────────────────────────────────── */}
            {/* Only for an account that HAS history. "You're all caught up"
                said to someone on day one reads as sarcasm — they have not
                caught up with anything, they have not started. That case is
                owned by the setup card above and the empty pipeline below,
                which say so in words that fit. */}
            {nothingPending && hasAnyActivity ? (
              <Appear index={nextStep()}>
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
              </Appear>
            ) : null}

            {/* ── Live, but not yours to move ───────────────────────── */}
            {/* Silence is marked on the row rather than broken out into its own
                "Going quiet" section above. A week of nothing is the clearest
                early sign a collaboration is dying — but it is a property of
                these projects, and listing the same project twice on one screen
                made the shorter list feel like different work. */}
            {theirMove.length > 0 ? (
              <Appear index={nextStep()}>
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
              </Appear>
            ) : null}

            {/* ── The headline figure, flat ─────────────────────────── */}
            {/*
              This was a filled brand-gradient block at the very top of the
              screen. Two things were wrong with that and only one of them was
              the gradient.

              The gradient itself: white text on a saturated ramp is the lowest
              contrast on the page, spent on the largest number on it, and it
              made the role accent read as wallpaper rather than as something
              you press. Flat now — the accent survives as the figure's own
              colour and the tint behind its icon, which is more of the accent
              where it counts and less of it where it does not.

              The position: a money total is context, not an action. Sitting
              above the review queue it was the first thing on the screen every
              morning, answering a question nobody opens an app to ask. It sits
              under the work now.

              Rendered at all only when there is a figure. A ₹0 pipeline card on
              a new account is the wall-of-zeros problem in its largest possible
              type.
            */}
            {pipelineValue > 0 || completedValue > 0 ? (
              <Appear index={nextStep()}>
                <Card style={{ gap: t.spacing.md }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: t.spacing.md,
                    }}
                  >
                    <View style={{ gap: 3, flex: 1 }}>
                      <Txt
                        variant="caption"
                        tone="muted"
                        style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                      >
                        {isCreator ? 'Pipeline value' : 'Committed spend'}
                      </Txt>
                      {/* A seven-figure pipeline is ₹12,50,000 — eleven glyphs
                          at 32pt, which wrapped mid-number against the trend
                          chip. Shrink to fit rather than wrap: a headline figure
                          broken across two lines stops reading as one number. */}
                      <Txt
                        variant="display"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{
                          color: t.color.brand,
                          fontVariant: ['tabular-nums'],
                          letterSpacing: -1,
                        }}
                      >
                        {formatCurrency(pipelineValue)}
                      </Txt>
                    </View>

                    {/* The month's direction belongs here, against the number it
                        describes. It used to sit in a card of its own two
                        screens down, where it explained nothing. */}
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: t.color.brandSoft,
                        }}
                      >
                        <TrendingUp size={18} color={t.color.brand} />
                      </View>
                      {analytics?.month.delta_pct != null ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Txt
                            variant="caption"
                            style={{
                              fontWeight: '700',
                              color:
                                analytics.month.delta_pct >= 0 ? t.color.ok : t.color.danger,
                            }}
                          >
                            {analytics.month.delta_pct >= 0 ? '+' : '−'}
                            {Math.abs(analytics.month.delta_pct)}%
                          </Txt>
                          <Txt variant="caption" tone="muted">
                            vs last month
                          </Txt>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTopWidth: 1,
                      borderTopColor: t.color.hairline,
                      paddingTop: t.spacing.md,
                    }}
                  >
                    <Txt variant="footnote" tone="soft">
                      {counts?.ongoing
                        ? `Across ${counts.ongoing} active ${counts.ongoing === 1 ? 'project' : 'projects'}`
                        : 'No active projects yet'}
                    </Txt>
                    {completedValue > 0 || (counts?.completed || 0) > 0 ? (
                      <Txt variant="footnote" style={{ fontWeight: '600' }}>
                        {completedValue > 0
                          ? `${formatCurrency(completedValue)}`
                          : `${counts?.completed || 0}`}{' '}
                        completed
                      </Txt>
                    ) : null}
                  </View>
                </Card>
              </Appear>
            ) : null}

            {/* ── Project pipeline ──────────────────────────────────── */}
            {/* PipelineStrip owns the icons and colours, keyed off each step's
                `key` — see the note there on why keying off array position was
                wrong and why these have to match the web dashboard's table. */}
            {/* The section keeps its heading in both states. A first-run
                account that never sees the words "Project pipeline" cannot
                learn that projects are a thing this app has — which is the
                whole reason the empty variant is a diagram and not a shrug.

                An account WITH history and no live work gets neither: it
                already knows what a project is, and "No projects yet" is
                factually wrong for someone who has finished three. */}
            {pipelineHasWork || !hasAnyActivity ? (
              <Appear index={nextStep()}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: t.spacing.md,
                    marginBottom: t.spacing.xs,
                  }}
                >
                  <Txt
                    variant="caption"
                    tone="muted"
                    style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                  >
                    Project pipeline
                  </Txt>
                  {pipelineHasWork ? (
                    <PressableScale
                      onPress={() => router.push('/projects')}
                      accessibilityRole="button"
                    >
                      <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '700' }}>
                        View all projects
                      </Txt>
                    </PressableScale>
                  ) : null}
                </View>
                {pipelineHasWork ? (
                  // Vertical padding on the card, horizontal padding on the
                  // scroller's CONTENT. The strip has six steps and never fits
                  // 375pt, so the last visible one has to be cut by the card's
                  // own edge — a step cut off 16pt short of the edge reads as
                  // clipped-by-mistake rather than as "there is more, push it".
                  <Card padded={false}>
                    <View style={{ paddingVertical: t.spacing.lg }}>
                      <PipelineStrip
                        steps={pipelineSteps}
                        inset={t.spacing.lg}
                        onPressStep={(key) =>
                          router.push(key === 'requests' ? '/requests' : '/projects')
                        }
                      />
                    </View>
                  </Card>
                ) : (
                  <HomeEmptyPipeline isCreator={isCreator} />
                )}
              </Appear>
            ) : null}

            {/* ── Money: one card, was three ────────────────────────── */}
            {/* Skipped entirely on an account with no money story at all. The
                old screen drew a ₹0 headline over an empty six-week chart and a
                caption explaining that no payment had ever settled — three
                pieces of furniture to say "nothing yet", on the screen where
                that is least worth saying. */}
            {hasSettled || moneyTrend.some((w) => w.value > 0) ? (
              <Appear index={nextStep()}>
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
                        <Txt
                          variant="caption"
                          tone="muted"
                          style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                        >
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
                            <Txt
                              variant="caption"
                              tone="muted"
                              style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                            >
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
                        {isCreator ? 'Delivered' : 'Committed'} in{' '}
                        {analytics?.month.label ?? 'this month'} · agreed value
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
                      No payment has settled through Influnet yet, so this shows agreed deal
                      value rather than money received.
                    </Txt>
                  ) : null}
                </Card>
              </Appear>
            ) : null}

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
              <Appear index={nextStep()}>
                <SectionLabel>Where your visitors go</SectionLabel>
                <Card style={{ gap: t.spacing.lg }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Txt
                          variant="title1"
                          style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
                        >
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
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`${attention.business_viewers} business owners viewed your profile`}
                      onPress={() => router.push('/profile-viewers' as any)}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing.sm,
                          paddingTop: t.spacing.md,
                          borderTopWidth: 1,
                          borderTopColor: t.color.hairline,
                        }}
                      >
                        <Eye size={15} color={t.color.brand} />
                        <Txt variant="footnote" tone="soft" style={{ flex: 1 }}>
                          {formatCount(attention.business_viewers)} business owners viewed you
                        </Txt>
                        <ChevronRight size={15} color={t.color.contentMuted} />
                      </View>
                    </PressableScale>
                  ) : null}
                </Card>
              </Appear>
            ) : null}

            {/* ── Browse campaigns ────────────────────────────────── */}
            {/* Two forms of the same destination, and which one you get depends
                on whether you already know what is there. Someone with history
                gets a one-line row — they are scanning, not learning. Someone
                on day one gets the explanatory card, because "Campaigns" as a
                bare label means nothing until you have opened it once. */}
            <Appear index={nextStep()}>
              <SectionLabel>Campaigns</SectionLabel>
              {showSetup ? (
                <HomeBrowseCampaigns isCreator={isCreator} />
              ) : (
                <PressableScale onPress={() => router.push('/campaigns' as never)}>
                  <Card
                    raised
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: t.color.brandSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Megaphone size={19} color={t.color.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">Browse open campaigns</Txt>
                        <Txt variant="caption" tone="muted">
                          Find opportunities that match your audience
                        </Txt>
                      </View>
                    </View>
                    <ChevronRight size={18} color={t.color.brand} />
                  </Card>
                </PressableScale>
              )}
            </Appear>

            {/* ── At a glance ───────────────────────────────────────── */}
            {/*
              Every tile carries its icon in a roundel of its own hue and a
              30-day sparkline under the number — the shape is the answer to
              "which way is this going", which is the question a bare total
              cannot answer at any size.

              Shape per tile is chosen by what the data IS, not for variety:
              area for continuous levels (views), bars for counted events
              (requests, projects, completions). See ui/sparkline.tsx.

              `emptyHint` is what a tile says instead of a bare bold zero. Read
              the whole grid on a new account and it is now a set of
              instructions rather than a set of zeros — which is the entire
              point of the change.
            */}
            <Appear index={nextStep()}>
              <SectionLabel>At a glance</SectionLabel>
              <StatGrid>
                {/* Omitted entirely when `attention` is null — the view table
                    could not be read, which is not the same as nobody looking,
                    and there is no honest tile for "we don't know". */}
                {attention ? (
                  <StatCard
                    index={0}
                    label="Profile views"
                    value={attention.profile_views}
                    icon={<Eye size={15} color={t.color.brand} />}
                    // The one tile on the role accent. It leads the grid, and
                    // the accent is how this app says "start here".
                    tint={t.color.brand}
                    delta={attention.profile_views_delta_pct}
                    series={series?.profile_views}
                    // The previous 30 days. This is what turns "0 views" from
                    // an empty slot into "your views stopped", which is the
                    // more urgent of the two and used to be invisible.
                    lifetime={attention.profile_views_prior}
                    hint={
                      attention.profile_views_delta_pct == null
                        ? `last ${attention.window_days}d`
                        : undefined
                    }
                    emptyHint={
                      isCreator
                        ? 'Share your profile link to get seen.'
                        : 'Creators check your page before replying.'
                    }
                    pausedHint={
                      attention.profile_views_prior > 0
                        ? `Quiet — ${formatCount(attention.profile_views_prior)} the month before`
                        : undefined
                    }
                  />
                ) : null}

                {isCreator && attention?.business_viewers != null ? (
                  <StatCard
                    index={1}
                    label="Brands who looked"
                    value={attention.business_viewers}
                    icon={<Users size={15} color={STAT_TINT.brands} />}
                    tint={STAT_TINT.brands}
                    hint="all time"
                    emptyHint="Verified creators show up first in search."
                  />
                ) : null}

                <StatCard
                  index={2}
                  label="Collab requests"
                  value={(isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0}
                  icon={<Inbox size={15} color={STAT_TINT.requests} />}
                  tint={STAT_TINT.requests}
                  series={series?.requests}
                  seriesShape="bars"
                  // All-time received. Zero pending with eleven behind you is
                  // "you're on top of it"; zero pending with none ever is a
                  // different sentence entirely.
                  lifetime={funnel?.received}
                  hint={
                    ((isCreator ? counts?.pending_requests : counts?.awaiting_them) ?? 0) > 0
                      ? 'pending'
                      : undefined
                  }
                  emptyHint={
                    isCreator ? 'None yet — get verified to rank higher.' : 'Reach out to a creator to start one.'
                  }
                  pausedHint={
                    funnel?.received
                      ? `All answered · ${formatCount(funnel.received)} received`
                      : 'All answered'
                  }
                  onPress={() => router.push('/requests')}
                />

                <StatCard
                  index={3}
                  label="Projects"
                  value={counts?.ongoing ?? 0}
                  icon={<FolderKanban size={15} color={STAT_TINT.projects} />}
                  tint={STAT_TINT.projects}
                  series={series?.projects_started}
                  seriesShape="bars"
                  // Finished work counts as history. "0 active" beside three
                  // completed is a lull; "0 active" beside nothing is day one.
                  lifetime={counts?.completed}
                  hint={counts?.ongoing ? 'active' : undefined}
                  emptyHint="Accepted requests become projects."
                  pausedHint={
                    counts?.completed
                      ? `Between projects · ${counts.completed} done`
                      : 'Nothing active right now'
                  }
                  onPress={() => router.push('/projects')}
                />

                <StatCard
                  index={4}
                  label="Completed"
                  value={counts?.completed ?? 0}
                  icon={<BadgeCheck size={15} color={STAT_TINT.completed} />}
                  tint={STAT_TINT.completed}
                  series={series?.completed}
                  seriesShape="bars"
                  emptyHint="Finished work shows up here."
                />

                {funnel?.accept_rate != null ? (
                  <StatCard
                    index={5}
                    label={isCreator ? 'Accepted' : 'Acceptance'}
                    value={`${funnel.accept_rate}%`}
                    icon={<Handshake size={15} color={STAT_TINT.moves} />}
                    tint={STAT_TINT.moves}
                    hint={`of ${funnel.received} received`}
                  />
                ) : (
                  <StatCard
                    index={5}
                    label="Needs your move"
                    value={counts?.your_turn ?? yourMove.length}
                    icon={<Handshake size={15} color={STAT_TINT.moves} />}
                    tint={STAT_TINT.moves}
                    lifetime={counts?.ongoing}
                    emptyHint="Nothing is blocked on you."
                    pausedHint="Nothing is blocked on you."
                    onPress={() => router.push('/projects')}
                  />
                )}
              </StatGrid>
            </Appear>

            {/* ── Discover campaigns ────────────────────────────────── */}
            {/* Renders nothing when the list is empty — heading included. A
                "Discover campaigns" title over an empty rail is a section whose
                only content is an apology, and the Campaigns row above already
                covers the case where there is nothing on the board today.

                No match score on these cards. There is nothing in this product
                that could compute one, and a fabricated percentage changes
                which campaign someone applies to — see the note in
                home-campaigns-rail.tsx. */}
            <HomeCampaignsRail campaigns={railCampaigns} isCreator={isCreator} />
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
