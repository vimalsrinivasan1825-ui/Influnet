/**
 * Platform brand marks for the social fields.
 *
 * Inline SVG rather than image files: these render inside inputs at 16–20px on
 * every signup and profile screen, and a network round-trip per logo (or a
 * sprite that can 404) is a lot of machinery for five shapes. Mobile keeps its
 * PNG assets (apps/mobile/assets/social/) — same marks, different constraint.
 *
 * Each is full-colour and takes no `color` prop, matching the mobile icon set:
 * recolouring a brand's own logo isn't a choice this app gets to make. `size`
 * is the one dimension a layout legitimately needs.
 *
 * The gradient id is suffixed per-instance because two Instagram marks on one
 * page would otherwise share a single id, and the second would silently adopt
 * the first's gradient (or vanish if the first unmounts).
 */
import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export function InstagramMark({ size = 18, className }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="Instagram">
      <defs>
        <radialGradient id={`ig-${id}`} cx="0.3" cy="1" r="1.2">
          <stop offset="0%" stopColor="#FDD35D" />
          <stop offset="25%" stopColor="#F77737" />
          <stop offset="50%" stopColor="#E1306C" />
          <stop offset="75%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#5B51D8" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={`url(#ig-${id})`} />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.1" cy="6.9" r="1.15" fill="#fff" />
    </svg>
  );
}

export function YouTubeMark({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="YouTube">
      <rect x="1" y="4.5" width="22" height="15" rx="4.2" fill="#FF0000" />
      <path d="M10 8.6l6 3.4-6 3.4V8.6z" fill="#fff" />
    </svg>
  );
}

export function FacebookMark({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="Facebook">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path
        d="M15.1 12.6l.45-2.9h-2.78V7.82c0-.8.39-1.57 1.63-1.57h1.27V3.78s-1.15-.2-2.25-.2c-2.3 0-3.8 1.39-3.8 3.9V9.7H7.06v2.9h2.56V23a10.2 10.2 0 003.15 0v-10.4h2.33z"
        fill="#fff"
      />
    </svg>
  );
}

export function XMark({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="X">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#000" />
      <path
        d="M16.4 6h2.1l-4.6 5.3L19.4 18h-4.2l-3.3-4.3L8.1 18H6l4.9-5.6L5.9 6h4.3l3 4 3.2-4zm-.75 10.7h1.16L9.4 7.2H8.16l7.49 9.5z"
        fill="#fff"
      />
    </svg>
  );
}

/**
 * Snapchat's ghost on its yellow — the app-icon composition, since a white
 * ghost alone is invisible against a light input background.
 */
export function SnapchatMark({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="Snapchat">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#FFFC00" />
      <path
        d="M12 4.2c-2.6 0-4.35 1.9-4.35 4.42 0 .78.04 1.5.04 1.9-.4.31-1.03.16-1.5 0-.4-.15-.79.16-.71.55.12.63.71 1.18 1.58 1.5.16.05.2.16.16.31-.28.95-1.58 1.58-2.53 1.74-.32.05-.47.4-.32.67.4.71 1.58.95 2.37 1.07.12.4.24.79.47.95.4.28 1.11.08 1.82.04.71-.04 1.5.43 2.05.83.47.35 1.18.35 1.66 0 .55-.4 1.34-.87 2.05-.83.71.04 1.42.24 1.82-.04.24-.16.36-.55.47-.95.79-.12 1.97-.36 2.37-1.07.16-.28 0-.63-.32-.67-.95-.16-2.25-.79-2.53-1.74-.04-.16 0-.26.16-.32.87-.32 1.46-.87 1.58-1.5.08-.39-.32-.7-.71-.55-.47.16-1.11.31-1.5 0 0-.4.04-1.11.04-1.9C16.35 6.1 14.6 4.2 12 4.2z"
        fill="#fff"
        stroke="#000"
        strokeOpacity="0.12"
        strokeWidth="0.4"
      />
    </svg>
  );
}

/** Platform key → mark, so callers can render by name without a switch. */
export const SOCIAL_MARKS = {
  instagram: InstagramMark,
  youtube: YouTubeMark,
  facebook: FacebookMark,
  twitter: XMark,
  snapchat: SnapchatMark,
} as const;

export type SocialMarkName = keyof typeof SOCIAL_MARKS;
