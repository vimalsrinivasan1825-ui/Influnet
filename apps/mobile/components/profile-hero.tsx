/**
 * The top of a creator's own Profile screen, built to design system v2's
 * "Profile v2" board: the photo full-bleed with the name over a dark scrim, the
 * three numbers a brand judges on in a card that overlaps the photo, then bio,
 * niches, the two primary actions, linked accounts, and the Work grid.
 *
 * Pure presentation — every number and action comes from app/profile.tsx, which
 * already reads them from /api/home and /api/portfolio. Nothing here fetches.
 */
import { Alert, Linking, Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Camera, ChevronLeft, EyeOff, Play, Share } from 'lucide-react-native';
import { PlatformMark } from '@/components/platform-mark';
import { useTheme } from '@/lib/theme';
import { Txt, VerifiedBadge } from '@/components/ui';
import type { PortfolioItem } from '@/components/portfolio-grid';

/** System emoji per niche — the design's 3D objects, in the type every phone has. */
const NICHE_EMOJI: Record<string, string> = {
  'Fashion & Beauty': '💄',
  'Tech & Gadgets': '📱',
  'Food & Cooking': '🍲',
  Travel: '✈️',
  'Fitness & Health': '💪',
  Gaming: '🎮',
  Finance: '💰',
  Lifestyle: '🌿',
  Education: '📚',
  Entertainment: '🎬',
  Sports: '🏏',
  Parenting: '🍼',
  'Home Decor': '🛋️',
  'Art & Design': '🎨',
  Music: '🎧',
  Comedy: '😂',
  Business: '💼',
  Environment: '🌍',
};

export interface ProfileHeroProps {
  name: string;
  username: string | null;
  city: string | null;
  photoUrl: string | null;
  verified: boolean;
  followers: string | null;
  engagement: string | null;
  collabs: number;
  bio: string | null;
  niches: string[];
  instagram: { handle: string | null; followers: string | null };
  youtube: { handle: string | null; subscribers: string | null };
  avatarBusy: boolean;
  onBack: () => void;
  onShare: (() => void) | null;
  onChangePhoto: () => void;
  onEdit: () => void;
  onLinkAccounts: () => void;
}

function CircleButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function ProfileHero(p: ProfileHeroProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 400pt on the 390pt-wide board; same proportion on every phone.
  const heroH = Math.round(Math.min(460, width * (400 / 390)));
  const STATS_OVERLAP = 28;

  const stats = [
    { label: 'Followers', value: p.followers ?? '—' },
    { label: 'Engagement', value: p.engagement ?? '—' },
    { label: 'Collabs', value: String(p.collabs) },
  ];

  return (
    <View>
      {/* ── Photo ─────────────────────────────────────────────── */}
      <View style={{ height: heroH, backgroundColor: t.color.brand }}>
        {p.photoUrl ? (
          <Image
            source={{ uri: p.photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            contentPosition={{ top: '25%' }}
            transition={200}
            accessibilityLabel={p.name}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ fontSize: 96, lineHeight: 110, fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>
              {p.name.trim().charAt(0).toUpperCase() || '·'}
            </Txt>
          </View>
        )}
        {/* Scrim: a touch of dark at the top for the buttons, heavy at the
            bottom so white type reads on any photo. */}
        <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="profileScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#111114" stopOpacity={0.15} />
              <Stop offset="0.3" stopColor="#111114" stopOpacity={0} />
              <Stop offset="1" stopColor="#111114" stopOpacity={0.72} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#profileScrim)" />
        </Svg>

        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 20,
            right: 20,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <CircleButton onPress={p.onBack} label="Back">
            <ChevronLeft size={22} color={t.color.content} />
          </CircleButton>
          <View style={{ flex: 1 }} />
          <CircleButton onPress={p.onChangePhoto} label="Change profile picture">
            <Camera size={19} color={p.avatarBusy ? t.color.contentMuted : t.color.content} />
          </CircleButton>
          {p.onShare ? (
            <CircleButton onPress={p.onShare} label="Share your profile">
              <Share size={19} color={t.color.content} />
            </CircleButton>
          ) : null}
        </View>

        <View style={{ position: 'absolute', left: 20, right: 20, bottom: STATS_OVERLAP + 20, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt
              numberOfLines={2}
              style={{ flexShrink: 1, fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1.2, color: '#ffffff' }}
            >
              {p.name}
            </Txt>
            {p.verified ? <VerifiedBadge size={24} /> : null}
          </View>
          {p.username || p.city ? (
            <Txt style={{ fontSize: 14.5, lineHeight: 20, fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>
              {[p.username ? `@${p.username}` : null, p.city].filter(Boolean).join(' · ')}
            </Txt>
          ) : null}
        </View>
      </View>

      {/* ── The three numbers, overlapping the photo ─────────── */}
      <View
        style={{
          marginTop: -STATS_OVERLAP,
          marginHorizontal: 20,
          flexDirection: 'row',
          backgroundColor: t.color.surfaceCard,
          borderRadius: 28,
          boxShadow: '0 18px 40px -16px rgba(17,17,20,0.18), 0 2px 6px rgba(17,17,20,0.04)',
        }}
      >
        {stats.map((s, i) => (
          <View key={s.label} style={{ flex: 1, flexDirection: 'row' }}>
            {i > 0 ? <View style={{ width: 1, backgroundColor: t.color.hairline, marginVertical: 14 }} /> : null}
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 }}>
              <Txt style={{ fontSize: 22, lineHeight: 27, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>
                {s.value}
              </Txt>
              <Txt variant="caption" tone="muted">{s.label}</Txt>
            </View>
          </View>
        ))}
      </View>

      {/* ── Bio, niches, actions, accounts ───────────────────── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 14 }}>
        {p.bio ? (
          <Txt style={{ fontSize: 15.5, lineHeight: 23, color: t.color.contentSoft }}>{p.bio}</Txt>
        ) : null}

        {p.niches.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {p.niches.slice(0, 5).map((n) => (
              <View
                key={n}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: t.color.surfaceCard,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {NICHE_EMOJI[n] ? <Txt style={{ fontSize: 15, lineHeight: 19 }}>{NICHE_EMOJI[n]}</Txt> : null}
                <Txt style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{n}</Txt>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={p.onEdit}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              height: 52,
              borderRadius: 999,
              backgroundColor: t.color.content,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Txt style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: '#ffffff' }}>Edit profile</Txt>
          </Pressable>
          {p.onShare ? (
            <Pressable
              onPress={p.onShare}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                height: 52,
                borderRadius: 999,
                backgroundColor: t.color.surfaceCard,
                borderWidth: 1.5,
                borderColor: t.color.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Txt style={{ fontSize: 16, lineHeight: 20, fontWeight: '700' }}>Share link</Txt>
            </Pressable>
          ) : null}
        </View>

        <View style={{ backgroundColor: t.color.surfaceCard, borderRadius: 28, paddingVertical: 6 }}>
          <AccountRow
            icon={<PlatformMark platform="instagram" size={42} />}
            title={p.instagram.handle ? `@${p.instagram.handle}` : 'Instagram'}
            subtitle={p.instagram.handle ? (p.instagram.followers ? `${p.instagram.followers} followers` : 'Linked') : 'Not linked yet'}
            right={
              p.instagram.handle && p.verified ? (
                <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.color.verifiedSoft, justifyContent: 'center' }}>
                  <Txt style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: t.color.verified }}>Owner verified</Txt>
                </View>
              ) : p.instagram.handle ? null : (
                <SmallButton label="Link" onPress={p.onLinkAccounts} />
              )
            }
          />
          <View style={{ height: 1, backgroundColor: t.color.hairline, marginHorizontal: 16 }} />
          <AccountRow
            icon={<PlatformMark platform="youtube" size={42} />}
            title={p.youtube.handle ? `@${p.youtube.handle.replace(/^@/, '')}` : 'YouTube'}
            subtitle={p.youtube.handle ? (p.youtube.subscribers ? `${p.youtube.subscribers} subscribers` : 'Linked') : 'Not linked yet'}
            right={p.youtube.handle ? null : <SmallButton label="Link" onPress={p.onLinkAccounts} />}
          />
        </View>
      </View>
    </View>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  right: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
      <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt style={{ fontSize: 15.5, lineHeight: 20, fontWeight: '700' }} numberOfLines={1}>{title}</Txt>
        <Txt variant="footnote" tone="muted" numberOfLines={1}>{subtitle}</Txt>
      </View>
      {right}
    </View>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: t.color.hairline,
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Txt style={{ fontSize: 14, lineHeight: 18, fontWeight: '700' }}>{label}</Txt>
    </Pressable>
  );
}

/**
 * The Work grid: three columns of tall tiles, the brand on a chip, a play mark
 * on video. Tap opens the post. Long-press is the owner's menu — hide/show, and
 * delete for entries they added themselves (platform-derived ones have no row
 * to delete), the same two actions the old list exposed as buttons.
 */
export function WorkGrid({
  items,
  onToggleVisible,
  onDelete,
}: {
  items: PortfolioItem[];
  onToggleVisible: (item: PortfolioItem, next: boolean) => void;
  onDelete: (item: PortfolioItem) => void;
}) {
  const t = useTheme();

  const menu = (item: PortfolioItem) => {
    const visible = item.is_visible !== false;
    Alert.alert(item.brand_name || item.title || 'This post', undefined, [
      { text: visible ? 'Hide from public profile' : 'Show on public profile', onPress: () => onToggleVisible(item, !visible) },
      ...(item.source === 'manual'
        ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => onDelete(item) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => {
        const hidden = item.is_visible === false;
        const isVideo = item.platform === 'youtube' || /\/reel\//.test(item.content_url ?? '');
        return (
          <Pressable
            key={item.id}
            onPress={() => item.content_url && Linking.openURL(item.content_url).catch(() => {})}
            onLongPress={() => menu(item)}
            delayLongPress={280}
            accessibilityRole="button"
            accessibilityLabel={`${item.brand_name ?? item.title}${hidden ? ', hidden' : ''}. Long-press for options.`}
            style={({ pressed }) => ({
              width: '31.6%',
              height: 160,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: t.color.surfaceMuted,
              opacity: pressed ? 0.85 : hidden ? 0.45 : 1,
            })}
          >
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={160} />
            ) : (
              <View style={{ flex: 1, padding: 10, justifyContent: 'center', backgroundColor: t.color.brandSoft }}>
                <Txt numberOfLines={4} style={{ fontSize: 12.5, lineHeight: 16, fontWeight: '700', color: t.color.brand }}>
                  {item.title}
                </Txt>
              </View>
            )}
            {isVideo ? (
              <View style={{ position: 'absolute', left: 8, top: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={12} color={t.color.content} fill={t.color.content} />
              </View>
            ) : null}
            {hidden ? (
              <View style={{ position: 'absolute', right: 8, top: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                <EyeOff size={13} color={t.color.content} />
              </View>
            ) : null}
            {item.brand_name ? (
              <View style={{ position: 'absolute', left: 8, bottom: 8, right: 8, flexDirection: 'row' }}>
                <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center', maxWidth: '100%' }}>
                  <Txt numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '700' }}>{item.brand_name}</Txt>
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
