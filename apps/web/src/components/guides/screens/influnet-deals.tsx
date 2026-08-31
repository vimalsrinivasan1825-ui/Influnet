"use client";

import { Avatar, Fill, PrimaryBtn, Row, SectionKey, StatusBar, Tap, TopBar, type GuideContext } from "./kit";

/** Collab request — compose (with a Fill) + an inbox card lower down. */
export function InfRequest({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Send a request" />
      <div className="p-2.5">
        <div className="flex items-center gap-2">
          <Avatar size={22} />
          <span className="text-[10px] font-bold text-content">To: Aarav Menon</span>
        </div>

        <Tap id="req-message" className="mt-2 rounded-lg border border-hairline bg-surface-card p-2">
          <SectionKey>What’s the collaboration?</SectionKey>
          <div className="min-h-[26px] pt-1 text-[9.5px] leading-relaxed text-content">
            <Fill id="req-message" placeholder="Describe deliverables, platforms and dates…" />
          </div>
        </Tap>

        <Tap id="req-budget" className="mt-2 rounded-lg border border-hairline bg-surface-card p-2">
          <SectionKey>Budget</SectionKey>
          <div className="min-h-[13px] pt-1 text-[10px] font-bold text-content">
            <Fill id="req-budget" placeholder="₹ —" />
          </div>
        </Tap>

        <PrimaryBtn id="req-send">Send request</PrimaryBtn>
      </div>

      <div className="mt-1 border-t border-hairline">
        <div className="px-3 py-1.5 text-[8px] font-bold uppercase tracking-wide text-content-muted">Incoming</div>
        <Tap id="req-card">
          <Row
            title="Nike India"
            subtitle="1 reel + 3 stories · ₹40,000 · March"
            leading={<Avatar size={24} />}
            trailing={
              <Tap id="req-accept" className="rounded-md bg-brand px-1.5 py-0.5 text-[8px] font-bold text-white">
                Review
              </Tap>
            }
          />
        </Tap>
      </div>
    </div>
  );
}

/** Project list / pipeline. */
export function InfProjects({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[12px] font-extrabold text-content">Projects</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[8px] font-bold text-content-muted">2 live</span>
      </div>

      <Tap id="proj-card" className="mx-3 mt-2 rounded-xl border border-hairline bg-surface-card p-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-[11px]">🎬</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10.5px] font-extrabold text-content">Nike India · March launch</span>
            <span className="block text-[8.5px] text-content-muted">Stage 4 of 12 · Draft review</span>
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className={`h-1 w-2 rounded-full ${i < 4 ? "bg-brand" : "bg-hairline-strong"}`} />
            ))}
          </div>
          <Tap id="proj-stage-pill" className="rounded-full bg-brand px-1.5 py-0.5 text-[7.5px] font-bold text-white">
            Your move
          </Tap>
        </div>
        <Tap id="proj-open" className="mt-2 flex h-[24px] items-center justify-center rounded-lg border border-hairline-strong text-[9.5px] font-bold text-content">
          Open project
        </Tap>
      </Tap>

      <Row title="Zoya Khan · Summer haul" subtitle="Stage 8 of 12 · Their move" leading={<span className="grid size-7 place-items-center rounded-lg bg-surface-muted text-[11px]">👜</span>} />
    </div>
  );
}

/** Stage detail — checklist + sign-off + upload. */
export function InfStage({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <TopBar title="Draft review" trailing={<span className="text-[8px] font-bold text-content-muted">4 / 12</span>} />
      <div className="p-2.5">
        <div className="text-[9px] leading-relaxed text-content-soft">
          The brand reviews the draft and either approves it or asks for changes.
        </div>

        <div className="mt-2 space-y-1">
          <Tap id="stage-checklist-item" className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2 py-1.5">
            <span className="grid size-3.5 place-items-center rounded-full border border-hairline-strong text-[8px]">✓</span>
            <span className="text-[9.5px] text-content">Creator uploads the draft</span>
          </Tap>
          <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2 py-1.5">
            <span className="size-3.5 rounded-full border border-hairline-strong" />
            <span className="text-[9.5px] text-content-muted">Brand leaves feedback</span>
          </div>
        </div>

        <Tap id="stage-upload" className="mt-2 flex h-[26px] items-center justify-center gap-1 rounded-lg border border-dashed border-hairline-strong text-[9.5px] font-bold text-content-soft">
          + Upload draft
        </Tap>

        <Tap id="stage-note" className="mt-2 rounded-lg border border-hairline bg-surface-card p-2">
          <SectionKey>Note to the other side</SectionKey>
          <div className="min-h-[13px] pt-1 text-[9.5px] text-content">
            <Fill id="stage-note" placeholder="Optional…" />
          </div>
        </Tap>

        <PrimaryBtn id="stage-signoff-btn">Sign off this stage</PrimaryBtn>
        <div className="mt-1 text-center text-[8px] text-content-muted">Both sides must sign off to advance</div>
      </div>
    </div>
  );
}

/** Pay securely sheet. */
export function InfPayment({ ctx }: { ctx: GuideContext }) {
  return (
    <div className="absolute inset-0 bg-surface">
      <StatusBar />
      <div className="flex items-center justify-center border-b border-hairline py-2 text-[11px] font-extrabold text-content">
        Pay securely
      </div>
      <div className="p-2.5">
        <div className="rounded-xl border border-hairline bg-surface-card p-2.5 text-center">
          <div className="text-[8px] font-bold uppercase tracking-wide text-content-muted">Advance payment</div>
          <Tap id="pay-amount" className="mt-1 text-[18px] font-extrabold text-content">
            ₹20,000
          </Tap>
          <div className="text-[8px] text-content-muted">50% of the agreed ₹40,000</div>
        </div>

        <div className="mt-2 space-y-1">
          <Tap id="pay-method" className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft px-2 py-1.5">
            <span className="size-2 rounded-full bg-brand" />
            <span className="text-[9.5px] font-bold text-content">UPI</span>
          </Tap>
          <div className="flex items-center gap-2 rounded-lg border border-hairline px-2 py-1.5">
            <span className="size-2 rounded-full border border-hairline-strong" />
            <span className="text-[9.5px] text-content-muted">Card · Net banking</span>
          </div>
        </div>

        <Tap id="pay-confirm" className="mt-2 flex h-[30px] items-center justify-center rounded-lg bg-brand text-[10.5px] font-bold text-white">
          Pay ₹20,000
        </Tap>
        <div className="mt-1 flex items-center justify-center gap-1 text-[8px] text-content-muted">
          🔒 Held safely · released on delivery
        </div>
      </div>
    </div>
  );
}
