# Product Confidence Report — 2026-07-26

**Questions asked**

1. After a project completes, how does it show up on the brand's and the creator's profiles?
2. A creator opening their dashboard or profile should see their own growth — posts, video
   thumbnails (including YouTube), analytics — everything their public profile shows. On the
   mobile app too.
3. Is the flow actually sound? Any loopholes?
4. Can this be handed to real clients on web *and* mobile, with the two in sync and nothing
   breaking?

**Method.** Traced each flow in source from both sides (brand and creator, web and mobile),
probed the live hosted database to establish which migrations are actually applied, live-tested
the new YouTube ingestion against a real channel, and built both apps.

**Verification run for this report**

| Check | Result |
|---|---|
| `tsc --noEmit` — web | clean |
| `tsc --noEmit` — mobile | clean |
| `next build` — web | exit 0 |
| `expo export --platform ios --platform android` | exit 0, both bundles emitted |
| YouTube ingestion, live channel | resolved channel ID, 12 videos, real view/like counts, thumbnails |
| **All 83 migrations applied in order to a clean Postgres** | **succeeded; 080/081/082 objects all present** |
| **New consent suite (`consent_integrity_test.sql`)** | **27/27 — 11 forgeries refused, 12 legitimate flows still pass, 4 ratings assertions** |
| **Existing suites: proposal-flow, cancellation, admin-security** | **all pass on a fresh DB with the new migrations — no regressions** |
| Hosted DB migration probe | see [Blockers](#blockers-before-real-users) |

The migrations are no longer "syntax-reviewed". They were executed against a real
Postgres with the full migration history applied, and the rules they add were driven
directly against the table — the way a PATCH to PostgREST would — to confirm they
refuse forgery *and* let honest flows through.

---

## The headline

The product flow is sound in shape and was **not** sound in enforcement. The real problem was
one thing wearing several hats: **every bilateral rule in the product was advisory.** The RLS
policy on `campaign_projects` authorises the *row* and never the columns or the values, and both
apps ship the anon key — so any participant could PATCH the row directly and forge the other
side's consent. On top of that, two paths let one side act alone even through the API, and mobile
could not reach the end of the flow at all:

1. **A brand could close a project by itself.** Dual-confirm completion existed, but the older
   `advance` action walked straight past it, and `STAGE_ACTOR['final_payment']` is `'business'`.
2. **Sign-offs, completion flags and agreed terms could all be written directly**, bypassing the
   API entirely — including moving the budget on a live project with no proposal and no trace.
3. **Mobile could not finish a project at all.** The final stage rendered no action button, so
   work started on the phone hit a dead end at the last step — and could never be rated.

All of it is fixed, and the consent rules now hold in the database rather than in a route handler:
27 assertions run against a real Postgres prove eleven forgeries are refused while twelve
legitimate flows still pass. The creator-visibility work is built on both platforms, and
completion now leaves a visible record on both sides.

What remains between here and real users is **operational, not code** — principally that the
hosted database is several migrations behind the repo.

---

## 1. What completion now leaves behind

### Before

Completion set `status = 'completed'` and that was nearly the end of it. The brand's private
page showed a count. The creator's public page gained the brand's name. Reviews were written to
the database by the web project screen and then displayed **nowhere at all** — migration 051's
own comment says "ratings surface on public profiles"; no reader was ever built, so every rating
a brand had ever left was invisible to everyone including the creator who earned it.

### Now

| Surface | What a completed project produces |
|---|---|
| Creator public page `/c/[username]` | Brand name on the collaborations wall (existing) **+ new: star rating, review count, and the brands' own words** |
| Creator dashboard (web + mobile) | "Completed work" list — project, partner, month, value — plus the same ratings block, plus the brand wall |
| Brand private page `/b/[username]` | Completed-collabs count, creators-partnered count (existing) |
| Brand dashboard (web + mobile) | "Completed work" list, same as the creator's side |
| Both project screens | Reviews readable; **mobile can now leave one** (it could not before) |

**Deliberate limit — project titles are never published.** The reviewer knowingly writes a public
rating, but nobody agreed to publish the name of the campaign it came from, and titles routinely
carry unreleased product or launch names. The public payload is the reviewer's name, their stars,
and their own text. Nothing else.

**Ratings only count completed work.** A review row can only be written against a completed
project, but a project can be cancelled afterwards; the RPC re-checks status at read time, so a
rating for work that was undone stops advertising.

---

## 2. The creator now sees themselves the way brands do

The creator's own screens showed numbers about content they could not see. That is now closed on
both platforms, reading the **same sources the public page reads** — not a parallel set of
figures that can drift.

| | Public `/c/` page | Web dashboard | Mobile app |
|---|---|---|---|
| Followers / engagement / avg views | yes | yes | yes (Home + Profile) |
| Instagram post thumbnails | yes | yes | **new** — grid on Home + Profile |
| YouTube videos + thumbnails | **new** | **new** | **new** |
| Subscribers (live, not self-typed) | **new** | **new** | **new** |
| Audience split (locations/age/gender) | yes | **new** | **new** |
| Star rating + reviews | **new** | **new** | **new** |
| Brands worked with | yes | **new** | **new** |
| Per-post reach trend | — | — | yes (existing) |

### YouTube, with no API key and no bill

There was no YouTube data anywhere in the product — only a handle and a subscriber number the
creator typed in themselves. Ingestion now uses the channel's **public Atom feed**
(`/feeds/videos.xml`), which carries recent uploads with view and like counts; thumbnails are
derived from the video id (`i.ytimg.com` URLs are permanent and unsigned, so unlike Instagram
there is nothing to download and cache). Handle → channel id costs one page fetch, which also
yields a real subscriber count.

Live-tested end to end: channel resolved, 12 videos returned with real metrics and working
thumbnails, and a nonexistent handle returned `null` without throwing.

- Costs nothing, needs no key, has no quota.
- Refreshes on the existing "refresh my numbers" path, and fires automatically (via `after()`,
  so it never slows the save) when a creator first connects a channel.
- Rate limits are split: Instagram stays 1-per-5-hours because that scrape is billed; YouTube
  gets 4-per-hour because a public feed fetch is free.
- **The fragile part, stated plainly:** handle → channel id reads YouTube's HTML. If that markup
  changes, videos stop appearing — nothing else breaks, and the profile falls back to the
  self-reported subscriber number. Every entry point returns `null` rather than throwing.

---

## 3. Loopholes

### Fixed in this pass

**L1 — A brand could complete a project alone.** `advance` accepted the
`final_payment → project_completed` transition, and that stage's actor is the business. So a
brand could close a project the creator never agreed was finished — ending the change-request
window, locking the workspace, and (now) publishing the collaboration and a rating opportunity on
the creator's public profile. Completion now has exactly one door: `confirm_completion`, which
requires both sides. *(`api/projects/[id]/route.ts`)*

**L2 — Every consent rule was bypassable by skipping the API.** RLS on `campaign_projects`
authorises the *row*, not the *columns or values*:

```sql
USING (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id)
```

Both apps ship the anon key, so any participant could `PATCH /rest/v1/campaign_projects?id=eq.N`
with a forged `stage_progress` (both sign-offs), `status: 'completed'`, and both confirmation
flags — and the API's careful bilateral logic simply never ran. Migration **081** moves the
invariants into a `BEFORE UPDATE` trigger, where they hold regardless of which client writes:

- you may only flip *your own* completion confirmation;
- `status` may only become `completed` when *both* confirmations are true;
- you may only write *your own* sign-off, and it must be attributed to you;
- a stage may only become `skipped` if the *other* party proposed the skip.

Service-role writes (no `auth.uid()`) and admins are exempt, matching migration 038.

**L3 — Mobile could not complete a project.** The stage screen only renders a footer for
mutual-sign-off stages; `final_payment` is not one, so the last stage had **no action at all**,
and the sign-off the UI would otherwise have sent is rejected outright by the API for that stage.
A collaboration run from the phone could reach final payment and never finish. Added the
completion control with both sides' confirmation state.

**L4 — Mobile could not rate anyone.** Reviews were web-only. Since ratings are now public, a
brand working from their phone would silently never contribute one. Added the review flow
(one per person per project, enforced by the DB since 051).

**L5 — "This is how brands see you" was lying.** `/dashboard/profile` called
`get_creator_collaborations` with `p_creator_user_id` and read the result as `{brand_name}`
objects. The RPC (067) takes `p_user_id` and returns flat strings — so the call errored, the
array came back empty, and the preview showed **no** past collaborations while the real public
page showed them all.

**L6 — The app's reach chart mislabelled every bar.** Mobile declared the snapshot's post date as
`taken_at`; the API passes the view model through, where it is `takenAt`. Every date was
`undefined`, so bars read "#1…#6" instead of when each post went out.

**L7 — Agreed terms were rewritable at the database level.** The same class as L2, on the columns
that carry the money. The API is correct — once a project is active, `update_project` refuses and
sends you to a change request — but PostgREST let either participant write `budget`, `title` or
`deliverables` on a *live* project with no proposal, no acceptance and no timeline entry.

This was left open in the first pass because accepting a change request legitimately writes those
same columns through the same user-authenticated path, so a blanket lock would have broken the
consent flow it was meant to protect. Migration **082** gives the legitimate path its own door
first: `apply_change_request()` re-checks consent (pending request, caller is the reviewer and not
the proposer), applies only whitelisted fields, and marks its transaction while it writes. The
trigger then refuses any terms change that is not either pre-agreement (by the proposer) or inside
that marked transaction. The change-requests route now goes through the RPC.

*Why a transaction flag rather than column grants:* the API writes a dozen other columns on this
table through the user's client. Revoking `UPDATE` and re-granting per column would mean
enumerating every one of them correctly forever — miss one and a flow breaks silently. The flag
names the one path allowed to write terms and leaves the rest alone. It cannot be forged from a
client: PostgREST only exposes `public` functions, runs one statement per transaction, and
`set_config` is not reachable.

**L8 — A payment could clear a gate in the wrong currency.** The ledger records the currency an
order was placed in; the webhook compared the captured *amount* but never the *unit*, so a capture
denominated in a weaker currency would have cleared a gate worth several times more. Now compared,
with a missing currency on the event treated as "no information", not as a mismatch.

### Correction to an earlier draft of this report

An earlier version listed the F5 payment-amount finding as still open, carried forward from the
2026-07-25 audit without re-checking. That was wrong: the order route already derives the amount
from the agreed terms rather than the client, and the webhook already refuses a capture below the
ledger amount. F5 is closed. L8 above is the narrower gap that was genuinely still there.

### Open

Nothing in the consent model. The remaining gaps are scope, not integrity: taking a payment
in-app is web-only, and creator-initiated outreach does not exist on either platform.

### Verified already fixed (2026-07-25 audit)

Upload overwrite across tenants (F3), gate items ignoring `owner_role` (F2), forged sign-off in
the API path (F1), silent terms rewrite via the API (F4), profile-view inflation (F6),
`X-Forwarded-For` spoofing (F7 — now reads the right-most hop and prefers Vercel's verified
header), blocks not enforced (F8, `user_blocks` present on the live DB).

---

## 4. Web ↔ mobile parity

| Flow | Web | Mobile | Notes |
|---|---|---|---|
| Signup, login, verification | yes | yes | |
| Discover creators (brand) | yes | yes | Creator-initiated outreach exists on neither — product decision, not a bug |
| Requests: accept / decline / undo | yes | yes | |
| Chat | yes | yes | GetStream on both |
| Deal proposal → accept | yes | yes | |
| Stage pipeline, checklists, updates | yes | yes | |
| Stage sign-off / skip | yes | yes | |
| **Confirm completion** | yes | **yes (new)** | was web-only |
| **Leave a review** | yes | **yes (new)** | was web-only |
| Payments (Razorpay) | yes | no | mobile shows state, cannot take payment |
| Public-profile content on own screens | yes | **yes (new)** | |
| Activity timeline, connections, blocks | yes | yes | |
| Push notifications | — | yes | |

Both clients read the same `/api/home`, so the new profile data lands on both from one change.

**Remaining gap:** taking a payment in-app is web-only. On mobile a brand can see that a payment
is due and see it settle, but must complete it on the web. That is a legitimate V1 shape —
it just needs to be a stated one, because a brand who starts on mobile will be sent to a browser
mid-flow.

---

## Blockers before real users

Ordered. The first is the only true blocker.

### 1. The hosted database is behind the repo — CONFIRMED, NOT ASSUMED

Probed live against the project's Supabase instance:

| Migration | Live status |
|---|---|
| 051 reviews, 056 completion flags, 060 snapshots, 067 collaborations, 068 business eligibility, 071 proposals, 072 cancellation, 073 activity, 076 blocks | **applied** |
| **080** `get_public_reviews` | **missing** (`PGRST202`) |
| **081** consent trigger | **missing** (new in this pass) |
| **082** terms integrity + `apply_change_request` | **missing** (new in this pass) |

Everything in this pass degrades safely without them — a missing RPC yields "no reviews section",
never a broken page — but until 080, 081 and 082 are applied: **ratings appear nowhere, and
loopholes L2 and L7 are still open in production.** Apply all three, in order.

One ordering note: 082 replaces the trigger function created by 081, so 081 must run first. The
change-requests route now calls `apply_change_request`, which only exists in 082 — deploy the
migrations before (or with) the app code, or accepting a change request will fail.

Migrations 074/077/079 could not be probed anonymously (column grants on `profiles` correctly
refuse). Confirm those are applied before trusting welcome-modal state, the media-kit nudge, and
push tokens.

### 2. Infrastructure still on you

Unchanged from the 2026-07-14 and 2026-07-15 reports: the service-role key in `.env.local` is a
`sbp_` token rather than a JWT (so any server-side path needing it fails, including snapshot
capture), Upstash and Sentry are pending, and Resend is scaffolded but not wired.

**Note:** YouTube capture writes with the service-role key. Until that key is correct, YouTube
videos will not populate even though the fetch itself works. This is the same dependency
Instagram snapshot capture already has.

### 3. Worth doing before scale, not before launch

In-app payments on mobile; creator-initiated outreach.

---

## Confidence

Scored as "would I hand this to a paying client tomorrow", assuming the migrations above are
applied. These are judgements from reading the code and the live data, not measurements.

| Area | Confidence | Why |
|---|---|---|
| Signup, auth, verification | High | Live-verified previously; unchanged here |
| Creator profile & analytics | High | Real data on the live DB (a 626K-follower snapshot is already captured); YouTube live-tested |
| Requests → deal → project | High | Bilateral throughout, now enforced in the DB |
| Stage pipeline & sign-off | High | L1/L2 closed; the guided flow was already the strongest part of the product |
| Completion & post-completion record | High | Was the weakest link this morning; L1/L3/L4 all closed |
| Ratings & public reputation | Medium-high | Behaviour verified against a real Postgres, but **zero production exposure** — one 5★ review exists on the live DB and it has never been rendered anywhere |
| Terms & change-request integrity | High | L7 closed and tested from both directions: forged writes refused, the accept path still applies |
| Payments | Medium-high | Amount and currency both verified now; still web-only |
| Mobile parity | High | Completion and reviews were the two real holes; both closed. Payments remain web-only by design |
| Web ↔ mobile data consistency | High | One endpoint feeds both; the two known drifts (L5, L6) are fixed |
| Operational readiness | **Low — and this is the gate** | Migrations behind, service-role key wrong, no Sentry, no Resend |

**Overall: the code is ready for real clients; the environment is not.** Nothing in the product
flow now depends on a user choosing to be honest — the consent rules hold at the database. What
stands between this and a confident launch is a migration run and four infrastructure items,
none of which are code and all of which need your credentials.

**On the migrations, stated plainly:** 080, 081 and 082 have now been executed against a real
Postgres with the entire migration history applied, and their rules were driven directly against
the table the way a hostile client would — 27 assertions, no failures, and the three pre-existing
suites still pass. That is a large step up from "syntax-reviewed", and it is still not the same
as running on *your* data. Apply them to staging and take one project through to completion
before production. If any legitimate path does trip the trigger, it surfaces as a
`consent_violation` message in the API response rather than as corrupted data — the failure mode
you want — but see it once in staging rather than for the first time with a client on the line.

**A note on how the tests were validated.** The first run of the new suite passed everything
against a hand-written schema stub, then failed almost everything against the real one: the live
`profiles` table requires `email`, so every fixture insert failed, every UPDATE matched zero rows,
and the forgery tests "passed" by touching nothing. Worth knowing because it is the standard way a
security test suite lies to you. The suite in the repo runs against the real migrations for
exactly this reason.

---

## Files changed in this pass

**New**
- `apps/web/src/lib/youtube.ts` — RSS ingestion, channel resolution, snapshot capture
- `apps/web/src/lib/public-profile/get-youtube-snapshot.ts`
- `apps/web/src/lib/public-profile/get-reviews.ts`
- `apps/mobile/components/content-grid.tsx` — post grid + video list
- `apps/mobile/components/project-reviews.tsx`
- `supabase/migrations/080_public_reviews_rpc.sql`
- `supabase/migrations/081_project_consent_integrity.sql`
- `supabase/migrations/082_terms_integrity.sql`
- `supabase/tests/consent_integrity_test.sql` — 27 assertions against the real schema

**Changed**
- `api/projects/[id]/route.ts` — L1
- `api/projects/[id]/change-requests/route.ts` — accept now goes through `apply_change_request` (L7)
- `api/payments/webhook/route.ts` — currency check (L8)
- `api/home/route.ts` — YouTube, audience, reviews, collaborations, completed work
- `api/profile/refresh/route.ts`, `api/profile/route.ts` — YouTube refresh + auto-capture
- `c/[username]/page.tsx`, `dashboard/profile/page.tsx` — new sources, L5
- `lib/public-profile/creator-profile.ts`, `components/public-profile/creator-profile-view.tsx` (+CSS)
- `dashboard/home/page.tsx` — videos, audience, ratings, completed work, brand wall
- `apps/mobile/app/(tabs)/home.tsx` — content, audience, ratings, L6
- `apps/mobile/app/(tabs)/profile.tsx` — rebuilt as the creator's own view of their public profile
- `apps/mobile/app/projects/[id]/index.tsx`, `.../stage/[stage].tsx` — L3, L4
