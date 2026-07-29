/**
 * Profile.
 *
 * This tab used to be an account menu: name, avatar, a share button and three
 * links. Everything a creator's public page shows a brand — the follower and
 * engagement numbers, the recent posts, the videos, the ratings, the brands
 * they've delivered for — existed only on the web. So the answer to "how does
 * my profile look right now?" was "open a browser".
 *
 * It now reads the same /api/home payload the web dashboard reads, and renders
 * the public profile as the creator's own view of it. The account controls stay,
 * below the content, where they belong.
 */
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import {
  BadgeCheck,
  Eye,
  History,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Star,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { API_BASE_URL } from '@/lib/supabase';
import { endpoints } from '@/lib/api';
import { invalidateFetchCache, useFetch } from '@/lib/use-fetch';
import { formatCount } from '@/lib/format';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ChipWrap,
  Chip,
  ListGroup,
  ListRow,
  ProgressBar,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  TrendBars,
  Txt,
  VerifiedBadge,
  type TrendPoint,
} from '@/components/ui';
import { AppHeader } from '@/components/app-header';
import { Logo } from '@/components/brand/logo';
import { PostGrid, VideoList } from '@/components/content-grid';
import { PortfolioGrid, type PortfolioItem } from '@/components/portfolio-grid';

interface ProfilePayload {
  role: string;
  profile: { name: string; location: string | null; verified: boolean; verification_status: string };
  public_profile: {
    username?: string | null;
    bio?: string | null;
    niche?: string[];
    instagram_handle?: string | null;
    youtube_handle?: string | null;
    instagram_followers?: number | null;
    youtube_subscribers?: number | null;
    avatar_url?: string | null;
    company_name?: string | null;
    logo_url?: string | null;
    industry?: string | null;
  };
  public_path: string | null;
  social: {
    followers: number | null;
    engagement_rate: number | null;
    avg_views: number | null;
    posts_count: number | null;
    fetched_at?: string | null;
    // camelCase `takenAt`: /api/home passes the snapshot view straight through
    // (lib/public-profile/get-instagram-snapshot.ts), so it is NOT `taken_at`.
    posts?: {
      url: string;
      thumbUrl: string | null;
      views: number | null;
      likes: number | null;
      comments?: number | null;
      takenAt?: string | null;
    }[];
  } | null;
  youtube: {
    subscribers: number | null;
    avg_views: number | null;
    videos: { url: string; title: string; thumbUrl: string | null; views: number | null; publishedAt: string | null }[];
  } | null;
  past_collaborations?: string[];
  /** Self-reported demographics, parsed exactly as the public page parses them. */
  audience: {
    locations: { label: string; pct: number }[];
    ages: { label: string; pct: number }[];
    genders: { label: string; pct: number }[];
  } | null;
  reviews: {
    count: number;
    average: number | null;
    items: { id: string; rating: number; comment: string | null; reviewerName: string; projectTitle: string | null }[];
  } | null;
  counts: { ongoing: number; completed: number };
}

export default function ProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const { profile, signOut } = useSession();
  const [refreshingSocial, setRefreshingSocial] = useState(false);

  const { data, loading, refreshing, refresh } = useFetch<ProfilePayload>(
    () => endpoints.home<ProfilePayload>(),
    { cacheKey: 'profile-public' },
  );

  /**
   * Separate fetch rather than another field on /api/home: the portfolio is
   * Profile-only, and Home — which shares that endpoint — has no use for it.
   */
  const { data: portfolio, refresh: refreshPortfolio } = useFetch<{ items: PortfolioItem[] }>(
    () => endpoints.listPortfolio<{ items: PortfolioItem[] }>(),
    { cacheKey: 'portfolio' },
  );

  const isCreator = (data?.role ?? profile?.role) === 'influencer';
  const pp = data?.public_profile ?? {};
  const displayName = isCreator
    ? data?.profile.name ?? profile?.name
    : pp.company_name ?? profile?.company_name ?? profile?.name;
  // The captured Instagram picture is what a brand sees on the public page; the
  // locally-stored one is only a fallback for a creator with no snapshot yet.
  const avatar = isCreator ? pp.avatar_url ?? profile?.avatar_url : pp.logo_url ?? profile?.logo_url;
  const username = pp.username ?? profile?.username ?? null;
  const verified = profile?.verified_badge || data?.profile.verified || data?.profile.verification_status === 'verified';

  const publicUrl = username
    ? `${API_BASE_URL}/${isCreator ? 'c' : 'b'}/${username}`
    : null;

  const posts = data?.social?.posts ?? [];
  const videos = data?.youtube?.videos ?? [];
  const reviews = data?.reviews ?? null;
  const collabs = data?.past_collaborations ?? [];
  const audience = data?.audience ?? null;
  const hasAudience =
    !!audience && audience.locations.length + audience.ages.length + audience.genders.length > 0;
  const portfolioItems = portfolio?.items ?? [];
  /**
   * Curated work outranks the scraped feed, matching /c/[username]. This tab
   * exists to show a creator what a brand sees, so it must hide the same
   * sections the public page hides — otherwise it is showing them a profile
   * that does not exist.
   */
  const hasPortfolio = portfolioItems.length > 0;

  /** Removes a manual entry. Platform-derived cards have no row to delete. */
  async function removePortfolioItem(item: PortfolioItem) {
    await endpoints.deletePortfolioItem(item.id);
    invalidateFetchCache('portfolio');
    await refreshPortfolio();
  }

  // Reach across the most recent posts. Views is the honest measure where
  // Instagram reports it; likes+comments is the fallback for stills.
  const postTrend: TrendPoint[] = posts
    .slice(0, 6)
    .reverse()
    .map((post, i) => ({
      label: post.takenAt
        ? new Date(post.takenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : `#${i + 1}`,
      value: post.views ?? (post.likes ?? 0) + (post.comments ?? 0),
    }));

  // Exactly the figures on the public page, in the same order.
  const stats = isCreator
    ? [
        { label: 'Followers', value: formatCount(data?.social?.followers ?? pp.instagram_followers ?? null) },
        {
          label: 'Engagement',
          value: data?.social?.engagement_rate != null ? `${data.social.engagement_rate}%` : '—',
        },
        // Instagram's scraper rarely returns a usable view count; YouTube's feed
        // always does, so the tile shows real views instead of disappearing.
        { label: 'Avg views', value: formatCount(data?.social?.avg_views ?? data?.youtube?.avg_views ?? null) },
        { label: 'Subscribers', value: formatCount(data?.youtube?.subscribers ?? pp.youtube_subscribers ?? null) },
      ]
        // formatCount renders an em dash for "not known" — a tile reading "—"
        // is worse than no tile, so unknown figures are dropped entirely.
        .filter((s) => s.value && s.value !== '0' && s.value !== '—')
    : [];

  async function share() {
    if (!publicUrl) return;
    await Share.share({
      message: `${displayName} on Influnet — ${publicUrl}`,
      url: publicUrl,
    });
  }

  /** Re-pull the social snapshot, then re-read Home so the new numbers land. */
  async function refreshSocial() {
    if (refreshingSocial) return;
    setRefreshingSocial(true);
    try {
      await endpoints.refreshProfile();
      invalidateFetchCache('profile-public');
      await refresh();
    } finally {
      setRefreshingSocial(false);
    }
  }

  return (
    <Screen padded={false}>
      <AppHeader title="Profile" showBell={false} />

      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <Card raised style={{ gap: t.spacing.md, alignItems: 'center' }}>
          <Avatar uri={avatar} name={displayName} size={76} />

          <View style={{ alignItems: 'center', gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Txt variant="title2">{displayName ?? 'Your profile'}</Txt>
              {verified ? <VerifiedBadge size={17} /> : null}
            </View>
            {username ? (
              <Txt variant="callout" tone="muted">
                @{username}
              </Txt>
            ) : null}
            {data?.profile.location ?? profile?.location ? (
              <Txt variant="footnote" tone="muted">
                {data?.profile.location ?? profile?.location}
              </Txt>
            ) : null}
          </View>

          {pp.bio || profile?.headline || profile?.tagline ? (
            <Txt variant="callout" tone="soft" center>
              {pp.bio ?? profile?.headline ?? profile?.tagline}
            </Txt>
          ) : null}

          {isCreator && (pp.niche?.length || profile?.niche?.length) ? (
            <ChipWrap>
              {(pp.niche?.length ? pp.niche : profile?.niche ?? []).slice(0, 4).map((n) => (
                <Chip key={n} label={n} />
              ))}
            </ChipWrap>
          ) : null}

          {publicUrl ? (
            <Button
              label="Share your profile"
              variant="secondary"
              size="md"
              onPress={share}
              icon={<Share2 size={16} color={t.color.content} />}
            />
          ) : null}
        </Card>

        {loading && !data ? <SkeletonCard /> : null}

        {/* ── The numbers a brand judges you on ───────────────────── */}
        {isCreator && stats.length > 0 ? (
          <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {stats.map((s) => (
              <View key={s.label} style={{ gap: 2 }}>
                <Txt variant="caption" tone="muted">
                  {s.label}
                </Txt>
                <Txt variant="title3" style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>
                  {s.value}
                </Txt>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Nothing captured yet is a state worth naming — an empty profile with
            no explanation reads as a broken app rather than an unlinked one. */}
        {isCreator && data && !data.social && !data.youtube ? (
          <Card style={{ gap: t.spacing.sm }}>
            <Txt variant="bodyStrong">Connect your accounts</Txt>
            <Txt variant="footnote" tone="muted">
              Your followers, engagement and recent posts appear here — and on your public
              profile — once Instagram or YouTube is linked in Settings.
            </Txt>
            <Button label="Open settings" size="md" variant="secondary" onPress={() => router.push('/settings')} />
          </Card>
        ) : null}

        {/* ── Portfolio: past work, with proof where we have it ───── */}
        {/* Sits above the brand-name chips because it supersedes them — a grid
            of actual work is what the chips were always a stand-in for. */}
        {isCreator ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <SectionLabel>Portfolio</SectionLabel>
              {portfolioItems.length > 0 ? (
                <Button
                  label="Add"
                  size="md"
                  variant="ghost"
                  inline
                  haptic={false}
                  icon={<Plus size={15} color={t.color.brand} />}
                  onPress={() => router.push('/portfolio/add')}
                />
              ) : null}
            </View>

            {portfolioItems.length > 0 ? (
              <Card>
                <PortfolioGrid items={portfolioItems} onDelete={removePortfolioItem} />
              </Card>
            ) : (
              <Card style={{ gap: t.spacing.sm }}>
                <Txt variant="bodyStrong">Show the work you've already done</Txt>
                <Txt variant="footnote" tone="muted">
                  Paste a link to any Instagram post or YouTube video you've made and it
                  becomes a card here. Collaborations you complete on Influnet are added
                  automatically, with the verified mark.
                </Txt>
                <Button
                  label="Add past work"
                  size="md"
                  variant="secondary"
                  icon={<Plus size={16} color={t.color.content} />}
                  onPress={() => router.push('/portfolio/add')}
                />
              </Card>
            )}
          </>
        ) : null}

        {/* ── Content, and how it performed ───────────────────────── */}
        {/* Both of these used to sit on Home, where they answered a question
            nobody opens Home to ask. They belong with the rest of the public
            profile — this is the screen for "how do I look to a brand?". */}
        {isCreator && !hasPortfolio && posts.some((p) => p.thumbUrl) ? (
          <>
            <SectionLabel>Recent posts</SectionLabel>
            <Card style={{ gap: t.spacing.lg }}>
              <PostGrid posts={posts} />
              {postTrend.some((p) => p.value > 0) ? (
                <View style={{ gap: t.spacing.sm }}>
                  <Txt
                    variant="caption"
                    tone="muted"
                    style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                  >
                    Reach per recent post
                  </Txt>
                  <TrendBars data={postTrend} formatValue={formatCount} />
                </View>
              ) : null}
            </Card>
          </>
        ) : null}

        {isCreator && !hasPortfolio && videos.some((v) => v.thumbUrl) ? (
          <>
            <SectionLabel>Latest videos</SectionLabel>
            <Card>
              <VideoList videos={videos} />
            </Card>
          </>
        ) : null}

        {/* ── Who is watching ─────────────────────────────────────── */}
        {isCreator && hasAudience ? (
          <>
            <SectionLabel>Audience breakdown</SectionLabel>
            <Card style={{ gap: t.spacing.lg }}>
              {(
                [
                  ['Top locations', audience!.locations],
                  ['Age range', audience!.ages],
                  ['Gender', audience!.genders],
                ] as const
              )
                .filter(([, slices]) => slices.length > 0)
                .map(([label, slices]) => (
                  <View key={label} style={{ gap: t.spacing.sm }}>
                    <Txt
                      variant="caption"
                      tone="muted"
                      style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                    >
                      {label}
                    </Txt>
                    {slices.map((s) => (
                      <View
                        key={s.label}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
                      >
                        <Txt variant="footnote" tone="soft" style={{ width: 74 }} numberOfLines={1}>
                          {s.label}
                        </Txt>
                        <View style={{ flex: 1 }}>
                          <ProgressBar progress={Math.min(1, s.pct / 100)} />
                        </View>
                        <Txt
                          variant="footnote"
                          style={{ width: 38, textAlign: 'right', fontVariant: ['tabular-nums'] }}
                        >
                          {s.pct}%
                        </Txt>
                      </View>
                    ))}
                  </View>
                ))}
            </Card>
          </>
        ) : null}

        {/* ── Proof of delivered work ─────────────────────────────── */}
        {isCreator && reviews && reviews.count > 0 ? (
          <>
            <SectionLabel>Brand ratings</SectionLabel>
            <Card style={{ gap: t.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Txt variant="title2" style={{ fontVariant: ['tabular-nums'] }}>
                  {reviews.average != null ? reviews.average.toFixed(1) : '—'}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={13}
                      color={n <= Math.round(reviews.average ?? 0) ? t.color.warn : t.color.contentMuted}
                      fill={n <= Math.round(reviews.average ?? 0) ? t.color.warn : 'transparent'}
                    />
                  ))}
                </View>
                <Txt variant="footnote" tone="muted">
                  {reviews.count} {reviews.count === 1 ? 'review' : 'reviews'}
                </Txt>
              </View>
              {reviews.items.slice(0, 3).map((r) => (
                <View
                  key={r.id}
                  style={{ gap: 3, borderTopWidth: 1, borderTopColor: t.color.hairline, paddingTop: t.spacing.sm }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm }}>
                    <Txt variant="footnote" style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>
                      {r.reviewerName}
                    </Txt>
                    <Txt variant="footnote" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                      {r.rating}/5
                    </Txt>
                  </View>
                  {r.comment ? (
                    <Txt variant="footnote" tone="soft" numberOfLines={3}>
                      {r.comment}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {isCreator && collabs.length > 0 ? (
          <>
            <SectionLabel>Brands you've worked with</SectionLabel>
            <Card>
              <ChipWrap>
                {collabs.slice(0, 12).map((b) => (
                  <Chip key={b} label={b} />
                ))}
              </ChipWrap>
            </Card>
          </>
        ) : null}

        {isCreator && !verified ? (
          <Card style={{ gap: t.spacing.sm, borderColor: t.color.brand + '40' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <BadgeCheck size={18} color={t.color.brand} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>
                Get verified
              </Txt>
              <Badge label="Recommended" tone="brand" />
            </View>
            <Txt variant="footnote" tone="muted">
              Prove you own your Instagram account. Verified creators get more
              requests and better rates.
            </Txt>
            <Button
              label="Start verification"
              size="md"
              onPress={() => router.push('/verification')}
            />
          </Card>
        ) : null}

        <SectionLabel>Manage</SectionLabel>
        <ListGroup>
          {/* Previewing your own profile opens the WEB page, not the in-app
              screen: the whole point here is "what a brand actually sees", and
              a brand most often arrives via a shared link. The web page is also
              the fuller one — pricing packages and the media kit live only
              there. The in-app screen is still what other users get when they
              tap you in search. */}
          {isCreator && publicUrl ? (
            <ListRow
              title="Preview public profile"
              subtitle="Opens the web page a brand sees when they find you"
              left={<Eye size={19} color={t.color.contentSoft} />}
              onPress={() => WebBrowser.openBrowserAsync(publicUrl)}
            />
          ) : null}
          {isCreator ? (
            <>
              <ListRow
                title={refreshingSocial ? 'Refreshing…' : 'Refresh my numbers'}
                style={username ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                subtitle={
                  data?.social?.fetched_at
                    ? `Last updated ${new Date(data.social.fetched_at).toLocaleDateString()}`
                    : 'Pull the latest from your linked accounts'
                }
                left={<RefreshCw size={19} color={t.color.contentSoft} />}
                onPress={refreshSocial}
              />
              <ListRow
                title="Verification & Trust Badge"
                subtitle={verified ? 'Verified account · Re-verify & Refresh' : 'Get verified'}
                left={<BadgeCheck size={19} color={verified ? t.color.brand : t.color.contentSoft} />}
                style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
                onPress={() => router.push('/verification')}
              />
            </>
          ) : null}
          <ListRow
            title="Connections"
            subtitle="Everyone you've worked with"
            left={<Users size={19} color={t.color.contentSoft} />}
            style={isCreator ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
            onPress={() => router.push('/connections')}
          />
          <ListRow
            title="My activity"
            subtitle="Everything that's happened on your account"
            left={<History size={19} color={t.color.contentSoft} />}
            style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
            onPress={() => router.push('/activity')}
          />
          <ListRow
            title="Settings"
            subtitle="Account, notifications, blocked users"
            left={<Settings size={19} color={t.color.contentSoft} />}
            style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
            onPress={() => router.push('/settings')}
          />
        </ListGroup>

        <Button
          label="Sign out"
          variant="secondary"
          icon={<LogOut size={16} color={t.color.content} />}
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
        />

        {/* Signs off the screen the way an About panel would — and gives the
            mark a home on the one tab that is entirely about you. */}
        <View style={{ alignItems: 'center', gap: t.spacing.xs, paddingTop: t.spacing.lg }}>
          <Logo size={26} />
          <Txt variant="caption" tone="muted">
            Influnet {Constants.expoConfig?.version ?? ''}
          </Txt>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
