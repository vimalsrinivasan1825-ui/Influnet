/**
 * A small, real, brand-colored glyph for one of the destinations a profile
 * link can point at — Instagram, YouTube, Facebook, a plain website.
 *
 * The reach card used to draw every channel as an identical grey bar with a
 * text label, which is exactly the "everything looks the same" complaint:
 * Instagram and a personal website read as the same row with different words.
 * These are small inline SVGs rather than an icon-font import — this version
 * of lucide-react ships no brand marks (see the note on IgLogo/YtPlay in
 * creator-profile-view.tsx, the same constraint this file works around) — each
 * sized to sit in a small colored roundel so the shape carries as much of the
 * identity as the color does.
 */
import type { CSSProperties } from "react";
import { Globe, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlatformKey =
  | "instagram"
  | "youtube"
  | "facebook"
  | "twitter"
  | "snapchat"
  | "linkedin"
  | "website"
  | "profile"
  | "other";

const PLATFORM_META: Record<PlatformKey, { bg: string; label: string }> = {
  // Instagram's mark is a gradient in real life; a flat approximation of its
  // warmest mid-tone reads correctly at 20px without needing a gradient def.
  instagram: { bg: "#D6249F", label: "Instagram" },
  youtube: { bg: "#FF0000", label: "YouTube" },
  facebook: { bg: "#1877F2", label: "Facebook" },
  twitter: { bg: "#000000", label: "X" },
  snapchat: { bg: "#FFFC00", label: "Snapchat" },
  linkedin: { bg: "#0A66C2", label: "LinkedIn" },
  website: { bg: "#475569", label: "Website" },
  profile: { bg: "#475569", label: "Profile" },
  other: { bg: "#94A3B8", label: "Other" },
};

function Glyph({ platform, size }: { platform: PlatformKey; size: number }) {
  const stroke = platform === "snapchat" ? "#000" : "#fff";
  const fill = platform === "snapchat" ? "#000" : "#fff";

  switch (platform) {
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.6" cy="6.4" r="1.1" fill={fill} stroke="none" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
          <path d="M13.5 21v-7.6h2.6l.4-3h-3v-1.9c0-.9.2-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.5V21h3.1z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
          <path d="M6.9 8.4H3.6V20h3.3V8.4zM5.3 3.5a1.9 1.9 0 1 0 0 3.9 1.9 1.9 0 0 0 0-3.9zM20.4 20h-3.3v-6.3c0-1.5-.5-2.5-1.9-2.5-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20H10s.1-10.6 0-11.6h3.3v1.6c.4-.7 1.2-1.7 3-1.7 2.2 0 3.9 1.4 3.9 4.5V20z" />
        </svg>
      );
    case "twitter":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
          <path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.9L4.5 22H1.4l8.1-9.3L1 2h7l4.9 6.3zm-1.2 18h1.9L7.4 4H5.4z" />
        </svg>
      );
    case "snapchat":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
          <path d="M12 3c2.9 0 4.6 2.1 4.6 4.9 0 1 .1 1.9.2 2.5.6.2 1.4.1 1.9-.2.3-.1.7 0 .8.4.1.4-.1.7-.4.9-.4.2-1 .5-1.7.7.1.6.5 1.1 1.4 1.6.3.2.4.6.2.9-.4.6-1.3.9-2.5 1-.1.4-.3.9-.8 1-.6.2-1.4-.1-2.2-.1-.8 0-1.3.6-2.4.6s-1.6-.6-2.4-.6c-.8 0-1.6.3-2.2.1-.5-.1-.7-.6-.8-1-1.2-.1-2.1-.4-2.5-1-.2-.3-.1-.7.2-.9.9-.5 1.3-1 1.4-1.6-.7-.2-1.3-.5-1.7-.7-.3-.2-.5-.5-.4-.9.1-.4.5-.5.8-.4.5.3 1.3.4 1.9.2.1-.6.2-1.5.2-2.5C7.4 5.1 9.1 3 12 3z" />
        </svg>
      );
    case "website":
    case "profile":
      return <Globe size={size} color={fill} />;
    default:
      return <Link2 size={size} color={fill} />;
  }
}

/** The colored roundel — used in the reach breakdown and anywhere else a channel needs identifying at a glance. */
export function PlatformMark({
  platform,
  size = 26,
  glyphSize,
  className,
  style,
}: {
  platform: string;
  size?: number;
  glyphSize?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const meta = PLATFORM_META[(platform as PlatformKey) in PLATFORM_META ? (platform as PlatformKey) : "other"];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", className)}
      style={{ width: size, height: size, backgroundColor: meta.bg, ...style }}
      aria-hidden
    >
      <Glyph platform={(platform as PlatformKey) in PLATFORM_META ? (platform as PlatformKey) : "other"} size={glyphSize ?? Math.round(size * 0.55)} />
    </span>
  );
}

export function platformLabel(platform: string): string {
  return PLATFORM_META[(platform as PlatformKey) in PLATFORM_META ? (platform as PlatformKey) : "other"].label;
}

export function platformColor(platform: string): string {
  return PLATFORM_META[(platform as PlatformKey) in PLATFORM_META ? (platform as PlatformKey) : "other"].bg;
}
