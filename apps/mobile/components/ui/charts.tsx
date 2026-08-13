/**
 * Chart primitives.
 *
 * Three rules this file follows, and screens should keep following:
 *
 *  1. One hue per chart. Bar *length* and arc *sweep* carry the value; the
 *     label carries identity. A categorical palette of pipeline states was
 *     measured and rejected: the completed-green / declined-red pair sits at
 *     ΔE 5.0 under deuteranopia, below the level any amount of direct
 *     labelling makes safe. Where several buckets do need telling apart, they
 *     are ordered, so one hue at stepped weight does it — see DONUT_ALPHA.
 *  2. Colour is never the only channel. Every segment and bar is labelled with
 *     its own name and value, so the chart still reads in greyscale or with the
 *     colour stripped entirely.
 *  3. All-zero data is not a chart. A flat baseline reads as broken rather than
 *     as empty, so these components say "nothing yet" in words instead.
 *
 * Bars are plain views — a bar is a rectangle, and views give real text
 * rendering and flex layout for free. SVG is reserved for arc geometry, which
 * views genuinely cannot express.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/** Height of the plot area for the weekly bars. */
const TREND_PLOT_HEIGHT = 92;
/** A bar that rounds to nothing still has to be visible as "zero, not missing". */
const MIN_BAR_HEIGHT = 3;

export interface TrendPoint {
  /** Short axis label, e.g. "6 Jul". */
  label: string;
  value: number;
}

/**
 * Discrete totals over time — six weekly buckets, newest last.
 *
 * Bars rather than a line on purpose: these are per-week sums, not a continuous
 * quantity, and real accounts have mostly-empty weeks. A line across five zeros
 * and one spike looks like a rendering fault; bars read as what they are.
 *
 * Only the tallest bar is labelled with its value. A number over every bar is
 * noise, and the axis plus that one anchor is enough to read the rest against.
 */
export function TrendBars({
  data,
  formatValue,
  emptyLabel = 'No activity in this period yet',
}: {
  data: TrendPoint[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
}) {
  const t = useTheme();

  const max = Math.max(...data.map((d) => d.value), 0);
  const peakIndex = data.findIndex((d) => d.value === max);

  if (data.length === 0 || max <= 0) {
    return (
      <View style={{ height: TREND_PLOT_HEIGHT, justifyContent: 'center' }}>
        <Txt variant="footnote" tone="muted" center>
          {emptyLabel}
        </Txt>
      </View>
    );
  }

  return (
    <View style={{ gap: t.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.sm,
          height: TREND_PLOT_HEIGHT,
        }}
      >
        {data.map((point, i) => {
          const isPeak = i === peakIndex;
          const ratio = point.value / max;

          return (
            <View key={`${point.label}-${i}`} style={{ flex: 1, justifyContent: 'flex-end', gap: 5 }}>
              {isPeak ? (
                <Txt variant="caption" tone="soft" center numberOfLines={1}>
                  {formatValue(point.value)}
                </Txt>
              ) : null}
              <View
                accessibilityLabel={`${point.label}: ${formatValue(point.value)}`}
                style={{
                  height: Math.max(ratio * (TREND_PLOT_HEIGHT - 22), MIN_BAR_HEIGHT),
                  // Rounded data-end, square against the baseline it sits on.
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  // Empty weeks stay visible as a faint stub rather than vanishing.
                  backgroundColor: point.value > 0 ? t.color.brand : t.color.hairlineStrong,
                  opacity: point.value > 0 && !isPeak ? 0.45 : 1,
                }}
              />
            </View>
          );
        })}
      </View>

      {/* Baseline. Recessive — it orients the bars, it isn't data. */}
      <View style={{ height: 1, backgroundColor: t.color.hairline }} />

      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {data.map((point, i) => (
          <Txt key={`${point.label}-label-${i}`} variant="caption" tone="muted" center style={{ flex: 1 }} numberOfLines={1}>
            {point.label}
          </Txt>
        ))}
      </View>
    </View>
  );
}

export interface BarListItem {
  label: string;
  value: number;
  /** Drawn to the left of the label — a platform mark, usually. */
  icon?: ReactNode;
}

/**
 * Ranked parts of a whole, as horizontal bars.
 *
 * The layout TrendBars cannot do: category names of real length. Vertical bars
 * force labels into a few characters or a rotation, and "Instagram" under a
 * column on a 375pt screen is neither. Rows give the name a whole line.
 *
 * Same rules as the rest of this file — one hue, length carries the value, and
 * every row states its own number, so it reads with the colour stripped out.
 */
export function BarList({
  data,
  formatValue = (v) => String(v),
}: {
  data: BarListItem[];
  formatValue?: (value: number) => string;
}) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || max <= 0) return null;

  return (
    <View style={{ gap: t.spacing.sm }}>
      {data.map((row) => (
        <View
          key={row.label}
          accessibilityLabel={`${row.label}: ${formatValue(row.value)}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
        >
          {row.icon ? <View style={{ width: 18, alignItems: 'center' }}>{row.icon}</View> : null}

          {/* Fixed label column so every bar starts at the same x — bars that
              begin at ragged offsets cannot be compared by eye, which is the
              only thing a bar chart is for. */}
          <Txt variant="footnote" tone="soft" numberOfLines={1} style={{ width: 74 }}>
            {row.label}
          </Txt>

          <View
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: t.color.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max((row.value / max) * 100, row.value > 0 ? 4 : 0)}%`,
                height: '100%',
                borderRadius: 4,
                backgroundColor: t.color.brand,
              }}
            />
          </View>

          <Txt
            variant="footnote"
            style={{ fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 46, textAlign: 'right' }}
          >
            {formatValue(row.value)}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export interface BreakdownItem {
  label: string;
  value: number;
  /** Optional per-row tint. Defaults to the role accent. */
  color?: string;
}

/**
 * Alpha steps for the donut ramp.
 *
 * Pipeline states are *ordered* (proposed → active → completed), so this is a
 * sequential ramp, not a categorical palette: one hue, decreasing weight. That
 * sidesteps the categorical palette measured and rejected at the top of this
 * file, and lightness monotonicity — the check a sequential ramp has to pass —
 * holds by construction, since each step is the same hue at less opacity over
 * the same surface.
 */
const DONUT_ALPHA = ['ff', 'bf', '85', '4d'];

/**
 * Part-to-whole across a few ordered buckets, with the total in the middle.
 *
 * Every segment is repeated in the legend with its own label and count, so the
 * ring is a summary of something already readable rather than the only way to
 * get the numbers.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 148,
  thickness = 22,
}: {
  data: BreakdownItem[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const t = useTheme();

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // A hair of surface between segments so neighbouring arcs stay distinct.
  const GAP = 2;

  let offset = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((item, i) => {
      const fraction = item.value / total;
      const length = Math.max(fraction * circumference - GAP, 0.5);
      const seg = {
        key: item.label,
        color: item.color ?? `${t.color.brand}${DONUT_ALPHA[i % DONUT_ALPHA.length]}`,
        length,
        offset,
      };
      offset += fraction * circumference;
      return seg;
    });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xl }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={t.color.surfaceMuted}
            strokeWidth={thickness}
            fill="none"
          />
          {segments.map((seg) => (
            <Circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={seg.color}
              strokeWidth={thickness}
              fill="none"
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              rotation={-90}
              originX={size / 2}
              originY={size / 2}
            />
          ))}
        </Svg>

        <View style={{ alignItems: 'center' }}>
          <Txt variant="title2" style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
            {centerValue}
          </Txt>
          <Txt variant="caption" tone="muted">
            {centerLabel}
          </Txt>
        </View>
      </View>

      {/* Legend. Present whenever there is more than one segment, so identity
          never rests on colour alone. */}
      <View style={{ flex: 1, gap: t.spacing.sm }}>
        {data.map((item, i) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor:
                  item.value > 0
                    ? item.color ?? `${t.color.brand}${DONUT_ALPHA[i % DONUT_ALPHA.length]}`
                    : t.color.hairlineStrong,
              }}
            />
            <Txt variant="footnote" tone="soft" style={{ flex: 1 }} numberOfLines={1}>
              {item.label}
            </Txt>
            <Txt variant="footnote" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {item.value}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A single ratio as an arc — stage N of M, or a percentage.
 *
 * The centre carries the value as text, so the ring is reinforcement rather
 * than the only way to read it.
 */
export function ProgressRing({
  progress,
  size = 64,
  thickness = 6,
  label,
  caption,
  color,
}: {
  /** 0–1. Values outside the range are clamped rather than drawn as an overspill. */
  progress: number;
  size?: number;
  thickness?: number;
  label: string;
  caption?: string;
  color?: string;
}) {
  const t = useTheme();

  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const tint = color ?? t.color.brand;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={t.color.hairlineStrong}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          // Start the sweep at 12 o'clock instead of 3. rotation/originX/originY
          // rather than a transform string — these are first-class props in
          // react-native-svg and don't depend on its SVG-string parser.
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>

      <View style={{ alignItems: 'center' }}>
        <Txt variant="footnote" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {label}
        </Txt>
        {caption ? (
          <Txt variant="caption" tone="muted" style={{ fontSize: 10 }}>
            {caption}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A thin determinate bar for "step 4 of 12" — the same idea as ProgressRing
 * where a row has width to spare but no room for a circle.
 */
export function ProgressBar({
  progress,
  color,
  style,
}: {
  progress: number;
  color?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  return (
    <View
      style={[
        { height: 5, borderRadius: 3, backgroundColor: t.color.surfaceMuted, overflow: 'hidden' },
        style,
      ]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color ?? t.color.brand,
        }}
      />
    </View>
  );
}
