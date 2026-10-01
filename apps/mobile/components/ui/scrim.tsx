/**
 * A bottom-up dark fade so white text reads over a cover or photo. SVG rather
 * than expo-linear-gradient, which is a native module this binary lacks.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function Scrim({ from = 0.35, strength = 0.82 }: { from?: number; strength?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset={String(from)} stopColor="#111114" stopOpacity={0} />
            <Stop offset="1" stopColor="#111114" stopOpacity={strength} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
      </Svg>
    </View>
  );
}
