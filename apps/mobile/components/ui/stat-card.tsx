/**
 * Half-width metric tile. Two per row is the whole layout system for stats.
 *
 * ── FIVE STATES, NOT TWO ──────────────────────────────────────────────
 *
 * This tile used to be a label, a number and maybe a delta. That is a fine tile
 * for an account with years behind it and a bad one for everybody else, because
 * "has data / has no data" fails at both ends.
 *
 * At the empty end a brand-new account got a grid of six bold zeros — the most
 * discouraging thing a product can show someone on day one, because it reads as
 * a verdict on them rather than as a description of an empty account, and
 * nothing on the tile suggests the number will ever move. It also could not
 * tell "nobody has looked at you yet" apart from "we could not read the view
 * table", which are opposite problems.
 *
 * At the full end it treated one data point as a trend: day three, three views
 * against one last week, "+200%" under a sparkline that is a flat line with one
 * bump. Arithmetic, not information — and worse than nothing, because it is
 * indistinguishable from a real +200%.
 *
 * The five states and the reasoning behind each live in `metricState()` in
 * @influnet/core, so the web dashboard cannot drift from this. What the tile
 * adds is how each one LOOKS:
 *
 *   unavailable  Renders nothing at all — the caller drops the tile.
 *   dormant      "--" in muted type, a flat hairline where the chart goes, and
 *                `emptyHint`: the one action that would make it move. An empty
 *                tile becomes an instruction instead of a score.
 *   paused       The real 0, in full weight, plus the shape that fell away and
 *                `pausedHint`. A zero with history behind it is a signal and
 *                gets said in the loud type; a zero without one is not.
 *   warming      The number and a sparse bar shape, no delta. Forced to bars
 *                even when the caller asked for an area: a smooth curve through
 *                two points invents the days between them, which is precisely
 *                the lie this state exists to avoid.
 *   live         Number, sparkline and delta. The tile as originally designed.
 *
 * A count-up runs on mount in every state that shows a figure, so a number that
 * IS there announces itself.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { metricState } from '@influnet/core';
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
  pausedHint,
  lifetime,
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
   * Shown when the metric has never moved: the single next action that would
   * change that. Short — this is a caption, not a lesson.
   */
  emptyHint?: string;
  /**
   * Shown when the metric is at zero but has history behind it. Deliberately a
   * SEPARATE string from `emptyHint`: "share your profile link to get seen" is
   * advice for someone who has never been seen, and telling it to someone whose
   * views just stopped ignores the only interesting thing on the tile.
   */
  pausedHint?: string;
  /**
   * Evidence this metric was non-zero outside the current window — a prior
   * period's count or an all-time total. It is the only thing separating
   * `paused` from `dormant`, so pass it wherever it is known.
   */
  lifetime?: number | null;
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

  /**
   * The whole state decision, in one shared function. See metric-state.ts in
   * @influnet/core for the five states and why the thresholds sit where they do.
   *
   * A pre-formatted `value` ("42%") is never nullable — the caller already
   * committed to having a figure — so it enters as its parsed number and can
   * only land in `warming` or `live`, both of which just show it.
   */
  const verdict = metricState({
    total: Number.isFinite(numeric) ? numeric : null,
    series,
    lifetime,
  });
  const { state, showSeries, showDelta } = verdict;
  const dormant = state === 'dormant';

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

      {/* "--" only when nothing has ever happened. A `paused` zero keeps full
          weight — it is a real measurement and a real signal. */}
      <Numeral style={dormant ? { color: t.color.contentMuted } : undefined}>
        {dormant ? '--' : display}
      </Numeral>

      {/* ── The 30-day shape ──────────────────────────────────────────
          Drawn only when there is something to draw. A dormant tile gets a
          flat hairline instead, which occupies the same height — so a grid
          with a mix of live and empty tiles stays on one baseline rather than
          going ragged — while making no claim about a trend. */}
      {series ? (
        showSeries ? (
          <View style={{ marginTop: 2 }}>
            {/* `warming` is forced to bars whatever the caller asked for. An
                area chart smooths a curve BETWEEN points, which on two real
                days invents the twenty-eight in between; discrete bars can only
                claim what actually happened on each day. */}
            {seriesShape === 'bars' || state === 'warming' ? (
              <MicroBars data={series} color={tint ?? t.color.brand} height={30} delay={index * 60} />
            ) : (
              <Sparkline data={series} color={tint ?? t.color.brand} height={30} delay={index * 60} />
            )}
          </View>
        ) : (
          // Same height as a chart, so a grid mixing live and empty tiles keeps
          // one baseline instead of going ragged — while claiming nothing.
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
      {delta != null && showDelta ? (
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
      ) : state === 'paused' ? (
        <Txt variant="caption" tone="muted" numberOfLines={2}>
          {/* Falls back to the window, not to `emptyHint`. Advice for a
              never-started account is wrong here by construction. */}
          {pausedHint ?? 'Nothing in this window'}
        </Txt>
      ) : state === 'warming' && verdict.activeDays > 0 ? (
        <Txt variant="caption" tone="muted" numberOfLines={2}>
          {/* Says why there is no percentage, rather than leaving a gap where
              every other tile has one. Naming the count is what makes it read
              as "not yet" instead of "broken". */}
          {hint ??
            (verdict.activeDays === 1 ? 'First activity — too early to trend' : 'Too early to trend')}
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
