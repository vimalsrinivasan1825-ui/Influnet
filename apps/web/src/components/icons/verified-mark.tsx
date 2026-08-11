// The Influnet "verified" trust mark: a checkmark inside a scalloped seal
// (12-point sunburst edge), not a plain circle — a certification-seal shape
// reads as "official," distinct from a generic checkmark-in-a-dot. Self
// contained (fill + white check baked in) so it drops in anywhere a badge icon
// is needed with no wrapping background required.
//
// ── `pro` ──────────────────────────────────────────────────────────────────
// A Pro subscriber's seal is gold with a soft glow instead of the standard
// pink. Two rules, the same ones VerifiedBadge follows:
//
//   • It only ever gilds a seal that is ALREADY being shown for a verified
//     account. Callers must not render this at all for unverified users, so
//     paying can never look like being verified — the failure migration 083
//     exists to prevent.
//   • It must be driven from the server's answer (`is_pro_public`), never from
//     anything the viewer controls.
//
// The gradient uses one fixed id shared by every instance on the page. Two
// elements with the same id is technically invalid, but every definition here
// is byte-identical so the first one winning is exactly the intended result —
// and it avoids useId(), which would make this unusable in a Server Component.
const GOLD_ID = 'influnet-pro-gold';

export function VerifiedMark({
  className,
  pro = false,
}: {
  className?: string;
  /** Gold + glow treatment for Pro subscribers. Only pass true for a VERIFIED account. */
  pro?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      // drop-shadow rather than an SVG <filter>: no filter region to clip the
      // glow against, and no second id to collide. Applied to a leaf icon, so
      // it cannot create a containing block that breaks a sticky ancestor.
      style={pro ? { filter: 'drop-shadow(0 0 3px rgba(224,165,38,0.75))' } : undefined}
    >
      {pro && (
        <defs>
          <linearGradient id={GOLD_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F6D77A" />
            <stop offset="45%" stopColor="#E0A526" />
            <stop offset="100%" stopColor="#B87814" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12.0,0.7 L14.33,3.31 L17.65,2.21 L18.36,5.64 L21.79,6.35 L20.69,9.67 L23.3,12.0 L20.69,14.33 L21.79,17.65 L18.36,18.36 L17.65,21.79 L14.33,20.69 L12.0,23.3 L9.67,20.69 L6.35,21.79 L5.64,18.36 L2.21,17.65 L3.31,14.33 L0.7,12.0 L3.31,9.67 L2.21,6.35 L5.64,5.64 L6.35,2.21 L9.67,3.31 Z"
        fill={pro ? `url(#${GOLD_ID})` : '#FF0B8D'}
      />
      <path
        d="M8 12.3l2.6 2.6L16.2 9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
