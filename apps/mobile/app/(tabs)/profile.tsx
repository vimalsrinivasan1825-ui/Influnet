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
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
  VerifiedBadge,
} from '@/components/ui';
import { AppHeader } from '@/components/app-header';
import { Logo } from '@/components/brand/logo';
import { PostGrid, VideoList } from '@/components/content-grid';

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
    posts?: { url: string; thumbUrl: string | null; views: number | null; likes: number | null }[];
  } | null;
  youtube: {
    subscribers: number | null;
    avg_views: number | null;
    videos: { url: string; title: string; thumbUrl: string | null; views: number | null; publishedAt: string | null }[];
  } | null;
  past_collaborations?: string[];
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

  const isCreator = (data?.role ?? profile?.role) === 'influencer';
  const pp = data?.public_profile ?? {};
  const displayName = isCreator
    ? data?.profile.name ?? profile?.name
    : pp.company_name ?? profile?.company_name ?? profile?.name;
  // The captured Instagram picture is what a brand sees on the public page; the
  // locally-stored one is only a fallback for a creator with no snapshot yet.
  const avatar = isCreator ? pp.avatar_url ?? profile?.avatar_url : pp.logo_url ?? profile?.logo_url;
  const username = pp.username ?? profile?.username ?? null;
  const verified = profile?.verified_badge || data?.profile.verified || data?.profile.verification_status === 'verified' || profile?.is_verified;

  const publicUrl = username
    ? `${API_BASE_URL}/${isCreator ? 'c' : 'b'}/${username}`
    : null;

  const posts = data?.social?.posts ?? [];
  const videos = data?.youtube?.videos ?? [];
  const reviews = data?.reviews ?? null;
  const collabs = data?.past_collaborations ?? [];

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

        {isCreator && posts.some((p) => p.thumbUrl) ? (
          <>
            <SectionLabel>Recent posts</SectionLabel>
            <Card>
              <PostGrid posts={posts} />
            </Card>
          </>
        ) : null}

        {isCreator && videos.some((v) => v.thumbUrl) ? (
          <>
            <SectionLabel>Latest videos</SectionLabel>
            <Card>
              <VideoList videos={videos} />
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
          {isCreator && publicUrl ? (
            <ListRow
              title="Preview public profile"
              subtitle="See exactly what a brand sees when they find you"
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
