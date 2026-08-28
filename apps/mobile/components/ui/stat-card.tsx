/**
 * Half-width metric tile. Two per row is the whole layout system for stats.
 *
 * ── WHAT CHANGED, AND WHY ─────────────────────────────────────────────
 *
 * This tile used to be a label, a number and maybe a delta. That is a fine
 * tile for an account with history and a bad one for everybody else, because
 * the two states it cannot tell apart are the two that matter most:
 *
 *   "0 profile views"  — nobody has looked at you yet
 *   "0 profile views"  — we could not read the view table
 *
 * and, worse, a brand-new account got a grid of six bold zeros. Six zeros is
 * the most discouraging thing a product can show someone on day one: it reads
 * as a verdict on them rather than as a description of an empty account, and
 * there is nothing on the tile suggesting the number is ever going to move.
 *
 * Three additions fix that:
 *
 *  1. `series` — a 30-day shape under the number. Direction is the question;
 *     the total is only the starting point of the answer.
 *  2. `dormant` — an explicit "there is nothing to report" look. The figure is
 *     replaced by a muted "--", NOT a zero: a bold 0 is a measurement, and
 *     claiming we measured nought views is different from admitting nothing has
 *     happened yet. The sparkline becomes a flat baseline and `emptyHint` says
 *     the ONE thing that would make the tile move, so an empty tile reads as an
 *     instruction instead of a score.
 *
 *     A real zero still renders as `0` — that is the point of testing the
 *     SERIES and not just the total. "0 requests pending" on an account that
 *     received eleven this month is a fact worth stating plainly; "0 requests"
 *     on an account that has never had one is just an empty tile.
 *  3. A count-up on mount, so a number that IS there announces itself.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Numeral, Txt } from './text';
import { MicroBars, Sparkline } from './sparkline';
import { PressableScale, useCountUp } from './motion';

export function StatCard({
  label,
  value,
  icon,
  tint,
  hint,
  delta,
  series,
  seriesShape = 'area',
  emptyHint,
  index = 0,
  onPress,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  /**
   * The tile's hue. Seats the icon in a soft roundel of the same colour and
   * colours the sparkline, which is what stops a grid of tiles reading as one
   * undifferentiated block of grey labels.
   */
  tint?: string;
  hint?: string;
  /**
   * Percentage change against the previous equivalent period.
   *
   * Null and undefined both mean "no delta", and both are correct in different
   * situations — null when there was no baseline to compare against, undefined
   * when this metric has no period at all. Neither renders as 0%, because a
   * figure with nothing behind it presented as flat is a claim we can't make.
   */
  delta?: number | null;
  /**
   * Daily counts, oldest first, from /api/home's `series`. Undefined means this
   * metric has no series; null means we could not read one. Both draw nothing
   * rather than a flat line, because a flat line at zero is an assertion.
   */
  series?: number[] | null;
  /**
   * `area` for continuous levels, `bars` for counted events. See the note at
   * the top of ui/sparkline.tsx — the choice is about what the data IS, not
   * about variety.
   */
  seriesShape?: 'area' | 'bars';
  /**
   * Shown instead of a delta when the metric is still at zero: the single next
   * action that would move it. Short — this is a caption, not a lesson.
   */
  emptyHint?: string;
  /** Position in the grid. Drives the entrance stagger and the sparkline's. */
  index?: number;
  onPress?: () => void;
}) {
  const t = useTheme();

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
  const counted = useCountUp(Number.isFinite(numeric) ? numeric : 0);

  // A number we counted up to is only safe to display when the incoming value
  // was a bare number. Anything pre-formatted ("42%", "1.2k") is rendered as
  // given — re-deriving a formatted string from a counter is how a percentage
  // ends up rendering as "42".
  const display = typeof value === 'number' ? counted : value;

  const hasSeries = Array.isArray(series) && series.length > 1;
  const seriesHasData = hasSeries && series!.some((v) => v > 0);
  // Nothing in the total AND nothing in the window. Either alone is not enough:
  // a zero total with a live series is a real, informative zero, and a total
  // with no series is just a backend that does not send one yet.
  const dormant = numeric === 0 && !seriesHasData;

  const body = (
    <View
      style={{
        flex: 1,
        backgroundColor: t.color.surfaceCard,
        borderRadius: t.radii.lg,
        borderWidth: 1,
        borderColor: t.color.hairline,
        padding: t.spacing.lg,
        gap: 6,
        // Deliberately no shadow. Six raised tiles in a grid is six competing
        // planes; the hairline is enough separation against the flat surface.
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.spacing.sm,
        }}
      >
        <Txt variant="footnote" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
        {icon && tint ? (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: t.radii.sm,
              alignItems: 'center',
              justifyContent: 'center',
              // Softer roundel on a dormant tile: the icon should still be
              // legible, but a tile with nothing in it must not shout as
              // loudly as one that does.
              backgroundColor: `${tint}${dormant ? '12' : '1f'}`,
            }}
          >
            {icon}
          </View>
        ) : (
          icon
        )}
      </View>

      {/* "--" rather than "0". See note 2 at the top of the file. */}
      <Numeral style={dormant ? { color: t.color.contentMuted } : undefined}>
        {dormant ? '--' : display}
      </Numeral>

      {/* ── The 30-day shape ──────────────────────────────────────────
          Drawn only when there is something to draw. A dormant tile gets a
          flat hairline instead, which occupies the same height — so a grid
          with a mix of live and empty tiles stays on one baseline rather than
          going ragged — while making no claim about a trend. */}
      {hasSeries ? (
        seriesHasData ? (
          <View style={{ marginTop: 2 }}>
            {seriesShape === 'bars' ? (
              <MicroBars data={series!} color={tint ?? t.color.brand} height={30} delay={index * 60} />
            ) : (
              <Sparkline data={series!} color={tint ?? t.color.brand} height={30} delay={index * 60} />
            )}
          </View>
        ) : (
          <View style={{ height: 30, justifyContent: 'flex-end', marginTop: 2 }}>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: t.color.hairlineStrong }} />
          </View>
        )
      ) : null}

      {/* ── The footer line ───────────────────────────────────────────
          Exactly one of: a delta, an empty-state instruction, or a hint.
          Never a delta AND an instruction — a tile that says both "+24%" and
          "share your profile to get seen" is telling someone to fix something
          that is already working. */}
      {delta != null && !dormant ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {delta >= 0 ? (
            <ArrowUpRight size={12} color={t.color.ok} />
          ) : (
            <ArrowDownRight size={12} color={t.color.danger} />
          )}
          <Txt
            variant="caption"
            style={{ fontWeight: '600', color: delta >= 0 ? t.color.ok : t.color.danger }}
          >
            {Math.abs(delta)}%
          </Txt>
          {hint ? (
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {hint}
            </Txt>
          ) : null}
        </View>
      ) : dormant ? (
        <Txt variant="caption" tone="muted" numberOfLines={2}>
          {/* A tile with no instruction still has to say WHY it is blank, or a
              row of dashes reads as a rendering failure. */}
          {emptyHint ?? 'No data yet'}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );

  // A tile that does nothing on tap must not offer press feedback — a scale
  // that springs back with no navigation reads as a failed tap.
  if (!onPress) {
    return <View style={{ flex: 1, minWidth: '45%' }}>{body}</View>;
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={{ flex: 1, minWidth: '45%' }}
    >
      {body}
    </PressableScale>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>{children}</View>
  );
}
