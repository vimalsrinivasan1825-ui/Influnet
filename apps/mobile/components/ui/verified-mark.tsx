import Svg, { Path } from 'react-native-svg';

/**
 * The Influnet "verified" trust mark: a checkmark inside a scalloped seal
 * (12-point sunburst edge), not a plain circle. Mirrors
 * apps/web/src/components/icons/verified-mark.tsx exactly (same path data,
 * same 24x24 coordinate space, same fixed pink+white fill) so the trust mark
 * is identical on both platforms. Self-contained — no wrapping background
 * needed, unlike the old checkmark-in-a-dot treatment.
 */
export function VerifiedMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12.0,0.7 L14.33,3.31 L17.65,2.21 L18.36,5.64 L21.79,6.35 L20.69,9.67 L23.3,12.0 L20.69,14.33 L21.79,17.65 L18.36,18.36 L17.65,21.79 L14.33,20.69 L12.0,23.3 L9.67,20.69 L6.35,21.79 L5.64,18.36 L2.21,17.65 L3.31,14.33 L0.7,12.0 L3.31,9.67 L2.21,6.35 L5.64,5.64 L6.35,2.21 L9.67,3.31 Z"
        fill="#FF0B8D"
      />
      <Path
        d="M8 12.3l2.6 2.6L16.2 9"
        fill="none"
        stroke="#fff"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
