/**
 * A creator's public profile, rendered natively.
 *
 * This deliberately does NOT embed the web page (apps/web/src/app/c/[username])
 * in a WebView: that needs react-native-webview, a native module, so every
 * already-installed build without it renders a blank screen. Native rendering
 * works on the builds people already have, and reuses the same view model the
 * web page is built from (/api/creators/[username]), so the numbers can't drift.
 */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
// Lucide dropped brand marks, so channels are labelled rather than logo'd.
import { AtSign, Globe, Link2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { API_BASE_URL } from '@/lib/supabase';
import { useFetch } from '@/lib/use-fetch';
import { PostGrid, VideoList } from '@/components/content-grid';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipWrap,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  StickyFooter,
  Txt,
  VerifiedBadge,
} from '@/components/ui';

/** Subset of apps/web's CreatorProfileView actually rendered here. */
interface CreatorProfileView {
  name: string;
  username: string;
  avatarUrl: string | null;
  location: string | null;
  niches: string[];
  isVerified: boolean;
  subtitleLead: string;
  subtitleAccent: string;
  tagline: string;
  heroStats: { label: string; value: string }[];
  instagramHandle?: string | null;
  youtubeHandle?: string | null;
  /** Instagram posts. `views` arrives pre-formatted, e.g. "1.2K". */
  featured?: {
    imageUrl?: string | null;
    views: string;
    href?: string | null;
    isVideo?: boolean;
  }[];
  /** YouTube uploads, newest first. */
  videos?: {
    url: string;
    title: string;
    thumbUrl: string | null;
    views: string | null;
    publishedAt: string | null;
  }[];
}

type CtaAction = 'edit' | 'work_with_me' | 'request_sent' | 'view_project' | 'view_only';

interface CreatorProfileResponse {
  data: CreatorProfileView;
  isOwner: boolean;
  ctaLabel: string;
  ctaAction: CtaAction;
  ctaProjectId: string | null;
  userId: string;
  availabilityStatus: string | null;
}

export default function CreatorDetail() {
  const t = useTheme();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();

  // Same view model and RPC as the web page (/api/creators/[username]) — one
  // profile, rendered natively instead of opening a web link out of the app.
  const { data: res, error, loading, refreshing, refresh } = useFetch(
    () => endpoints.getCreatorProfile<CreatorProfileResponse>(username),
    { cacheKey: `creator:${username}` },
  );

  const creator = res?.data;

  // The web view model formats counts server-side and keys posts by permalink;
  // the shared grid takes raw rows, so map rather than re-format.
  const posts = (creator?.featured ?? [])
    .filter((p) => p.imageUrl)
    .map((p, i) => ({
      url: p.href || `post-${i}`,
      thumbUrl: p.imageUrl ?? null,
      metricLabel: p.views || null,
      type: p.isVideo ? 'Video' : undefined,
    }));

  const videos = (creator?.videos ?? []).map((v) => ({
    url: v.url,
    title: v.title,
    thumbUrl: v.thumbUrl,
    viewsLabel: v.views,
    publishedAt: v.publishedAt,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !creator || !res ? (
          <ErrorState message="This creator is no longer listed." />
        ) : (
          <>
            <Card raised style={{ gap: t.spacing.md, alignItems: 'center' }}>
              <Avatar uri={creator.avatarUrl} name={creator.name} size={76} />
              <View style={{ alignItems: 'center', gap: 3 }}>
                <Txt variant="title1">{creator.name}</Txt>
                <Txt variant="callout" tone="muted">
                  @{creator.username}
                  {creator.location ? ` · ${creator.location}` : ''}
                </Txt>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, justifyContent: 'center' }}>
                {res.availabilityStatus ? (
                  <Badge
                    label={
                      res.availabilityStatus === 'open'
                        ? 'Open to collaborations'
                        : res.availabilityStatus === 'limited'
                          ? 'Limited availability'
                          : 'Not taking work'
                    }
                    tone={
                      res.availabilityStatus === 'open'
                        ? 'ok'
                        : res.availabilityStatus === 'limited'
                          ? 'warn'
                          : 'neutral'
                    }
                  />
                ) : null}
                <Badge
                  label={creator.isVerified ? 'Verified creator' : 'Ownership not verified'}
                  tone={creator.isVerified ? 'verified' : 'neutral'}
                  icon={creator.isVerified ? <VerifiedBadge size={13} /> : undefined}
                />
              </View>

              {creator.subtitleLead || creator.subtitleAccent ? (
                <Txt variant="body" tone="soft" center>
                  {[creator.subtitleLead, creator.subtitleAccent].filter(Boolean).join(' · ')}
                </Txt>
              ) : null}

              {res.isOwner ? (
                <Badge label="This is what others see on your profile" tone="brand" />
              ) : null}
            </Card>

            {creator.tagline ? (
              <Card style={{ gap: t.spacing.sm }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  About
                </Txt>
                <Txt variant="body" tone="soft">
                  {creator.tagline}
                </Txt>
              </Card>
            ) : null}

            {creator.niches?.length ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Works in
                </Txt>
                <ChipWrap>
                  {creator.niches.map((n) => (
                    <Chip key={n} label={n} />
                  ))}
                </ChipWrap>
              </Card>
            ) : null}

            {creator.heroStats?.length ? (
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {creator.heroStats.map((s) => (
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

            {/* The actual work, not just the numbers — same thumbnails the web
                profile shows, tapping through to the original post. */}
            {posts.some((p) => p.thumbUrl) ? (
              <>
                <SectionLabel>Recent posts</SectionLabel>
                <Card>
                  <PostGrid posts={posts} />
                </Card>
              </>
            ) : null}

            {videos.some((v) => v.thumbUrl) ? (
              <>
                <SectionLabel>Latest videos</SectionLabel>
                <Card>
                  <VideoList videos={videos} />
                </Card>
              </>
            ) : null}

            {creator.instagramHandle || creator.youtubeHandle ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Channels
                </Txt>
                <View style={{ gap: t.spacing.sm }}>
                  {creator.instagramHandle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <AtSign size={17} color={t.color.contentSoft} />
                      <Txt variant="callout" tone="soft">
                        Instagram · @{creator.instagramHandle}
                      </Txt>
                    </View>
                  ) : null}
                  {creator.youtubeHandle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <Link2 size={17} color={t.color.contentSoft} />
                      <Txt variant="callout" tone="soft">
                        YouTube · {creator.youtubeHandle}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}

            {/* The web page carries more than this screen does — pricing
                packages, the media kit, the share sheet — so it stays one tap
                away rather than becoming a second entry point people have to
                choose between before they've seen anything. */}
            <ListGroup>
              <ListRow
                title="Open web version"
                subtitle="Packages, media kit and the full brand-facing page"
                left={<Globe size={19} color={t.color.contentSoft} />}
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    `${API_BASE_URL}/c/${encodeURIComponent(creator.username)}`,
                  )
                }
              />
            </ListGroup>
          </>
        )}
      </ScreenScroll>

      {/* Only a business account viewing someone else ever gets an actionable
          CTA — same restriction the web overlay enforces server-side (see
          apps/web/src/app/api/creators/[username]/route.ts). Previewing your
          own profile, or any other viewer/role, is read-only. */}
      {creator && res && !res.isOwner && res.ctaAction !== 'view_only' ? (
        <StickyFooter>
          <Button
            label={res.ctaLabel}
            disabled={res.ctaAction === 'request_sent'}
            onPress={() => {
              if (res.ctaAction === 'work_with_me') {
                router.push({ pathname: '/requests/new', params: { to: res.userId, name: creator.name } });
              } else if (res.ctaAction === 'view_project' && res.ctaProjectId) {
                router.push({ pathname: '/projects/[id]', params: { id: res.ctaProjectId } });
              }
            }}
          />
        </StickyFooter>
      ) : null}
    </View>
  );
}
