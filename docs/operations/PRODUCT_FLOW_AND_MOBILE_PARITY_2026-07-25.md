# Influnet — End-to-End Flow, Creator Experience & Web↔Mobile Parity

**Date:** 2026-07-25
**Scope:** three questions, answered from source:
1. What the web app actually does, and how the whole flow hangs together — signup → public link →
   inbound request → conversation → project → stage-by-stage → payment → completion.
2. How that feels if you are the creator using it, and where it can be made easier.
3. What the web app has that the mobile app does not, and what is worth adding.

**Method:** traced every route handler in `apps/web/src/app/api/**`, every dashboard page, the
shared state machine in `packages/core`, and all 40 mobile screens/libs in `apps/mobile`.

**Relationship to the other reports today:** `CREATOR_EXPERIENCE_AUDIT_2026-07-25.md` listed 15 UX
defects (C1–C15) and `SECURITY_AUDIT_2026-07-25.md` listed the consent-bypass class. **Most of
those are already fixed in the working tree** (31 files modified, uncommitted). This report
describes the product *as it now stands* and does not re-litigate what is fixed — Part 3 says
explicitly what changed and what is still open.

---

# Part 1 — What the product is, in one page

Influnet is a **two-sided campaign workspace for India**: brands find creators, agree terms in
chat, and then run the collaboration through a **12-stage pipeline** where each stage needs both
sides to confirm before it moves. Money moves through Razorpay against the agreed number, and the
whole thing leaves an audit trail.

Three surfaces:

| Surface | Who | What it is |
|---|---|---|
| `apps/landing` | public | marketing site (built by you — off limits per project notes) |
| `apps/web` | creators, brands, admins | the full product |
| `apps/mobile` | creators, brands | Expo/React Native companion, talks to the **same** `/api/*` routes |

Shared logic lives in `packages/`:
- `core` — the stage machine (`STAGES`, `ALLOWED_TRANSITIONS`, `STAGE_ACTOR`, `STAGE_GUIDE`), so web
  and mobile can never disagree about what stage 7 means.
- `api` — one typed endpoint list ([endpoints.ts](packages/api/src/endpoints.ts)) used by mobile.
- `types`, `tokens` — shapes and design tokens.

Mobile deliberately **never touches Postgres directly** ([api.ts:1](apps/mobile/lib/api.ts)) — every
RLS rule, rate limit and audit hook lives in the web app's route handlers, and a second DB client
would be a second place to get it wrong. That is the right call and it makes parity a pure UI
question, not a security question.

## Feature inventory — web

**Auth & onboarding**
- Role-split signup: `/signup` → `/signup/influencer` (5 steps) or `/signup/business`
- Instagram auto-fill at signup (`/api/auth/scrape-instagram` → Apify/HikerAPI)
- Live username availability (`/api/auth/check-username`, RPC from migration 066)
- Email confirm path stashes the wizard payload in `localStorage` and replays it at login
- Business accounts are **admin-approval gated** before they can contact anyone
- Password reset, welcome modal (server-persisted via migration 074)

**Creator identity & the public link**
- `/c/[username]` — public creator profile (SSR, anon RPC `get_public_influencer`)
- `/c/[username]/media-kit` — brand-facing media kit: rates, audience splits, past collabs, reviews
- `/b/[username]` — business profile, **relationship-gated** (not public)
- `/vf/[code]` — verification landing for the ownership code
- Profile view counting (`record_profile_view`, authenticated non-owner only — migration 075)
- Instagram **ownership** verification: one-time code in bio → scrape → verified badge
- Social snapshots (followers, engagement, recent posts) cached in `social_snapshots`

**Discovery & the pitch**
- `/dashboard/discover` — **business only** (creators cannot search brands)
- `/dashboard/requests/new` — brand composes a pitch (title, brief, budget)
- Requests inbox with accept / decline / cancel, plus a derived `deal_state`
- Blocks and reports, enforced at the DB layer (migration 076)

**Negotiation**
- 1:1 conversations, **GetStream-backed** chat (Postgres `messages` is pre-Stream history only)
- In-chat **deal panel**: the collab request, pending terms, past declined terms, live projects,
  and a `viewer` permission block that tells the UI exactly which buttons to enable
- Propose terms → accept / decline / withdraw. **Only acceptance creates a project.**

**Projects — four views of the same project**
| View | What it is |
|---|---|
| **Guided** | the default: current stage, per-role instructions, checklist, updates, sign-off |
| **Flow** | React Flow diagram of the 12-stage pipeline |
| **Board** | drag-and-drop kanban with a date gutter, card spans, colours, resize |
| **Activity** | append-only timeline of everything that happened |

Plus: change requests (propose → notify → accept, with a `before` snapshot), stage updates with
file attachments, Razorpay payment gates, dual-confirm completion, mutual-consent cancellation
(a state change, never a delete), and post-completion reviews.

**Admin** — dashboard, business approvals, users, collabs, projects, reports, verification data,
with an audit log and hardened self-promotion guard (migration 070).

---

# Part 2 — The flow, end to end

## Stage 0 — A creator signs up

`/signup/influencer` ([page.tsx](apps/web/src/app/signup/influencer/page.tsx)) — five steps:

```
1 Connect   → type your IG handle → /api/auth/scrape-instagram pulls name, bio, followers
2 Account   → first/last name, username (live availability), email, phone, password
3 Profile   → gender, city, state, languages
4 Creator   → primary + secondary niches, bio, IG/YouTube/Twitter handles
5 Collab    → content types, price tier
```

On submit:
1. **Re-check the username** (it could have been taken while they filled steps 3–5). If it was,
   the wizard now jumps *back to step 2 itself*, focuses the field, and offers two alternatives it
   has already confirmed are free. (This was C9; it's fixed.)
2. `supabase.auth.signUp()` with the whole payload as user metadata.
3. If a session comes back → `POST /api/auth/register` → the `register_profile` RPC writes
   `profiles` + `influencer_profiles` in one transaction. The route **strips `approvalStatus`**
   from the payload so nobody can self-approve ([register/route.ts:30](apps/web/src/app/api/auth/register/route.ts)).
4. Fire-and-forget `POST /api/verification` so the trust badge starts processing immediately —
   never blocks signup.
5. If email confirmation is required there is no session yet, so the payload is stashed in
   `localStorage` and replayed after login.

**The public ID is generated here.** `influencer_profiles.username` *is* the public slug. There is
no separate ID generation step — the username the creator picks at step 2 becomes
`influnet.app/c/<username>` immediately on account creation.

Every place that shows that URL now goes through one helper ([site.ts](apps/web/src/lib/site.ts)):
```
publicProfileUrl('c', username)  →  ${NEXT_PUBLIC_APP_URL}/c/username
```
so signup hint text, the welcome modal, settings and the media kit can no longer disagree about
the domain. If there is no username, the UI shows **no link at all** rather than guessing one from
the display name (that guess used to 404 — C2, fixed).

## Stage 1 — The link goes live

`/c/[username]` is a server-rendered page ([page.tsx](apps/web/src/app/c/[username]/page.tsx)):

- `get_public_influencer(p_slug)` — anon RPC, PII-safe columns only
- `get_creator_collaborations(p_user_id)` — brand names from **real completed projects**, so the
  "worked with" wall cannot be faked
- `getInstagramSnapshot(userId)` — cached followers/engagement/recent posts
- OpenGraph metadata so the link previews properly when pasted into a bio or a DM

The CTA is **contextual**:

| Viewer | Button |
|---|---|
| the creator themselves | Edit profile → settings |
| a brand with no history | Work with me → `/dashboard/requests/new?to=<id>` |
| a brand with a pending request | Request sent |
| a brand already working with them | View project |
| a logged-out visitor | Work with me → `/signup?next=/c/username` |
| any other signed-in user | Back to dashboard |

A view is recorded only for a **signed-in, non-owner** visitor — so the creator cannot inflate
their own count and logged-out traffic doesn't pollute it.

## Stage 2 — A brand pitches

`POST /api/collabs` ([route.ts](apps/web/src/app/api/collabs/route.ts)) is gated four ways before a
row is written:

1. `withAuth(req, { role: 'business_owner' })` — creators cannot send requests
2. `get_own_business_profile().approval_status === 'approved'` — an unapproved brand can browse but
   not contact anyone
3. Rate limit — 20 per minute per business, to stop one brand blasting every creator
4. `is_blocked_pair(a, b)` — a block stops contact in **both** directions

Then the row is inserted and `notifyUser()` writes a notification for the creator.

## Stage 3 — Accept ≠ project

This is the most important design decision in the product, and it is right.

`PATCH /api/collabs` with `status: 'accepted'` calls `accept_collab_request(request_id)`, which
opens **a conversation and nothing else**. No project. No stages. No money.

The state machine around it is properly guarded: only the receiver can decline, only the sender can
cancel, nothing can go back to `pending`, and once a request leaves `pending` any further change
returns 409.

## Stage 4 — Negotiation in chat

Chat is **GetStream** (`/api/stream/token`, `/api/stream/channel`). Alongside it sits the deal
panel, driven by `GET /api/conversations/[id]/deal`
([route.ts](apps/web/src/app/api/conversations/[id]/deal/route.ts)), which returns:

```
request         the latest collab request between this pair
requests[]      the full history — a brand and creator run several deals through one chat
projects[]      live projects (pending_acceptance ones are excluded on purpose)
proposal        terms currently on the table
last_declined   the last terms that were turned down, so the negotiation keeps its history
viewer{}        can_respond_to_request, can_propose, can_respond_to_proposal,
                can_withdraw_proposal, awaiting_me
```

That `viewer` block is a genuinely good piece of design: the server decides whose turn it is, and
both clients just render it.

`POST .../deal` → `propose_project(...)` writes a **`project_proposals`** row and nothing else.
`PATCH .../deal` with `accept` → `respond_to_proposal(...)` — **this is the only thing in the entire
codebase that creates a `campaign_projects` row.** Until someone accepts, an un-agreed deal cannot
appear in anyone's project list or pipeline.

Guards: the advance can't exceed the budget; you can't respond to your own proposal; only the
proposer can withdraw; no new proposal while one is pending or a project is still running.

## Stage 5 — The project runs, stage by stage

Twelve stages ([project-lifecycle.ts](packages/core/src/project-lifecycle.ts)):

```
collaboration_started → project_discussion → advance_payment → content_planning
→ content_confirmation → shooting_in_progress → editing_in_progress → sent_for_review
  ↳ revisions ⇄ sent_for_review          (the review loop)
  ↳ final_approval → final_payment → project_completed
```

Three rule tables govern movement:

- **`ALLOWED_TRANSITIONS`** — you cannot jump. `sent_for_review` is the only fork (revisions *or*
  final approval).
- **`STAGE_ACTOR`** — who may move out of a stage. Payment stages belong to the brand; planning,
  shooting and editing belong to the creator; review and final approval belong to the brand.
- **`STAGE_GUIDE`** ([project-stage-guide.ts](packages/core/src/project-stage-guide.ts)) — for every
  stage, a one-line purpose plus concrete bullet actions **for each side**. This is the best asset
  in the product: at any moment both people can see what they should be doing and what the other
  person should be doing.

### How a stage actually advances

Two mechanisms, and they layer:

**a) Mutual sign-off** (the default, for 9 of the 12 stages). Each side confirms; when both have,
the stage completes and the project moves on automatically. Sign-off state lives in the
`stage_progress` JSONB as `owner_signoff_at` / `creator_signoff_at`.

**b) The checklist gate.** Each stage seeds default checklist items
([stage-items/route.ts](apps/web/src/app/api/projects/[id]/stage-items/route.ts)) with an
`owner_role` and `is_gate` flag. Every **required** item must be done before either side can sign
off or advance — enforced server-side, not just in the UI.

Two enforcement rules matter a lot here, and both were tightened this week:

- **You cannot tick the other side's box.** `owner_role` is checked in the PATCH handler, so a
  creator can no longer mark "Brand approved the concept" done themselves.
- **You cannot hand-tick a payment gate while Razorpay is live.** The advance/final "received"
  items open *only* when a confirmed payment exists in `project_payments`.
- **`update_stage` uses an allow-list, not a deny-list.** Only `notes`, `meeting_link` and
  `deliverables` can be merged into `stage_progress` — because sign-off consent and skip proposals
  live in that same JSONB, and a deny-list left them forgeable.

**Skipping.** Non-essential stages can be skipped, but only by **mutual consent** — one side
proposes, the other confirms. Payment stages, final approval, the review fork, the revision loop
and the terminal stage can **never** be skipped.

**Cancellation.** `request_cancellation` → the other side `decline_cancellation` or
`accept_cancellation`. Accepting calls `cancel_project()`, which is a **state change, not a
delete** — the row, the payment ledger, the activity timeline and the assets all survive, so both
sides keep a record of what was agreed and what was paid.

**Change requests.** Title/description/deliverables can only be changed through
`/api/projects/[id]/change-requests`: propose → snapshot the previous value → notify → the other
side accepts. The direct `update_project` action is now restricted to the proposer tidying up terms
**nobody has accepted yet**.

### Money

`POST /api/projects/[id]/payments` ([route.ts](apps/web/src/app/api/projects/[id]/payments/route.ts)):

- Only the **project owner (the brand)** can initiate.
- The amount is **derived server-side from the agreed terms** — `advance_amount` for the advance,
  `budget − advance` for the final. If the client sends an amount that doesn't match, the request
  is **rejected**, never silently substituted. (Previously ₹1 could open the advance gate.)
- A ledger row is written with status `created`; the **signed webhook** flips it to `paid`.

### Completion

At `final_payment`, `confirm_completion` needs **both** parties. When both have confirmed,
`current_stage → project_completed`, `status → completed`, and reviews open. Every action along the
way writes to the activity timeline and notifies the counterparty with a deep link.

---

# Part 3 — Being the creator: how this feels

## The good — and it's genuinely good

- **"Accept ≠ project" is the right model.** A creator can say "yes, let's talk" without committing
  to anything. The number of Indian creator-brand disputes that start with "but I thought you'd
  agreed" makes this worth a lot.
- **The consent architecture is the product.** Bilateral sign-off, mutual-consent skips,
  dual-confirm completion, propose-notify-accept for scope changes, cancellation as a state change.
  A creator is structurally protected from a brand unilaterally moving the goalposts — and after
  this week's fixes, that protection is enforced on the server rather than in the UI.
- **`STAGE_GUIDE` removes the "what now?"** At every step, a plain-language statement of what *you*
  do and what *they* do. Most competitor tools give you a status label and nothing else.
- **Server-derived payment amounts.** The creator cannot be told "the advance is in" on the back of
  a ₹1 transaction.
- **Real data on the public profile.** Past collaborations come from completed projects; view counts
  exclude the owner. The creator's page is credible *because* they can't inflate it.
- **Care in small places** — rate limiting placed *after* cheap rejections so a creator with no
  handle doesn't burn their 5-hour refresh window; the mobile verification flow (copy code → deep
  link into Instagram → come back → confirm) is genuinely better than doing it on desktop.

## What this week's fixes already resolved

Confirmed in the working tree, no longer open:

| Was | Now |
|---|---|
| Every creator saw fake L'Oréal / Nike deals and "1.2M reach" | Real active roster from `campaign_projects`, empty state otherwise |
| Public link shown with 3 different domains, one guessable-and-wrong | One `site.ts` helper; no username → no link, prompt to pick one |
| Avatar hardcoded `null` on the dashboard | Returned from `influencer_profiles.avatar_url` |
| "Pipeline value" summed every accepted DM | Sums `campaign_projects` where status = active |
| "Earnings" charted when pitches *arrived* | Charts `project_payments` where status = paid, by `paid_at` |
| Terms awaiting the creator were invisible | `proposals_awaiting_you` KPI |
| Declining a ₹50k pitch was one unconfirmed tap | Confirmation step added |
| Stage diagram didn't re-render when the stage advanced | Synced via effect |
| Media-kit nudge forgot dismissal per-device | Persisted on the profile (migration 077) |
| Empty Requests page said nothing useful | `InboundBoostPanel` — a live checklist of what raises inbound |

## What still makes it harder than it needs to be

**1. The creator's pipeline is entirely inbound. There is no outbound anything.**
`/api/discover` is business-only ([route.ts:40](apps/web/src/app/api/discover/route.ts)) — and the
route's *own doc comment* says it should serve "creators (for businesses) **or brands (for
influencers)**". The two-way intent is written down and not implemented. A creator can wait, accept,
or decline. That's the whole verb list. The new `InboundBoostPanel` makes the waiting *productive*,
which is the right interim move, but the asymmetry is the biggest remaining product gap.
*Recommendation:* even before full creator→brand outreach, let a creator **re-open a declined
request** ("I passed earlier — still interested?"). It's one PATCH guard change and it removes the
sharpest edge of the current terminal-decline design.

**2. Nothing reaches the creator when they're not in the app.**
`notifyUser()` writes a row to `notifications` and stops
([notify.ts](apps/web/src/lib/notify.ts)). No email (Resend is scaffolded, not wired — it appears in
`env.ts` and nowhere else). No push (see Part 4). The entire product is turn-based — "waiting on the
creator" is a real state the DB knows about — and the creator only discovers it by opening the app.
**This is the single highest-leverage improvement available.** A brand paid an advance and is
waiting; the creator finds out on their next visit.

**3. Twelve stages is a lot of ceremony for a ₹5,000 reel.**
The pipeline is designed for a brand campaign. For the small, fast deals that are most of the Indian
creator market, a creator has to walk through Discussion → Advance → Planning → Confirmation →
Shooting → Editing → Review → Final Approval → Final Payment, confirming twice at each step. Skips
help but need mutual consent each time.
*Recommendation:* a **"Quick collab" template** chosen at proposal time that pre-marks the optional
stages skipped, leaving roughly: agree → advance → deliver → review → pay. Same state machine, same
guarantees, one-fifth the taps. No schema change needed — it's a seeded `stage_progress`.

**4. The creator can't see their own money in one place.**
`project_payments` exists and is accurate. The creator's dashboard shows an earnings *trend*; a
project shows *its* payments. There is no "here is everything I have been paid, by whom, when" view
— and no invoice or receipt artifact anywhere. For an Indian creator filing GST/ITR this is the
first thing they'll ask for.

**5. The media kit is the best asset and the least promoted.**
`/c/[username]/media-kit` renders rates, audience splits, past collaborations and reviews — a real
brand-facing artifact. It's reachable through settings and a dismissible nudge. It deserves to be
the thing the product pushes the creator toward on day one, with a PDF export.

**6. Verification asks for the creator's most valuable real estate.**
Putting a code in the Instagram bio is correct and cheap, but the bio is often a creator's only link
slot. The copy now leads better, but there's still no post-verification prompt to **remove** the
code. One toast at the moment of success closes it.

**7. Two overview screens with unpredictable labels.**
"Home" (`/dashboard/home`) and "Dashboard" (`/dashboard/influencer`) sit adjacent in the sidebar.
The IA split is deliberate, but a creator can't predict which one holds which number, so they click
both. Rename to what they contain — "Today" and "My numbers".

---

# Part 4 — Web vs mobile: what's missing

The mobile app is well built. Its home screen is arguably *better* than the web's — it opens with
"Needs you", groups projects into **Your move / Waiting on them / Closed**, and the verification
flow beats the desktop one. The design system, theming, caching (`use-fetch` with cache keys) and
offline-ish refresh are all solid.

But it is **read-mostly**. Of the 40 endpoints exposed in
[endpoints.ts](packages/api/src/endpoints.ts), the screens call about half, and almost every *write*
is missing. Verified by grep — these endpoints exist in the client and are called by **no screen**:

```
updateProfile   refreshProfile   signUpload        createProject
updateDeal      createStageEntry createChangeRequest
createProjectPayment   listProjectPayments   createReview
createBlock     removeBlock      createReport      discover (search)
```

## Parity matrix

| Capability | Web | Mobile | Impact |
|---|:--:|:--:|---|
| Sign up (creator + business) | ✅ | ✅ | — |
| IG auto-fill at signup | ✅ | ✅ | — |
| Home / dashboard with charts | ✅ | ✅ | mobile is very good here |
| Requests inbox, accept/decline | ✅ | ✅ | — |
| Chat (GetStream) | ✅ | ✅ | — |
| **Respond to proposed terms** | ✅ | ❌ | **P0** — sheet literally says "use the web app" |
| **Propose terms** | ✅ | ❌ | **P0** |
| Project list + stage timeline | ✅ | ✅ | — |
| Stage guide (both roles) | ✅ | ✅ | — |
| Stage sign-off / revoke / propose skip | ✅ | ✅ | **confirm_skip is missing** |
| **Tick checklist items** | ✅ | ❌ | **P0** — read-only; blocks sign-off entirely |
| **Post a stage update / attach a file** | ✅ | ❌ | **P0** — this is where phones win |
| **Pay (Razorpay)** | ✅ | ❌ | **P1** (brand-side) |
| **Confirm completion** | ✅ | ❌ | **P1** — final_payment has no mobile control at all |
| **Sent-for-review fork (approve / revisions)** | ✅ | ❌ | **P1** — dead-ends on "handle it from the project chat" |
| **Leave a review** | ✅ | ❌ | P1 |
| **Change requests** | ✅ | ❌ | P1 |
| Cancellation flow | ✅ | ❌ | P2 |
| **Edit profile / media kit** | ✅ | ❌ | **P1** — settings has *no* editing at all |
| Avatar upload | ✅ | ❌ | P1 (`expo-image-picker` is already a dependency, unused) |
| View own public profile / media kit | ✅ | share URL only | P2 |
| Discover / search creators | ✅ | ❌ | P2 (business-side) |
| Block / unblock, report | ✅ | ❌ | **P1 — safety** |
| Verification | ✅ | ✅ | mobile is better |
| Notifications list | ✅ | ✅ | — |
| **Push notifications** | n/a | ❌ | **P0 — the reason to have an app** |
| Deep links from notifications | ✅ | partial | `notification-link.ts` maps paths; no push to open them |
| Activity timeline | ✅ | ✅ | — |
| Project board / kanban / flow diagram | ✅ | ❌ | correctly out of scope for phone |
| Admin tools | ✅ | ❌ | correctly out of scope (settings says so) |

## The three that matter most

### M1. Push notifications — the app's entire reason to exist
`expo-notifications` is **not installed**. The product is a turn-based system that already computes
"whose turn is it" (`viewer.awaiting_me`, the `STAGE_ACTOR` table, `notifyUser()` at every
transition). Every one of those calls is a push waiting to be sent.

Without push, the mobile app is a nicer-looking way to check something you had to remember to check.
With it, it becomes the thing that tells a creator a brand just paid their advance.

**Shape of the work:** add `expo-notifications`, store the Expo push token on the profile, and
extend `notifyUser()` to fan out to Expo's push API alongside the DB insert. `notification-link.ts`
already maps web links to mobile routes, so tapping one lands on the right screen. Roughly a day.

### M2. Mobile cannot close a deal
The conversation screen's deal sheet ends with:

> *"Terms are waiting on you. Accept or decline them from the Influnet web app — that flow is not in
> the mobile app yet."*

([conversations/[id].tsx:466](apps/mobile/app/conversations/[id].tsx))

That is honest, and it is also the commercial heart of the product being unavailable on the device
people negotiate on. `PATCH /api/conversations/[id]/deal` already does everything; this is a sheet
with two buttons and an optional decline note.

### M3. Mobile cannot do the work of a stage
Three things are missing and they compound:

- **Checklist is read-only** — *"Tick items off from the Influnet web app"*. Since required items
  gate sign-off, a creator on mobile can be blocked from confirming a stage with no way forward.
- **No stage updates** — a creator cannot post "here's the draft" with a file. This is precisely
  where a phone should win: shoot it, attach it, send it. `signUpload` and `createStageEntry` both
  exist and are unused; `expo-image-picker` is already installed.
- **Non-sign-off stages dead-end** — `sent_for_review`, `final_payment` and `project_completed`
  render *"This stage has its own controls — handle it from the project chat"*, and the chat has no
  such controls. A project on mobile can reach `sent_for_review` and simply stop.

## Recommended order

| # | Item | Why | Rough size |
|---|---|---|---|
| 1 | **Push notifications** | turns the app from a viewer into a channel | ~1 day |
| 2 | **Accept/decline/propose terms on mobile** | the commercial action, currently web-only | ~1 day |
| 3 | **Checklist toggle + stage updates with attachments** | unblocks sign-off; the phone's natural advantage | ~2 days |
| 4 | **Review fork + confirm completion + confirm_skip** | removes the three dead-ends in the stage machine | ~1 day |
| 5 | **Profile & media-kit editing + avatar upload** | a creator's profile is their storefront | ~2 days |
| 6 | **Block / report from mobile** | safety features shouldn't be desktop-only | ~half day |
| 7 | Reviews, change requests, cancellation | completes the loop | ~2 days |
| 8 | Razorpay checkout (brand side), Discover | brand-side parity | ~2 days |

Also worth fixing while in there: **mobile Settings → "Blocked accounts" is a dead row** — tapping
it fetches a count and updates its own subtitle, but navigates nowhere
([settings.tsx:54-64](apps/mobile/app/settings.tsx)). And mobile Settings offers **no profile
editing whatsoever** — it's account info, a block count, delete-by-email, and sign out.

---

# Part 5 — Dynamic / operational work still outstanding

Things that are **not code problems** but will decide whether the flow works in production:

| Item | State | Consequence if left |
|---|---|---|
| **Migrations 075–078 applied to hosted DB** | 4 new files, unapplied | 075 = view integrity, 076 = **blocks not enforced**, 077 = nudge persistence, 078 = the `profiles` grant fix that silently broke `welcome_seen` |
| `SUPABASE_SERVICE_ROLE_KEY` | wrong in `.env.local` (`sbp_` not a JWT) | **every notification is silently skipped** — `notifyUser` warns and returns false |
| Email (Resend) | scaffolded in `env.ts`, wired nowhere | no off-platform reach at all; combined with no push, the product is silent |
| Push (Expo) | not installed | see M1 |
| Razorpay | env-gated; manual mode when unset | payment gates fall back to hand-ticking, which is the weaker guarantee |
| Upstash (rate limits) | pending | rate limiting degrades to in-memory, per-instance — ineffective on serverless |
| Sentry | pending | no visibility into the 500s these flows can produce |
| EAS production env → dev backend | deliberate, per project notes | **must be switched before public release** |

The first two are the ones that make the flow *appear broken* rather than degraded: unapplied 076
means the block button does nothing, and a bad service-role key means the entire notification
pipeline is a no-op while every route reports success.

---

# Summary

**The architecture is right.** The separation of "agreed to talk" from "agreed to work", the
bilateral consent model through every stage, server-derived payment amounts, and a shared state
machine across web and mobile are all good decisions that will hold up.

**The creator experience is now honest** — this week's fixes removed fabricated data, wrong links
and misleading money figures. What remains is not defects but *shape*: the creator has no outbound
verb, nothing reaches them when they're away, and a small deal costs as much ceremony as a large one.

**The mobile app is a beautiful reader that can't write.** It shows a creator exactly what needs
them and then, at the moment of action, points at a laptop. Push notifications plus the ability to
accept terms and work a stage would turn it into the primary surface — which, for Indian creators,
is what it should be.
