# Confidence report — 2026-08-08

**Question asked**: is the application strong? Will a new user struggle?

**Short answer**: the *product logic* is strong — 251/251 automated checks pass,
including every finding from the morning's audit, on web and mobile. The
remaining risk is **not in the code**. It is three configuration gates that are
deliberately off in dev and must be turned on before real users arrive, and one
of them (email confirmation) will directly hurt new users if it ships as-is.

I've written this to be useful rather than reassuring. Where I can't back a
claim with evidence, I say so.

---

## What the evidence is

| Suite | Checks | Result |
|---|---|---|
| Phase 3 — discovery, requests, concurrency | 44 | ✅ 44/44 |
| Phase 4/5 — messaging, deals, 12-stage machine | 49 | ✅ 49/49 |
| Phase 6/7 — payments, gate bypass, completion | 43 | ✅ 43/43 |
| Phase 8/9 — admin surface, authorization sweep | 56 | ✅ 56/56 |
| Migration 113 verification | 20 | ✅ 20/20 |
| Checklist-gate regression | 11 | ✅ 11/11 |
| Sign-off race regression (20 rounds) | 10 | ✅ 10/10 |
| Medium-findings regression | 18 | ✅ 18/18 |
| **Mobile — full project from the phone** | 31 | ✅ 31/31 |
| **Total** | **282** | **✅ 282/282** |

Up from 181/192 this morning. Every one of these runs against the real dev
database with 12 real multi-account personas and real (test-mode) Razorpay
payments — not mocks.

Reproduce:

```bash
node --env-file=apps/web/.env.local tests/e2e/seed-personas.mjs
```

then `phase3-requests`, `phase4-lifecycle`, `phase5-payments`,
`phase6-admin-authz`, `verify-113`, `verify-gate-fix`, `verify-signoff-race`,
`verify-medium-fixes`, `verify-mobile-parity`.

---

## What was fixed today (5 commits on `fix/audit-critical-high`)

| Commit | Severity | What |
|---|---|---|
| `c41bb5b2` | **CRITICAL** | Checklist gate was vacuous until the checklist was first rendered — a project could walk through the advance-payment gate with an empty ledger |
| `d197deb3` | **HIGH** | Concurrent sign-off lost one side's click, returned 500, and stuck the project |
| `22881da1` | **MEDIUM** ×5 | Dashboard role guards, collab recipient role check, message length + rate limit, user-input errors returning 500, upstream HTML → 503 |
| `6783ac81` | follow-up | Check ordering, stage-items participation check, checklist seeded at project creation |
| `25aba52d` | verification | Mobile end-to-end walk |

Each fix ships with a regression test that **fails on the pre-fix code**. The
sign-off race is tested 20 times, not once, because the original bug was
non-deterministic — one round would have proven nothing.

---

## Confidence by area

Scale: **Strong** = proven by test against the real stack. **Good** = proven,
with a named caveat. **Unverified** = I did not test it; not a claim either way.

### Money — **Strong**

The most-tested area, and it holds up.

- Order amounts are derived server-side from agreed terms. A client sending
  `amount_rupees: 1` against a ₹200,000 advance is refused.
- Unsigned webhooks, corrupted signatures, and webhooks signed with the wrong
  secret are all rejected 401 and moved nothing in the ledger.
- Replaying a captured webhook does not double-record.
- Payment gates open **only** on a signed capture — the bypass that existed this
  morning is closed and regression-tested through all three routes into it
  (`signoff`, `advance`, `confirm_completion`).
- A cancelled project preserves its payment ledger and refuses further payments.

*Caveat*: tested with Razorpay **test** keys and synthetic (correctly signed)
webhooks. The signature path, amount derivation and ledger logic are real; a
live card transaction through Razorpay's hosted checkout is not something I can
drive. **Do one real ₹1 transaction in production before launch.**

### Authorization — **Strong**

- All 16 admin routes refuse creators, businesses and anonymous callers.
- Self-promotion to admin is blocked (migration 070 holds).
- Across 79 API routes, no non-public route answers an anonymous caller.
- A non-participant cannot read or write another pair's project, conversation or
  messages — and their attempted writes never reach the database.
- Every `/api/projects/[id]/*` route now verifies membership, with no exceptions.

### Concurrency — **Strong**

This is where I'd have expected trouble, and it is genuinely good.

- Five brands hitting one creator simultaneously → exactly five rows.
- Five *identical* simultaneous requests → exactly one row, four clean 409s (a
  real database constraint, not an application check racing).
- Four simultaneous "open conversation" calls → one conversation.
- Accepting the same terms twice concurrently → one project.
- Simultaneous sign-off → 20/20 rounds both land and advance.

### The 12-stage machine — **Strong**

Full walk to `project_completed` with real payments, on both web and mobile.
The transition map is enforced server-side: illegal jumps refused, wrong actor
refused, payment stages unskippable, and the revision loop routes back through
re-review and can be re-entered.

### Mobile — **Good**

A complete collaboration runs from the phone: discovery → request → accept →
terms → project → all 12 stages → completion. Typecheck clean, `expo export`
succeeds for iOS and Android.

*Caveat*: in-app card checkout is **web-only** — no React Native Razorpay SDK
here. Mobile shows a "Pay on web" button that opens the browser. That's handled
honestly and clearly labelled, but a business running entirely from a phone will
leave the app twice per project. It works; it isn't seamless.

*Also*: I verified mobile at the **API layer**, plus typecheck and bundle
export. I did **not** run it on a simulator or device (standing rule in this
repo — local native builds are too heavy and have their own crash history). So
**mobile screen rendering, gestures and native crashes are Unverified.** The
logic is proven; the pixels are not.

### Admin — **Strong**

All 16 routes work, and the numbers agree with the database (I checked the
counts against direct SQL, not just that the page rendered).

### Signup — **Good**

You've tested it repeatedly and it held up here too: 12 accounts created through
the real endpoint, including a YouTube-only creator with no Instagram and a
business with no GST. Rate limiting works (see the caveat below).

### Email delivery — **Unverified today**

I disabled app email sends for the audit (the `.test` addresses would hard-bounce
and damage your Resend domain reputation) and restored the setting afterwards.
Email was proven working on 2026-08-07; nothing today re-tested it.

### Load and scale — **Unverified**

Everything here is correctness, not capacity. The largest burst I ran was 80
concurrent requests. No claim about behaviour at real traffic.

---

## Will a new user struggle? Three things say yes

These are the honest answers to your actual question, and none of them are code
bugs — which is why they wouldn't show up in the test counts above.

### 1. Email confirmation is OFF — this is the big one 🔴

All 91 accounts in the dev database are auto-confirmed; nobody ever proves they
own their address.

**What that does to a new user**: someone types `gmial.com` instead of
`gmail.com`, or fat-fingers one character. The account is created and works
until they log out. Then they can't sign in, can't reset the password (the reset
mail goes to an address they don't own), and cannot recover the account at all —
including any project or payment history attached to it. They have to start over
with a different email, and support cannot fix it for them.

It also means anyone can register an address belonging to someone else.

**The fix is a Supabase dashboard toggle, not a code change.** Turn on
"Confirm email" before real users arrive. Note this has been a standing item for
a while — it's the single highest-value thing on this list.

### 2. Registration rate limiting is per-IP, not per-user 🟡

`auth:register` allows 10 per minute keyed on **IP address**. A college, an
agency office, or a co-working space behind one NAT gets eleven signups and then
a wall — with an error that reads like the app is broken.

If you run any campus or event-based campaign, raise this limit or key it on
something less collision-prone first.

### 3. Two friction points that are working as designed 🟡

Worth knowing, not necessarily changing:

- **Business approval**: a new business can send requests while `pending_review`,
  and the creator sees an "unverified" flag. That's the intended design. But if
  nobody is actively reviewing the queue, brands sit flagged indefinitely and
  creators learn to ignore the flag. There are currently **4 businesses awaiting
  review**. Whoever owns that queue needs to actually work it.
- **Mobile payment handoff**: covered above — two trips to the browser per
  project.

---

## One number worth your attention

From the new engagement metrics (migration 113, now live):

```
business_funnel: signed_up 14 → viewed_creator 2 → sent_request 11
                 → started_project 6 → completed_project 2
```

`viewed_creator` being *lower* than `sent_request` isn't an error — profile-view
tracking only started recently, so the history isn't there. But going forward
this is the number that tells you where businesses stall: signed up but never
looked, looked but never asked, or asked but never closed. That's the question
the old single "signups" figure couldn't answer, and it's now on the admin
analytics endpoint.

---

## What I'd do next

1. **Turn on email confirmation.** Dashboard toggle. Highest value on this list
   by a distance.
2. **One real ₹1 payment in production.** The only part of the money path I
   cannot verify from here.
3. **Run the mobile app on a real device** for a full project. The logic is
   proven; the rendering is not.
4. **Re-key or raise the registration rate limit** if any campaign will bring
   users from one location.
5. **Wire the audit suite into CI.** It runs in minutes at the API level and
   catches exactly the concurrency and authorization class that unit tests
   structurally cannot. The three regression suites are the ones that matter
   most — they encode today's bugs so they can't come back.
6. **Sweep the remaining fail-open defaults.** The CRITICAL bug came from one:
   "the migration might not be applied" is right for a missing table and wrong
   for empty data, and the code couldn't tell them apart. I fixed that instance
   and the pattern in `lib/stage-items-gate.ts` shows how to distinguish them.
   Several similar defaults remain elsewhere — worth deciding each one
   explicitly now that the database is fully current.

---

## Summary

**The features you have are strong and I'd back them.** The core loops —
signup, discovery, requests, messaging, negotiation, the 12-stage machine,
payments, completion, reviews, cancellation, admin — are proven end-to-end on
both web and mobile, under concurrency and against a hostile caller.

**I would not call the application launch-ready today**, and the reason is item
1: email confirmation being off will cost you real users in a way that no amount
of correct code compensates for. It's a toggle, not a project.

Everything is on `fix/audit-critical-high`, five commits, ready for review.
