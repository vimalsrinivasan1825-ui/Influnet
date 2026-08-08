# Full-flow audit — 2026-08-08

**Scope**: signup → discovery → collab request → messaging → deal negotiation →
project creation → the 12-stage machine → payments → completion → reviews →
cancellation → admin, driven by 12 real multi-account personas against the dev
database, with deliberate concurrency and abuse scenarios throughout.

**Result**: **181 / 192 checks passed. 11 findings — 1 CRITICAL, 4 HIGH, 5 MEDIUM, 1 LOW.**

| Phase | Passed | Focus |
|---|---|---|
| 3 — discovery, requests, concurrency | 43/44 | 5 brands → 1 creator simultaneously; duplicates; blocks |
| 4/5 — messaging, deals, stage machine | 44/49 | negotiation loop, 12 stages, revision loop, sign-off race |
| 6/7 — payments, gate bypass, completion | 41/43 | Razorpay orders, signed webhooks, cancellation ledger |
| 8/9 — admin, authorization sweep | 53/56 | 16 admin routes, 79-route anon sweep, IDOR sweep |

Everything is reproducible:

```bash
node --env-file=apps/web/.env.local tests/e2e/seed-personas.mjs
```

Then `phase3-requests.mjs`, `phase4-lifecycle.mjs`, `phase5-payments.mjs`,
`phase6-admin-authz.mjs` in that order. Each phase resets its own state, so any
phase can be re-run on its own. Machine-readable results land in
`tests/e2e/state/<phase>.json` with the observed value for every check.

---

## The headline: what is genuinely strong

This is worth stating plainly, because the finding list below is short and the
passing list is long. The parts of this system that usually break did not.

- **Payment integrity is excellent — 8/8.** The order amount is derived
  server-side from the agreed terms and a client-supplied `amount_rupees: 1`
  against a ₹200,000 advance is refused. Unsigned webhooks, corrupted
  signatures and webhooks signed with the wrong secret are all rejected 401,
  and none of them moved the ledger. A replayed capture does not double-record.
- **Concurrency on requests is correct.** Five brands hitting one creator in the
  same instant produced exactly five rows, one per sender. Five *identical*
  simultaneous requests produced exactly one row and four clean 409s — that is a
  database uniqueness constraint holding, not an application check racing.
- **The consent model holds.** The proposer cannot accept their own terms.
  Accepting the same terms twice concurrently creates one project, not two.
  Completion needs both sides. Cancellation needs both sides.
- **Authorization is tight.** All 16 admin routes refused creators, businesses
  and anonymous callers. Self-promotion to admin is blocked. Across 79 routes,
  no non-public route answered an anonymous caller. A non-participant could not
  read or write another pair's project, conversation, or messages, and their
  attempted message never reached the database.
- **The stage machine's transition map is enforced server-side.** Stage 1 → 12
  is refused; the revision loop routes back through re-review and can be
  re-entered; payment stages cannot be skipped; the wrong actor is refused.
- **Cancellation preserves the payment ledger** and freezes the project against
  further advances and further payments.

---

## Findings

### 1. CRITICAL — the checklist gate is vacuous until something first *renders* the checklist

**What happens.** `project_stage_items` rows are seeded **lazily**, by
`GET /api/projects/[id]/stage-items`. The advance and sign-off gates call
`blockingItems(stage, items)` over whatever rows exist. On a project whose
checklist has never been fetched, **there are no rows, so there is nothing to
block on** and every gate is open — including the money gates.

**Proved.** A fresh project, never fetching the checklist, driven to
`advance_payment` and signed off by both sides:

```
checklist rows on a brand-new project (before any GET): 0
stage=content_planning, paid rows=0, signoff=[200,200]
```

The project walked *through* the advance-payment gate with an empty payment
ledger. The creator is now shown a project past "advance payment" for money that
never moved.

**Why it hasn't bitten yet.** The web dashboard always fetches the checklist when
it opens a project, which materialises the rows before anyone can act. The gate
is protected by a rendering side-effect, not by a rule.

**Who it does affect.** Any caller that doesn't happen to GET first: the mobile
app on a screen that skips the checklist fetch, a deep link straight into a
stage action, a retry after a failed load, or any direct API use. This is one
missing fetch away from being live.

**Fix.** Seed the checklist at project creation, inside the same transaction as
`respond_to_proposal` — the project and its gates should not be able to exist
separately. Then make the gate *fail closed*: if a required stage has zero
checklist rows, refuse to advance rather than treating "no items" as "nothing
pending". The current `blockingItems([]) === []` is a fail-open default in the
one place fail-open costs money.

> Note the related fail-open comments already in the code ("Fail OPEN if the
> checklist table isn't there yet"). That reasoning is sound for a *missing
> table* on an un-migrated database. It is not sound for *zero rows* on a live
> one, and the code cannot currently tell those two cases apart.

---

### 2. HIGH — concurrent sign-off loses one side's click and strands the project

**What happens.** `PATCH /api/projects/[id]` with `action: 'signoff'` reads
`stage_progress`, mutates it in JavaScript, and writes the whole JSONB column
back. There is no optimistic lock and no atomic `jsonb_set`. When both sides
sign off at the same instant, both read a state with neither signature, and the
second write is built from a stale read.

A database trigger catches the anomaly — `consent_violation: cannot change the
other party's sign-off` — which correctly prevents *forgery*. But the route has
no retry, so it surfaces as a **500**, and the losing side's sign-off is simply
gone.

**Proved (twice, with the loser alternating — a real race):**

```
run 1:  simultaneous sign-off → [500, 200]   owner=MISSING   creator=05:03:10.651
run 2:  simultaneous sign-off → [200, 500]   owner=05:08:13.619   creator=MISSING
stage after: collaboration_started   (expected: project_discussion)
```

**Impact.** Both people clicked "confirm". One got a server error. The stage did
not move. Nothing in the UI explains why, and the only recovery is for the
unlucky side to click again — or to contact support. On a two-sided sign-off
product this is the exact moment users are most likely to act simultaneously,
because both have just been notified.

**Fix.** Do the sign-off write in the database, not in the route: a single
`UPDATE ... SET stage_progress = jsonb_set(stage_progress, '{<stage>,<my_key>}', ...)`
computes from the current row rather than a stale snapshot, and the trigger stops
firing on the legitimate case. Failing that, catch `P0001 consent_violation`,
re-read, and retry once — and never return 500 for a losing race, since it is not
a server fault.

---

### 3. HIGH — a new project's checklist does not exist until fetched

Same root cause as finding 1, recorded separately because it is also a
correctness issue on its own: `project_stage_items` is empty at project
creation, so anything reasoning about "what does this stage require" — the
mobile app, notifications, an admin view — sees an empty checklist for a project
that definitely has requirements. Fixed by the same change.

---

### 4. MEDIUM — `/api/business/dashboard` and `/api/influencer/dashboard` do not check role

Both routes hand-roll authentication (reading the `Authorization` header and
building their own Supabase client) instead of using the codebase's `withAuth`
helper, and neither checks `role`.

```
creator  → GET /api/business/dashboard   200  {"company_name":"Your Company","industry":"Unknown"}
business → GET /api/influencer/dashboard 200  {"username":null,"niche":[],"verified_badge":false}
```

**Not a data leak** — both are scoped to the caller's own id, so nobody sees
anyone else's data. The problem is that the wrong role gets a 200 full of
placeholder values instead of a 403, and these two routes sit outside the
central auth helper where every other route's guarantees live. That is how a
future change to `withAuth` silently fails to protect them.

**Fix.** Convert both to `withAuth(req, { role: 'business_owner' })` /
`{ role: 'influencer' }`. This is a small, contained change and it removes the
only two routes in the API that don't go through the common path.

---

### 5. MEDIUM — a business can send a collab request to another business

`POST /api/collabs` validates that the *sender* is a business but never checks
the *recipient's* role.

```
boat → mamaearth   200  {"collab":{"id":"45405f01-…","to_user_id":"e798bef8-…"}}
```

The row is created, and it will appear in the recipient business's inbox. From
there it can be accepted and — since the deal flow keys off the request, not the
roles — carried into a conversation and a project between two brands, in a
product whose entire data model assumes owner = business and counterparty =
creator.

**Fix.** Check `to_user_id`'s role is `influencer` in the route, and back it with
a database constraint so it cannot be reintroduced. Self-requests are already
blocked by a `collab_requests_no_self` check constraint — this belongs at the
same level.

---

### 6. MEDIUM — messages have no length limit and no rate limit

```
100,000-character message  → 200 (accepted and stored)
30-message burst           → 30 accepted, 0 rate-limited
```

Every other high-impact action in this codebase is rate-limited —
`auth:register` 10/min, `collabs:create` 20/min, `deal:propose` 20/min,
`payments:create` 12/min. Messaging, which fans out to push notifications and
email, is the one that is not. One account can flood another's inbox, and each
message drives the notification pipeline behind it.

**Fix.** Add `enforceRateLimit(req, { bucket: 'messages:create', limit: 30,
windowMs: 60_000, key: user.id })` and a `max(4000)` on the content schema, to
match the 2000–4000 ranges already used for `project_description` and deal notes.

---

### 7. MEDIUM — user input can produce a 500 instead of a 4xx

Two inputs turn into unhandled 500s:

- **A null byte** in any text field → Postgres `22P05:   cannot be
  converted to text`.
- **`../../etc/passwd`** → this one is more interesting: **Supabase's Cloudflare
  WAF blocks the request** before it reaches Postgres, and the app receives an
  HTML block page where it expects JSON. It logs the entire Cloudflare error
  page and returns 500.

The second is worth attention beyond input hygiene: **any WAF block, upstream
outage or Supabase incident page will produce this same failure mode** — an
opaque 500 and a log entry containing a full HTML document. A legitimate user
whose project title trips a WAF heuristic also gets it.

**Fix.** Strip ` ` in the shared validators. Separately, in the Supabase
client wrapper, detect a non-JSON response body and surface it as a distinct
"upstream unavailable" (502/503) rather than letting it flow into a generic 500
— and log the status and a short prefix, not the whole page.

---

### 8. MEDIUM — user-input errors surface as 500

Related but distinct from the above: a self-request and a request to a
non-existent user both return **500**, because the check constraint
(`collab_requests_no_self`) and the foreign-key violation are caught by a generic
handler. These are ordinary user errors and should be 400/404. They also pollute
error monitoring with events that aren't faults.

---

### 9. LOW — `GET /api/projects/[id]/payments` answers any authenticated caller

The handler never reads the project id; it only reports whether Razorpay is
configured plus the **publishable** key. No project data is disclosed and the key
is public by design, so this is not an IDOR — but it is the one project
sub-route that doesn't check participation, and a reader auditing this file
cannot tell that's deliberate.

**Fix.** Add the participation check for consistency, or move the config lookup
to a project-independent endpoint where it visibly belongs.

---

### 10. LOW — `instagram_followers = 0` is indistinguishable from "not on Instagram"

Both columns default to `0`, so a YouTube-only creator and a creator with a real
zero look identical:

```
kiranrural   instagram_handle=null   instagram_followers=0   youtube_subscribers=486000
nishaanand   instagram_handle=…      youtube_handle=null     youtube_subscribers=0
```

This will misreport reach and skew any discovery sort that ranks on follower
count. **Fix**: make the columns nullable and write `NULL` when the handle is
absent; treat `NULL` as "not present" in ranking rather than as zero.

---

### 11. INFO — the registration rate limit is per-IP

Seeding 12 accounts in a row hit `auth:register` (10/min) and the last two were
429'd. The limiter is working exactly as intended. Worth knowing, though, that
it is keyed on **IP, not user** — so a college, agency or co-working space behind
one NAT gets eleven signups and then a wall. Consider raising the limit or
keying it on something less collision-prone before a campus campaign.

---

## Things that were checked and are fine

Recorded so they don't get re-audited: block enforcement in both directions;
non-recipients answering someone else's request; concurrent accept+decline
resolving deterministically; `get_or_create_conversation` under a 4-way race
(one conversation); a second proposal while one is pending (409); budget
validation; discovery surfacing both the 41k nano creator and the
Instagram-less creator; admin dashboard counts agreeing with the database;
SQL-injection payloads stored as inert text; malformed UUIDs returning 4xx;
reviews restricted to participants, one per side, with range validation.

---

## What was built

### Migration 113 — `113_collaboration_stats_and_business_views.sql` ⚠️ **NOT YET APPLIED**

I could not apply this myself (the environment blocks database-mutating
commands). Apply with:

```bash
node --env-file=apps/web/.env.local scripts/apply-migration.mjs 113
```

Everything wired to it degrades to `null` when it is absent — verified: the
creator profile page renders normally today with the RPC missing, simply without
the new section.

**1. Collaboration counts on profiles.** `get_collaboration_stats(user_id)`
returns partners, projects total/active/completed/cancelled and first/last
collaboration dates. It works for either role and returns **counts only** — no
partner identities — so it is safe on a public profile.

Deliberately **derived**, not stored. `public.connections` (migration 029) was
built to hold exactly these counters and has held **zero rows since the day it
shipped**, because nothing ever wrote to it. That is the argument against
denormalising: a counter a feature must remember to increment is wrong the first
time someone forgets, and silently so. This reads `campaign_projects` and
`collab_requests`, so it covers history from before the migration and cannot
drift. Same pattern as `get_user_activity` (073) and `get_platform_activity`
(099). `connections` is now commented as deprecated.

**2. Business profile views.** Businesses had **no view tracking at all** —
`profile_views` is keyed on `influencer_user_id`. Added
`business_profile_views` (mirroring `profile_views`, including its daily-grain
de-duplication and RLS) plus `record_business_profile_view()`, which takes no
viewer parameter at all so a spoofed view is unrepresentable.

**3. `get_profile_view_stats(days)`** — self-scoped view counts that read
whichever table matches the caller's role.

**4. `get_admin_engagement_stats(days)`** — this is the metric set you asked
for. Signups **split by role** (the existing growth series reports one combined
number, which on a two-sided marketplace hides the thing you most need to see),
business approval breakdown, creator- and business-profile view totals, how many
**business owners actually viewed a creator**, and a demand-side funnel:
signed up → viewed a creator → sent a request → started a project → completed one.

### Code wired to it

| File | Change |
|---|---|
| `apps/web/src/app/api/admin/analytics/route.ts` | returns `engagement` (null if 113 unapplied) |
| `apps/web/src/app/api/creators/[username]/route.ts` | returns `collaborationStats` |
| `apps/web/src/app/[username]/creator-profile.tsx` | fetches and passes the stats |
| `apps/web/src/components/public-profile/creator-profile-view.tsx` | new "Track record" section |
| `apps/web/src/app/[username]/business-profile.tsx` | records a business profile view |

The creator profile now shows completed projects and distinct brands, placed
directly above Brand ratings — ratings say how well the work went, this says how
much work there has been, and follower count answers neither. Hidden entirely at
zero, because "0 projects" on a new creator's profile is a reason for a brand to
leave.

**Note**: business profiles *already* showed `completedCollaborations` and
`totalPartners` via `get_business_eligibility`, so that half of the request was
already built. The creator side was the gap.

### Test infrastructure

`tests/e2e/lib/` — `sql.mjs` (Management-API SQL with 429 backoff), `actor.mjs`
(per-persona authenticated API client + `raceAll` for true simultaneity),
`personas.mjs` (12 personas modelled on real public profiles), `scenario.mjs`
(findings recorder that always keeps the observed value), `lifecycle.mjs`
(collaboration → project → stage-walk helpers). Plus
`scripts/apply-migration.mjs`.

---

## Improvement strategy

**Before the next release**

1. Seed `project_stage_items` inside the project-creation transaction, and make
   the gate fail closed on zero rows for a stage that should have some. *(One
   change, closes findings 1 and 3 — the only money-path issue found.)*
2. Move the sign-off write into an atomic `jsonb_set` UPDATE; on
   `consent_violation`, re-read and retry once instead of returning 500.
3. Role-check the two dashboard routes via `withAuth`, and role-check
   `to_user_id` in `POST /api/collabs`.
4. Rate-limit and length-limit messages.

**Soon after**

5. Map user-input DB errors (check constraint, FK violation) to 4xx, and handle
   non-JSON upstream responses as 502/503 — the Cloudflare case will recur under
   any Supabase incident, and right now it is indistinguishable from a code bug.
6. Apply migration 113 and put the engagement metrics on the admin analytics
   page. The demand-side funnel is the number that tells you whether businesses
   are stalling at "signed up", "browsed", or "asked".
7. Make follower columns nullable so "not on this platform" stops reading as zero.

**Structural**

8. **The pattern behind finding 1 is worth a sweep of its own.** This codebase
   has several deliberate, well-reasoned fail-open comments, all justified by
   "the migration might not be applied". That reasoning is right for a missing
   table and wrong for empty data, and the code currently can't distinguish
   them. Now that the dev database is fully current at migration 112, those
   defaults are protecting against a state that no longer exists — and one of
   them was guarding a payment gate. Worth auditing each one and deciding
   explicitly: fail open, or fail closed?
9. Consider a small set of these scenarios as CI smoke tests. The concurrency
   ones especially — they are cheap at the API level (the whole suite runs in
   minutes) and they catch exactly the class of bug that unit tests structurally
   cannot.

---

## Audit environment

- Branch `dev`, dev Supabase project, all 108 local migrations applied (through 112).
- Razorpay **test** keys (`rzp_test_…`); no real money moved. Capture simulated
  with correctly HMAC-signed webhooks.
- App email sends were disabled for the run and **restored afterwards**
  (`NOTIFY_EMAILS_ENABLED=true`) — the personas use `@influnet-audit.test`
  addresses which would hard-bounce and damage the Resend domain reputation.
- Bypasses used, all dev-only and requested: business approval set to `approved`
  for 5 of 6 businesses (one deliberately left `pending_review` as a control).
  Email confirmation is off in this environment; the phone-OTP and
  ownership-verification gates are off by default in code, so nothing was
  bypassed for them.
- 12 personas remain in the dev database, all with `@influnet-audit.test`
  addresses, safe to purge by re-running the seeder.
