/**
 * A horizontal dashed line that looks the same on both platforms.
 *
 * The obvious way to draw one is `borderTopWidth: 1.5, borderStyle: 'dashed'`
 * on a zero-height View. That works on iOS and quietly does not on Android:
 * Android's border renderer only honours `dashed` when every side has the same
 * width, so a top-only dashed border falls back to solid. The result is a
 * connector that is dashed on one platform and solid on the other, which is
 * exactly the kind of difference nobody notices until a screenshot from a
 * tester does not match the design.
 *
 * So the dashes are Views. It costs a handful of nodes on a line that is
 * twenty points long, and it is identical everywhere.
 *
 * The parent is expected to give this its width (a flex row, or an absolutely
 * positioned box). `overflow: 'hidden'` means the last dash is clipped rather
 * than overhanging, so the line always ends flush.
 */
import { View } from 'react-native';

/** Enough segments to fill any connector this app draws, then clipped. */
const SEGMENTS = 14;

export function DashedRule({
  color,
  thickness = 1.5,
  dash = 3,
  gap = 3,
}: {
  color: string;
  thickness?: number;
  dash?: number;
  gap?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{ flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <View
          key={i}
          style={{
            width: dash,
            height: thickness,
            marginRight: gap,
            borderRadius: thickness / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
