/**
 * "You have N things to review" — one card, one call to action.
 *
 * This replaces a stack of full-width ActionCards, one per waiting decision.
 * That stack was honest and unusable: four cards of identical weight is four
 * screens of scrolling before a creator reaches anything else, and nothing in
 * it said how much there was in total. A queue with a count at the top answers
 * "how much is on me?" before any individual item does.
 *
 * ── WHY THE ITEMS ARE A ROW AND NOT A LIST ────────────────────────────
 *
 * They used to be full-width rows: icon, title, body, chevron, stacked. Three
 * of those is most of a phone screen spent on what is really a *summary* — and
 * the body line under each ("Accept the terms or send changes") was restating
 * what the title already said, at a size nobody reads.
 *
 * As a row of three chips the whole queue is one glance: how many, of what
 * kind, and which one is urgent (the amber underline). The bodies survive as
 * the accessibility label, which is the one place they were still doing work.
 *
 * Each chip is still individually tappable — the grouping is about weight, not
 * about taking away the shortcut to a specific thing. The footer button goes to
 * whatever the most urgent row is, so the common case ("just show me") is one
 * tap and never a wrong guess.
 *
 * Sized to hold up to four chips (proposals, requests, messages, verification —
 * the most that can be pending at once). At four, each gets ~80pt, which is
 * why the circle is 54 and the label is caption-sized on two lines.
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, Txt } from '@/components/ui';

const INBOX = require('../assets/things-to-review-section-image.png');
/** Intrinsic aspect of things-to-review-section-image.png (trimmed), w ÷ h. */
const INBOX_RATIO = 720 / 482;
const INBOX_WIDTH = 124;

export interface ReviewItem {
  key: string;
  icon: ReactNode;
  /** The count this row represents. Drives the "N things" total and the badge. */
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
    <Card
      raised
      padded={false}
      style={{
        backgroundColor: t.color.brandSoft,
        borderColor: t.color.brandRing,
      }}
    >
      {/* Bleeds off the top-right; the Card's inner view already clips to the
          radius. Behind the content and non-interactive. */}
      <Image
        source={INBOX}
        contentFit="contain"
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -20,
          top: -6,
          width: INBOX_WIDTH,
          height: INBOX_WIDTH / INBOX_RATIO,
        }}
      />

      <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        {/* ── Headline ──────────────────────────────────────────────
            The count carries the role accent. It is the one number on this
            card and the reason the card is here. `paddingRight` keeps the
            text clear of the illustration behind it. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 6,
            paddingRight: INBOX_WIDTH - 28,
          }}
        >
          <Txt variant="title3" style={{ flexShrink: 1 }}>
            You have{' '}
            <Txt variant="title3" style={{ color: t.color.brand }}>
              {total}
            </Txt>
            {total === 1 ? ' thing to review' : ' things to review'}
          </Txt>
          <Sparkles size={15} color={t.color.brand} style={{ marginTop: 4 }} />
        </View>

        {/* ── The chips ─────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row' }}>
          {items.map((item, i) => {
            const c = tones[item.tone];
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.body}`}
                onPress={item.onPress}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  paddingHorizontal: 2,
                  opacity: pressed ? 0.6 : 1,
                  borderLeftWidth: i > 0 ? 1 : 0,
                  borderLeftColor: t.color.brandRing,
                })}
              >
                <View>
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 27,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: c.bg,
                    }}
                  >
                    {item.icon}
                  </View>

                  {/* The count, on the circle. A number rather than a dot:
                      "how many" is what decides whether you tap. */}
                  {item.count > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -6,
                        minWidth: 22,
                        height: 22,
                        paddingHorizontal: 5,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: c.fg,
                        borderWidth: 2,
                        borderColor: t.color.brandSoft,
                      }}
                    >
                      <Txt
                        style={{
                          color: t.color.white,
                          fontSize: 11,
                          lineHeight: 14,
                          fontWeight: '700',
                        }}
                      >
                        {item.count > 99 ? '99+' : item.count}
                      </Txt>
                    </View>
                  ) : null}
                </View>

                {/* Fixed two-line box, so the rules below line up across chips
                    whether a label takes one line or two.
                    Shrink-to-fit rather than truncate: at four chips each gets
                    ~78pt and "collaboration" is one unbreakable word wider than
                    that, so a clamp ellipses it mid-word ("1 collaborati…").
                    Scaling the whole label down a notch keeps every word. */}
                <View style={{ height: 30, justifyContent: 'center' }}>
                  <Txt
                    center
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={{ fontSize: 11, lineHeight: 14, fontWeight: '600' }}
                  >
                    {item.title}
                  </Txt>
                </View>

                {/* The tone, as a rule under the label. This is what makes the
                    urgent one findable without reading any of them. */}
                <View
                  style={{
                    width: 30,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: c.fg,
                  }}
                />
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
            gap: t.spacing.sm,
            paddingVertical: 15,
            borderRadius: t.radii.lg,
            backgroundColor: t.color.brand,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Txt variant="bodyStrong" tone="inverse">
            Review now
          </Txt>
          <ArrowRight size={18} color={t.color.white} />
        </Pressable>
      </View>
    </Card>
  );
}
