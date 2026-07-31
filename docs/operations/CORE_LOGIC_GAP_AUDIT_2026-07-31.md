# Core logic gap audit — full journey, both devices

**Date:** 2026-07-31
**Branch:** `dev` @ `53cbfa0b`
**Scope:** read-only. No code changed.
**Method:** traced the actual route handlers, RPCs, migrations and both clients
end-to-end. Not a docs review — every finding below was confirmed in source.

Journey traced: signup → email confirmation → phone OTP → social scrape →
ownership + trust verification → public profile → collab request → accept →
conversation → deal terms → project creation → budgets → the 12 stages →
dual-confirm completion → reviews → showcase on the public profile.

---

## 1. Verdict

**The core engine is genuinely strong.** The server-side state machine is the
best part of this codebase: transitions are enforced against a map, both sides
must consent to advance, payment gates can't be hand-ticked when Razorpay is
live, sign-off state is written through an allow-list so neither party can forge
the other's consent, and completion has exactly one door. 233 unit tests pass and
`typecheck` is clean across all 7 packages.

**The gaps are not in the engine — they are in mobile's coverage of it, and in
two seams where a flow can strand a user with no way forward.**

One of them is a hard blocker: **a project managed on mobile cannot get past
stage 8 of 12.**

### Confidence scores

| Module | Web | Mobile | Note |
|---|---|---|---|
| Signup (fields, validation, username, OTP) | 92 | 90 | Server-authoritative; both clients call the same gates |
| Email confirmation → profile creation | 70 | **40** | Orphan-account seam, see G2 |
| Social scrape + snapshot | 88 | 80 | Mobile has no IG prefill at signup |
| Ownership verification (bio code) | 90 | **0** | Broken end-to-end on mobile, see B2 |
| Trust pipeline / verified badge | 93 | 88 | Locked down properly by migration 083 |
| Public profile + showcase | 92 | 88 | Derived from real completed projects, not forgeable |
| Collab request → accept | 88 | 78 | Approval-gate divergence, see G3/G4 |
| Conversation + deal terms | 93 | 90 | Clean propose → accept → project handoff |
| Project creation + budgets | 94 | 90 | Amounts server-derived, never client-set |
| 12-stage machine (server) | 94 | — | Excellent; one transition-map contradiction (G1) |
| 12-stage machine (client coverage) | 92 | **45** | Stage 8 has no UI on mobile at all |
| Payments | 90 | 60 | Pay-on-web is a known, documented stopgap |
| Completion + reviews | 92 | 88 | Dual-confirm enforced in one place |

**Overall readiness: web ~90, mobile ~68.**

Web is close to shippable on core logic. Mobile is not, and the reason is
narrow and fixable — it's two missing screens' worth of work, not a redesign.

---

## 2. Blockers

### B1 — Mobile cannot act on `sent_for_review`. Projects dead-end at stage 8/12. **HIGH**

`apps/mobile/app/projects/[id]/stage/[stage].tsx:559-637` renders the sticky
footer in exactly two cases:

```
isCurrent && isCompletionStage   → completion controls
isCurrent && usesSignoff         → sign-off / skip controls
otherwise                        → null
```

`sent_for_review` is in `NON_SIGNOFF_STAGES` (`packages/core/src/project-stage-guide.ts:88`),
so `usesSignoff` is `false`, and it is not `final_payment`. **It falls through to
`null` — no footer, no buttons, nothing.**

The brand has no way to approve the draft or request revisions. A grep across
the entire mobile app for `sent_for_review`, `'advance'`, "Request revisions" or
"Approve draft" returns **zero hits** — the review fork simply does not exist on
mobile. Web handles it correctly (`apps/web/src/app/dashboard/projects/[id]/page.tsx:1261`,
`isReviewFork`).

A project started and run on the phone reaches stage 8 and stops. The only
escape is opening the web dashboard.

This is the *same bug* that was already fixed one stage over. The comment at
`stage/[stage].tsx:170-175` says, of `final_payment`: *"Without this branch the
final stage rendered NO footer at all, so a project started on the phone could
be carried all the way to final payment and then never finished."* The fix was
applied to `final_payment` and `sent_for_review` was missed.

**Fix:** add an `isReviewFork` branch with two buttons calling
`updateProject(id, { action: 'advance', stage_key: 'revisions' | 'final_approval' })`.
Note `advance` is not in the mobile `act()` action union (`:243-249`) — it needs
adding, and it takes `stage_key`, not the `stage` the screen currently sends.

### B2 — Mobile ownership verification is non-functional. **HIGH**

Already documented in `AUTH_AND_VERIFICATION_PARITY_2026-07-31.md` §3 — **confirmed
still present** at `53cbfa0b`. Re-verified directly:

- `apps/mobile/app/verification.tsx:119` sends `{ action: 'initiate' }` with no
  `handle`. `apps/web/src/app/api/verification/ownership/route.ts:68` returns
  `400 'A handle is required'`. Tapping "Get my code" always fails.
- The GET path (`:36-38`) returns `{status:'none'}` whenever `handle` is absent,
  so the screen can never show a verified claim either.

Because ownership is a prerequisite for auto-verification
(`/api/verification/route.ts:131-143` sets `signals.ownership_verified`), a
mobile-only creator can never earn the badge.

---

## 3. Logic gaps

### G1 — The revision loop skips re-review, contradicting the transition map. **MEDIUM**

`ALLOWED_TRANSITIONS['revisions'] = ['sent_for_review']`
(`packages/core/src/project-lifecycle.ts:27`) — a reworked draft is meant to go
back for review.

But `revisions` is **not** in `NON_SIGNOFF_STAGES`, so it uses mutual sign-off,
and the sign-off branch advances by array index, not by the transition map:

`apps/web/src/app/api/projects/[id]/route.ts:349`
```ts
const ns = STAGES[currentIdx + 1] as string;   // revisions → final_approval
```

So both sides confirm the revisions stage and the project jumps straight to
`final_approval`, **skipping `sent_for_review` entirely**. The brand signs off
final content having never seen the resubmitted draft in the review stage.

Both clients surface this (web `page.tsx:1263`, mobile `stage/[stage].tsx:157`).

Not a security hole — both parties consent — but the state machine contradicts
itself, and the `advance` path and the `signoff` path disagree about what
`revisions` does. The `sent_for_review` stage becomes single-use.

**Fix:** either exclude `revisions` from sign-off (it's a creator-resubmits
stage, like the review fork), or make the sign-off branch honour
`ALLOWED_TRANSITIONS` instead of `currentIdx + 1`.

### G2 — Orphaned auth accounts: signed in, no profile, no recovery. **MEDIUM–HIGH** (conditional)

When Supabase email confirmation is on, `signUp` returns no session, so
`register_profile` cannot run. Web stashes the wizard payload in `localStorage`
and replays it on first login (`apps/web/src/app/login/page.tsx:52-85`). That
works — **only in the same browser**.

Two ways to strand a user:

1. **Cross-device.** Sign up on desktop, click the confirm link on your phone,
   log in there. No `localStorage` → no replay → auth account with no profile row.
2. **Mobile entirely.** `apps/mobile/lib/use-signup.ts:101-103` returns
   `needsConfirmation: true` and **discards the payload**. There is no replay on
   mobile login at all (already flagged as P2-1 in the parity doc).

Neither client recovers from the resulting state:

- Mobile `app/index.tsx:34` — session present, profile null → `<Redirect href="/home" />`,
  straight into the tabs with no profile.
- Web `components/dashboard/shell.tsx:112` — `if (profile)` guards everything;
  when it's null the shell silently sets no role and no redirect.

The user is inside the app, logged in, with nothing behind them and no path back
to the wizard.

**Severity depends on one setting.** If "Confirm email" is currently **off** on
the Supabase project, this is latent. If it's **on** — and
`EMAIL_PROGRAM_PLAN_2026-07-31.md:196` recommends keeping it on — this is live
today. That setting needs checking before anything else here is prioritised.

**Fix:** a "finish setting up your account" route on both clients, triggered by
`session && !profile`. The wizard answers already ride along as auth metadata
(`use-signup.ts:94`, web `page.tsx:254`), so the profile is reconstructable
server-side without the client's localStorage at all — that's the durable fix.

### G3 — The business approval precaution flag likely renders as nothing on the live DB. **MEDIUM**

The product rule changed on 2026-07-30: an unapproved business may now message
creators, and in exchange the creator sees a precaution flag
(`apps/web/src/app/api/collabs/route.ts:66-68, 122-136` — only `rejected` is
blocked now).

That flag depends on the creator being able to read
`business_profiles.approval_status`, which is granted **only** by
`supabase/migrations/094_business_approval_status_visible.sql`.

Per the recorded hosted-DB state, migrations are applied through **092**; 093 and
094 are not. The query at `collabs/route.ts:80-83` destructures only `data` and
ignores the error, so on the live DB it returns nothing, the map stays empty, and
`sender_business_approval_status` is `null` for every request. Both clients hide
the badge on null (web `requests/page.tsx:432`, mobile `(tabs)/requests.tsx:130`).

**Net effect on production right now: unapproved businesses can contact creators
and the creator sees no warning at all** — the gate was removed but its
replacement isn't live.

Needs verifying against the hosted DB before acting on. Fix is applying 094.

Related: the comment at `components/dashboard/shell.tsx:316-318` still claims
"outreach actions stay locked server-side until an admin approves". That is no
longer true and will mislead the next person reading it.

### G4 — The same pending business is a full product on web and a locked door on mobile. **MEDIUM**

- Web: `shell.tsx:319-322` — `pending_review` gets a dismissible banner and the
  entire dashboard, and can send collab requests.
- Mobile: `app/index.tsx:31-33` — `pending_review` is hard-redirected to
  `/pending`, a status screen with a re-check button. No app access.

One account, two contradictory products. Mobile was never updated for the
2026-07-30 decision.

---

## 4. Smaller gaps

| # | Finding | Where |
|---|---|---|
| S1 | ~~Mobile cannot add custom stage checklist items~~ — **WITHDRAWN, this was wrong.** Web can't either: the route exports GET and PATCH only, and neither client has an "add step" UI. The `createStageItem` helper pointed at a POST that has never existed and would have 405'd. Nothing called it. Removed as dead code rather than built as a feature — a user-authored required item would be a user-authored gate, since the checklist is what blocks advancement | `packages/api/` |
| S2 | Mobile signup has no Instagram prefill — `scrapeInstagram` called 0 times; web uses it to prefill follower count. **Worse than reported:** the helper POSTed to a GET-only route, so it could not have worked had anything called it. Mobile signups also landed with `instagram_followers` NULL, ranking those creators below equivalent web signups in discovery until their first refresh | `apps/mobile/lib/use-signup.ts` |
| S3 | Review `comment` has no max length and the endpoint has no rate limit, unlike every other write path | `api/projects/[id]/reviews/route.ts:69` |
| S4 | `confirm_completion` doesn't check the final-payment gate item — both sides can close a project with the final payment unmade. Consensual, so low, but it means "completed" ≠ "paid" | `api/projects/[id]/route.ts:499-518` |
| S5 | Mobile payments are "pay on web" — a known, documented stopgap, not an oversight | `stage/[stage].tsx:158-170` |

---

## 5. What is genuinely solid

Worth stating plainly, because it's most of the system:

- **Amounts are never client-set.** `payments/route.ts:76-94` derives the sum
  from agreed terms and rejects a mismatched client value rather than
  substituting it.
- **Payment gates can't be hand-ticked** when Razorpay is configured
  (`stage-items/route.ts:132-148`) — the tick opens only on a signed webhook.
- **Consent can't be forged.** `update_stage` uses an allow-list
  (`route.ts:588`) precisely so neither party can write the other's
  `owner_signoff_at` into the JSONB and satisfy "both agreed" alone.
- **Completion has one door.** The legacy `advance` path explicitly refuses to
  walk into `project_completed` (`route.ts:222-227`).
- **Cancelled and unaccepted projects are frozen** before any action runs
  (`route.ts:135-152`).
- **The showcase is not forgeable.** `get_creator_collaborations` (067) and the
  portfolio RPC (087) derive `source='platform'` entries live from completed
  projects; creators cannot mark their own entries verified.
- **Ownership is a prerequisite for the badge** — the anti-impersonation link
  survived the 083 lockdown.

---

## 6. Suggested order

1. **Check whether Supabase "Confirm email" is on.** It decides whether G2 is
   live or latent, and nothing else can be prioritised without knowing.
2. **B1** — mobile review fork. Smallest fix, largest impact: it's the difference
   between mobile being able to finish a project and not.
3. **G3** — apply migration 094, or re-block unapproved outreach until it's
   applied. Right now neither the gate nor its replacement is live.
4. **B2** — mobile ownership verification (three stacked bugs; the parity doc
   has the details).
5. **G1** — decide what `revisions` should do and make the two code paths agree.
6. **G2** — server-side profile reconstruction from auth metadata.
7. **G4** — align mobile's pending-business gate with web.
8. S1–S5.

---

## 7. Verification performed

- `npx turbo run typecheck` — **7/7 packages pass**, clean.
- `npx turbo run test` — **233 passed**, 6 skipped (integration suite,
  intentionally skipped), 0 failed.
- Every finding above traced to a specific file and line in source; no finding
  is inferred from documentation alone.

**Not covered by this audit** (would need a live environment, not source
reading): actual hosted-DB migration state, whether the phone-OTP Edge Function
is deployed, and real-device behaviour on physical iOS/Android hardware.
