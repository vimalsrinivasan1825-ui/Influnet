/**
 * "You have N things to review" — one card, one call to action.
 *
 * This replaces a stack of full-width ActionCards, one per waiting decision.
 * That stack was honest and unusable: four cards of identical weight is four
 * screens of scrolling before a creator reaches anything else, and nothing in
 * it said how much there was in total. A queue with a count at the top answers
 * "how much is on me?" before any individual item does.
 *
 * ── THE TWO-COLUMN LAYOUT ─────────────────────────────────────────────
 *
 * Left: the things waiting, as icon chips. Right, behind a rule: the
 * illustration and the one call to action. That split is the point — the left
 * half is *what* is waiting and the right half is *what to do about it*, and
 * keeping the button out of the list is what stops it reading as a fourth item.
 *
 * The headline spans the full width rather than sitting inside the left column.
 * At 360pt the left column is ~170pt, and "You have 3 things to review" set
 * there wraps to three lines — a headline broken that many times stops being a
 * headline. This is the one place the phone build departs from the reference,
 * and it buys the chips their width back.
 *
 * ── AND WHY ONLY THREE CHIPS ──────────────────────────────────────────
 *
 * Three is what the left column can hold at a legible size. A fourth (all of
 * proposals, requests, messages and verification pending at once) collapses
 * into a "View all" toggle that wraps the full set onto a second row, so
 * nothing is ever hidden with no way to reach it.
 *
 * Each chip is still individually tappable — the grouping is about weight, not
 * about taking away the shortcut to a specific thing. The footer button goes to
 * whatever the most urgent row is, so the common case ("just show me") is one
 * tap and never a wrong guess.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, Txt } from '@/components/ui';

const INBOX = require('../assets/things-to-review-section-image.png');
/** Intrinsic aspect of things-to-review-section-image.png (trimmed), w ÷ h. */
const INBOX_RATIO = 720 / 482;
/** The action column. Wide enough for "Review now →" and nothing more —
 *  every point spent here comes straight out of the chips beside it. */
const ACTION_WIDTH = 106;
const COLLAPSED = 3;

export interface ReviewItem {
  key: string;
  icon: ReactNode;
  /** The count this row represents. Drives the "N things" total and the badge. */
  count: number;
  title: string;
  body: string;
  /**
   * The chip label. `title` is a sentence ("1 collaboration request") written
   * for a full-width row; at phone width the left column gives each chip ~60pt
   * and no sentence survives that. Supply the two- or three-word version here.
   * `title` is still what the accessibility label reads.
   */
  short?: string;
  tone: 'brand' | 'warn' | 'ok';
  onPress: () => void;
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const total = items.reduce((sum, i) => sum + i.count, 0);
  const overflow = items.length > COLLAPSED;
  const shown = expanded ? items : items.slice(0, COLLAPSED);

  const tones = {
    brand: { fg: t.color.brand, bg: t.color.brandSoft },
    warn: { fg: t.color.warn, bg: t.color.warnSoft },
    ok: { fg: t.color.ok, bg: t.color.okSoft },
  } as const;

  const chip = (item: ReviewItem, i: number) => {
    const c = tones[item.tone];
    // Wrapped rows are thirds; a single collapsed row divides evenly.
    const width = expanded ? '33.33%' : undefined;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        onPress={item.onPress}
        style={({ pressed }) => ({
          flex: expanded ? undefined : 1,
          width,
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 2,
          paddingVertical: expanded ? 6 : 0,
          opacity: pressed ? 0.6 : 1,
          // No rule on the first of a row, so a wrapped grid does not draw a
          // stray divider down its left edge.
          borderLeftWidth: (expanded ? i % 3 !== 0 : i > 0) ? 1 : 0,
          borderLeftColor: t.color.hairline,
        })}
      >
        <View>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.bg,
            }}
          >
            {item.icon}
          </View>

          {/* The count, on the circle. A number rather than a dot: "how many"
              is what decides whether you tap. */}
          {item.count > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -5,
                right: -7,
                minWidth: 20,
                height: 20,
                paddingHorizontal: 5,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.fg,
                borderWidth: 2,
                borderColor: t.color.surfaceCard,
              }}
            >
              <Txt
                style={{
                  color: t.color.white,
                  fontSize: 10,
                  lineHeight: 13,
                  fontWeight: '700',
                }}
              >
                {item.count > 99 ? '99+' : item.count}
              </Txt>
            </View>
          ) : null}
        </View>

        {/* Fixed two-line box so the rules line up across chips whether a
            label takes one line or two, and shrink-to-fit rather than clamp so
            a long word scales instead of ellipsing mid-word. */}
        <View style={{ height: 26, justifyContent: 'center' }}>
          <Txt
            center
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{ fontSize: 11, lineHeight: 13, fontWeight: '600' }}
          >
            {item.short ?? item.title}
          </Txt>
        </View>

        {/* The tone, as a rule under the label. This is what makes the urgent
            one findable without reading any of them. */}
        <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: c.fg }} />
      </Pressable>
    );
  };

  return (
    <Card raised style={{ gap: t.spacing.md, paddingHorizontal: t.spacing.md }}>
      {/* ── Headline ────────────────────────────────────────────────
          The count carries the role accent. It is the one number on this card
          and the reason the card is here. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="title3" style={{ flexShrink: 1 }}>
          You have{' '}
          <Txt variant="title3" style={{ color: t.color.brand }}>
            {total}
          </Txt>
          {total === 1 ? ' thing to review' : ' things to review'}
        </Txt>
        <Sparkles size={15} color={t.color.brand} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {/* ── Left: what is waiting ──────────────────────────────── */}
        <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: expanded ? 'wrap' : 'nowrap' }}>
            {shown.map(chip)}
          </View>

          {overflow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? 'Show fewer' : `View all ${items.length} things to review`
              }
              onPress={() => setExpanded((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '700' }}>
                {expanded ? 'Show less' : `View all ${items.length}`}
              </Txt>
              <ChevronDown
                size={13}
                color={t.color.brand}
                style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
              />
            </Pressable>
          ) : null}
        </View>

        {/* The rule between "what is waiting" and "what to do about it". */}
        <View
          style={{
            width: 1,
            backgroundColor: t.color.hairline,
            marginHorizontal: t.spacing.sm,
          }}
        />

        {/* ── Right: the illustration and the one action ─────────── */}
        <View style={{ width: ACTION_WIDTH, alignItems: 'center', gap: t.spacing.sm }}>
          <Image
            source={INBOX}
            contentFit="contain"
            pointerEvents="none"
            style={{ width: ACTION_WIDTH, height: ACTION_WIDTH / INBOX_RATIO }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review now"
            onPress={items[0].onPress}
            style={({ pressed }) => ({
              alignSelf: 'stretch',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 11,
              paddingHorizontal: 6,
              borderRadius: t.radii.md,
              backgroundColor: t.color.brand,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Txt
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: t.color.white, fontSize: 13, fontWeight: '700' }}
            >
              Review now
            </Txt>
            <ArrowRight size={14} color={t.color.white} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}
