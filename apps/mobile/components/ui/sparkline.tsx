/**
 * Sparklines for the counter tiles.
 *
 * ── WHY THESE EXIST ───────────────────────────────────────────────────
 *
 * A tile that says "Profile views · 1,248" answers where you are and nothing
 * else. The question someone actually opens Home with is "is this going up?",
 * and a 30-day shape answers it in the space a tile already occupies — no extra
 * card, no extra scroll, no extra round trip (see `series` in /api/home, which
 * buckets rows it had already fetched).
 *
 * Two shapes, and the difference is not decorative:
 *
 *  - `Sparkline` — a filled area for CONTINUOUS quantities that are meaningful
 *    between samples. Profile views on a Tuesday is a real level, so the line
 *    connecting Monday to Wednesday is a real statement.
 *  - `MicroBars` — separated bars for COUNTABLE events. Three collab requests
 *    on Tuesday is three discrete things; drawing a line through them implies a
 *    reading of "1.4 requests" halfway between days, which is nonsense.
 *
 * ── DRAWING AND ANIMATION ─────────────────────────────────────────────
 *
 * The reveal is a left-to-right wipe: a clipping `Animated.View` whose width
 * grows over the SVG, rather than an animated path length. Animating SVG props
 * needs `createAnimatedComponent` plus a native prop bridge per platform, and
 * getting stroke-dash right across iOS and Android for a path we regenerate on
 * every layout is a lot of machinery for the same 300ms. The wipe reads
 * identically and is ordinary layout animation.
 *
 * Both components measure themselves with `onLayout`. An SVG cannot take a
 * percentage width from a flex parent — it has no intrinsic size to take a
 * percentage OF — so it collapses to nothing. This is the same trap documented
 * in ui/gradient.tsx and it bites the same way.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Measures its own box once and hands children real pixel numbers. */
function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  };
  return { width, onLayout };
}

/**
 * Left-to-right wipe. `width` is the final width in points; the inner content
 * is absolutely positioned at that width so it does not reflow as the clip
 * opens — otherwise the chart would squash rather than be revealed.
 */
function Wipe({
  width,
  height,
  delay,
  children,
}: {
  width: number;
  height: number;
  delay: number;
  children: React.ReactNode;
}) {
  const open = useSharedValue(0);

  // Keyed on `width` rather than mount: the first render measures 0, and
  // starting the wipe then would run the whole animation against a zero-width
  // box and finish before the chart has anywhere to be drawn.
  useEffect(() => {
    if (width <= 0) return;
    open.value = withDelay(delay, withTiming(1, { duration: 520, easing: EASE }));
  }, [width, delay, open]);

  const animated = useAnimatedStyle(() => ({ width: width * open.value }));

  return (
    <Animated.View style={[{ height, overflow: 'hidden' }, animated]}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height }}>{children}</View>
    </Animated.View>
  );
}

/** Build a smooth path through the points, plus the closed area beneath it. */
function buildPaths(values: number[], width: number, height: number) {
  const n = values.length;
  const max = Math.max(...values, 1);
  // A 1.5pt inset top and bottom so a peak's stroke is not clipped in half by
  // the viewbox edge, and a flat-zero series still draws a visible baseline.
  const pad = 1.5;
  const usable = height - pad * 2;
  const step = n > 1 ? width / (n - 1) : width;

  const pt = (i: number) => ({
    x: i * step,
    y: pad + usable - (values[i] / max) * usable,
  });

  let line = '';
  for (let i = 0; i < n; i += 1) {
    const p = pt(i);
    if (i === 0) {
      line += `M ${p.x} ${p.y}`;
    } else {
      // Horizontal-tangent cubic: control points share their neighbour's y, so
      // the curve smooths the joints without ever overshooting past a data
      // point. An overshooting spline on a "views" chart draws days with more
      // views than actually happened.
      const prev = pt(i - 1);
      const cx = (prev.x + p.x) / 2;
      line += ` C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
    }
  }

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area };
}

/**
 * Filled area sparkline for a continuous series.
 *
 * `color` is the whole visual identity of the tile — the stroke, and the top
 * stop of the fill at 28% down to nothing. Anything stronger and a grid of six
 * tiles becomes six coloured blocks competing with the numbers on top of them.
 */
export function Sparkline({
  data,
  color,
  height = 34,
  delay = 0,
}: {
  data: number[];
  color: string;
  height?: number;
  /** Stagger against the card's own entrance so they do not fight. */
  delay?: number;
}) {
  const { width, onLayout } = useMeasuredWidth();

  // Fewer than two points is not a trend, and drawing "a line" through one
  // sample is the chart lying about how much we know.
  if (data.length < 2) return <View style={{ height }} onLayout={onLayout} />;

  const { line, area } = width > 0 ? buildPaths(data, width, height) : { line: '', area: '' };
  const gradientId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <View style={{ height, width: '100%' }} onLayout={onLayout}>
      {width > 0 ? (
        <Wipe width={width} height={height} delay={delay}>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill={`url(#${gradientId})`} />
            <Path
              d={line}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Wipe>
      ) : null}
    </View>
  );
}

/**
 * Discrete bars for a countable series.
 *
 * Plain Views rather than SVG: this is a row of rounded rectangles, which is
 * exactly what flexbox does, and it saves mounting an SVG surface per tile.
 *
 * Bars grow from the baseline in a stagger rather than wiping, because the
 * thing being animated here is each day's count arriving, not a line being
 * drawn. Zero-count days keep a 2pt stub so the axis is legible as an axis —
 * a gap where a bar should be reads as missing data rather than as "none".
 */
export function MicroBars({
  data,
  color,
  height = 34,
  delay = 0,
}: {
  data: number[];
  color: string;
  height?: number;
  delay?: number;
}) {
  /**
   * Thirty daily bars do not fit a tile.
   *
   * A half-width tile is ~133pt of usable width. Thirty bars and their gaps
   * leaves each bar under 2pt — thinner than the 2pt corner radius on it, so
   * they render as a row of dots and the chart stops reading as bars at all.
   *
   * So the series is folded into `TARGET_BARS` equal buckets by SUM. Summing is
   * the honest operation for counted events: two days with one request each is
   * genuinely two requests in that bucket, where averaging would report 1 and
   * quietly shrink the month. The tile is showing shape, not exact daily
   * values, and the shape of a sum is the shape of the underlying counts.
   */
  const TARGET_BARS = 15;
  const bars =
    data.length <= TARGET_BARS
      ? data
      : (() => {
          // Ceil, so the last bucket is the short one. A floor here drops the
          // most recent days off the end, which is the half anyone looks at.
          const size = Math.ceil(data.length / TARGET_BARS);
          const out: number[] = [];
          for (let i = 0; i < data.length; i += size) {
            out.push(data.slice(i, i + size).reduce((sum, v) => sum + v, 0));
          }
          return out;
        })();
  const max = Math.max(...bars, 1);

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
      {bars.map((v, i) => (
        <Bar
          key={i}
          // Minimum 2pt so an empty day is still a mark on the axis.
          ratio={Math.max(v / max, 0.06)}
          height={height}
          color={color}
          // Faint for empty days, solid for real ones — the shape of the month
          // is readable without reading any number.
          dim={v === 0}
          delay={delay + i * 12}
        />
      ))}
    </View>
  );
}

function Bar({
  ratio,
  height,
  color,
  dim,
  delay,
}: {
  ratio: number;
  height: number;
  color: string;
  dim: boolean;
  delay: number;
}) {
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 300, easing: EASE }));
  }, [delay, grow]);

  const animated = useAnimatedStyle(() => ({ height: height * ratio * grow.value }));

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          borderRadius: 2.5,
          backgroundColor: color,
          opacity: dim ? 0.18 : 1,
        },
        animated,
      ]}
    />
  );
}
