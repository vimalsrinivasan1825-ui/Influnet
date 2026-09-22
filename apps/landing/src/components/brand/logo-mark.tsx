// The Influnet mark, redrawn from public/influet_logo.png so its parts (ring,
// spokes, nodes) can be animated separately. Class names are animation hooks.
type Props = {
  size?: number;
  color?: string;
  /** Fill inside the ring; hollow by default. */
  hole?: string;
  className?: string;
  title?: string;
};

export const NODES = [
  { cx: 960, cy: 246, r: 87 },
  { cx: 525, cy: 396, r: 76 },
  { cx: 1013, cy: 617, r: 80 },
  { cx: 566, cy: 774, r: 84 },
];

// Spokes start at the ring's outer edge, so the ring can stay hollow and the
// mark sits on any background.
const RING_OUTER = 118;
const spokeStart = (n: { cx: number; cy: number }) => {
  const dx = n.cx - 752;
  const dy = n.cy - 520;
  const len = Math.hypot(dx, dy);
  return { x: 752 + (dx / len) * RING_OUTER, y: 520 + (dy / len) * RING_OUTER };
};

export default function LogoMark({ size = 32, color = '#ff078e', hole = 'none', className, title }: Props) {
  return (
    <svg
      viewBox="430 150 690 720"
      width={size}
      height={size * (720 / 690)}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g stroke={color} strokeWidth={44} strokeLinecap="round" fill="none">
        {NODES.map((n) => (
          <line key={n.cx} className="logo-spoke" x1={spokeStart(n).x} y1={spokeStart(n).y} x2={n.cx} y2={n.cy} />
        ))}
      </g>
      <g fill={color}>
        {NODES.map((n, i) => (
          <circle key={n.cx} className={`logo-node logo-node-${i}`} cx={n.cx} cy={n.cy} r={n.r} />
        ))}
      </g>
      <circle className="logo-ring" cx={752} cy={520} r={96} fill={hole} stroke={color} strokeWidth={44} />
    </svg>
  );
}
