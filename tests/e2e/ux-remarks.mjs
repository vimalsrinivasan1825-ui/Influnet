// Hand-written qualitative UX/design observations from actually looking at
// the screenshots this audit produced — separate from the automated
// pass/fail checks above. Not derived from assertions; this is a human
// (well, Claude) read of how the product actually looks and feels to use.
//
// tone: 'strength' | 'rough-edge' | 'suggestion'

export const UX_REMARKS = [
  {
    area: 'Landing page (apps/landing)',
    tone: 'strength',
    text: 'Clean, modern hero with a clear one-line value prop and a single obvious CTA. The animated node graphic next to the headline communicates "network of creators/brands" without needing a caption.',
  },
  {
    area: 'Creator signup wizard',
    tone: 'strength',
    text: 'The 5-step progress stepper (Connect → Account → Profile → Creator → Collab) keeps orientation clear throughout a long form. Live username availability and the 4-segment password-strength meter give immediate feedback instead of failing silently at submit. The Instagram auto-fill step reduces real signup friction significantly when it works.',
  },
  {
    area: 'Creator signup wizard',
    tone: 'rough-edge',
    text: 'When Instagram auto-fill fails (network hiccup, rate limit, or the account is momentarily unreachable), the fallback is a plain "Skip and fill manually" button with no explanation of *why* auto-fill failed — a user just sees it silently give up. A one-line reason ("couldn\'t reach Instagram right now") would reduce confusion.',
  },
  {
    area: 'Dashboard home (creator)',
    tone: 'strength',
    text: 'The "get verified in 3 steps" card is well-placed for an unverified creator — it\'s the single most important next action and it\'s not buried. Collaboration counters (Ongoing/Completed/Needs you/Awaiting them) as clickable shortcut cards is a nice pattern that turns a stat into a direct action.',
  },
  {
    area: 'Public profile (/c/username)',
    tone: 'strength',
    text: 'Real Instagram/YouTube numbers rendered as a clean stat row rather than a wall of text, and the price-tier cards (₹1K–₹5K style ranges) read like a menu, which sets expectations for a business before they even reach out. The circular niche-badge avatar treatment is a nice distinctive touch.',
  },
  {
    area: 'Business dashboard (new/empty account)',
    tone: 'rough-edge',
    text: 'A brand-new business account sees ₹0 everywhere at once (pipeline value, weekly trend chart, campaign stages, recent collaborations all empty simultaneously) with no onboarding nudge ("try Discover" is dead — see below — so there isn\'t even an obvious first action to suggest). It reads as a working but idle product rather than a guided next step.',
  },
  {
    area: 'Discover (creator + business)',
    tone: 'rough-edge',
    text: 'The feature is fully built (search, filters, niche chips) but hard-disabled behind an unconditional notFound() for V1. The 404 page itself is well-branded, but the *sidebar nav link to it is still present* — a user has no way to know it\'s intentionally disabled versus a broken page until they click through.',
  },
  {
    area: 'Project workspace — Guided view',
    tone: 'strength',
    text: 'This is the best-designed screen in the product. The 12-stage horizontal tracker, "STEP X of 12" heading, and the two-column "YOU (BRAND)" / "PARTNER (CREATOR)" checklist give both sides a shared, unambiguous mental model of whose move it is. The "waiting on the other side" state (grayed-out name + hourglass icon) is a small touch that removes a lot of anxiety in an async back-and-forth.',
  },
  {
    area: 'Project workspace — payment gate',
    tone: 'strength',
    text: '"Pay ₹X securely" with a visible "Secured by Razorpay · the gate opens automatically once payment is confirmed" caption sets expectations well — the user knows they don\'t need to do anything else after paying.',
  },
  {
    area: 'Project workspace — change requests & skip',
    tone: 'strength',
    text: 'Both "Propose a change to the terms" and "This stage isn\'t needed — propose skipping it" are deliberately low-emphasis ghost-text links, not buttons — a good signal that these are secondary/occasional actions, not the main flow, without hiding them.',
  },
  {
    area: 'Reviews',
    tone: 'suggestion',
    text: 'The star-rating buttons have no visible numeric label or hover tooltip (e.g. "5 — Excellent") — fine for a quick tap, but a screen-reader or keyboard-only user has only the filled-star count to go on.',
  },
  {
    area: 'Business account shell (every page)',
    tone: 'rough-edge',
    text: 'Every single page a business account loads fires a console error from a stale direct-to-PostgREST query that was cut off by a security migration (403, silently ignored). Invisible to a normal user, but it\'s constant noise for anyone who opens devtools, and worth cleaning up since dead code paths like this tend to accumulate.',
  },
  {
    area: 'Admin panel',
    tone: 'suggestion',
    text: 'Functionally solid but visually a tier below the main app — plain tables, no charts on the collabs/projects pages (the home page has KPI cards, but drilling in loses that polish). Fine for an internal tool, but a stark contrast if an admin is also a business/creator user elsewhere in the same session.',
  },
  {
    area: 'Payment gate (real Razorpay Checkout)',
    tone: 'strength',
    text: 'The actual Razorpay modal is well-integrated — price summary, saved-card option, "Secured by Razorpay" branding all present, and a clear "Test Mode" ribbon so nobody mistakes a sandbox run for a live charge. This is a real third-party checkout working cleanly inside the app chrome, not an awkward redirect.',
  },
  {
    area: 'Guided view — completed project',
    tone: 'strength',
    text: 'The finished 12-stage tracker (all stages ticked green, "Stage 12/12") is a satisfying, legible summary of a long collaboration — genuinely nice payoff for what is otherwise a long, many-step process. The in-context "Leave a Review" modal appearing right at the completed stage (not a separate page) keeps the finishing action low-friction.',
  },
  {
    area: 'Public profile after a completed project',
    tone: 'strength',
    text: 'This is the best "proof" surface in the product: a real per-project portfolio card ("Verified on Influnet"), a genuine star rating computed from actual reviews (not a placeholder), and the project folded automatically into "Past collaborations" — a brand landing on this profile sees real, checkable social proof rather than self-reported claims.',
  },
  {
    area: 'Unauthorized project access',
    tone: 'rough-edge',
    text: 'Opening a project you have no relationship to: the core record, activity, and change-requests are correctly denied, but the page itself has no error-state handling for that case — it just spins on "Loading…" forever instead of a clear "not found" message. Separately (see security findings), the reviews and cards endpoints for that project don\'t check membership at all, though no real content happened to leak in this specific test.',
  },
  {
    area: 'Messaging (Stream Chat)',
    tone: 'strength',
    text: 'The chat composer round-trips a real message end-to-end — sent by one side, still there after a hard page reload, and visible to the other side without any manual refresh. Straightforward, no surprises, works like a normal chat app should.',
  },
];

export function renderUxRemarksSection(esc) {
  if (!UX_REMARKS.length) return '';
  const toneLabel = { strength: 'Strength', 'rough-edge': 'Rough edge', suggestion: 'Suggestion' };
  const toneClass = { strength: 'ux-strength', 'rough-edge': 'ux-rough', suggestion: 'ux-suggestion' };
  const rows = UX_REMARKS.map((r) => `
    <div class="ux-card ${toneClass[r.tone]}">
      <span class="ux-tone">${toneLabel[r.tone]}</span>
      <strong>${esc(r.area)}</strong>
      <p>${esc(r.text)}</p>
    </div>`).join('\n');
  return `
    <section class="phase ux-remarks">
      <h2>UX &amp; Design Remarks <span class="phase-stats">qualitative — not from automated assertions</span></h2>
      <p class="lede" style="margin-bottom:16px">What the product actually looks and feels like to use, based on reviewing the screenshots above — separate from the pass/fail checks. Not exhaustive; a starting point for design review.</p>
      <div class="ux-grid">${rows}</div>
    </section>`;
}
