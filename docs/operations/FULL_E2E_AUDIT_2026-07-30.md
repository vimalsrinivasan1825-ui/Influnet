# Full E2E Audit — 2026-07-30

**What this was:** a from-scratch, full-application Playwright audit covering the entire creator and business journey — signup through a fully completed, paid, reviewed project — using the real Madan Gowri Instagram/YouTube accounts. Requested because the previous E2E report ([e2e-walkthrough-report.html](../e2e-reports/e2e-walkthrough-report.html)) was fabricating captions instead of asserting real state.

**Final result:** 142 checks across 7 phases, 139 passed, 1 confirmed real bug, 2 legitimate skips, 113 screenshots.

**Report:** [docs/e2e-reports/e2e-walkthrough-report.html](../e2e-reports/e2e-walkthrough-report.html) — every step's screenshot + pass/fail verdict + DB-check result, a findings table, and a "UX & Design Remarks" section (qualitative notes on how things actually look/feel, separate from the pass/fail data).

**Test suite:** `tests/e2e/` — reusable, rerunnable, not a one-off. See "How to re-run" at the bottom.

---

## Why the old report was thrown out

`tests/e2e/influnet-e2e.mjs` (deleted this session) wrote screenshot captions *before* taking the screenshot, swallowed every failure with `.catch(() => {})`, and had zero DB verification. Concretely: screenshots #26–27 were captioned "creator requests inbox" and "projects list" — both were actually the **login page**, because the creator signup in that run had silently failed (typo'd test email) and nobody checked.

---

## Phase 0 — Reset

Backed up and deleted 132 stale accounts (3 leftover "Madan Gowri" logins with no profile data, one broken business account from the same broken run, ~128 old `test_*@test.influnet.com` accounts from prior sessions). Kept the 9 real accounts untouched. Full JSON backup: `phase0-cleanup-backup-2026-07-29T15-24-38-512Z.json` (repo root).

## Phase 1 — New harness

Built `tests/e2e/lib/` from scratch: `harness.mjs` (step runner — real assertions, auto-screenshot, console/network capture), `db.mjs` (Supabase service-role client + polling helpers), `browser.mjs` (form/click helpers that throw instead of logging a warning and moving on), `report.mjs` (renders the cumulative HTML report from every phase's JSON results). 8/8 smoke checks passed.

Found along the way: `apps/web`'s root `/` intentionally redirects to `/login` (confirmed via `git log` — a deliberate 2026-07-18 refactor, not a bug); the real marketing page lives in the separate `apps/landing` app.

## Phase 2 — Creator journey (26/26)

Full 5-step signup wizard with the real `madangowri` Instagram handle, DB-verified at every write, home, public profile, media kit, settings edit, activity, connections, verification anti-impersonation gate (confirmed still enforced).

## Phase 3 — Business journey (29/30, 1 skip)

Signup → pending review → admin approval → dashboard → send request → creator accepts → bilateral project proposal → project created → guided stage-flow checklist (bilateral) → stage genuinely advanced in the DB → cancellation requested → other party accepted → DB confirms cancelled.

## Phase 4 — Admin & guards (16/17, 1 skip)

Admin panel (home/collabs/projects/users), and a real **security check**: confirmed non-admin sessions get a clean 401/403 from `/api/admin/*` despite no page-level role redirect existing. `/vf/[code]`, `/influnet/[slug]`, `/b/[username]`, `/reset-password` all checked.

## Phase 5 — Edge cases (9/9)

Duplicate email/username, weak password, invalid email format, GST/website format (none — confirmed gap), Tamil unicode bio (round-trips correctly), XSS payload (stored safely, never executes on render), negative/huge budgets.

## Phase 6 — Full project lifecycle (34/34)

The big one — one continuous real project through **every** remaining mechanism:
- Change request (business proposes new budget mid-project, creator accepts, DB updates)
- **Real Razorpay payments** — genuine test-mode orders via Razorpay's live API + a properly HMAC-signed webhook (same scheme Razorpay itself uses) to simulate capture; checklist gate auto-opens
- Skip-stage flow (propose/confirm, stage marked "skipped", project advances)
- Review fork ("Approve draft")
- **Dual-confirm completion** — verified live that one side confirming is *not* enough; only completes once both sides confirm (this is exactly the unilateral-completion bug migrations 081/082 were built to prevent — confirmed still locked down)
- Reviews — both sides posted real ratings, now visible on the creator's public profile with a "Verified on Influnet" project card

Took several iterations to get a clean run — every failure along the way turned out to be a bug in the **test harness's timing/ordering** (see below), not the app.

## Phase 7 — Requests, messaging, notifications, guards (17/18, 1 real finding)

Cancel / decline (native confirm dialog + 6s undo window) / reopen — all real. **Real chat message sent, survived a reload, confirmed visible on both sides.** Notification bell + real notification rows confirmed. Resolved the `/dashboard/influencer` question (see below). One confirmed security bug found here (see next section).

---

## Confirmed bugs (real, in the app)

| Severity | Finding | Location |
|---|---|---|
| **High** | `use-username-availability.ts` misclassifies any server error as **"username taken"** instead of "error" — a transient network hiccup permanently blocks signup with a false message | `apps/web/src/lib/hooks/use-username-availability.ts:57-63` |
| **Medium** | `GET /api/projects/[id]/reviews` has **no participant/membership check** — any logged-in user can read any project's reviews (rating, comment, reviewer name) by guessing the numeric ID. Same missing check on `/cards` (no content leaked only because that project had none) | `apps/web/src/app/api/projects/[id]/reviews/route.ts` (checks auth at line 15, never checks membership before querying by `project_id` at line 33) |
| **Medium** | `shell.tsx` (every business page's nav shell) runs a direct `business_profiles.select("approval_status")` query that migration 053's PII lockdown revoked — **403 on every page load** for every business account. Feature still works via a redundant path, but it's dead, noisy code | `apps/web/src/components/dashboard/shell.tsx:118-123` |
| **Medium** | Sending a collab request with budget left blank (labeled "optional") sends `budget: null`, which Zod's `.optional()` rejects — 400 on a documented-valid use case | `apps/web/src/app/dashboard/requests/new/page.tsx:126-131` |
| **Low** | Negative budget input ("-500") has its minus sign stripped by the sanitizer before the positive-number check runs — silently becomes +500 instead of being rejected | `apps/web/src/app/dashboard/requests/new/page.tsx:115` |
| **Low** | Business signup's GST number and website fields have no format validation anywhere (client or server) | signup/business wizard |
| **Low** | `/dashboard/discover`'s disabled-feature page (a `"use client"` component calling `notFound()`) renders the correct 404 UI but returns HTTP 200, not 404 — invisible to crawlers/monitoring | `apps/web/src/app/dashboard/discover/page.tsx` |
| **Low** | The auth gate redirects any unmatched URL to `/login` for anonymous visitors instead of a real 404 — masks genuine 404s | `apps/web/src/proxy.ts` |
| **Low** | Opening a project you have no relationship to shows an indefinite "Loading…" spinner instead of a clear "not found"/"access denied" state (no real data leaks there — see confirmed-safe below) | `apps/web/src/app/dashboard/projects/[id]/page.tsx` |
| **Info** | `/dashboard/influencer` is a genuine **legacy page** (53 lines, thin wrapper around `/api/influencer/dashboard`) still live behind `shell.tsx`'s redirect for creators landing on bare `/dashboard` — materially thinner than the 765-line `/dashboard/home` every other check in this audit actually used | `apps/web/src/app/dashboard/influencer/page.tsx` vs `.../home/page.tsx` |
| **Info** | Block-user feature is fully wired (API + DB) but has no UI entry point anywhere in the app | — |
| **Info** | Connections page is a static stub with no real data on both creator and business sides | `dashboard/connections/page.tsx` |
| **Info** | `.env.local`'s `RAZORPAY_WEBHOOK_SECRET` is still the literal placeholder value (`your_test_webhook_secret_here`) — fine for this local/dev audit (it's just a shared string either side uses to sign/verify), but **must be replaced with a real generated secret before any production deploy**, or webhook signatures become forgeable | `apps/web/.env.local` |

## Confirmed safe (tried to break, couldn't)

- **XSS**: a `<script>`/`onerror` payload in bio is stored verbatim but never executes on the public profile — properly escaped on render.
- **Admin API**: creator/business sessions hitting `/api/admin/users` directly get a clean 401/403, no data leak, despite no page-level role redirect existing.
- **Anti-impersonation gate**: creator is correctly *not* auto-verified immediately after signup (migrations 083/086 lockdown holds).
- **Business approval gate**: server-side enforced (403), not just a UI lock.
- **Unauthorized project access** (core data): base project record, activity, and change-requests are correctly denied for a non-participant — verified by reading actual response bodies, not just status codes.
- **Dual-confirm completion**: one side confirming is genuinely not enough to complete a project — checked live against the DB mid-flow.

## UX & design remarks (see the report for the full list)

Strengths: the signup wizard's live validation, the Guided project view's bilateral checklist (best-designed screen in the product), the real Razorpay checkout integration, the completed-project public profile (real portfolio card + real star rating), messaging.
Rough edges: business dashboard feels empty on a new account with no onboarding nudge, Discover's nav link still visible despite being hard-disabled, the unauthorized-project infinite spinner, constant console noise from the dead `business_profiles` query.

---

## What needs attention (not fixed — flagged for you)

1. **Fix the reviews/cards IDOR** (`/api/projects/[id]/reviews`, `/api/projects/[id]/cards`) — add a participant check before querying. Real, exploitable, not yet patched — your call on priority.
2. **Fix the username-availability false-"taken" bug** — treat any non-2xx response as `status: 'error'`, not fall through to `'taken'`.
3. **Clean up the dead `business_profiles` query in `shell.tsx`** — swap to the `get_own_business_profile()` RPC the PII-lockdown migration already provides.
4. **Decide on the reset-password `.test` TLD issue** — not a bug, just noting Supabase's own `/auth/v1/recover` rejects the `.test` reserved TLD (used elsewhere in this test suite for synthetic accounts), so that one check used a different throwaway domain.
5. **Replace the placeholder Razorpay webhook secret** before any production deploy.
6. Test accounts from this audit are still live in the database: `e2e.creator.madangowri@influnet-audit.test`, `e2e.business.jupiter@influnet-audit.test`, `e2e.admin.audit@influnet-audit.test` (plus a fully completed, paid, reviewed "Full Lifecycle Audit Project" between the first two) — left in place intentionally so you can inspect the real end state. Let me know if you want these cleaned up.

---

## How to re-run

Each phase is independent and re-runnable:

```bash
node --env-file=apps/web/.env.local tests/e2e/phases/phase1-harness-smoke.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase2-creator-journey.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase3-business-journey.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase4-admin-and-public-routes.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase5-edge-cases.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase6-full-lifecycle.mjs
node --env-file=apps/web/.env.local tests/e2e/phases/phase7-requests-messages-guards.mjs
```

The dev server (`apps/web`) must be running on `localhost:3000` first. Each phase writes `tests/e2e/results/<phase>.json` and regenerates the HTML report automatically. To just rebuild the report from existing results: `node tests/e2e/lib/report.mjs`.

Phases 6 and 7 reuse the same business/creator accounts and are **not idempotent for the deal-flow** — if a project from a previous run is still active, a fresh run will hit "already have a pending request" type errors. Purge with (adjust the two IDs if the accounts changed):

```js
// see the purge snippet used throughout this session — deletes campaign_projects,
// project_stage_items/entries/activity/change_requests/payments, reviews,
// project_proposals, collab_requests, and orphaned conversations for the pair.
```

Add new edge cases or flows by copying the pattern in `tests/e2e/phases/*.mjs` and reusing `tests/e2e/lib/{harness,db,browser,auth-helpers,project-helpers,payments}.mjs`.
