/**
 * The soft colour wash behind the signed-out screens: three blurred blobs in
 * light mode, one pink glow in dark. Drawn with react-native-svg radial
 * gradients because a real blur (expo-blur) is a native module this binary
 * doesn't have — SVG ships over the air.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const LIGHT = [
  { id: 'a', cx: '12%', cy: '6%', r: '46%', color: '#ff9fcd', o: 0.55 },
  { id: 'b', cx: '92%', cy: '14%', r: '42%', color: '#ffc9a8', o: 0.5 },
  { id: 'c', cx: '50%', cy: '38%', r: '40%', color: '#d9cdff', o: 0.42 },
];
const DARK = [{ id: 'a', cx: '70%', cy: '18%', r: '55%', color: '#ff0b8d', o: 0.28 }];

export function SoftGlow({ height = 520 }: { height?: number }) {
  const t = useTheme();
  const blobs = t.scheme === 'dark' ? DARK : LIGHT;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          {blobs.map((b) => (
            <RadialGradient key={b.id} id={`g${b.id}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.color} stopOpacity={b.o} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b) => (
          <Circle key={b.id} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#g${b.id})`} />
        ))}
      </Svg>
    </View>
  );
}
