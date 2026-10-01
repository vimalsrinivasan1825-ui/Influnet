/**
 * Home's loading state, drawn in the shape of Home.
 *
 * It used to be two identical three-line cards. That says "something is
 * loading" and nothing else, and when the real screen arrived — a pink hero,
 * a list, a money card, a grid of tiles — everything jumped into a layout
 * the placeholder had given no hint of. This mirrors the real sections in
 * order and at roughly their real heights, so the content lands where the
 * eye already is:
 *
 *   your-move hero (pink, stacked) → a list card → the money card → stat tiles
 *
 * Rarely seen now: launch loads Home behind the splash (lib/home-data.ts),
 * so this is mostly for a pull from a dead cache or a slow first sign-in.
 */
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Skeleton } from '@/components/ui';

const HERO_RADIUS = 28;
// A shade deeper than brandSoft, for blocks sitting ON the pink hero.
const HERO_BLOCK = '#FBD3E8';

function SkeletonSurface({ children, gap = 12, padding }: { children: React.ReactNode; gap?: number; padding?: number }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surfaceCard,
          borderRadius: t.radii.lg,
          padding: padding ?? t.spacing.lg,
          gap,
        },
        t.shadows.card,
      ]}
    >
      {children}
    </View>
  );
}

function Hero() {
  const t = useTheme();
  return (
    <View style={{ paddingTop: 16 }}>
      {/* The two cards "behind" — same stack as YourMoveHero. */}
      <View style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 60, borderRadius: HERO_RADIUS, backgroundColor: '#FCE3F0' }} />
      <View style={{ position: 'absolute', top: 7, left: 12, right: 12, height: 60, borderRadius: HERO_RADIUS, backgroundColor: '#F9D2E6' }} />
      <View style={{ backgroundColor: t.color.brandSoft, borderRadius: HERO_RADIUS, padding: 20, gap: 16 }}>
        <Skeleton height={26} width={150} radius={13} tone={HERO_BLOCK} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Skeleton height={40} width={40} radius={13} tone={HERO_BLOCK} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton height={12} width="45%" tone={HERO_BLOCK} />
            <Skeleton height={10} width="30%" tone={HERO_BLOCK} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Skeleton height={22} width="82%" radius={8} tone={HERO_BLOCK} />
          <Skeleton height={22} width="56%" radius={8} tone={HERO_BLOCK} />
        </View>
        <Skeleton height={52} radius={26} tone="#ffffff" />
      </View>
    </View>
  );
}

function ListCard() {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Skeleton height={12} width={120} style={{ marginTop: t.spacing.md }} />
      <SkeletonSurface gap={0} padding={0}>
        {[0.62, 0.48, 0.7].map((w, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              padding: t.spacing.lg,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: t.color.hairline,
            }}
          >
            <Skeleton height={36} width={36} radius={18} />
            <View style={{ flex: 1, gap: 7 }}>
              <Skeleton height={13} width={`${Math.round(w * 100)}%` as `${number}%`} />
              <Skeleton height={10} width={`${Math.round(w * 70)}%` as `${number}%`} />
            </View>
            <Skeleton height={10} width={34} />
          </View>
        ))}
      </SkeletonSurface>
    </View>
  );
}

const BARS = [0.35, 0.55, 0.42, 0.7, 0.5, 0.82, 0.62, 0.9];

function MoneyCard() {
  const t = useTheme();
  return (
    <SkeletonSurface gap={t.spacing.md}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 8, flex: 1 }}>
          <Skeleton height={10} width={96} />
          <Skeleton height={30} width="58%" radius={8} />
        </View>
        <Skeleton height={36} width={36} radius={18} tone={t.color.brandSoft} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 64 }}>
        {BARS.map((h, i) => (
          <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <Skeleton height={64 * h} radius={6} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Skeleton height={10} width="30%" />
        <Skeleton height={10} width="24%" />
      </View>
    </SkeletonSurface>
  );
}

function Tile() {
  return (
    <SkeletonSurface gap={10}>
      <Skeleton height={32} width={32} radius={16} />
      <Skeleton height={22} width="48%" radius={7} />
      <Skeleton height={10} width="72%" />
    </SkeletonSurface>
  );
}

export function HomeSkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }} accessibilityLabel="Loading your home" accessibilityRole="progressbar">
      <Hero />
      <ListCard />
      <MoneyCard />
      <View style={{ gap: t.spacing.md }}>
        {[0, 1].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Tile />
            </View>
            <View style={{ flex: 1 }}>
              <Tile />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
