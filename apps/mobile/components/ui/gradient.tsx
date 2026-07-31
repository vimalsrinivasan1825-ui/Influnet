/**
 * Brand gradient surfaces.
 *
 * Mirrors the web's `linear-gradient(135deg, #ee3e96 0%, #f26e59 100%)` — the
 * same two stops already in the tokens as `brand` and `brand2`, so the ramp
 * re-tints per role for free (pink→coral for brands, violet for creators).
 *
 * Drawn with react-native-svg rather than expo-linear-gradient: it is already a
 * dependency, so this needs no new native module and no dev-client rebuild.
 *
 * Both components below measure their box with onLayout and hand the SVG real
 * numbers. Percentage sizing does not work here — an absolutely-positioned Svg
 * has no intrinsic size to take a percentage *of*, so it collapses and the fill
 * ends up smaller than the card, leaving content stranded on bare background.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

/** Shared painter: fills `width`×`height` with a 135° two-stop ramp. */
function Ramp({
  width,
  height,
  from,
  to,
  id,
}: {
  width: number;
  height: number;
  from: string;
  to: string;
  id: string;
}) {
  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        {/* x1/y1 → x2/y2 across the box: top-left to bottom-right, i.e. 135deg. */}
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A filled card that paints the brand ramp behind its children.
 */
export function GradientCard({
  children,
  style,
  radius,
  colors,
}: {
  children: ReactNode;
  style?: ViewStyle;
  radius?: number;
  /** Override the ramp. Defaults to the role accent's two stops. */
  colors?: [string, string];
}) {
  const t = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [from, to] = colors ?? [t.color.brand, t.color.brand2];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  };

  const r = radius ?? t.radii.xl;

  // Two layers on purpose: `overflow: 'hidden'` is what keeps the gradient
  // inside the rounded corners, and on iOS that same property clips the shadow
  // off a view. So the shadow goes on the outer box and the clipping on the
  // inner one.
  return (
    <View style={[{ borderRadius: r }, t.shadows.raised, style]}>
      <View
        onLayout={onLayout}
        style={{
          borderRadius: r,
          overflow: 'hidden',
          padding: t.spacing.xl,
          // Spacing between children lives here, not on the outer box — the
          // outer box has exactly one child and a `gap` on it would do nothing.
          gap: t.spacing.lg,
          // Until the first layout lands the flat brand colour stands in, so a
          // card is never briefly white with white text on it.
          backgroundColor: from,
        }}
      >
        <Ramp width={size.width} height={size.height} from={from} to={to} id="cardRamp" />
        {children}
      </View>
    </View>
  );
}

/**
 * A soft wash of brand colour behind a whole screen.
 *
 * Fills the entire screen — not a strip at the top. A fixed-height band left a
 * hard horizontal edge partway down the page and read as a stray coloured block
 * behind some containers and not others; the tint has to run the full height or
 * it looks like a rendering fault.
 *
 * It is also the only painted background: nothing stacked above it may set an
 * opaque colour, or that element punches a grey hole straight through the wash.
 */
export function GradientBackground() {
  const t = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height }
        );
      }}
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
          <Defs>
            {/* Straight down the page rather than diagonally: a diagonal ramp on
                a tall, narrow screen puts its corner transition somewhere
                arbitrary in the middle of the content. */}
            <LinearGradient id="screenRamp" x1="0" y1="0" x2="0" y2="1">
              {/* Faint even at full strength. Any stronger and every white card
                  on top starts to look like it is on the wrong background. */}
              <Stop offset="0" stopColor={t.color.brand} stopOpacity={0.18} />
              <Stop offset="0.38" stopColor={t.color.brand} stopOpacity={0.06} />
              <Stop offset="1" stopColor={t.color.brand} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill="url(#screenRamp)"
          />
        </Svg>
      ) : null}
    </View>
  );
}
