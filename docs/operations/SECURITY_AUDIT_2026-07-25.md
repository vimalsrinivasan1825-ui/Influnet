# Influnet — Security Audit Report

**Run:** run-1 · **Date:** 2026-07-25 · **Target:** `/Users/macbook/Downloads/Library/PROJECTS/Influnet`
**Method:** `cloudflare/security-audit-skill@security-audit`, six phases, run inline
(single-auditor rather than fanned out to subagents).
**Scope:** whole codebase — 46 API routes, 70 migrations, RLS/grants, payments, uploads,
chat, admin, public profiles, client-side sinks.

---

## Summary

The infrastructure-level security of this codebase is **good**, and better than typical
for a product at this stage. The database is doing the heavy lifting correctly: RLS is on
everywhere, PII is locked down with column-level grants rather than trusted to application
code, and migration 070 closes privilege escalation with three independent layers
(REVOKE + column allow-list + trigger guard). No SQL injection, no XSS, no SSRF, no
insecure deserialization, no secret leakage into the client bundle. Webhooks verify HMAC
signatures with constant-time comparison and fail closed.

**The real exposure is one layer up: the mutual-consent state machine.** Influnet's core
promise to a creator is "every step is on the record and neither side can move alone."
Four findings break that promise. In each case a *project participant* — not an outsider —
can act past a boundary the product explicitly enforces in its own UI: forge the other
party's stage sign-off, tick the other party's approval gate, silently rewrite agreed
deliverables, or open a payment gate with ₹1. These are not theoretical; each has a
concrete request sequence, and the consequences land on creators (unpaid work, fabricated
approval evidence in a dispute).

One finding is cross-tenant and needs no relationship at all: the Cloudinary upload
signer lets any authenticated user overwrite any other user's profile image.

**Counts:** 3 HIGH · 5 MEDIUM · 0 CRITICAL · 4 hardening notes.
Nothing here is remotely exploitable without an account, except F6 (anon).

---

## Findings

### F1 — HIGH — Either party can forge the counterparty's stage sign-off and advance the project alone
**File:** `apps/web/src/app/api/projects/[id]/route.ts:532-566` (`PATCH`, `update_stage`)

The `update_stage` action merges caller-supplied JSON straight into
`campaign_projects.stage_progress[stage_key]`. It sanitises exactly three keys:

```js
delete sanitizedUpdates.status;
delete sanitizedUpdates.started_at;
delete sanitizedUpdates.completed_at;
```

But the bilateral sign-off state lives in that *same* JSONB object, under
`owner_signoff_at`, `creator_signoff_at`, `owner_signoff_by`, `creator_signoff_by`,
`skip_proposed_by`, `skip_proposed_at`. None are sanitised. The `signoff` action
(line 258) then reads the counterparty's key back out of that object to decide whether
both sides have agreed:

```js
const bothSigned = !!entry[myKey] && !!entry[otherKey];   // otherKey is attacker-writable
```

**Attack (creator advancing without the brand):**
1. `PATCH /api/projects/42` → `{"action":"update_stage","stage_key":"final_approval","updates":{"owner_signoff_at":"2026-07-25T10:00:00Z","owner_signoff_by":"<brand-uuid>"}}`
2. `PATCH /api/projects/42` → `{"action":"signoff"}`
3. `bothSigned` is true → the project advances to `final_payment`, an activity-log entry
   is written saying *"both sides agreed"*, and the brand is notified that the stage moved.

The same trick works on the skip flow: forge `skip_proposed_by: "<counterparty-uuid>"`,
then call `confirm_skip`. The `proposedBy === user.id` check passes because the forged
value is the *other* user's id, and the stage is skipped with no proposal ever made.

**Impact.** Complete defeat of bilateral consent for every mutual-sign-off stage
(everything except `sent_for_review`, `final_payment`, `project_completed`). Worse than
the state change itself: `stageSignoffAt()` renders the forged timestamp in the UI and the
timeline records "both sides agreed", so the audit trail actively **fabricates the
victim's approval**. In a payment dispute that record is the evidence.

**Not exploitable for money directly** — payment gates live in the separate
`project_stage_items` table and still hold (see F2 for the part that doesn't).

**Fix.** Replace the deny-list with an allow-list. Only the presentational fields belong
here:
```js
const ALLOWED_STAGE_FIELDS = ['notes', 'meeting_link', 'deliverables'];
const sanitizedUpdates = Object.fromEntries(
  Object.entries(updates).filter(([k]) => ALLOWED_STAGE_FIELDS.includes(k))
);
```
Better still, move sign-off out of the client-writable JSONB into dedicated columns or a
`project_stage_signoffs` table with an RLS policy of `auth.uid() = signed_by`.

---

### F2 — MEDIUM — Approval-gate checklist items ignore `owner_role`; either party can tick the other's gate
**File:** `apps/web/src/app/api/projects/[id]/stage-items/route.ts:69-134` (`PATCH`)

Each checklist row carries an `owner_role` (`business` | `creator` | `both`). The UI
enforces it — `apps/web/src/app/dashboard/projects/[id]/page.tsx:667`:

```js
const canToggleThis = canToggleStage && (it.owner_role === 'both' || it.owner_role === userRole) && !paymentLocked;
// title: `Only the ${roleLabel(it.owner_role)} can mark this`
```

The server never checks it. The PATCH handler validates only `item_id` + `done`, then
applies a payment-gate guard scoped to `stage_key IN ('advance_payment','final_payment')`
— by design, approval gates are excluded. So a **creator can tick the brand's approval
gates**: *"Brand approved the concept"* (`content_confirmation`, `is_gate`) and
*"Brand approved final content"* (`final_approval`, `is_gate`).

**Attack.** `PATCH /api/projects/42/stage-items` → `{"item_id":"<brand-approval-uuid>","done":true}`. Returns 200.

**Chained with F1**, a creator single-handedly records the brand's final approval and
moves the project to `final_payment` — the brand's own green light, given without them.

**Impact.** The UI tells the user a rule that the server does not enforce: textbook
client-side-only authorization. Confined to project participants, hence MEDIUM alone,
but it is the second half of F1's chain.

**Fix.** Re-check `owner_role` server-side before the update:
```js
if (item.owner_role !== 'both' && item.owner_role !== userRole) {
  return jsonError(403, `Only the ${item.owner_role} can mark this step done.`);
}
```
(`userRole` is already derivable — `project.owner_user_id === user.id ? 'business' : 'creator'`.)

---

### F3 — HIGH — Any authenticated user can overwrite any other user's uploaded images
**Files:** `apps/web/src/app/api/uploads/sign/route.ts:10-55`,
`apps/web/src/lib/storage/upload-client.ts:13-44`

The signer accepts an unvalidated client string and signs it as the Cloudinary
`public_id`, together with `overwrite=true`:

```js
const BodySchema = z.object({ purpose: z.enum([...]), hash: z.string().optional() });
...
if (parsed.data.hash) {
  paramsToSign.public_id = parsed.data.hash;
  paramsToSign.overwrite = 'true';
}
```

`hash` is meant to be the SHA-256 of the file (content-addressed dedup, computed in
`computeFileHash`), but nothing binds it to the file, to the caller, or to any format —
no regex, no length limit, no ownership check. The resulting `public_id` appears verbatim
in the delivered URL (`res.cloudinary.com/<cloud>/image/upload/v.../influnet/avatars/<hash>`),
which is rendered publicly on every creator profile.

**Attack.**
1. Open any creator's public profile `/c/victim`, read their avatar URL, extract the hash.
2. `POST /api/uploads/sign` → `{"purpose":"avatar","hash":"<victim-hash>"}` → returns a
   valid signature for that exact `public_id` with `overwrite=true`.
3. `POST https://api.cloudinary.com/v1_1/<cloud>/auto/upload` with that signature and any
   file of the attacker's choosing.
4. The victim's avatar — everywhere it is referenced, including their public profile and
   media kit — now serves the attacker's content.

Because `hash` may contain `/`, the server-chosen `folder` is not a boundary either: the
attacker can target `influnet/project-updates` assets (campaign deliverables — i.e.
proof-of-work in a payment dispute) from the `avatar` purpose. `auto/upload` also accepts
non-images, so the same primitive hosts arbitrary files on the company's Cloudinary domain.

**Impact.** Cross-tenant stored-content overwrite with no prior relationship to the
victim — profile defacement on a creator marketplace (direct reputational harm) and
integrity loss on deliverable assets. Only a free account is required.

**Fix.** Validate the hash and namespace it per user:
```js
hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
...
paramsToSign.public_id = `${user.id}/${parsed.data.hash}`;
```
The per-user prefix keeps dedup working within an account while making cross-user
collision impossible. Consider dropping `overwrite` entirely and relying on Cloudinary's
`unique_filename=false` + idempotent re-upload.

---

### F4 — HIGH — `update_project` silently rewrites agreed deal terms, bypassing the change-request consent flow
**File:** `apps/web/src/app/api/projects/[id]/route.ts:569-585`

The codebase implements an explicit propose → notify → accept/reject loop for changing
deal terms (`project_change_requests`, migration 063, route
`apps/web/src/app/api/projects/[id]/change-requests/route.ts`). Its `EDITABLE_FIELDS` are
`title, description, deliverables, budget, advance_amount, due_date`, each length-validated,
each change snapshotted in a `before` column, each notified to the counterparty.

The `update_project` action on the project PATCH writes three of those same fields
directly:

```js
if (title !== undefined) updateData.title = title;
if (description !== undefined) updateData.description = description;
if (deliverables !== undefined) updateData.deliverables = deliverables;
```

No counterparty consent. No notification. No `logActivity` entry. No length limits (the
Zod schema is a bare `z.string().optional()` while the change-request path caps
description/deliverables at 4000). Any participant, at any stage.

**Attack.** Brand and creator agree "3 Reels, ₹50,000". The creator delivers and the
project sits at `final_approval`. The brand sends
`PATCH /api/projects/42` → `{"action":"update_project","deliverables":"10 Reels + 5 static posts + 30-day usage rights"}`.
The project record — the artefact both sides rely on as the agreement — now reads
differently, with nothing in the timeline showing it changed, and the brand refuses final
payment citing unmet deliverables.

**Impact.** Defeats the explicit consent boundary the product builds for exactly these
fields, and does it silently. The creator's protection against scope creep is the record;
this rewrites the record. Budget is not reachable this way, which caps it below critical.

**Fix.** Remove `update_project` and route all term edits through `change-requests`. If a
direct edit must stay for pre-acceptance drafts, restrict it to
`created_by_user_id === user.id AND status === 'pending_acceptance'`, add the same length
limits, and write an activity entry.

---

### F5 — MEDIUM — Payment gates open on any captured amount, not the agreed one
**Files:** `apps/web/src/app/api/projects/[id]/payments/route.ts:15-19,70-74`,
`apps/web/src/app/api/payments/webhook/route.ts:71-92`

The order amount comes from the client and is never compared to the project's agreed
`budget` / `advance_amount`:
```js
amount_rupees: z.number().positive().max(10_000_000).optional(),
...
const rupees = amount_rupees ?? Number(project.budget);
```
The webhook then flips the ledger row to `paid` and auto-completes the stage's gate item
purely on `stage_key` + `is_gate` + `done_at IS NULL` — the amount is used only to format
the notification text. `stage-items` PATCH likewise accepts any `status='paid'` row.

**Attack.** The brand posts `{"stage_key":"advance_payment","amount_rupees":1}`, pays ₹1
through genuine Razorpay checkout. The signed webhook marks the advance gate **done** and
the project can advance out of `advance_payment` — the gate whose entire purpose is
"the creator does not start work until the deposit lands."

**Impact.** The creator begins production believing the advance was honoured. Detection is
possible — the notification does say "₹1 advance received" — which is what keeps this at
MEDIUM rather than HIGH. Razorpay prevents *under*paying a fixed order, so the flaw is
ours: we let the payer choose the order amount for a gate with an agreed value.

**Fix.** Derive the expected amount server-side and reject mismatches:
```js
const expected = stage_key === 'advance_payment'
  ? Number(project.advance_amount ?? project.budget)
  : Number(project.budget) - Number(project.advance_amount ?? 0);
if (!amount_rupees || Math.round(amount_rupees * 100) !== Math.round(expected * 100)) {
  return jsonError(400, 'Payment amount must match the agreed amount for this stage.');
}
```
And in the webhook, verify `entity.amount === payment.amount` before opening the gate.

---

### F6 — MEDIUM — Anonymous callers can inflate any creator's profile-view analytics without limit
**Files:** `supabase/migrations/044_profile_views.sql:1-25`,
`apps/web/src/app/c/[username]/page.tsx:75-78`

`record_profile_view(p_influencer_user_id, p_viewer_user_id)` is `SECURITY DEFINER` and
`GRANT EXECUTE ... TO anon`. It inserts a row into `profile_views` on every call, with no
rate limit, no dedup, no throttle, and no verification that a page was actually viewed.
The creator's `user_id` needed as the argument is returned by the public
`get_public_influencer` RPC, so it is trivially discoverable.

**Attack.** `POST https://<project>.supabase.co/rest/v1/rpc/record_profile_view` with the
anon key (published in the client bundle by design) and `{"p_influencer_user_id":"<uuid>"}`,
in a loop. Every call adds a row.

**Impact.** Two distinct harms. (1) **Analytics integrity** — creators price themselves and
pitch brands on these numbers; a competitor can inflate or a creator can self-inflate
their own view count arbitrarily. (2) **Unbounded storage growth** on an append-only table
from an unauthenticated endpoint. The page also calls this on the owner's *own* visits
(`isOwner` is computed but never used to gate the call) and on every crawler hit, so the
metric is inflated even without an attacker.

**Fix.** Gate the call behind `isOwner === false`; add a short-window uniqueness key
(hashed IP + creator + day) as a `UNIQUE` index with `ON CONFLICT DO NOTHING`; and move
the RPC behind an authenticated API route with `enforceRateLimit`, or keep it anon but
add a per-IP limiter in Postgres.

---

### F7 — MEDIUM — IP rate limiting is bypassable via a spoofed `X-Forwarded-For`
**File:** `apps/web/src/lib/rate-limit.ts:121-128`

```js
const xff = req.headers.get('x-forwarded-for');
if (xff) return xff.split(',')[0]!.trim();   // left-most hop = client-controlled
```

The left-most XFF entry is supplied by the caller, not the proxy. Every limiter that does
not pass an explicit `key` therefore keys on an attacker-chosen string — including the
unauthenticated ones: `scrape:instagram` (5/min), and username checks.

**Attack.** `for i in $(seq 1 5000); do curl -H "X-Forwarded-For: 1.2.3.$i" "https://app/api/auth/scrape-instagram?handle=x$i"; done` — every request lands in a fresh bucket.

**Impact.** Direct financial: `/api/auth/scrape-instagram` spends paid Apify/HikerAPI
credits per call and holds a 60s `maxDuration` serverless invocation. Unbounded burn plus
provider-quota exhaustion, which would break signup for real creators. Authenticated
limiters that pass `key: user.id` are unaffected.

**Fix.** Trust only the platform-injected header and prefer the right-most hop:
```js
const vercel = req.headers.get('x-vercel-forwarded-for');
if (vercel) return vercel.trim();
const xff = req.headers.get('x-forwarded-for');
if (xff) { const hops = xff.split(',').map(s => s.trim()); return hops[hops.length - 1]!; }
```
Adjust the hop index to the actual proxy depth (Azure Container Apps differs from Vercel).

---

### F8 — MEDIUM — Blocking a user has no effect anywhere in the product
**File:** `apps/web/src/app/api/blocks/route.ts` (the only file that references `user_blocks`)

`POST /api/blocks` writes to `user_blocks` and `GET` reads it back. A repo-wide grep for
`user_blocks` outside that one route returns **nothing**. No collab-request path, chat
path, profile-view path, project path or discovery query consults it.

**Attack.** A brand harasses a creator. The creator blocks them. The brand continues to
send collaboration requests, message them through GetStream, and view their profile —
every path is unchanged.

**Impact.** This is a safety control that the UI represents as working. For a creator
being harassed, a block that silently does nothing is worse than no block button at all,
because they stop taking other protective action. Flagged in the 2026-07-18 audit and
still open.

**Fix.** Enforce at the three chokepoints: reject `POST /api/collabs` when either
direction of `user_blocks` matches; filter blocked users out of `search_influencers` and
`ensure_conversation`; and remove the pair's Stream channel members on block. Long term
this belongs in RLS so no route can forget it.

---

## Hardening notes (not findings)

1. **The stage gate fails open when its table is unreadable.**
   `apps/web/src/app/api/projects/[id]/route.ts:161` — `if (itemsErr) pending = []`, so a
   query error skips the payment/approval gate entirely. Deliberate (migration 054 may be
   unapplied), and an attacker cannot force the error, so it is not a finding. But given
   the hosted DB is documented as running behind migrations, on such a database the
   payment gates do not exist at all. Prefer failing closed with a clear operator error.
2. **Two trigger functions lack `SET search_path`.**
   `supabase/migrations/047_notifications_pipeline.sql:39,61` — `handle_new_collab_request`
   and `handle_update_collab_request` are `SECURITY DEFINER` without a pinned search_path.
   All references inside are schema-qualified and Postgres 15+ removes the default public
   CREATE grant, so this is not exploitable — but it is the only inconsistency in an
   otherwise uniform pattern (the other 30 functions all pin it).
3. **Raw error messages returned to clients** in `/api/auth/register:50`,
   `/api/influencer/dashboard:132`, `/api/business/dashboard:144`, `/api/admin/users:53`
   and others (`error.message` straight into the JSON body). Leaks Postgres/PostgREST
   internals. The `jsonError` helper already does this correctly — use it consistently.
4. **No `middleware.ts`; auth is re-implemented per route.** 12 of 46 routes hand-roll the
   `withAuth` block. All are currently correct, but the next route added is the one that
   forgets. A middleware matcher over `/dashboard` + `/api` (excluding the webhooks and
   public reads) would make the safe path the default.

## What this codebase does well

Worth stating plainly, because it should shape where you spend effort:

- **Migration 070 is exemplary.** Three independent layers against privilege escalation,
  with the reasoning documented inline and the original exploit written down. The
  service-role-only `provision_admin` is the right call.
- **PII is protected at the database, not in application code** (048/053 column grants).
  This is the difference between "we remember to filter" and "it cannot leak."
- **Both webhooks verify HMAC over the raw body with `crypto.timingSafeEqual`, and fail
  closed when the secret is absent.** The Razorpay handler reads `req.text()` before
  parsing, which is the detail most implementations get wrong.
- **Payment gate integrity** (`stage-items/route.ts:97-119`) correctly refuses hand-ticking
  a payment gate when Razorpay is live. The mechanism is right; F5 is only about the amount.
- **The one `dangerouslySetInnerHTML` is genuinely safe**, and no `eval`/`new Function`
  anywhere.
- **Deal-flow RPCs (069/071/072) use `FOR UPDATE` row locks**, check `auth.uid()` against
  the specific participant role, and enforce proposer ≠ responder. The DB-level consent
  logic is stronger than the API-level consent logic — F1/F2/F4 are all cases where the
  API writes state the RPCs would have guarded.

## Coverage

This is run-1 and no prior runs exist. Testing of this methodology shows a single run
finds roughly half of what repeated runs find. Areas covered less deeply and worth a
run-2: the GetStream chat surface (channel membership drift, message history via the
webhook), the Expo mobile client against the same endpoints, the admin verification
decision flow, and `packages/api` client-side envelope handling.
