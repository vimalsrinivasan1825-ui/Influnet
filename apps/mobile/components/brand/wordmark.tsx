/**
 * The influnet wordmark, as outlines.
 *
 * Plus Jakarta Sans Bold, lowercase, −2.5% tracking — the design system v2
 * lockup. It used to be live text, and on a phone that is not the same thing:
 * the font has an `fl` ligature, and iOS and Android both apply it, so the
 * `f` hooked into the `l` and the gap between them closed up. A browser
 * drops the ligature as soon as letter-spacing is non-zero, which is why the
 * design (and dev.influnet.io) show `f` and `l` apart. React Native can't
 * turn the ligature off on iOS (`no-common-ligatures` is ignored there).
 *
 * So the logo is drawn, not typeset: the eight glyphs from the same font file
 * Google Fonts serves (v2.071), placed exactly as Chrome lays them out — no
 * ligatures, no kerning pairs apply, −25 units after every glyph. It also
 * means the wordmark no longer waits for the font to register.
 *
 * Units are the font's (1000/em). The box is Chrome's line box for the face —
 * ascent 1038, descent 222 — and the advance width including the trailing
 * tracking, so it centres against the mark exactly as `align-items: center`
 * does in the design.
 */
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const D =
  'M61 0V-544H192V0ZM61 -605V-745H192V-605ZM288 0V-544H411V-437L401 -456Q420 -505 463.5 -530.5Q507 -556 565 -556Q625 -556 671.5 -530Q718 -504 744 -457.5Q770 -411 770 -350V0H639V-319Q639 -355 625 -381Q611 -407 586.5 -421.5Q562 -436 529 -436Q497 -436 472 -421.5Q447 -407 433 -381Q419 -355 419 -319V0ZM919 0V-427H823V-544H919V-562Q919 -624 944.5 -667.5Q970 -711 1016 -734Q1062 -757 1125 -757Q1137 -757 1151.5 -755.5Q1166 -754 1176 -752V-639Q1166 -641 1157.5 -641.5Q1149 -642 1142 -642Q1098 -642 1074 -622.5Q1050 -603 1050 -562V-544H1171V-427H1050V0ZM1237 0V-757H1368V0ZM1658 12Q1595 12 1548.5 -16Q1502 -44 1477.5 -94Q1453 -144 1453 -211V-544H1584V-222Q1584 -188 1597.5 -162.5Q1611 -137 1636.5 -122.5Q1662 -108 1694 -108Q1726 -108 1751 -122.5Q1776 -137 1790 -163Q1804 -189 1804 -225V-544H1935V0H1811V-107L1822 -88Q1803 -38 1759.5 -13Q1716 12 1658 12ZM2032 0V-544H2155V-437L2145 -456Q2164 -505 2207.5 -530.5Q2251 -556 2309 -556Q2369 -556 2415.5 -530Q2462 -504 2488 -457.5Q2514 -411 2514 -350V0H2383V-319Q2383 -355 2369 -381Q2355 -407 2330.5 -421.5Q2306 -436 2273 -436Q2241 -436 2216 -421.5Q2191 -407 2177 -381Q2163 -355 2163 -319V0ZM2858 12Q2774 12 2711 -26Q2648 -64 2613 -129Q2578 -194 2578 -273Q2578 -355 2613.5 -418.5Q2649 -482 2710.5 -519Q2772 -556 2848 -556Q2912 -556 2960.5 -535Q3009 -514 3043 -477Q3077 -440 3095 -392.5Q3113 -345 3113 -290Q3113 -276 3111.5 -261Q3110 -246 3106 -235H2686V-335H3032L2970 -288Q2979 -334 2965.5 -370Q2952 -406 2921.5 -427Q2891 -448 2848 -448Q2807 -448 2775 -427.5Q2743 -407 2726.5 -367.5Q2710 -328 2714 -272Q2710 -222 2727.5 -183.5Q2745 -145 2779.5 -124Q2814 -103 2859 -103Q2904 -103 2935.5 -122Q2967 -141 2985 -173L3091 -121Q3075 -82 3041 -52Q3007 -22 2960.5 -5Q2914 12 2858 12ZM3435 6Q3343 6 3292.5 -44.5Q3242 -95 3242 -187V-427H3148V-544H3158Q3198 -544 3220 -565Q3242 -586 3242 -626V-668H3373V-544H3498V-427H3373V-194Q3373 -167 3382.5 -148Q3392 -129 3412.5 -119Q3433 -109 3465 -109Q3472 -109 3481.5 -110Q3491 -111 3500 -112V0Q3486 2 3468 4Q3450 6 3435 6Z';

const ADVANCE = 3514;
const ASCENT = 1038;
const LINE = 1260;

/** Width and height of the wordmark's box, per point of font size. */
export const WORDMARK_EM = { width: ADVANCE / 1000, height: LINE / 1000 };

export function Wordmark({ size, color }: { /** Font size in points. */ size: number; color?: string }) {
  const t = useTheme();
  return (
    <Svg
      width={size * WORDMARK_EM.width}
      height={size * WORDMARK_EM.height}
      viewBox={`0 ${-ASCENT} ${ADVANCE} ${LINE}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel="influnet"
    >
      <Path d={D} fill={color ?? t.color.content} />
    </Svg>
  );
}
