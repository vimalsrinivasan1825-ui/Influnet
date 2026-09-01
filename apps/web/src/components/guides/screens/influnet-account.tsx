"use client";

import { Avatar, Fill, PrimaryBtn, Row, SectionKey, StatusBar, Tap, TopBar, VerifiedTick, type GuideContext } from "./kit";

/** Edit public profile + connect socials. */
export function InfProfileEditor({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Edit profile" trailing={<Tap id="pe-save" className="text-[10px] font-extrabold text-brand-strong">Save</Tap>} />
      <div className="flex flex-col items-center gap-1 py-2">
        <Tap id="pe-avatar">
          <Avatar size={40} uri={ctx.avatarUrl} />
        </Tap>
        <span className="text-[8.5px] font-semibold text-brand-strong">Change photo</span>
      </div>

      <Tap id="pe-bio" className="border-b border-hairline px-3 py-2">
        <SectionKey>Bio</SectionKey>
        <div className="min-h-[13px] pt-0.5 text-[10px] leading-relaxed text-content">
          <Fill id="pe-bio" placeholder="Tell brands what you make…" />
        </div>
      </Tap>

      <div className="px-3 py-2">
        <SectionKey>Platforms</SectionKey>
        <div className="mt-1 space-y-1">
          <Tap id="pe-connect-ig" className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-2 py-1.5">
            <span className="grid size-5 place-items-center rounded-md" style={{ background: "conic-gradient(from 210deg,#f9ce34,#ee2a7b,#6228d7)" }} />
            <span className="text-[9.5px] font-bold text-content">Instagram</span>
            <span className="ml-auto flex items-center gap-0.5 text-[8px] font-bold text-brand-strong">
              <VerifiedTick size={9} /> Connected
            </span>
          </Tap>
          <Tap id="pe-connect-yt" className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-2 py-1.5">
            <span className="grid size-5 place-items-center rounded-md bg-[#ff0000] text-[8px] text-white">▶</span>
            <span className="text-[9.5px] font-bold text-content">YouTube</span>
            <span className="ml-auto min-h-[10px] text-[8px] font-bold text-brand-strong">
              <Fill id="pe-connect-yt" placeholder="Connect" />
            </span>
          </Tap>
        </div>
      </div>

      <Tap id="pe-add-portfolio" className="mx-3 flex h-[26px] items-center justify-center rounded-lg border border-dashed border-hairline-strong text-[9.5px] font-bold text-content-soft">
        + Add past work
      </Tap>
    </div>
  );
}

/** The public profile page — report/block menu lives here. */
export function InfPublicProfile({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="flex h-8 items-center justify-between border-b border-hairline px-3">
        <span className="size-[7px] rotate-45 border-b-2 border-l-2 border-content-soft" />
        <Tap id="pp-overflow" className="text-[14px] leading-none text-content-soft">⋯</Tap>
      </div>

      <div className="flex flex-col items-center gap-1 px-3 pt-3">
        <Avatar size={44} uri={ctx.avatarUrl} />
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-extrabold text-content">{ctx.name}</span>
          <Tap id="pp-verified-badge">
            <VerifiedTick size={12} />
          </Tap>
        </div>
        <span className="text-[8.5px] text-content-muted">@{ctx.handle} · {ctx.displayUrl}</span>
      </div>

      <div className="mx-3 mt-2 grid grid-cols-3 gap-1 text-center">
        <Stat n="48.2K" label="followers" />
        <Stat n="4.1%" label="engagement" />
        <Stat n="21K" label="avg views" />
      </div>

      <div className="mx-3 mt-2 flex gap-1.5">
        <Tap id="pp-message-btn" className="flex h-[26px] flex-1 items-center justify-center rounded-lg bg-brand text-[10px] font-bold text-white">
          Message
        </Tap>
        <span className="grid size-[26px] place-items-center rounded-lg border border-hairline-strong text-content-soft">♡</span>
      </div>

      {/* overflow menu (measured even though visually stacked) */}
      <div className="mx-3 mt-2 overflow-hidden rounded-lg border border-hairline bg-surface-card">
        <Tap id="pp-report" className="border-b border-hairline px-2.5 py-1.5 text-[9.5px] font-semibold text-content">
          Report this profile
        </Tap>
        <Tap id="pp-block" className="px-2.5 py-1.5 text-[9.5px] font-semibold text-danger">
          Block {ctx.name.split(" ")[0]}
        </Tap>
      </div>
    </div>
  );
}

/** Account switcher. */
export function InfAccountMenu({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Account" />
      <Tap id="am-current" className="flex items-center gap-2.5 border-b border-hairline px-3 py-2.5">
        <Avatar size={30} uri={ctx.avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-extrabold text-content">{ctx.name}</span>
          <span className="block text-[8.5px] text-content-muted">@{ctx.handle} · creator</span>
        </span>
        <span className="text-[10px] text-brand-strong">✓</span>
      </Tap>

      <div className="p-1.5">
        <Tap id="am-other-account" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <Avatar size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-bold text-content">Bright Foods</span>
            <span className="block text-[8px] text-content-muted">hello@brightfoods.in · brand</span>
          </span>
        </Tap>
        <Tap id="am-add-account" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[10px] font-bold text-content-soft">
          <span className="grid size-6 place-items-center rounded-full bg-surface-muted text-[12px]">+</span>
          <span className="min-h-[10px]">
            <Fill id="am-add-account" placeholder="Add another account" />
          </span>
        </Tap>
      </div>

      <div className="border-t border-hairline p-1.5">
        <Tap id="am-settings" className="rounded-lg px-2.5 py-2 text-[10px] font-semibold text-content-soft">
          Settings
        </Tap>
      </div>
    </div>
  );
}

/** Upgrade to Pro. */
export function InfBilling({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Plan & billing" />
      <div className="p-2.5">
        <Tap id="bill-pro-card" className="rounded-xl border border-brand bg-brand-soft p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-content">Influnet Pro</span>
            <span className="text-[11px] font-extrabold text-brand-strong">₹499/mo</span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <Tap id="bill-feature" className="text-[9px] text-content">✓ Unlimited projects & requests</Tap>
            <div className="text-[9px] text-content">✓ Priority in brand search</div>
            <div className="text-[9px] text-content">✓ Full audience analytics</div>
          </div>
        </Tap>

        <Tap id="bill-upgrade-btn" className="mt-2 flex h-[30px] items-center justify-center rounded-lg bg-brand text-[10.5px] font-bold text-white">
          Upgrade to Pro
        </Tap>
        <div className="mt-1 text-center text-[8px] text-content-muted">Cancel anytime · billed monthly</div>

        <div className="mt-2 rounded-lg border border-hairline bg-surface-card p-2 text-[8.5px] text-content-muted">
          Free plan: 5 projects lifetime · you’ve used 3
        </div>
      </div>
    </div>
  );
}

/** Notifications / activity feed. */
export function InfActivity({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Activity" />
      <div className="flex gap-1.5 px-3 py-2">
        <Tap id="act-filter" className="rounded-full border border-hairline-strong bg-surface-card px-2 py-0.5 text-[8px] font-bold text-content">
          All
        </Tap>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[8px] text-content-muted">Projects</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[8px] text-content-muted">Payments</span>
      </div>
      <Tap id="act-item">
        <Row
          title="Nike India signed off “Concept”"
          subtitle="Your move: upload the draft · 2h ago"
          leading={<span className="grid size-6 place-items-center rounded-full bg-brand-soft text-[10px]">✓</span>}
        />
      </Tap>
      <Row title="Payment received · ₹20,000" subtitle="Advance for March launch · 1d ago" leading={<span className="grid size-6 place-items-center rounded-full bg-ok-soft text-[10px]">₹</span>} />
      <Row title="Zoya Khan sent a request" subtitle="Summer haul · 2d ago" leading={<Avatar size={22} />} />
    </div>
  );
}

/** Help & feedback. */
export function InfSupport({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Help & support" trailing={<Tap id="sup-feedback-btn" className="text-[9px] font-bold text-brand-strong">Feedback</Tap>} />
      <div className="p-2.5">
        <Tap id="sup-new-ticket" className="flex h-[26px] items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-[9.5px] font-bold text-content">
          + New conversation
        </Tap>

        <Tap id="sup-message" className="mt-2 rounded-lg border border-hairline bg-surface-card p-2">
          <SectionKey>What’s going on?</SectionKey>
          <div className="min-h-[26px] pt-1 text-[9.5px] leading-relaxed text-content">
            <Fill id="sup-message" placeholder="Describe the problem…" />
          </div>
        </Tap>

        <PrimaryBtn id="sup-send">Send to support</PrimaryBtn>
        <div className="mt-1 text-center text-[8px] text-content-muted">Replies come here and to your email</div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-card py-1">
      <div className="text-[10px] font-extrabold text-content">{n}</div>
      <div className="text-[7px] uppercase tracking-wide text-content-muted">{label}</div>
    </div>
  );
}
