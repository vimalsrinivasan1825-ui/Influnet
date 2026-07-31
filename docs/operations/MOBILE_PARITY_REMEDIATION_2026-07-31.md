# Mobile-first parity remediation — what shipped, and what still needs you

**Date:** 2026-07-31
**Branch:** `fix/mobile-parity-core-gaps` (branched from `dev` @ `53cbfa0b`)
**Source:** every item in `CORE_LOGIC_GAP_AUDIT_2026-07-31.md`
**Commits:** 9, one per item or tightly-related pair

---

## 1. Result

All ten backlog items are closed. Nine shipped; one was withdrawn as a bad
finding (S1 — see §3).

| Suite | Before | After |
|---|---|---|
| Unit tests | 233 passing | **258 passing**, 0 failing |
| `turbo typecheck` | 7/7 clean | **7/7 clean** |
| `expo export` | — | **iOS and Android both build** |

Every mobile change was verified with a real `expo export`, not just `tsc` — a
bundle that typechecks can still fail to build.

**Revised confidence: web ~93, mobile ~88** (was 90 / 68). The mobile number
moved because the two things holding it down — a project that could not finish
and a verification flow that could not succeed — are both fixed.

---

## 2. What shipped

### Blockers

**B1 — Mobile can now finish a project.** `sent_for_review` is neither the
completion stage nor a sign-off stage, so it fell through both footer branches
and rendered `null`. A project run from the phone reached stage 8 of 12 and
stopped: no button to approve the draft, none to send it back. Added the fork,
mirroring web exactly — gated on the required checklist items, shown only to the
stage's actor, with the creator told who they're waiting on.

**B2 — Mobile ownership verification works.** Three stacked defects, all of which
had to go: every call omitted the handle (POST → hard 400, GET → a misleading
`{status:'none'}` that rendered as "not started" even for a verified creator);
confirm read `status` from a response shaped `{ verified }`; and nothing fired
the trust pipeline afterwards, so a creator who completed the whole handshake sat
at "unverified" with nothing queued. The handle is now a **required parameter**
on both helpers rather than something three call sites each forgot.

### Logic gaps

**G1 — Advancement follows the state machine, not array order.** Three separate
paths used `STAGES[currentIdx + 1]`. For eleven stages that's the same answer;
for `revisions` it wasn't. Its only legal transition is *back* to
`sent_for_review`, so all three skipped the re-review — the brand approved final
content having never seen the resubmitted draft. The `advance` path *with* an
explicit stage_key validated against the map and would have rejected the same
move, so the API contradicted itself depending on which button you pressed.

**G2 — Nobody gets stranded signed-in with no profile.** The wizard answers were
never lost: all four wizards pass them to `signUp` as `options.data`, so they
live on the auth user server-side. `/api/auth/register` now rebuilds from that
when the body carries no `role`, and both clients call it on any
"session but no profile" state. Web's localStorage replay was same-browser-only;
this needs no client storage at all and works across devices.

**G3 — The approval precaution fails safe.** Both routes swallowed the error from
reading `business_profiles.approval_status` and defaulted to `null`, which both
clients render as "no badge". On a DB without migration 094 that meant the gate
was gone *and* the warning was invisible. Unreadable now reports `'unknown'`,
which both clients already show the precaution for.

**G4 — Unapproved businesses behave the same on both platforms.** Mobile
hard-redirected `pending_review` to a dead-end screen while web gave that same
account the full dashboard. It was wrong in the other direction too: it only
matched `pending_review`, so a *rejected* business — the one state the server
still refuses outreach for — fell through with no warning anywhere. Replaced with
`<ApprovalBanner />`, matching web's copy and dismiss-per-status behaviour.

### Smaller

**S2 — Instagram prefill on mobile signup.** Web opens its creator wizard with a
"Connect" step; mobile asked for name, bio and followers by hand, and never sent
`instagramFollowers` at all — so mobile signups ranked below equivalent web
signups in discovery until their first refresh. The helper also POSTed to a
GET-only route, so it could not have worked regardless.

**S3 — Reviews are guarded.** No length cap and no rate limit, on an endpoint
writing a permanent, public, uneditable rating. Now 2000 chars and 10/min.

**S4 — Completion means paid.** `confirm_completion` checked only that the
project was *at* `final_payment`, never that the gate item was done — the one
stage a project could walk past. The creator is now blocked while the final
payment is outstanding; the business isn't, because they're the payer and
gating them would strand every off-platform settlement.

---

## 3. One finding withdrawn

**S1 was wrong.** I reported "mobile cannot add custom stage checklist items" as
a parity gap. Web can't either — the route exports GET and PATCH only, and
neither client has an add-step UI. `createStageItem` pointed at a POST that has
never existed and would have 405'd; nothing called it.

Removed as dead code rather than built as a feature. The checklist is what the
advancement gate reads, so a user-authored *required* item is a user-authored
gate — that's a product decision, not something to wire up because a helper
happened to exist.

---

## 4. New regression tests (25 added)

Written against the invariants the bugs actually broke, not the fixes:

- `stage-action-coverage` — every stage is terminal, uses sign-off, or has a
  dedicated control. **This is the test that would have caught B1**, and it
  catches the next stage added to `NON_SIGNOFF_STAGES` without controls.
- `stage-transition-integrity` — revisions loops back; every sign-off and skip
  stage has exactly one exit; forking stages are excluded from both consent
  flows; every stage stays reachable by walking the graph.
- `ownership-endpoints` — what actually reaches the wire: the handle in the
  query string and in both POST bodies, the platform default and its override,
  the prefill route as a GET, and that confirm returns `verified` not `status`.
- `registration-recovery` — both wizard payloads pinned verbatim, asserting the
  shared schema accepts them. If a wizard ever collects a required field without
  passing it to `signUp`, recovery would quietly build a half-formed profile.

---

## 5. What I could not do — over to you

Five things, none of them code. Ordered by how much they matter.

### 5.1 Check whether Supabase "Confirm email" is ON — **do this first**

Supabase dashboard → Authentication → Providers → Email → "Confirm email".

It decides whether G2 was a live bug or a latent one, and it changes what you
should test. **Tell me which it is and I'll tell you exactly what to verify.**
`EMAIL_PROGRAM_PLAN_2026-07-31.md:196` recommends keeping it on; the recovery
path now makes that safe on both platforms, which it wasn't before.

### 5.2 Apply migrations 093 and 094 to the hosted DB

Recorded state is applied through 092.

- **094** is the one that matters — it grants creators the ability to read a
  business's `approval_status`. Without it, the precaution badge now shows
  `'unknown'` on *every* business sender (safe, but noisy and uninformative).
  With it, real statuses flow and only genuinely unreviewed businesses are
  flagged.
- **093** is cosmetic (payments realtime).

Neither is destructive. I can't reach the hosted DB from here.

### 5.3 Deploy the phone-OTP Edge Function, if you want the OTP gate live

`supabase/functions/phone-otp` is written but undeployed, and
`NEXT_PUBLIC_PHONE_OTP_ENABLED` gates it. Until both are done the gate is inert —
which is fine, and the recovery path in G2 handles both configurations correctly.
Worth knowing: it's an India-only provider (2Factor).

### 5.4 Cut a new mobile build

Everything in §2 is JS-only, so an **OTA update carries all of it** — no store
submission needed. Two caveats: OTA only reaches builds already on the current
channel, and `EAS "production" still points at the dev backend`, which needs
changing before external testers (that one predates this work).

### 5.5 Real-device testing

I verified logic, types, tests and bundle builds. I could not verify how any of
this *feels* on hardware. The three worth ten minutes each:

1. **Run a project to `sent_for_review` on the phone** and take it both ways —
   request revisions, and approve. This is B1 and G1 together, and it's the path
   that was completely dead.
2. **Ownership verification end-to-end** with a real Instagram account you
   control: get the code, paste it in the bio, confirm, and check the badge
   arrives. Needs a public account.
3. **Sign up on mobile, confirm the email on a different device, log in.** You
   should land in a fully-formed profile. That's G2, and it's the one I most
   want a real run of.

---

## 6. Note on a judgment call

G1 leaves `revisions` as a mutual sign-off stage, so both sides confirm before
the draft goes back for review. That's consistent with every other stage and it
fixes the actual bug, but it does mean the brand acts twice in the review loop.

The alternative — making `revisions` a creator-only "Resubmit draft" action,
which is what `STAGE_ACTOR` and the stage guide both already imply — is arguably
the better product. I didn't make that change unilaterally because it's a
redesign of the stage rather than a fix. Say the word and it's a small change.
