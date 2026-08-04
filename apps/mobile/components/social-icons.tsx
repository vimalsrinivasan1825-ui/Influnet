/**
 * Platform marks for the social fields.
 *
 * lucide-react-native dropped every brand icon in v1 (trademark reasons), and
 * none of its 1996 remaining glyphs read as "Instagram". These are drawn from
 * SVG primitives instead of pulling in a second icon package for four shapes.
 *
 * Stroke-built rather than solid brand logos, so they sit in the same visual
 * language as every other icon in the app and inherit `color` the same way.
 */
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function InstagramIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color}>
      <Rect x={2} y={2} width={20} height={20} rx={5} />
      <Circle cx={12} cy={12} r={4} />
      <Circle cx={17.5} cy={6.5} r={1} fill={color} stroke="none" />
    </Svg>
  );
}

export function YoutubeIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color}>
      <Rect x={2} y={5} width={20} height={14} rx={4} />
      <Polygon points="10.5,9 15.5,12 10.5,15" fill={color} stroke="none" />
    </Svg>
  );
}

/** The post-rebrand X mark: a plain crossed glyph, not the old bird. */
export function XIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color}>
      <Line x1={4} y1={4} x2={20} y2={20} />
      <Line x1={20} y1={4} x2={4} y2={20} />
    </Svg>
  );
}

export function FacebookIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} stroke={color}>
      <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </Svg>
  );
}
