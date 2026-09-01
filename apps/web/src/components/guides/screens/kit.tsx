"use client";

/**
 * Shared mock-UI primitives for the guide screens. Everything is built from the
 * app's own design tokens (`--surface-card`, `--brand`, …) so the mock tracks
 * the real interface and is correct in light and dark without extra work.
 *
 * Screens are stylised representations, not the live DOM. They exist to be
 * pointed at: tap/zoom targets carry `data-el="<id>"`, and text that types
 * itself in carries `data-fill="<id>"`.
 */

import type { ReactNode } from "react";

export interface GuideContext {
  /** The signed-in person's display name. */
  name: string;
  /** Instagram-style handle, no @. */
  handle: string;
  avatarUrl?: string | null;
  /** Public profile link with protocol. */
  profileUrl: string;
  /** Same link, protocol stripped, for display. */
  displayUrl: string;
  role: "influencer" | "business_owner" | "admin" | null;
  /** "free" | "pro" — drives the billing screen. */
  plan: "free" | "pro";
}

export const DEFAULT_CONTEXT: GuideContext = {
  name: "Priya Sharma",
  handle: "priyacreates",
  avatarUrl: null,
  profileUrl: "https://influnet.in/c/priya",
  displayUrl: "influnet.in/c/priya",
  role: "influencer",
  plan: "free",
};

/** iOS-ish status bar. */
export function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex h-[26px] items-center justify-between px-3 pt-1.5 text-[9px] font-semibold ${
        dark ? "text-white/95" : "text-content opacity-80"
      }`}
    >
      <span>9:41</span>
      <span>▮▮ ⌁</span>
    </div>
  );
}

/** A screen's own top bar: back chevron + title + optional trailing node. */
export function TopBar({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-1.5 border-b border-hairline px-3">
      <span className="size-[7px] rotate-45 border-b-2 border-l-2 border-content-soft" />
      <span className="flex-1 truncate text-[11px] font-extrabold text-content">{title}</span>
      {trailing}
    </div>
  );
}

/** A tap/zoom target. */
export function Tap({
  id,
  children,
  className = "",
  style,
}: {
  id: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div data-el={id} className={className} style={style}>
      {children}
    </div>
  );
}

/** A slot that a beat's `type` text fills character by character. */
export function Fill({ id, placeholder }: { id: string; placeholder?: string }) {
  return (
    <span className="text-content" data-fill={id}>
      {placeholder ?? ""}
    </span>
  );
}

const K =
  "text-[8px] font-bold uppercase tracking-[0.07em] text-content-muted";

/** A labelled field row with a typed-text slot. */
export function Field({
  label,
  id,
  placeholder,
  value,
}: {
  label: string;
  id: string;
  placeholder?: string;
  value?: string;
}) {
  return (
    <Tap id={id} className="border-b border-hairline px-3 py-2">
      <div className={K}>{label}</div>
      <div className="min-h-[13px] break-all pt-0.5 text-[10.5px] leading-relaxed text-content">
        {value ? <span className="text-content">{value}</span> : <Fill id={id} placeholder={placeholder} />}
      </div>
    </Tap>
  );
}

export function SectionKey({ children }: { children: ReactNode }) {
  return <div className={K}>{children}</div>;
}

export function PrimaryBtn({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Tap
      id={id}
      className="mt-2 flex h-[30px] items-center justify-center rounded-lg bg-brand text-[10.5px] font-bold text-white"
    >
      {children}
    </Tap>
  );
}

export function GhostBtn({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Tap
      id={id}
      className="flex h-[28px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-[10px] font-bold text-content"
    >
      {children}
    </Tap>
  );
}

/** A list row: leading avatar/icon, title, subtitle, optional trailing. */
export function Row({
  id,
  title,
  subtitle,
  leading,
  trailing,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-2.5 border-b border-hairline px-3 py-2 last:border-0">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10.5px] font-bold text-content">{title}</div>
        {subtitle && <div className="truncate text-[9px] text-content-muted">{subtitle}</div>}
      </div>
      {trailing}
    </div>
  );
  return id ? <Tap id={id}>{body}</Tap> : body;
}

/** Default profile image — a designed avatar, never an empty grey disc. */
export function Avatar({ size = 24, uri }: { size?: number; uri?: string | null }) {
  if (uri) {
    // A mock avatar in a guide screen — next/image's loader is pointless at 24px.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uri}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const id = `g-av-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="block shrink-0 rounded-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb9ec3" />
          <stop offset="52%" stopColor="#c286f0" />
          <stop offset="100%" stopColor="#7c9cf5" />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect width="64" height="64" fill={`url(#${id})`} />
        <circle cx="32" cy="25" r="11.5" fill="#fff" fillOpacity=".92" />
        <path
          d="M32 39c-11 0-19.5 6.6-21.5 16.4A32 32 0 0032 64a32 32 0 0021.5-8.6C51.5 45.6 43 39 32 39z"
          fill="#fff"
          fillOpacity=".92"
        />
      </g>
    </svg>
  );
}

export function VerifiedTick({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="var(--verified, #ff0b8d)"
      />
      <path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A neutral tile used for grid thumbnails. */
export function Thumb() {
  return (
    <span
      className="block aspect-square rounded-[3px]"
      style={{ background: "linear-gradient(150deg,var(--hairline-strong),var(--surface-muted))" }}
    />
  );
}

export const money = "₹";
