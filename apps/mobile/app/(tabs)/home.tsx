/**
 * Home.
 *
 * Reads in one pass down the screen: what needs a decision from you, what your
 * money is doing, then what's in flight. The charts are all fed by endpoints
 * that already existed — /api/{influencer,business}/dashboard carry a six-week
 * trend and a pipeline breakdown that this screen previously ignored, which is
 * why it read as a list of bare numbers next to the web dashboard.
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BadgeCheck,
  ChevronRight,
  Eye,
  FolderKanban,
  Handshake,
  Inbox,
  Send,
  TrendingUp,
} from 'lucide-react-native';
import { STAGES, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  humanizeStage,
  timeAgo,
} from '@/lib/format';
import { styleForStatus } from '@/lib/deal-state-style';
import { AppHeader } from '@/components/app-header';
import { ActionCard } from '@/components/action-card';
import {
  Badge,
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

interface SocialPost {
  taken_at: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
}

interface HomePayload {
  role: string;
  profile: { name: string; location: string | null; verified: boolean; verification_status: string };
  public_path: string | null;
  social: {
    followers: number;
    engagement_rate: number;
    avg_views: number;
    posts_count: number | null;
    posts?: SocialPost[];
  } | null;
  ongoing: {
    id: string;
    title: string;
    status: string;
    current_stage: string;
    budget: number | null;
    updated_at: string;
    partner: string | null;
  }[];
  counts: {
    ongoing: number;
    completed: number;
    awaiting_me: number;
    awaiting_them: number;
    pending_requests: number;
  };
}

/** The two role dashboards differ only in what they name the same two series. */
interface DashboardPayload {
  stats?: { pipeline_value?: number };
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

  // Everything that needs a decision from this user, most urgent first.
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
          body: 'A brand wants to work with you.',
          tone: 'warn' as const,
          onPress: () => router.push('/requests'),
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

  const breakdownSource = dashboard?.request_breakdown ?? dashboard?.pipeline_data ?? [];
  const breakdown: BreakdownItem[] = breakdownSource.map((b) => ({
    label: b.name,
    value: b.value,
  }));
  const breakdownTotal = breakdown.reduce((sum, b) => sum + b.value, 0);

  // Reach across the creator's most recent posts. Views is the honest measure
  // where Instagram reports it; likes+comments is the fallback for stills.
  const postTrend: TrendPoint[] = (home?.social?.posts ?? [])
    .slice(0, 6)
    .reverse()
    .map((post, i) => ({
      label: post.taken_at
        ? new Date(post.taken_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : `#${i + 1}`,
      value: post.views ?? (post.likes ?? 0) + (post.comments ?? 0),
    }));

  const focus = home?.ongoing?.[0];
  const focusProgress = focus ? stageProgress(focus.current_stage) : null;

  return (
    <Screen padded={false}>
      <AppHeader
        subtitle={greeting()}
        title={home?.profile.name ?? profile?.name ?? 'Home'}
        avatarUri={avatar}
        avatarName={profile?.name}
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

              <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.82)' }}>
                {counts?.ongoing
                  ? `Across ${counts.ongoing} active ${counts.ongoing === 1 ? 'project' : 'projects'}`
                  : 'No active projects yet'}
              </Txt>
            </GradientCard>

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
            ) : (
              <Card style={{ gap: 4 }}>
                <Txt variant="bodyStrong">You're all caught up</Txt>
                <Txt variant="footnote" tone="muted">
                  {isCreator
                    ? 'No requests or approvals waiting. Keep your profile fresh so brands can find you.'
                    : "Nothing waiting on you. Here's where your campaigns stand."}
                </Txt>
              </Card>
            )}

            {/* ── The six weeks behind that number ─────────────────── */}
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

            {/* ── The one project most worth looking at right now ── */}
            {focus && focusProgress ? (
              <>
                <SectionLabel>Current focus</SectionLabel>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/projects/${focus.id}`)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Card
                    raised
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.lg,
                    }}
                  >
                    <ProgressRing
                      progress={focusProgress.ratio}
                      size={62}
                      label={`${focusProgress.index + 1}/${STAGES.length}`}
                      caption="stage"
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>
                        {focus.title}
                      </Txt>
                      <Txt variant="footnote" tone="soft" numberOfLines={1}>
                        {humanizeStage(focus.current_stage)}
                      </Txt>
                      <Txt variant="caption" tone="muted" numberOfLines={1}>
                        {focus.partner ?? 'Partner'} · {timeAgo(focus.updated_at)}
                      </Txt>
                    </View>
                    <ChevronRight size={18} color={t.color.contentMuted} />
                  </Card>
                </Pressable>
              </>
            ) : null}

            {/* ── Creator reach, from the cached Instagram snapshot ── */}
            {isCreator && home?.social ? (
              <>
                <SectionLabel>Your audience</SectionLabel>
                <Card style={{ gap: t.spacing.lg }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {[
                      { label: 'Followers', value: formatCount(home.social.followers) },
                      {
                        label: 'Engagement',
                        value: home.social.engagement_rate
                          ? `${home.social.engagement_rate.toFixed(1)}%`
                          : '—',
                      },
                      { label: 'Avg views', value: formatCount(home.social.avg_views) },
                    ].map((stat) => (
                      <View key={stat.label} style={{ gap: 2 }}>
                        <Txt variant="caption" tone="muted">
                          {stat.label}
                        </Txt>
                        <Txt
                          variant="title3"
                          style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}
                        >
                          {stat.value}
                        </Txt>
                      </View>
                    ))}
                  </View>

                  <View style={{ height: 1, backgroundColor: t.color.hairline }} />

                  <View style={{ gap: t.spacing.sm }}>
                    <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Reach per recent post
                    </Txt>
                    <TrendBars
                      data={postTrend}
                      formatValue={formatCount}
                      emptyLabel="Connect Instagram to see how your recent posts performed"
                    />
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
              {isCreator ? (
                <StatCard
                  label="Posts"
                  value={home?.social?.posts_count ?? '—'}
                  icon={<Eye size={15} color={t.color.contentMuted} />}
                />
              ) : (
                <StatCard
                  label="Awaiting them"
                  value={counts?.awaiting_them ?? 0}
                  icon={<Send size={15} color={t.color.contentMuted} />}
                />
              )}
              <StatCard
                label={isCreator ? 'Open requests' : 'Proposals out'}
                value={counts?.pending_requests ?? 0}
                icon={<Inbox size={15} color={t.color.contentMuted} />}
                onPress={() => router.push(isCreator ? '/requests' : '/projects')}
              />
            </StatGrid>

            {home?.ongoing?.length ? (
              <>
                <SectionLabel>In flight</SectionLabel>
                <ListGroup>
                  {home.ongoing.slice(0, 5).map((p, i) => {
                    const s = styleForStatus(p.status, t.color);
                    const { index, ratio } = stageProgress(p.current_stage);

                    return (
                      <ListRow
                        key={p.id}
                        title={p.title}
                        subtitle={`${p.partner ?? 'Partner'} · ${humanizeStage(p.current_stage)}`}
                        index={i}
                        style={
                          i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined
                        }
                        right={
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            {p.budget ? (
                              <Txt variant="footnote" tone="soft" style={{ fontVariant: ['tabular-nums'] }}>
                                {formatCurrency(p.budget)}
                              </Txt>
                            ) : (
                              <Badge label={s.label} fg={s.fg} bg={s.bg} />
                            )}
                            <Txt variant="caption" tone="muted">
                              step {index + 1} of {STAGES.length}
                            </Txt>
                          </View>
                        }
                        below={<ProgressBar progress={ratio} style={{ marginTop: t.spacing.sm }} />}
                        onPress={() => router.push(`/projects/${p.id}`)}
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
