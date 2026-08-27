# Release 1 — Completion pass, 27 August 2026

Everything in this document was written and verified in one session against
`dev` at the point where the prior status check left off (12 migrations
applied, campaigns/documents/S1–S5 wired but several gaps and untested paths).
**Nothing here is committed** — see [What you need to do](#what-you-need-to-do)
for the one command that changes that.

---

## Headline

Three migrations added (131–133), five files touched for bug fixes, C6
enforcement built end to end, mobile parity closed for B3/S1/S3/S5, and a
60-assertion end-to-end test written that **found six real, previously-unknown
bugs** — none of which a code read would have caught, because each one only
shows up when the actual database enforces its own triggers against real
writes.

| | Before this session | After |
|---|---|---|
| Migrations applied | 130 | 133 |
| C6 (campaign limits) | Columns existed, nothing read them | Enforced at the route and the database, both directions (publish + apply) |
| Short-term projects proven end to end | Never | Yes — `tests/e2e/phase8-r1-features.mjs`, 60/60 |
| Documents | Every issue attempt failed silently (500) | Fixed — issuing and downloading both work, proven live |
| Barter payment gate | Permanently stuck once ticked | Fixed — barter projects now complete |
| A short project's `status` column | Never became `'completed'` | Fixed |
| Mobile: campaigns tap target | Opened a dead link (`/projects/<uuid>`) | Opens a real detail + apply + accept screen |
| Unit tests | 453 | 463 |

---

## What was actually broken, and what closes it

These are the bugs the e2e test surfaced by driving the real server — not
things visible from reading the code in isolation. Each was confirmed via a
live server log, fixed, and re-verified by re-running the test.

### 1. No document has ever actually been issued

`project_documents` has RLS enabled with **deliberately no INSERT policy** —
migration 124's own comment says documents are meant to be written by the
service role. But the route never switched to one; it used the caller's own
client for the insert. Every single "Issue proforma" or "Issue receipt" click,
on web or mobile, since B2 shipped, has returned a 500.

**Fixed**: [`documents/route.tsx`](../../apps/web/src/app/api/projects/[id]/documents/route.tsx)
now uses a service-role client for the write only; every read stays on the
caller's own client so RLS still gates what this route may see.

### 2. A short-term project's `status` column never flips to `'completed'`

`record_stage_signoff()` (migration 114) deliberately left `status` untouched
when a sign-off's next stage is `project_completed` — correct for the full
12-stage flow, where that transition is `confirm_completion`'s job and
sign-off can never legitimately reach it. The short flows break that
assumption: `quick_payment → project_completed` (or `quick_delivery →
project_completed`) happens via **ordinary mutual sign-off**, which this RPC
was never updated to recognise. `current_stage` reached `project_completed`;
`status` stayed `'active'` forever. Reviews ("Can only review completed
projects"), and anything else reading that column, could never see the
project as finished.

**Fixed**: migration 132 makes the sign-off RPC set `status = 'completed'`
unconditionally on that transition (safe — the full flow can still never
reach this branch this way).

### 3. …which a second trigger then blocked anyway

Fixing #2 immediately hit `enforce_project_consent()` (migration 081):
`status = 'completed'` requires **both** `owner_confirmed_complete` and
`counterparty_confirmed_complete` to already be `true`, regardless of which
code path is setting it. Setting both together, from whichever side happens to
be the second signer, then tripped the *other* rule in the same trigger —
"only the brand can confirm its own completion" — because from that rule's
point of view, one participant was flipping the other side's confirmation flag.

**Fixed** (migration 133) — not by relaxing that rule generally, which would
let one participant fake the other's confirmation by direct PATCH. Instead the
trigger now recognises the one shape only `record_stage_signoff()` can
produce: both confirmation columns flipping true together, in a statement
where `stage_progress` already shows **both** parties' self-attributed
signatures on the stage being left — a fact the trigger's own rule 4
independently guarantees can't be forged. The exception is anchored to
evidence the trigger already verifies on the same write, not to trust in the
caller.

### 4. Barter projects could never actually complete

Traced by reading the code, then confirmed live: when Razorpay is configured
(it is, on dev), the stage-items route refuses to let a payment-gate item be
manually ticked — correct, that's the whole point of the payment gate. But the
check had **no exception for barter**, whose `budget = 0` means no Razorpay
order can ever exist (the payments route rejects a ₹0 order outright). A
barter short project could tick every other checklist item, reach
`quick_payment`, and then sit there permanently — the entire feature the scope
document specifically called for ("generate a zero-value record rather than
being blocked") didn't work.

**Fixed**: the manual-tick restriction now exempts `quick_payment` specifically
when `campaign_projects.is_barter` is true.

### 5. The wrong stage was checked at completion for `short_pay_before`

Flagged in the prior review, still present: `confirm_completion` found "the
terminal payment stage" by **position** (`stages[length - 2]`), which is
`final_payment` for the full flow and `quick_payment` for `short_pay_after` —
but for `short_pay_before` (whose order is `quick_agreement → quick_payment →
quick_delivery → project_completed`), the stage before completion is
**delivery**, not payment.

**Fixed**: [`paymentGateStage()`](../../apps/web/src/lib/project-stage-items.ts)
finds the stage BY NAME — the one carrying the actual payment-gate item —
rather than by position. Pinned with a unit test
(`tests/unit/project-stage-items.test.ts`) covering all three flows, since the
full flow has three `is_gate` stages and the fix has to pick the *last* one,
not the first.

### 6. C6's live-campaign cap returned a raw 500 under the obvious real-world case

The route-level check (`requireLiveCampaignQuota`) reads a **60-second cached**
entitlements snapshot. A brand publishing three or four campaigns back to back
— the actual scenario the cap exists for — has every one of those calls read
the *same* stale "0 live campaigns" count, so the route-level check passes all
of them. The database trigger (the real, uncached backstop) correctly refused
the fourth — but nothing mapped its exception to a clean response, so the
brand got an unexplained 500 instead of "you're at your limit."

**Fixed**: the campaigns PATCH route now maps `campaign_quota_exceeded` to a
402, the same way the existing deal route already does for
`project_quota_exceeded`.

### 7. `releaseWeeklyQuota` crashed instead of running

My own code, caught by my own test before it shipped: supabase-js's query
builder is a `PromiseLike`, not a real `Promise` — it has `.then()` but not
`.catch()`. Chaining `.catch()` directly on it throws `TypeError: ...catch is
not a function`. **Fixed** with a real `try/catch`.

---

## What C6 (campaign limits) now actually does

This was the specific gap flagged twice in prior status checks — the columns
existed, nothing read them. Now:

- **`requireLiveCampaignQuota`** — gates the `draft → live` transition. Reads
  the real live count, refuses with 402 at the free limit. Backed by
  `enforce_campaign_quota_trg`, a `BEFORE UPDATE` trigger with the same
  advisory-lock pattern as the existing project cap.
- **`requireWeeklyQuota`** / **`releaseWeeklyQuota`** — atomic consume-then-write
  for campaign applications, truncated to the week rather than the month
  (`consume_weekly_quota` / `release_weekly_quota`, migration 131). A
  duplicate-application 409 correctly gives the unit back rather than
  charging a creator for an application that was refused.
- **`get_entitlements()`** now reports `liveCampaigns` / `applicationsPerWeek`
  in `limits`, `freeLimits`, and `usage` — this rewrite is also the thing that
  almost regressed migration 117's `projectConversions` fields; caught before
  it shipped, and the migration file now carries a comment warning the next
  person not to copy an old version of this function as a starting point.
- The campaigns PATCH route also now: rejects a brief under 50 characters
  correctly (fixed a bug where it compared `updates.deliverables` to itself
  instead of falling back to the existing value), requires at least one
  platform before publishing, and defaults `expires_at` from
  `campaign_default_days` when the brand doesn't set one.

## Documents can now actually be downloaded

Beyond the RLS fix above, there was no way to get the PDF bytes at all —
`file_url` was always null and no route re-rendered from the stored snapshot.
Added:

- `GET /api/projects/[id]/documents/[docId]` — re-renders the PDF from the
  frozen `snapshot` jsonb on every request (never stores the file, consistent
  with "regenerating gives back the same document").
- `POST .../[docId]/token` — mints a 10-minute, single-document signed link
  for mobile, which can't attach an `Authorization` header the way web's
  `fetch` can. The signing key is derived from
  `SUPABASE_SERVICE_ROLE_KEY` via HMAC rather than a new secret, so no new
  environment variable is needed in any deployed container.
- Web: clicking a document row now actually downloads it (blob URL, new tab).
- Mobile: [`project-documents.tsx`](../../apps/mobile/components/project-documents.tsx)
  lists documents and opens them via `expo-web-browser` using the signed link.

## Mobile parity closed

| Task | What shipped |
|---|---|
| Navigation bug | `campaigns.tsx` tapped through to `/projects/${campaignId}` — a dead link, since campaign ids are UUIDs and project ids are bigints. Fixed to `/campaigns/${id}`. |
| Campaign detail (C2/C3/C4) | New screen: full brief, apply form (creator), applicant list with shortlist/decline/**accept & message** (business) — the accept action navigates straight into the resulting conversation. This was **entirely missing**; the list screen had nowhere to send a tap. |
| S1 — creator level | The public-profile API already returned `creatorLevel`; mobile's creator screen never rendered it. Added a badge next to the verified badge. |
| S3 — favourites | Save/unsave button on the campaign detail screen, using the `saved_items` endpoints (also newly added to the shared API client). |
| S5 — review scores | Both web's review modal and mobile's `project-reviews.tsx` only ever sent `{rating, comment}` — the four criteria columns migration 128 added were accepted by the route but never collected by any UI. Both now collect and submit all four. |
| B3 — documents | New section on the mobile project screen (see above). |
| S4 — funnel | Web only — see below. |

`LAST_COMMIT_TIME` was bumped to `2026-08-27T00:00:00Z`; **update it to the
real commit timestamp when you actually commit** (see below).

## S4 — the networking funnel

`get_collaboration_stats()` already returned everything needed, including
`requests_sent` since migration 130. Added `GET /api/stats/funnel` (a
self-scoped read of that same RPC) and a four-number card at the top of
`/dashboard/activity` — requests sent, accepted, became projects, completed.
**Web only.** Mobile has no equivalent screen yet; there's no dedicated
"activity" destination on mobile to hang it from without a small IA decision,
which felt like the wrong call to make unilaterally in this pass.

---

## The proof: `tests/e2e/phase8-r1-features.mjs`

60 assertions, all passing, confirmed to re-run cleanly a second time without
manual cleanup. This is the test four separate status reports were missing —
short-term projects had been marked "done" three times without ever being run
end to end. It now drives, against the real server:

- Both short flows (`short_pay_after`, `short_pay_before`) through every
  stage, with a real Razorpay test-mode payment and a real signed webhook.
- The barter path, including the exact manual-tick bug it exists to prevent.
- A direct proof that the migration 120 payment guard fires **at the database
  layer**, independent of any route — by forcing a non-barter project's stage
  directly via SQL and confirming the trigger, not application code, refuses
  it.
- The full campaign loop: draft → brief-too-thin refused → no-platform
  refused → publish → cap enforced on the 4th → board visibility → apply →
  duplicate refused without burning a quota unit → weekly cap proven directly
  against the SQL primitive (impersonating a real user via
  `SET LOCAL request.jwt.claim.sub`, not the service role) → accept →
  conversation → the normal terms-proposal flow continuing from there.
- Document issue, session-auth download, signed-token download, and a check
  that a token minted for one document is rejected against another.
- Review criteria round-trip, favourites round-trip, funnel sanity.

Run it any time with:

```bash
node --env-file=apps/web/.env.local tests/e2e/phase8-r1-features.mjs
```

It needs a dev server running with `SUBSCRIPTIONS_ENABLED=true` (already the
case in `.env.local`), and turns no email switch itself — turn
`NOTIFY_EMAILS_ENABLED` off before running and back on after, same as every
other phase (the personas hard-bounce).

There's also `scripts/r1-status.mjs`, extended this session to check for
everything above:

```bash
node --env-file=apps/web/.env.local scripts/r1-status.mjs
```

---

## What's still genuinely open

- **S2, the display half.** Creating-since is now settable on both platforms
  (mobile added this session), but it is **still not shown anywhere** — not on
  web's public profile, not on mobile's. The data flows through
  `get_public_influencer()`, a large, heavily-used RPC (5.5KB of SQL) that
  every profile view depends on. Adding one field to it is real but not
  trivial work, and touching it without time to verify the full blast radius
  felt like the wrong trade this session. Small, contained, worth a dedicated
  pass.
- **B4, tax invoices** — still correctly parked on the supplier/GST question
  (Q1). Nothing to do here until that's answered.
- **`release_quota()` (monthly)** — found while fixing its weekly twin: the
  *monthly* version (`requests.send`) has never been called from any route
  either, meaning a failed request-send can burn a monthly unit for nothing.
  Pre-existing, unrelated to this session's work, outside R1's scope — flagging
  it since it's the same bug class fixed here for the weekly meter.
- **The 60-second entitlements cache** vs. rapid sequential campaign
  publishes — the safety property holds (the database trigger always catches
  it), but a brand who checks their own campaign count right after hitting the
  cap could see a stale "still under" number for up to a minute. Cosmetic, not
  a hole.
- **S4 on mobile** — no funnel screen yet, per above.
- Two review documents from earlier in this session
  (`R1_LANE1_HANDOVER_2026-08-27.md`, `R1_STATUS_CHECK_2026-08-27b.md`) are
  still sitting uncommitted in `docs/operations/` — keep or discard as you like.

---

## What you need to do

**Nothing is committed.** Every change described above is sitting in the
working tree. Review it, then:

```bash
git status
git add -A
git commit -m "fix: R1 completion pass — C6 enforcement, short-project completion bugs, mobile parity"
```

Split it into more than one commit if you'd rather keep the bug-fix migrations
separate from the mobile UI work — nothing here depends on being one commit.

**Before you push to a shared branch**, restart the dev server once with a
clean environment and re-run both:

```bash
node --env-file=apps/web/.env.local scripts/r1-status.mjs
node --env-file=apps/web/.env.local tests/e2e/phase8-r1-features.mjs
```

Both were green when this report was written; re-running costs a couple of
minutes and confirms nothing shifted between then and when you commit.

**Nothing here needs a business decision except B4** (still waiting on Q1) —
everything else was a code fix, a missing test, or a missing screen, and all
of it is done.
