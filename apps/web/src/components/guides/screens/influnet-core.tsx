"use client";

import { Avatar, Fill, Row, StatusBar, Tap, TopBar, VerifiedTick, type GuideContext } from "./kit";

/** Dashboard home — the action console. */
export function InfHome({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[12px] font-extrabold text-content">Home</span>
        <div className="flex items-center gap-1.5">
          <Tap id="home-search" className="grid size-6 place-items-center rounded-lg bg-surface-muted text-content-soft">
            <SearchGlyph />
          </Tap>
          <Tap id="act-bell" className="relative grid size-6 place-items-center rounded-lg bg-surface-muted text-content-soft">
            <BellGlyph />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand-2" />
          </Tap>
        </div>
      </div>

      <Tap id="home-turn-card" className="mx-3 rounded-xl border border-hairline bg-surface-card p-2.5">
        <div className="text-[8px] font-bold uppercase tracking-wide text-brand-strong">Your move</div>
        <div className="mt-1 flex items-center gap-2">
          <Avatar size={20} />
          <span className="text-[10px] font-bold text-content">Nike India · sign off “Draft review”</span>
        </div>
      </Tap>

      <div className="mx-3 mt-2 grid grid-cols-3 gap-1.5">
        <Metric label="Reach" value="132K" />
        <Metric label="Views" value="21.4K" />
        <Metric label="Earned" value="₹1.2L" />
      </div>

      <Tap id="home-discover-card" className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-hairline bg-surface-card p-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand-strong">
          <SearchGlyph />
        </span>
        <span className="text-[10px] font-bold text-content">Discover creators & brands</span>
      </Tap>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-hairline bg-surface-card py-1.5 text-[7px] font-semibold text-content-muted">
        <span className="text-brand-strong">Home</span>
        <Tap id="home-nav-messages">Messages</Tap>
        <Tap id="home-nav-projects">Projects</Tap>
        <span>Profile</span>
      </div>
    </div>
  );
}

/** Search + discover. */
export function InfDiscover({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Discover" />
      <div className="p-2.5">
        <Tap id="discover-search" className="flex h-[26px] items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-muted px-2 text-[9.5px] text-content-muted">
          <SearchGlyph />
          <Fill id="discover-search" placeholder="Search people…" />
        </Tap>
        <div className="mt-2 flex gap-1.5">
          <Tap id="discover-filter" className="rounded-full border border-hairline-strong bg-surface-card px-2 py-1 text-[8.5px] font-bold text-content">
            Filters
          </Tap>
          <span className="rounded-full bg-surface-muted px-2 py-1 text-[8.5px] text-content-muted">Instagram</span>
          <span className="rounded-full bg-surface-muted px-2 py-1 text-[8.5px] text-content-muted">Chennai</span>
        </div>
      </div>
      <div className="border-t border-hairline">
        <Tap id="discover-card">
          <Row
            title="Aarav Menon"
            subtitle="Food · 88K followers · 4.1% eng."
            leading={<Avatar size={24} />}
            trailing={<VerifiedTick />}
          />
        </Tap>
        <Row title="Zoya Khan" subtitle="Travel · 210K followers" leading={<Avatar size={24} />} />
        <Row title="Kabir Rao" subtitle="Lifestyle · 45K followers" leading={<Avatar size={24} />} />
      </div>
      <div className="px-3 pt-2">
        <Tap id="discover-message-btn" className="flex h-[26px] items-center justify-center rounded-lg bg-brand text-[10px] font-bold text-white">
          Message
        </Tap>
      </div>
    </div>
  );
}

/** Conversation list. */
export function InfMessages({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[12px] font-extrabold text-content">Messages</span>
        <Tap id="msg-new" className="text-[11px] font-bold text-brand-strong">
          New
        </Tap>
      </div>
      <Tap id="msg-search" className="mx-3 my-2 flex h-[24px] items-center gap-1.5 rounded-lg bg-surface-muted px-2 text-[9px] text-content-muted">
        <SearchGlyph /> Search conversations
      </Tap>
      <Tap id="msg-conversation">
        <Row
          title="Nike India"
          subtitle="Sounds great — let’s lock the dates"
          leading={<Avatar size={26} />}
          trailing={<span className="size-2 rounded-full bg-brand" />}
        />
      </Tap>
      <Row title="Aarav Menon" subtitle="Thanks! Sending the brief now" leading={<Avatar size={26} />} />
      <Row title="Zoya Khan" subtitle="You: is next week okay?" leading={<Avatar size={26} />} />
    </div>
  );
}

/** One conversation — composer + deal bar. */
export function InfChat({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-surface">
      <StatusBar />
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
        <span className="size-[7px] rotate-45 border-b-2 border-l-2 border-content-soft" />
        <Avatar size={20} />
        <span className="text-[10.5px] font-extrabold text-content">Nike India</span>
      </div>

      <Tap id="chat-deal-bar" className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-2 py-1.5">
        <span className="size-1.5 rounded-full bg-brand" />
        <span className="text-[8.5px] font-bold text-content">Deal: discussing terms</span>
        <Tap id="chat-propose-btn" className="ml-auto rounded-md bg-brand px-1.5 py-0.5 text-[8px] font-bold text-white">
          Propose project
        </Tap>
      </Tap>

      <div className="flex-1 space-y-1.5 px-3 py-2">
        <Bubble side="in">Loved your last reel — open to a collab?</Bubble>
        <Bubble side="out">Yes! What are you thinking?</Bubble>
      </div>

      <div className="flex items-center gap-1.5 border-t border-hairline px-2 py-1.5">
        <Tap id="chat-attach" className="grid size-6 place-items-center rounded-lg bg-surface-muted text-content-soft">
          +
        </Tap>
        <Tap id="chat-input" className="flex h-[24px] flex-1 items-center rounded-full border border-hairline-strong bg-surface-muted px-2.5 text-[9.5px] text-content-muted">
          <Fill id="chat-input" placeholder="Message…" />
        </Tap>
        <Tap id="chat-send" className="grid size-[24px] place-items-center rounded-full bg-brand text-white">
          <SendGlyph />
        </Tap>
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  return (
    <div className={side === "out" ? "flex justify-end" : "flex justify-start"}>
      <span
        className={`max-w-[80%] rounded-2xl px-2 py-1 text-[9px] leading-snug ${
          side === "out" ? "bg-brand text-white" : "bg-surface-muted text-content"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-card px-1.5 py-1.5">
      <div className="text-[7px] font-bold uppercase tracking-wide text-content-muted">{label}</div>
      <div className="text-[11px] font-extrabold text-content">{value}</div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function SendGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3">
      <path d="M4 12 20 4l-4 16-4-7-8-1Z" fill="currentColor" />
    </svg>
  );
}
