/**
 * The portfolio wall — a creator's past work, as a brand sees it.
 *
 * Two kinds of card sit in one grid and MUST NOT be mistaken for each other:
 *
 *   verified — a completed Influnet project. The brand, the date and the fact
 *              it happened come from our own tables and the creator cannot
 *              fabricate them, so the card carries the trust mark.
 *   self-reported — the creator pasted a link. We validated the host and
 *              nothing else.
 *
 * The distinction is drawn in the layout itself, not just a colour: verified
 * cards get the mark and an explicit "Verified on Influnet" line, self-reported
 * ones say so in the same position. A brand skimming the grid can tell them
 * apart at a glance, which is the only way this feature is worth having —
 * a portfolio where anyone can look verified is worse than no portfolio.
 */
import { Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
// No brand glyphs: this version of lucide dropped them, and the rest of the app
// already depicts platforms with generic marks (see content-grid.tsx).
import { BadgeCheck, Camera, Link2, Play, Trash2, Video } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { formatCount } from '@/lib/format';
import { Txt } from '@/components/ui';

export interface PortfolioItem {
  id: string;
  source: 'manual' | 'platform';
  verified: boolean;
  title: string;
  brand_name: string | null;
  description: string | null;
  platform: 'instagram' | 'youtube' | 'other';
  content_url: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  happened_at: string | null;
}

const open = (url: string | null) => {
  if (!url) return;
  Linking.openURL(url).catch(() => {
    /* A dead link is not worth an error dialog. */
  });
};

function PlatformGlyph({ platform, size = 15, color }: { platform: string; size?: number; color: string }) {
  if (platform === 'instagram') return <Camera size={size} color={color} />;
  if (platform === 'youtube') return <Video size={size} color={color} />;
  return <Link2 size={size} color={color} />;
}

/**
 * The tile art. Instagram never gives us a thumbnail from a datacenter IP (see
 * lib/portfolio-link.ts), and completed platform projects have no post at all,
 * so a placeholder is the common case rather than the error case — it gets the
 * brand ramp and the platform glyph rather than a grey box with a broken icon.
 */
function Thumb({ item, height }: { item: PortfolioItem; height: number }) {
  const t = useTheme();

  if (item.thumbnail_url) {
    return (
      <View style={{ height, borderRadius: t.radii.md, overflow: 'hidden', backgroundColor: t.color.surfaceMuted }}>
        <Image
          source={{ uri: item.thumbnail_url }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={160}
        />
        {item.platform === 'youtube' ? (
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Play size={15} color={t.color.white} fill={t.color.white} />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={{
        height,
        borderRadius: t.radii.md,
        backgroundColor: item.verified ? t.color.brandSoft : t.color.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: t.color.hairline,
      }}
    >
      {item.verified ? (
        <BadgeCheck size={22} color={t.color.brand} />
      ) : (
        <PlatformGlyph platform={item.platform} size={22} color={t.color.contentMuted} />
      )}
    </View>
  );
}

function ProvenanceLine({ item }: { item: PortfolioItem }) {
  const t = useTheme();

  if (item.verified) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <BadgeCheck size={11} color={t.color.verified} />
        <Txt variant="caption" style={{ color: t.color.verified, fontWeight: '600' }} numberOfLines={1}>
          Verified on Influnet
        </Txt>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <PlatformGlyph platform={item.platform} size={11} color={t.color.contentMuted} />
      <Txt variant="caption" tone="muted" numberOfLines={1}>
        Self-reported
      </Txt>
    </View>
  );
}

/**
 * Two across. Wider than the 3-up post grid because these cards carry a title,
 * a brand and a provenance line, none of which survive at a third of the width.
 */
export function PortfolioGrid({
  items,
  onDelete,
}: {
  items: PortfolioItem[];
  /** Owner view only — a brand looking at a public profile passes nothing. */
  onDelete?: (item: PortfolioItem) => void;
}) {
  const t = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
      {items.map((item) => {
        const metric = item.views ?? item.likes;
        const date = item.happened_at
          ? new Date(item.happened_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
          : null;

        return (
          <Pressable
            key={item.id}
            accessibilityRole={item.content_url ? 'link' : 'text'}
            accessibilityLabel={`${item.title}${item.brand_name ? ` for ${item.brand_name}` : ''}. ${
              item.verified ? 'Verified on Influnet' : 'Self-reported'
            }`}
            disabled={!item.content_url}
            onPress={() => open(item.content_url)}
            style={({ pressed }) => ({
              // Two columns inside a card, accounting for the single gap.
              width: `${(100 - 3) / 2}%`,
              opacity: pressed && item.content_url ? 0.85 : 1,
              gap: 6,
            })}
          >
            <Thumb item={item} height={104} />

            <View style={{ gap: 2 }}>
              <Txt variant="footnote" style={{ fontWeight: '600' }} numberOfLines={2}>
                {item.title}
              </Txt>
              {item.brand_name ? (
                <Txt variant="caption" tone="soft" numberOfLines={1}>
                  {item.brand_name}
                </Txt>
              ) : null}

              <ProvenanceLine item={item} />

              {metric != null || date ? (
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {[metric != null ? `${formatCount(metric)} views` : null, date]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
              ) : null}
            </View>

            {/* Platform entries are derived from a real project and have no row
                to delete — only manual items get the control. */}
            {onDelete && item.source === 'manual' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title}`}
                hitSlop={10}
                onPress={() => onDelete(item)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: 'rgba(15,23,42,0.62)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={13} color={t.color.white} />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
