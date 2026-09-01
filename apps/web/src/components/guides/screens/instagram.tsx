"use client";

/**
 * The Instagram-verification family of mock screens, lifted from the original
 * `verify-guide-animation.tsx`. Kept close to that file's look.
 */

import Image from "next/image";
import { Avatar, Fill, SectionKey, StatusBar, Tap, VerifiedTick, type GuideContext } from "./kit";

export function PhoneHome() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#6d5bd0,#b06ab3 55%,#e88b6a)" }} />
      <div className="relative">
        <StatusBar dark />
      </div>
      <div className="absolute left-4 right-4 top-11 grid grid-cols-4 gap-x-3 gap-y-4">
        <AppIcon label="Weather" bg="linear-gradient(150deg,#5ac8fa,#007aff)" />
        <AppIcon label="Notes" bg="linear-gradient(150deg,#34d399,#059669)" />
        <AppIcon label="Photos" bg="linear-gradient(150deg,#fbbf24,#f59e0b)" />
        <AppIcon label="Music" bg="linear-gradient(150deg,#f87171,#dc2626)" />
        <Tap id="ig-icon" className="flex flex-col items-center gap-1">
          <span
            className="flex size-10 items-center justify-center rounded-[11px] shadow-md"
            style={{ background: "conic-gradient(from 210deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)" }}
          >
            <span className="relative block size-[19px] rounded-md border-[2.2px] border-white">
              <span className="absolute inset-[3.5px] block rounded-full border-[2.2px] border-white" />
            </span>
          </span>
          <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">Instagram</span>
        </Tap>
        <Tap id="inf-icon" className="flex flex-col items-center gap-1">
          <span className="flex size-10 items-center justify-center rounded-[11px] bg-white shadow-md">
            <Image src="/influet_logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
          </span>
          <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">Influnet</span>
        </Tap>
        <AppIcon label="Calendar" bg="linear-gradient(150deg,#a78bfa,#7c3aed)" />
        <AppIcon label="Settings" bg="linear-gradient(150deg,#94a3b8,#475569)" />
      </div>
    </div>
  );
}

export function IgProfile({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface-card">
      <StatusBar />
      <div className="flex h-[30px] items-center justify-between border-b border-hairline px-3">
        <span className="text-[11.5px] font-extrabold text-content">{ctx.handle}</span>
        <span className="text-[13px] text-content-soft">☰</span>
      </div>
      <div className="flex items-center gap-3.5 px-3 pb-2 pt-3">
        <span className="rounded-full p-0.5" style={{ background: "conic-gradient(from 210deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)" }}>
          <span className="block rounded-full border-2 border-surface-card">
            <Avatar size={46} uri={ctx.avatarUrl} />
          </span>
        </span>
        <span className="flex flex-1 justify-around text-center">
          <Stat n="248" label="posts" />
          <Stat n="48.2K" label="followers" />
          <Stat n="612" label="following" />
        </span>
      </div>
      <div className="px-3 pb-2 text-[9.5px] leading-relaxed text-content">
        <span className="block text-[10px] font-extrabold">{ctx.name}</span>
        Food &amp; travel creator
      </div>
      <Tap
        id="ig-edit-btn"
        className="mx-3 flex h-[27px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-muted text-[10px] font-bold text-content"
      >
        Edit profile
      </Tap>
      <div className="mt-2.5 grid grid-cols-3 gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="block aspect-square" style={{ background: "linear-gradient(150deg,var(--hairline-strong),var(--surface-muted))" }} />
        ))}
      </div>
    </div>
  );
}

export function IgEdit({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface-card">
      <StatusBar />
      <div className="flex h-[30px] items-center justify-between border-b border-hairline px-3">
        <span className="text-[13px] text-content-soft">✕</span>
        <span className="text-[11.5px] font-extrabold text-content">Edit profile</span>
        <Tap id="ig-done" className="text-[11px] font-extrabold" style={{ color: "#0095f6" }}>
          Done
        </Tap>
      </div>
      <div className="flex flex-col items-center gap-1 py-2.5">
        <Avatar size={36} uri={ctx.avatarUrl} />
        <span className="text-[9px] font-semibold" style={{ color: "#0095f6" }}>
          Edit picture
        </span>
      </div>
      <div className="border-b border-hairline px-3 py-2">
        <SectionKey>Name</SectionKey>
        <div className="pt-0.5 text-[10.5px] text-content">{ctx.name}</div>
      </div>
      <div className="border-b border-hairline px-3 py-2">
        <SectionKey>Username</SectionKey>
        <div className="pt-0.5 text-[10.5px] text-content">{ctx.handle}</div>
      </div>
      <div className="border-b border-hairline px-3 py-2">
        <SectionKey>Bio</SectionKey>
        <div className="break-all pt-0.5 text-[10.5px] leading-relaxed text-content">
          Food &amp; travel creator, Chennai
          <span className="block text-[9.5px] text-content-soft">Collabs → tap the link below</span>
        </div>
      </div>
      <Tap id="ig-links-row" className="border-b border-hairline px-3 py-2">
        <SectionKey>Links</SectionKey>
        <div className="min-h-[13px] break-all pt-0.5 font-mono text-[9.5px] leading-relaxed" style={{ color: "#0095f6" }}>
          <Fill id="ig-links-row" placeholder="Add link" />
        </div>
      </Tap>
    </div>
  );
}

export function InfVerify({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="px-3">
        <div className="flex h-7 items-center gap-1.5 text-[12px] font-bold text-content">
          <span className="size-[7px] rotate-45 border-b-2 border-l-2 border-content-soft" />
          Verify your Instagram
        </div>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-surface-card p-2">
          <Avatar size={22} uri={ctx.avatarUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-bold text-content">{ctx.name}</span>
            <span className="block truncate text-[8.5px] text-content-muted">@{ctx.handle}</span>
          </span>
        </div>

        <Tap id="link-card" className="mt-2 rounded-xl border border-hairline bg-surface-card p-2.5">
          <SectionKey>Your profile link</SectionKey>
          <div className="mt-1.5 break-all rounded-lg border border-dashed border-hairline-strong bg-surface-muted px-1.5 py-2 text-center font-mono text-[9.5px] font-semibold text-content">
            {ctx.displayUrl}
          </div>
          <Tap
            id="copy-btn"
            className="mt-2 flex h-[30px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-[10.5px] font-bold text-content"
          >
            Copy link
          </Tap>
        </Tap>

        <Tap
          id="verify-btn"
          className="mt-2.5 flex h-[30px] items-center justify-center rounded-lg bg-brand text-[10.5px] font-bold text-white"
        >
          I&apos;ve added the link
        </Tap>

        <div className="mt-2 flex items-center justify-center gap-1 text-[9px] font-semibold text-content-muted">
          <VerifiedTick size={11} /> Verification keeps your profile trusted
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <span>
      <b className="block text-[12px] font-extrabold text-content">{n}</b>
      <span className="text-[8.5px] text-content-soft">{label}</span>
    </span>
  );
}

function AppIcon({ label, bg }: { label: string; bg: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="size-10 rounded-[11px] shadow-md" style={{ background: bg }} />
      <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">{label}</span>
    </span>
  );
}
