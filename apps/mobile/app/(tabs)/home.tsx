import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BadgeCheck,
  Eye,
  FolderKanban,
  Handshake,
  Inbox,
  Send,
  Wallet,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { formatCount, formatCurrency, humanizeStage, timeAgo } from '@/lib/format';
import { styleForStatus } from '@/lib/deal-state-style';
import { AppHeader } from '@/components/app-header';
import { ActionCard } from '@/components/action-card';
import {
  Badge,
  Card,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  StatCard,
  StatGrid,
  Txt,
} from '@/components/ui';

interface HomePayload {
  role: string;
  profile: { name: string; location: string | null; verified: boolean; verification_status: string };
  public_path: string | null;
  social: { followers: number; engagement_rate: number; avg_views: number } | null;
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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const isCreator = profile?.role === 'influencer';

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.home<HomePayload>()
  );

  const counts = data?.counts;
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
    isCreator && data && !data.profile.verified
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

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <AppHeader
        subtitle={greeting()}
        title={data?.profile.name ?? profile?.name ?? 'Home'}
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
                    : 'Nothing waiting on you. Find creators who fit your next campaign.'}
                </Txt>
              </Card>
            )}

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
                <>
                  <StatCard
                    label="Followers"
                    value={formatCount(data?.social?.followers)}
                    icon={<Eye size={15} color={t.color.contentMuted} />}
                  />
                  <StatCard
                    label="Engagement"
                    value={
                      data?.social?.engagement_rate
                        ? `${data.social.engagement_rate.toFixed(1)}%`
                        : '—'
                    }
                    icon={<Send size={15} color={t.color.contentMuted} />}
                  />
                </>
              ) : (
                <>
                  <StatCard
                    label="Awaiting them"
                    value={counts?.awaiting_them ?? 0}
                    icon={<Send size={15} color={t.color.contentMuted} />}
                  />
                  <StatCard
                    label="Open requests"
                    value={counts?.pending_requests ?? 0}
                    icon={<Wallet size={15} color={t.color.contentMuted} />}
                  />
                </>
              )}
            </StatGrid>

            {data?.ongoing?.length ? (
              <>
                <SectionLabel>In flight</SectionLabel>
                <ListGroup>
                  {data.ongoing.slice(0, 5).map((p, i) => {
                    const s = styleForStatus(p.status, t.color);
                    return (
                      <ListRow
                        key={p.id}
                        title={p.title}
                        subtitle={`${p.partner ?? 'Partner'} · ${humanizeStage(p.current_stage)} · ${timeAgo(p.updated_at)}`}
                        style={
                          i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined
                        }
                        right={
                          p.budget ? (
                            <Txt variant="footnote" tone="soft">
                              {formatCurrency(p.budget)}
                            </Txt>
                          ) : (
                            <Badge label={s.label} fg={s.fg} bg={s.bg} />
                          )
                        }
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
    </View>
  );
}
