/**
 * The creator's own content, as a brand sees it.
 *
 * The web profile shows a grid of real post thumbnails; the app showed only
 * numbers, so a creator checking their phone could not tell which work was
 * being counted. Two shapes, one component:
 *
 *   PostGrid   — square-ish Instagram tiles, 3 across, metric overlay
 *   VideoList  — 16:9 YouTube thumbnails with the video title underneath
 *
 * Tapping opens the real post/video, which is the only sensible destination:
 * we do not re-host the content, we point at it.
 */
import { Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Heart, Play } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { formatCount } from '@/lib/format';
import { Txt } from '@/components/ui';

export interface ContentPost {
  url: string;
  thumbUrl: string | null;
  views?: number | null;
  likes?: number | null;
  type?: string;
}

export interface ContentVideo {
  url: string;
  title: string;
  thumbUrl: string | null;
  views?: number | null;
  publishedAt?: string | null;
}

const open = (url: string) => {
  Linking.openURL(url).catch(() => {
    /* A dead link is not worth an error dialog. */
  });
};

/** Instagram posts, three across. Only tiles with a cached thumbnail render. */
export function PostGrid({ posts }: { posts: ContentPost[] }) {
  const t = useTheme();
  const withThumbs = posts.filter((p) => p.thumbUrl);
  if (withThumbs.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
      {withThumbs.map((post) => {
        const metric = post.views ?? post.likes;
        const isViews = post.views != null;
        return (
          <Pressable
            key={post.url}
            accessibilityRole="link"
            accessibilityLabel="Open post"
            onPress={() => open(post.url)}
            style={({ pressed }) => ({
              // Three columns inside a card, accounting for the two gaps.
              width: `${(100 - 4) / 3}%`,
              aspectRatio: 4 / 5,
              borderRadius: t.radii.md,
              overflow: 'hidden',
              backgroundColor: t.color.surfaceMuted,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={{ uri: post.thumbUrl! }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
            {metric != null ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                }}
              >
                {isViews ? (
                  <Play size={10} color={t.color.white} fill={t.color.white} />
                ) : (
                  <Heart size={10} color={t.color.white} fill={t.color.white} />
                )}
                <Txt variant="caption" style={{ color: t.color.white, fontWeight: '600' }}>
                  {formatCount(metric)}
                </Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** YouTube uploads. Titles matter here, so these are rows, not tiles. */
export function VideoList({ videos }: { videos: ContentVideo[] }) {
  const t = useTheme();
  const withThumbs = videos.filter((v) => v.thumbUrl);
  if (withThumbs.length === 0) return null;

  return (
    <View style={{ gap: t.spacing.md }}>
      {withThumbs.map((video) => (
        <Pressable
          key={video.url}
          accessibilityRole="link"
          accessibilityLabel={`Open video: ${video.title}`}
          onPress={() => open(video.url)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: t.spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 116,
              aspectRatio: 16 / 9,
              borderRadius: t.radii.md,
              overflow: 'hidden',
              backgroundColor: t.color.surfaceMuted,
            }}
          >
            <Image
              source={{ uri: video.thumbUrl! }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
            <View
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                marginTop: -13,
                marginLeft: -13,
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,0,0,0.88)',
              }}
            >
              <Play size={12} color={t.color.white} fill={t.color.white} />
            </View>
          </View>

          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="footnote" numberOfLines={2} style={{ fontWeight: '600' }}>
              {video.title}
            </Txt>
            <Txt variant="caption" tone="muted">
              {[
                video.views != null ? `${formatCount(video.views)} views` : null,
                video.publishedAt
                  ? new Date(video.publishedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
