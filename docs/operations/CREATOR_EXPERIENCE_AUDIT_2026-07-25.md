# Creator Experience Audit — 2026-07-25

**Question asked:** walk the product as a creator, from arriving to getting paid, and find
every place it becomes confusing, misleading, or harder than it needs to be.

**Method:** traced each screen a creator touches in source — signup → login → first
dashboard → public link → profile → incoming pitch → chat → project stages → payment →
completion — and read what the creator actually sees at each step, including every modal,
toast, empty state and disabled control.

**Scope note:** this is a UX/product report. Security findings are separate, in
`~/security-audit-skill/Influnet/run-1/REPORT.md`. Where a UX problem has a security twin,
it is cross-referenced.

---

## The headline

The creator flow is well-built structurally — the stage pipeline, the guided per-stage
instructions, the bilateral sign-off model and the activity timeline are genuinely good
product thinking, and the visual system is consistent. The problems are not architectural.
They cluster in three places:

1. **The first ninety seconds are wrong.** The first thing a new creator sees on their own
   dashboard is two fabricated brand deals (L'Oréal, Nike) and a fake 1.2M reach figure.
   This is the single most damaging thing in the product.
2. **The creator's public link — the product's core value — is described three different
   ways** and can be generated wrong at the exact moment the creator is told to publish it.
3. **Irreversible decisions have no confirmation.** Declining a paying brand's pitch is one
   tap, unconfirmed, and unrecoverable from the creator's side.

Fix C1, C2 and C5 and the product feels trustworthy. Everything else on this list is
refinement.

---

## P0 — Fix before any creator sees this

### C1. The creator dashboard shows fabricated brand deals to every user
**File:** `apps/web/src/components/dashboard/views/influencer-home.tsx:141-171`

The "Active Roster" card is hardcoded. Every creator who logs in — including one who signed
up sixty seconds ago with zero collaborations — sees:

- **L'Oréal Paris** — "Skincare Campaign" — badge *Active*
- **Nike** — "Summer Athletics" — badge *Review*
- **Total Reach — 1.2M+**

None of it comes from data. There is no `data.` reference anywhere in that block.

Why this is P0 and not a cosmetic placeholder:

- A creator's dashboard is the surface where they check *their own* commercial reality. Showing
  them deals they do not have is not a placeholder, it is a false statement about their account.
  The moment they notice, every other number on the page becomes untrustworthy — including the
  ones that are real.
- "Total Reach 1.2M+" sits directly under it, unlabelled as an example, next to genuine KPI
  cards. A creator will read it as their reach.
- Using the L'Oréal and Nike marks to imply a commercial relationship that does not exist is a
  trademark exposure, not just a UX bug.

**Fix.** Delete the card and replace it with the real thing: derive an active-roster list from
`campaign_projects` where the creator is `counterparty_user_id` and status is `active`, joined to
the brand's profile name. When empty, use the `EmptyState` component already imported in the same
file — the pattern is right there at line 186. Compute Total Reach from the creator's own
`social_snapshots`, or drop the tile until it can be real.

### C2. The creator is told their public link three different ways, and it can be wrong
**Files:** `app/signup/influencer/page.tsx:421`, `app/dashboard/settings/page.tsx:412,446`,
`components/dashboard/views/welcome-modal.tsx:30`, `lib/public-profile/media-kit.ts:281`

The public profile link is the product's core promise to a creator — "paste this in your bio
and brands come to you." Right now they are shown:

| Where | What they see |
|---|---|
| Signup step 2 | `influnet.com/c/username` |
| Welcome modal (post-signup) | `window.location.origin` + `/c/username` |
| Settings → creator | `influnet.app/c/yourusername` |
| Settings → business | `influnet.app/b/yourusername` |
| Media kit / profile defaults | `https://influnet.app` |

Three different domains for one link, one of which is necessarily wrong. A creator who
copies the signup-page version into their Instagram bio may be publishing a dead link to
their whole audience.

**Worse — the link in the welcome modal can be derived from the wrong value.**
`app/api/influencer/dashboard/route.ts:107` falls back like this when the creator has no
username row yet:

```js
username: inflData?.username || (profileData?.name || 'creator').toLowerCase().replace(/[^a-z0-9]/g, '')
```

So a creator named "Priya Sharma" with no `influencer_profiles.username` is shown
`/c/priyasharma` in the celebratory modal and told to paste it into their bio. That slug
resolves through `get_public_influencer(p_slug)`, matches nothing, and 404s.

**Fix.** One source of truth: resolve the origin from `NEXT_PUBLIC_APP_URL` (already
validated in `lib/env.ts`) via a single `publicProfileUrl(username)` helper in
`packages/core`, and use it in all five places. Remove every hardcoded domain string. Then
remove the name-derived username fallback — if there is no username, the modal must not
offer a link at all; show "Pick your username to get your link" pointing at settings.

---

## P1 — Fix in the first pass

### C3. The creator's own avatar never appears on their dashboard
**File:** `apps/web/src/app/api/influencer/dashboard/route.ts:111`

```js
avatar_url: null,
```

Hardcoded null, never looked up. The dashboard header (`influencer-home.tsx:39`) passes it to
`<Avatar src={p.avatar_url}>`, which always falls back to initials. A creator who uploaded a
profile photo sees it on their public profile but never on their own dashboard, which reads as
"my upload didn't work."

The data is already there and already used elsewhere: `influencer_profiles.avatar_url` exists
(migration 012), `/api/profile:91` returns it, and `/api/home:51` renders an avatar from the
social snapshot. Only this one route zeroes it out — which is also why the creator's two
overview screens (C8) disagree about whether they have a photo.

**Fix.** The route already selects `influencer_profiles.select('*')` at line 25, so `inflData`
carries it. Return `avatar_url: inflData?.avatar_url ?? null` instead of the hardcoded null.

### C4. Declining a brand's pitch is one unconfirmed tap and the creator cannot undo it
**File:** `apps/web/src/app/dashboard/requests/page.tsx:363-377`

`Accept` and `Decline` are adjacent, same size, no confirmation, no undo. `handleAction` fires
the PATCH immediately. Server-side the decision is terminal — `api/collabs/route.ts:199` returns
409 for any further change once the status leaves `pending`.

The in-code comment says *"Declining is not permanent. The sender can reach out again"* — but
that is recovery available to the **brand**, not the creator. From the creator's side there is
no path back: they cannot un-decline, and they cannot initiate contact with a business
themselves (Discover is business-only, `api/discover/route.ts:40`). A mis-tap on a ₹50,000
pitch is unrecoverable by the person who made the mistake.

There is exactly one `window.confirm` in the entire dashboard — account deletion
(`settings/page.tsx:317`). Declining a paid opportunity deserves the same weight.

**Fix.** Add a confirmation step to Decline showing the brand name and budget, with an optional
reason that becomes the notification body. Separate the two buttons visually. Consider a
30-second undo toast (`sonner` is already the toast library) before the PATCH commits.

### C5. "Pipeline value" and the earnings chart count money that was never agreed
**Files:** `apps/web/src/app/api/influencer/dashboard/route.ts:38-72`,
`components/dashboard/views/influencer-home.tsx:75-81,108-117`

Both are computed from `collab_requests.budget WHERE status = 'accepted'`:

```js
const pipeline_value = acceptedCollabs.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
```

But since migration 069 the deal flow deliberately separates *"we agreed to talk"* from
*"we agreed to work"* — accepting a request only opens the conversation. So a creator's
"Pipeline value" sums the brand's opening ask from every conversation they ever agreed to have,
including ones that went nowhere. The API field is literally named `earnings_trend`, and the
chart is bucketed by `collab_requests.created_at` — the week the pitch *arrived*, not when any
money moved.

A creator will read ₹4,20,000 pipeline / a rising earnings line as money coming. It may
represent nothing but politely answered DMs. This is the metric most likely to make a creator
feel lied to once they reconcile it against their bank account.

**Fix.** Derive pipeline from `campaign_projects` — `budget` where `status = 'active'` — which
is scope both sides actually accepted. Derive earnings from `project_payments` where
`status = 'paid'`, bucketed by `paid_at`. Rename the tiles accordingly: "Agreed & in progress"
and "Payments received". If a pre-agreement number is wanted, label it "Open conversations"
and do not attach a rupee figure to it.

### C6. Projects awaiting the creator's acceptance are invisible on the dashboard
**File:** `apps/web/src/app/api/influencer/dashboard/route.ts:51-52`

```js
const active_projects = projects?.filter(p => p.status === 'active').length || 0;
const completed_projects = projects?.filter(p => p.status === 'completed').length || 0;
```

`pending_acceptance` is counted nowhere. Under the 069/071 flow a brand proposes terms and the
project sits in `pending_acceptance` **waiting on the creator**. The creator's dashboard shows
no count, no card, no banner. The one thing genuinely blocked on them is the one thing the
dashboard does not mention. They find out only by opening the conversation.

**Fix.** Add a "Terms awaiting your review" KPI wired to `pending_acceptance` where the creator
is the counterparty and `created_by_user_id` is not them, linking straight to the proposal. This
is the highest-value tile on the page and it is missing.

### C7. A creator landing on `/dashboard` briefly becomes a business — or stays one
**File:** `apps/web/src/app/dashboard/page.tsx:24-67`

`/dashboard` **is** the business dashboard. Role routing happens client-side inside a
`useEffect`: fetch session → fetch profile → `router.replace('/dashboard/influencer')`. Two
consequences:

- A creator arriving at `/dashboard` (bookmark, notification link, typed URL) mounts the
  business dashboard, waits on two sequential round-trips, then redirects. They see a skeleton
  of the wrong product.
- If `getSession()` returns null on a cold load — which it can, before the client rehydrates —
  the role gate is **skipped entirely** (`if (session)`), and the creator falls through to
  `apiFetch('/api/business/dashboard')`. That returns empty business data, and the page renders
  `FALLBACK`: *"Welcome back, there"*, *"Your brand"*, *pipeline value ₹0*, *weekly spend*. A
  creator sitting on a brand dashboard with no way to tell what happened.

There is no `middleware.ts`, so each page re-implements this gate independently.

**Fix.** Move role routing into `middleware.ts` so it resolves before render, and make
`/dashboard` a role-dispatching route rather than the business dashboard itself. Failing that,
make the fallback path in `page.tsx` redirect on *unknown* role instead of assuming business.

---

## P2 — Friction worth removing

### C8. Nav offers a creator two different overview screens with no explicable difference
**File:** `apps/web/src/components/dashboard/sidebar.tsx:37-38`

`Home → /dashboard/home` and `Dashboard → /dashboard/influencer` sit adjacent as the first two
nav items. Both are overview screens. "Home" versus "Dashboard" is not a distinction a creator
can predict, so they will click both, repeatedly, to find where a given number lives. (The IA
split is intentional per the 2026-07-20 decision — the problem is the *labels*, not the split.)

**Fix.** Name them by what they contain: "Today" / "What needs you" for the action feed, and
"Insights" or "My numbers" for the analytics view. Or merge them.

### C9. Losing a username race dead-ends the creator on the last step
**File:** `apps/web/src/app/signup/influencer/page.tsx:176-183`

Username availability is checked live at step 2 (`useUsernameAvailability`) and re-checked at
final submit. If it was taken in between, the creator — standing on the last step with every
field filled — is told:

> "That username was just taken. Please pick another and **go back to step 2**."

They must navigate back manually, with no link and no field focus. Asking a user to walk
backwards through a wizard they have just completed is where signups get abandoned.

**Fix.** On that specific failure, jump the wizard to step 2 automatically, focus the username
field, keep everything else intact, and suggest two available alternatives.

### C10. The pipeline diagram does not update when the stage advances
**File:** `apps/web/src/components/dashboard/project-flow.tsx:99-100`

```js
const [nodes, , onNodesChange] = useNodesState(initialNodes);
const [edges, , onEdgesChange] = useEdgesState(initialEdges);
```

`useNodesState` seeds from `initialNodes` **once**. Later changes to the memo — which is exactly
what happens when `project.current_stage` advances — do not flow into state, because the setter
is discarded (`, ,`). So a creator signs off a stage, the project genuinely advances, and the
diagram they are looking at does not change until a full remount.

That is the worst possible failure mode for the guided flow: the creator's action appears not
to have worked, so they click again.

**Fix.** Sync on change — keep the setters and drive them from an effect:
```js
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
```
(same for edges).

### C11. The guided flow hides what happens next
**File:** `apps/web/src/components/dashboard/project-flow.tsx:70-73`

`reached` filters stages to `i <= currentIdx`, so the diagram renders only stages already
reached. The whole point of a guided pipeline is that a creator can see what is coming and
prepare for it. `STAGE_GUIDE` in `packages/core` already contains per-stage instructions for
both sides, including future stages — the data is there and unused.

**Fix.** Render all 12 stages, styling unreached ones as upcoming. Let the creator click a
future stage to read its `STAGE_GUIDE.creator` entries.

### C12. Three first-run surfaces compete on the same screen
**Files:** `influencer-home.tsx:34-35`, `welcome-modal.tsx`, `media-kit-nudge.tsx`

On first login a creator gets, simultaneously: the blocking `WelcomeModal` with three seconds
of confetti, the `MediaKitNudge` banner underneath it, and the dashboard behind both. The nudge
is invisible until the modal is dismissed, so its "complete your media kit" prompt — the most
useful next action — lands unseen.

The modal is also thin on affordances: no close X, no Escape handler, no backdrop-click
dismiss, no `role="dialog"`/`aria-modal`, no focus trap. The only exit is one button, and on a
short mobile viewport with `p-8` padding it can sit below the fold.

**Fix.** Sequence them: modal first, nudge only after it is dismissed. Add Escape,
backdrop-click and a visible close control, plus `role="dialog"` and `aria-modal="true"`.

### C13. The media-kit nudge forgets its dismissal on every new device
**File:** `apps/web/src/components/dashboard/media-kit-nudge.tsx:26,45,59`

Dismissal is `localStorage` only — the exact problem migration 074 fixed for the welcome modal
by moving the flag onto the profile. A creator who dismisses it on their laptop sees it again on
their phone, forever.

**Fix.** Persist it like `welcome_seen_at` — add `mediakit_nudge_dismissed_at` to `profiles`,
grant UPDATE on that one column (following 074's pattern), and set it from the dismiss handler.

### C14. Verification instructions ask for a bio edit without saying it can be undone first
**File:** `apps/web/src/app/api/verification/ownership/route.ts:93-95`

> "Add this link (or just the code vf_…) to your Instagram bio, keep your account public, then
> tap Verify. You can remove it once verified."

For a creator, their bio is prime real estate and often their only link slot. The instruction
buries the reassurance at the end and never states the two things they will worry about: how
long the code stays valid (30 minutes, `TTL_SECONDS`) and that nothing is posted publicly on
their behalf. There is also no in-product reminder to remove it afterwards.

**Fix.** Lead with the reassurance and the clock: "This takes about a minute. Add the code to
your bio, tap Verify, then remove it — the code expires in 30 minutes and nothing is posted to
your account." Add a post-verification prompt to remove it.

### C15. Creators cannot initiate contact at all
**File:** `apps/web/src/app/api/discover/route.ts:40-42`

```js
if (role !== 'business_owner' && role !== 'admin') {
  return jsonError(403, 'Forbidden: Discover is only available for businesses');
}
```

The route's own doc comment says *"Discover creators (for businesses) or brands (for
influencers)"* — the two-way intent is written down and not implemented. Combined with C4
(declining is terminal, `Send again` is brand-only), a creator's pipeline is entirely
brand-initiated: they can wait, accept or decline, and nothing else.

The sidebar correctly hides Discover from creators, so this is not a broken link — it is a
missing half of the marketplace, and it is what makes C4's irreversibility bite.

**Fix.** Product decision, not a bug. If creator-initiated outreach is out of scope for V1,
make the waiting productive: tell the creator concretely what raises inbound (verified badge,
complete media kit, rates set) with live progress, rather than leaving an empty Requests page.

---

## Cross-references to the security report

Four security findings are also creator-trust problems, and the fixes overlap:

- **F1 / F2** (forgeable sign-off, ticking the other side's approval gate) — a brand can drive
  a project past approvals the creator never gave, and the timeline will show the creator
  approved it. The bilateral sign-off model is a promise to creators; these break it.
- **F4** (silent rewrite of agreed deliverables) — direct scope-creep vector against creators,
  invisible in the timeline.
- **F5** (₹1 opens the advance gate) — a creator starts work believing the deposit landed.
- **F8** (blocking does nothing) — a creator relying on the block button is unprotected.

---

## What is already good

Worth keeping, because these are the parts to build on:

- **`STAGE_GUIDE` in `packages/core`** — per-stage, per-role, plain-language instructions for
  both sides. Genuinely excellent, and under-used (see C11).
- **The activity timeline and change-request loop** (migrations 062/063) — propose → notify →
  accept, with a `before` snapshot. Exactly the right model for a creator's protection; the
  problem is only that `update_project` routes around it (F4).
- **Payment-gate integrity** — refusing to hand-tick a payment gate while Razorpay is live
  (`stage-items/route.ts:97-119`) is the right instinct, well commented.
- **Migration 074** — moving the welcome flag from `localStorage` to the account, with the
  reasoning written down. C13 is the same fix applied to the one place that still needs it.
- **Rate limiting placed *after* cheap rejections** in `profile/refresh` so a creator with no
  handle does not burn their 5-hour window. That is real care about the creator's experience.
- **The design system** — tokens, `EmptyState`, `StatCard`, `SectionCard`, `Reveal`/`Stagger`
  are consistent and used consistently. None of the fixes above need new primitives.

---

## Suggested order of work

| # | Item | Why first |
|---|---|---|
| 1 | C1 fake L'Oréal/Nike roster | Destroys trust on first login; trademark exposure |
| 2 | C2 public-link domain + bad username fallback | Core value prop; a wrong link is published to the creator's audience |
| 3 | F3 Cloudinary overwrite | Cross-tenant, needs only a free account |
| 4 | F1 + F2 sign-off forgery chain | Breaks the consent model the product is sold on |
| 5 | C5 + C6 dashboard metrics | Creators make commercial decisions on these numbers |
| 6 | C4 decline confirmation | One tap loses a paid deal, unrecoverable |
| 7 | F4 + F5 terms & payment integrity | Direct financial exposure for creators |
| 8 | C10 + C7 stage diagram / role routing | Makes correct actions look broken |
| 9 | F7 + F8 + F6 rate limit, blocks, view counts | Cost, safety, analytics integrity |
| 10 | C3, C8, C9, C11–C15 | Refinement |
