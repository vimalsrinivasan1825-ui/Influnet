/**
 * "You have N things to review" — one card, one call to action.
 *
 * This replaces a stack of full-width ActionCards, one per waiting decision.
 * That stack was honest and unusable: four cards of identical weight is four
 * screens of scrolling before a creator reaches anything else, and nothing in
 * it said how much there was in total. A queue with a count at the top answers
 * "how much is on me?" before any individual item does.
 *
 * The rows stay individually tappable — the grouping is about weight, not about
 * taking away the shortcut to a specific thing. The footer button goes to
 * whatever the most urgent row is, so the common case ("just show me") is one
 * tap and never a wrong guess.
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowRight, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, Txt } from '@/components/ui';

export interface ReviewItem {
  key: string;
  icon: ReactNode;
  /** The count this row represents. Drives the "N things" total. */
  count: number;
  title: string;
  body: string;
  tone: 'brand' | 'warn' | 'ok';
  onPress: () => void;
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const t = useTheme();
  if (items.length === 0) return null;

  const total = items.reduce((sum, i) => sum + i.count, 0);
  const tones = {
    brand: { fg: t.color.brand, bg: t.color.brandSoft },
    warn: { fg: t.color.warn, bg: t.color.warnSoft },
    ok: { fg: t.color.ok, bg: t.color.okSoft },
  } as const;

  return (
    // Unpadded: the rows run edge to edge so their press state reads as a list,
    // and each block below applies its own inset.
    <Card padded={false} style={{ gap: t.spacing.md }}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg }}>
        <Txt variant="bodyStrong">
          {total === 1 ? 'You have 1 thing to review' : `You have ${total} things to review`}
        </Txt>
      </View>

      <View>
        {items.map((item, i) => {
          const c = tones[item.tone];
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
              onPress={item.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingHorizontal: t.spacing.lg,
                paddingVertical: t.spacing.md,
                backgroundColor: pressed ? t.color.surfaceMuted : 'transparent',
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: t.color.hairline,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: t.radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.bg,
                }}
              >
                {item.icon}
              </View>

              <View style={{ flex: 1, gap: 1 }}>
                <Txt variant="footnote" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {item.title}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {item.body}
                </Txt>
              </View>

              <ChevronRight size={17} color={t.color.contentMuted} />
            </Pressable>
          );
        })}
      </View>

      {/* One primary action for the whole queue, aimed at the top row — the
          list is already ordered most-urgent-first. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Review now"
        onPress={items[0].onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginHorizontal: t.spacing.lg,
          marginBottom: t.spacing.lg,
          paddingVertical: t.spacing.md,
          borderRadius: t.radii.md,
          backgroundColor: t.color.brand,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Txt variant="bodyStrong" tone="inverse">
          Review now
        </Txt>
        <ArrowRight size={16} color={t.color.white} />
      </Pressable>
    </Card>
  );
}
