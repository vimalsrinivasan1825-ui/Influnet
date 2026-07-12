# Influnet — Cloud Deployment Readiness & Deep Audit

**Date:** 2026-07-12
**Author:** Senior-architect audit (code + database level, on branch `ui/redesign`)
**Method:** Read the actual source, the 50 SQL migrations, the API routes, and the dashboard code. Ran a production build (`npm run build --workspace=web` → passes). **No live login was performed** — the account walk-throughs are specified as a manual test script for you to run (see Part E).

> **Rule for this document:** nothing here has been changed in code. Every fix is written as an instruction. Treat this file as the work order. Do the fixes on a branch, verify against Part E, then deploy per Part A.

---

## 0. How to use this document

1. Read **Part 1 (the Engineering Loop)** — that is the "script": the goal, the guardrails, and the repeatable process.
2. Read the **Verdict** to know if you can deploy today (short answer: **not yet — 4 blockers**).
3. Work the **Prioritized Backlog (Part F)** top to bottom. Each item points to an exact file.
4. Before deploy, follow the **Deployment Runbook (Part A)** step by step.
5. After each change, run the matching flow in the **Manual Test Script (Part E)**.

---

## 1. The Engineering Loop (the "script")

**Goal:** Take Influnet from "works on my laptop against a dev Supabase project" to "a real business and a real creator can sign up, get matched, run a campaign end-to-end, and see accurate progress — hosted in the cloud, safely."

**Guardrails (do not violate):**
- One branch per fix. Never commit `.env*`. Never expose the service-role key to the browser.
- Every fix must be verified by *driving the real flow*, not just by a passing typecheck.
- Do not touch the landing app (`apps/landing`) — it is owned by the user.
- Migrations are append-only and numbered. New DB change = new `0XX_*.sql`, never edit an applied one.

**The loop — repeat until the Exit Criteria are all green:**

```
1. PICK the highest item in the Prioritized Backlog (Part F).
2. REPRODUCE it (curl / click / SQL) so you can see it fail. Write down the failing observation.
3. FIX it in a branch (code or a new migration).
4. VERIFY by re-running the exact flow from Part E that covers it. It must now pass.
5. REGRESS-CHECK: run `npm run build --workspace=web` + the touched flow's neighbours.
6. RECORD: tick the item, note what you observed. Commit.
7. GOTO 1.
```

**Exit criteria (V1 "cloud-ready"):**
- [ ] All **P0** items in Part F are closed.
- [ ] The full lifecycle in Part E (business → creator → project → completion) runs without a dead end.
- [ ] App is deployed to a cloud host with production env vars and a *separate production Supabase project* (not the dev one).
- [ ] Service-role key, Stream secret, and any management token are only in the host's secret store.
- [ ] A logged-out visitor cannot reach `/dashboard/*`; a creator's email/phone is not readable with the anon key.

---

## 2. Verdict

**Can you deploy today? No — but you are close.** The build is clean, the auth/session model was already fixed (tokens come from `supabase.auth.getSession()`, not stale localStorage), the route proxy is live, and the Stream webhook verifies signatures. Good foundation.

**4 blockers stand between you and a real cloud launch:**

| # | Blocker | Why it blocks a real launch |
|---|---|---|
| B1 | **"Advance stage" on the projects list page is broken** — it PATCHes `/api/projects` with a numeric id validated as `z.string().uuid()`, so every call 400s. | The core loop (moving a campaign forward) fails from the main projects screen. This *is* "project progress" and it doesn't work from that page. |
| B2 | **Influencer PII (email/phone) is readable via the anon key** (RLS `influencer_profiles_select_public` = `role = 'influencer'`). | Any visitor can scrape every creator's contact info. Unacceptable to launch publicly. |
| B3 | **No production environment separation** — one Supabase project (`jaajosocopoicmqcffuu`), a management token sitting in `.env.local`, dev keys reused. | Shipping dev infra as prod. First incident = whole project compromised. |
| B4 | **The project "completion" story is empty** — nothing happens when a campaign completes: no rating, no payment record, no creator benefit. | The product's promised value ("what does the creator get") does not exist yet. This is a product-completeness blocker, not a crash. |

Everything else is P1/P2 polish. Details below.

---

## Part A — Cloud Deployment Runbook

The app is a single Next.js 16 app (`apps/web`) in a Turborepo, backed by Supabase (Postgres + Auth + Storage + Edge Functions) and Stream Chat. Recommended host: **Vercel** (first-class Next.js 16 support). Supabase stays as the managed backend.

### A.1 Provision a *production* Supabase project (do not reuse the dev one)
1. Create a **new** Supabase project → this is production. Keep `jaajosocopoicmqcffuu` as dev/staging.
2. Link and push the schema:
   ```bash
   supabase link --project-ref <PROD_REF>
   supabase db push          # applies supabase/migrations/001..050 in order
   ```
3. Deploy the edge functions:
   ```bash
   supabase functions deploy phone-otp
   supabase functions deploy auth-signup
   ```
   Both are configured `verify_jwt = false` in `supabase/config.toml` — confirm that is intended for prod (phone-otp being public is normal; make sure it is rate-limited — migration 026 adds a rate-limit, verify it is applied).
4. In Supabase Auth settings: set **Site URL** and **Redirect URLs** to your production domain (needed for email confirmation and the password-reset link to land correctly — see B-list item on `next`/redirect).
5. Configure the SMTP / email sender for Auth (confirmation + recovery emails). Without this, signup email confirmation and password reset silently do nothing in prod.
6. Storage: confirm the `project-assets`, avatar, and profile-photo buckets exist (they are created by migrations 020/013/025) and their public/policy settings are correct for prod.

### A.2 Environment variables (set in the host's secret store, never in git)
From `apps/web/.env.example`, the full runtime set:

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | prod project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | prod service key. Used by admin routes + `lib/supabase/server.ts`. NEVER `NEXT_PUBLIC`. |
| `NEXT_PUBLIC_STREAM_API_KEY` | public | Stream key |
| `STREAM_API_KEY` | server | same value, server SDK |
| `STREAM_API_SECRET` | **server only** | signs Stream tokens + verifies webhook |
| `RESEND_API_KEY` | server | transactional email (optional; leave empty to skip) |
| `EMAIL_FROM` | server | verified Resend sender |
| `NOTIFY_EMAILS_ENABLED` | server | set `true` in prod if you want emails to actually send |

**Gotcha:** `lib/supabase/server.ts` reads `process.env.SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL`. Set at least `NEXT_PUBLIC_SUPABASE_URL`. Don't rely on the bare `SUPABASE_URL` unless you also set it.
**Do not** set `SUPABASE_ACCESS_TOKEN` (the `sbp_…` management token) in the app's env — it is not needed at runtime and is dangerous. It currently sits in `apps/web/.env.local`; keep it out of the deployment entirely (see B-list secrets item).

### A.3 Build & host
1. Vercel project → root `apps/web` (or root with `turbo`). Build command `npm run build`, output handled by Next adapter.
2. Set all env vars from A.2 in Vercel (Production scope). Redeploy.
3. Point your domain; update Supabase Auth Site URL to match.
4. **Stream Chat:** in the Stream dashboard, set the webhook URL to `https://<yourdomain>/api/stream/webhook`. The route verifies `x-signature` with `STREAM_API_SECRET` — good.

### A.4 Post-deploy smoke test (must pass before announcing)
- Logged-out `GET /dashboard` → redirects to `/login` (proxy is active — confirmed in build output as `ƒ Proxy (Middleware)`).
- `GET /c/<a-creator-username>` and `/b/<a-business-username>` → 200 (public profiles must stay public).
- Sign up a throwaway business + creator, run the Part E lifecycle once on prod.
- Check Supabase logs + Vercel logs for 500s.

### A.5 Operational gaps to close before real traffic (currently missing)
- **No error monitoring.** `HANDOFF`/memory note Sentry is pending. Add Sentry (or equivalent) before launch — right now failures only surface in server logs.
- **No rate limiting** on public RPCs (`record_profile_view`, OTP). Memory notes Upstash is pending. At minimum confirm migration 026 OTP rate-limit is live; add view-count dedup (see B-list).
- **No DB backups policy verified** — enable PITR / scheduled backups on the prod Supabase project.
- **`/api/admin/*`** is role-gated via `withAdmin` (verified) — good, but there is no audit log of admin approve/reject actions. Consider one before launch.

---

## Part B — Logic & real-use-case findings (prioritized, with exact locations)

Severity: 🔴 P0 = blocks launch · 🟠 P1 = fix before real users · 🟡 P2 = polish.

### 🔴 B1 — Projects list "Advance stage" button is dead (id type mismatch)
- **Where:** `apps/web/src/app/dashboard/projects/page.tsx:85–93` calls `PATCH /api/projects` with `{ id: projectId, current_stage, status }`. The route `apps/web/src/app/api/projects/route.ts:6` validates `id: z.string().uuid()`.
- **Reality:** `campaign_projects.id` is `BIGINT` (migration 006). The id is a number like `5`, serialized as `"5"`, which is **not a UUID** → Zod 400 "Validation failed" on every call.
- **Effect:** From the main projects list, "advance stage" always fails. The workspace detail page works because it uses a *different* route (`/api/projects/[id]`, action-based, id from URL param — no uuid check).
- **Fix (pick one):**
  - **Preferred:** delete the stage-advance logic from `/api/projects` PATCH and make the list page call the same working endpoint the detail page uses: `PATCH /api/projects/{id}` with `{ action: 'advance' }`. This removes the duplicate state machine entirely.
  - **Minimal:** change the schema to `id: z.union([z.string(), z.number()]).transform(String)` (or `z.coerce.number()`), and stop sending `status` (the server derives it).
- **Also:** the list page sends `status: nextStage === "completed" ? …` but the terminal stage key is `project_completed`, never `"completed"` — dead branch. Harmless once you stop sending `status`.

### 🔴 B2 — Influencer PII exposed through RLS
- **Where:** RLS policy `influencer_profiles_select_public` on `public.profiles` with `qual: role = 'influencer'` (from the earlier V1 report; re-verify on the live prod DB with `select * from pg_policies where tablename='profiles'`). `profiles` holds `email` and `phone`.
- **Effect:** Anyone with the anon key (i.e. anyone) can `select email, phone from profiles where role='influencer'`. Full contact scrape.
- **Fix:** Public creator pages already go through the `get_public_influencer` `SECURITY DEFINER` RPC (curated columns), so the broad SELECT policy isn't needed for the public page. Either (a) drop the broad policy and expose only safe columns via a `public_profiles` view, or (b) move `email`/`phone` into a `private_profile_data` table with owner-only RLS. Do the same review for the `*_select_authenticated` (`qual: true`) policies that let any logged-in user read `gst_number`, pricing, `registered_address`.
- Ship this as a **new migration** (e.g. `051_pii_lockdown.sql`).

### 🔴 B3 — Two divergent project state machines (consolidate)
- **Where:** `/api/projects` PATCH (`route.ts`) and `/api/projects/[id]` PATCH (`[id]/route.ts`) each define their **own copy** of `ALLOWED_TRANSITIONS` and advancement logic. The first also owns the cancellation flow; the second owns `advance` / `update_stage` / `update_project` and writes `stage_progress`.
- **Risk:** They will drift. The list-page bug (B1) exists precisely because two paths do "the same" thing differently.
- **Fix:** Make `/api/projects/[id]` the single source of truth for a project mutation. Extract the stage machine + transition map into one shared module (`lib/project-lifecycle.ts`) imported by the route(s). Keep cancellation there too, keyed by `[id]`.
- **Dead scaffolding:** `apps/web/src/app/api/projects/[id]/advance/` and `.../assets/` are **empty directories** (no `route.ts`). Delete them or implement them; leaving empty route folders is confusing.

### 🟠 B4 — "Completed" collab status is never set (dashboard metric always 0)
- **Where:** `api/business/dashboard/route.ts` and `api/influencer/dashboard/route.ts` compute `completedCollabs = collabs.filter(c => c.status === 'completed')`. But `collab_requests.status` is only ever `pending|accepted|declined|cancelled` (see `CollabUpdateSchema` and the accept RPC). Completion flips `campaign_projects.status = 'completed'`, not the collab.
- **Effect:** Any dashboard number derived from `completedCollabs` is permanently 0 and misleading. Completion is tracked in a *different* table than the money.
- **Fix:** Decide the single source of truth. Recommended: derive "completed" from `campaign_projects.status='completed'` everywhere, and stop referencing a `completed` collab status that doesn't exist. (Or, when a project completes, also stamp its originating `collab_requests` row — but that duplicates state.)

### 🟠 B5 — "Earnings" counts accepted budgets, not paid/completed work
- **Where:** `api/influencer/dashboard/route.ts:44` `total_earnings = sum(acceptedCollabs.budget)`. Same pattern for business `total_budget`.
- **Effect:** The moment a business *accepts a request* (actually, the moment the creator accepts — but budget comes from the request), the full budget counts as "earnings" for the creator, even though no work is done and **no money has moved** (there is no payment integration — see B6). This overstates earnings and is the wrong number to show a creator.
- **Fix:** Define earnings as budget of projects with `status='completed'` (or of a real `payments` table once B6 exists). At minimum label it "Pipeline value" not "Earnings" until payments are real.

### 🟠 B6 — Payment stages are cosmetic (no gateway, no records)
- **Where:** Pipeline stages `advance_payment` and `final_payment` are just labels. Grep for `razorpay|stripe|payment_intent|paypal` across the app + migrations → **no payment integration anywhere**. There is no `payments`/`invoices`/`payouts` table.
- **Effect:** The platform tracks a "payment" stage but cannot take or record a payment. For a real influencer-marketing product this is the central value/trust mechanism.
- **Fix (scope decision needed):** For a genuine V1 either (a) integrate a gateway (Razorpay given ₹/en-IN formatting) with a `payments` table and advance the payment stages only on a confirmed transaction, or (b) explicitly scope V1 as "off-platform payments" and relabel the stages as *milestones you mark done manually* — and say so in the UI so nobody expects escrow. Do not ship payment-looking stages that do nothing without a decision.

### 🟠 B7 — Stage transitions have no role model (either party can push any stage)
- **Where:** Both PATCH routes allow *any participant* (`owner` or `counterparty`) to advance *any* transition. No distinction between what the **business** does vs the **creator**.
- **Effect:** The creator can mark "final_approval" (a brand decision) or "final_payment"; the business can mark "shooting_in_progress" (creator's action). This contradicts the lifecycle the product implies (Part C) and enables one-sided progression / disputes.
- **Fix:** Introduce per-stage actor rules, e.g. `sent_for_review` advanced by creator, `final_approval` by business, `advance_payment`/`final_payment` by business (payer), etc. Enforce in the shared lifecycle module (B3). Consider two-party confirmation on money + completion stages.

### 🟠 B8 — Open-redirect via `next` param (verify current state)
- **Where:** login/signup read `?next=` and `router.push(nextParam)`. The V1 report flagged that `next` isn't validated as a relative path.
- **Fix:** guard `nextParam.startsWith('/') && !nextParam.startsWith('//')` before pushing. Confirm whether the redesign already added this; if not, add it. (One line, but it's an auth-flow open redirect.)

### 🟡 B9 — `record_profile_view` has no dedup / rate limit
- **Where:** `SECURITY DEFINER` RPC callable by `anon`, inserts a `profile_views` row on every call.
- **Effect:** Anyone can inflate a creator's view count and bloat the table in a loop.
- **Fix:** inside the RPC, skip the raw insert if the same `(influencer, viewer-or-IP, day)` was seen in the last N minutes; keep the aggregate upsert.

### 🟡 B10 — Secrets hygiene / repo clutter
- `apps/web/.env.local` contains `SUPABASE_ACCESS_TOKEN` (management token). Remove it; it is not needed at runtime and is one `git add -f` from disaster. Keep management tokens in your shell profile only.
- `ADMIN_CREDENTIALS.local.txt` at repo root — gitignored via `*.local.txt`, but confirm it never reaches the deployed bundle.
- Root-level `test-get-creator.js` / `test-*.js` and `implementation_plan.md` are clutter; move under `docs/` or delete.

### 🟡 B11 — Discovery has no search/filter/pagination
- **Where:** `/api/discover` is a bare `select … limit 30`. No query params, no pagination, and the "request from public profile" deep-link only works if the target is in the first 30 rows.
- **Fix:** add `?q=`, category/location filters, and keyset pagination; add a direct `by-id` fetch for the deep-link case. (Migration 048 added search infra — wire it up.)

---

## Part C — Project Lifecycle Analysis (end-to-end)

This is the answer to *"what happens from the creator side, the business side, and after completion."*

### C.1 The happy path (as built today)

```
BUSINESS                           SYSTEM                              CREATOR
--------                           ------                              -------
signs up (business)  ──────────►  approval_status = pending_review
                                   admin approves (Part D) ───────────► (business now has dashboard)
browses /dashboard/discover
opens a creator, sends request ──► collab_requests row (status=pending) ──► shows in creator's /dashboard/requests
                                                                        creator ACCEPTS
                                   accept_collab_request(request_id) RPC:
                                     • collab_requests.status = accepted
                                     • get/create conversation (both parties)
                                     • INSERT campaign_projects
                                         owner = business, counterparty = creator
                                         status=active, stage=collaboration_started
                                         title = first line of the request message
both parties see the project at /dashboard/projects and the workspace /dashboard/projects/[id]
                        ── 12-stage pipeline advances ──
collaboration_started → project_discussion → advance_payment → content_planning →
content_confirmation → shooting_in_progress → editing_in_progress → sent_for_review →
(revisions ⇄ sent_for_review) → final_approval → final_payment → project_completed
                                   at project_completed: campaign_projects.status='completed'
                                   ...and then: NOTHING ELSE HAPPENS
```

### C.2 What each side actually does (and the gaps)

**Business side:** discover → request (with budget + message) → wait for accept → collaborate in workspace (chat, cards/Kanban, assets) → advance stages → mark completed. **Gaps:** cannot pay on-platform (B6); can advance stages that should be the creator's (B7); "completed" count on dashboard is broken (B4).

**Creator side:** receive request → accept/decline → collaborate → upload deliverables (`project_assets`, 25MB, migration 020) → advance stages. **Gaps:** "earnings" is really "accepted budget" (B5); no payout, no on-platform payment; can advance business-owned stages (B7).

**The workspace (`/dashboard/projects/[id]`):** real and reasonably rich — a Kanban of `project_cards` per stage (migration 039: title/description/due_date/meeting_link/position/status, drag-and-drop via dnd-kit), asset uploads, stage progress stored in `stage_progress` JSONB with `started_at`/`completed_at` timestamps. This is the strongest part of the lifecycle.

### C.3 What happens *after* completion — the honest answer

Today, on `project_completed`: `status` flips to `completed`, the project moves into a "completed" count, and that is the entire story. **There is no:**
- ⭐ **Rating / review** of the creator by the business (or vice-versa). No `reviews` table exists.
- 🧾 **Payment / payout record.** No money moves; no receipt.
- 🏆 **Portfolio / social proof credit.** Completing a campaign does not add anything to the creator's public `/c/[username]` profile (no "X campaigns completed", no testimonials, no showcased work).
- 📈 **Reputation signal for discovery.** Discovery cannot rank by completed-project count or rating because neither is tracked.
- 🔁 **Re-engagement.** No "work again" / repeat-collaboration shortcut, no case study.

**This is B4's real weight and directly answers your question "what would be the benefit for the creator":** *currently, essentially none is implemented.* To make completion meaningful, build (in priority order):
1. **Reviews & ratings** (`reviews` table: project_id, rater, ratee, stars, text; owner-scoped RLS; aggregate rating on the creator profile). This is the cheapest, highest-trust win.
2. **Completed-work showcase** on the public creator profile (opt-in: pull title + one asset from completed projects).
3. **Payment records** (ties to B6) so "earnings" is real.
4. **Discovery ranking** by rating + completed count.

---

## Part D — Dashboard "Project Progress" (what to build)

You asked for project progress to be visible on the dashboard. State today:

- **Project detail page** (`/dashboard/projects/[id]`) already visualizes the full stage pipeline + Kanban + `stage_progress` timestamps. Good.
- **Projects list page** (`/dashboard/projects`) shows stages but its **advance action is broken (B1)** — so "progress" cannot be moved from there.
- **Dashboard home** (`business-home.tsx` / `influencer-home.tsx`) shows a "Campaign stages"/pipeline section and counts, but:
  - counts derive partly from the never-set `completed` collab status (B4) → wrong.
  - there is **no per-project progress bar** (e.g. "stage 7 of 12 — 58%") on the home dashboard.

**To deliver "project progress on the dashboard":**
1. Fix B1 so advancing works everywhere.
2. Add a **progress percentage** helper: `stageIndex / 11` from the shared stage list; render a progress bar per active project on the home dashboard and the list card.
3. Fix the completed/active counts to come from `campaign_projects.status` (B4).
4. Optionally surface **next action** per project ("Awaiting your review", "Awaiting brand approval") using the role model from B7 — this is what makes a dashboard feel alive.

---

## Part E — Manual Test Script (run with your 3 accounts + new verticals)

I did not log in (I don't enter credentials on your behalf). Run these yourself; each maps to a finding above. Use the creator (`vimal@gmail.com`), business (`arjun@jvsystem.gmail.com`), and admin accounts.

**Setup — create variety (do this to test "many verticals"):**
- Create 2–3 more **business** accounts in different industries (e.g. D2C skincare, a SaaS tool, a local restaurant) and 2–3 more **creators** in different categories (beauty, tech, food). This exercises discovery filtering and matching across verticals.
- Note: new business accounts start `pending_review` and are **gated** until the admin approves them — so test the admin approval step first.

**Flow 1 — Admin approval gate**
1. Log in as admin → `/dashboard/admin/approvals`. Approve one new business, reject another.
2. Log in as the rejected business → confirm the "Account not approved" gate screen (shell.tsx:229). Approved one → full dashboard. ✅ expected to work.

**Flow 2 — Discovery & request (business → creator)**
1. As an approved business → `/dashboard/discover`. Confirm you can find creators. *(Expect: no search/filters, max 30 results — B11.)*
2. Open a creator, send a collab request with a budget + message. Confirm it appears in the creator's `/dashboard/requests`.

**Flow 3 — Accept & project creation (creator)**
1. As the creator, accept the request. Confirm a project appears for **both** parties at `/dashboard/projects`, and a chat conversation exists. ✅ (accept RPC).
2. Note the project **title** — it's the first line of your request message (C.1). Send a request whose message starts with a blank line and see the title fall back to "New Collaboration".

**Flow 4 — Advance the pipeline (the critical bug)**
1. On the **projects list** page, click "Advance stage". ❌ **Expect failure** (B1 — uuid validation). Confirm the 400.
2. Open the project **detail** page and advance from there. ✅ Expect success. This proves the two-path divergence (B3).
3. As the *creator*, try to advance `final_approval` (a brand decision) and `final_payment`. ❌ *Should* be blocked but currently isn't (B7). Confirm it lets you.

**Flow 5 — Workspace**
1. In the detail page, add Kanban cards, set due dates/meeting links, drag between columns, upload a deliverable file. ✅ Expect this to work well.

**Flow 6 — Complete & "what does the creator get"**
1. Advance all the way to `project_completed`. Confirm status flips to completed.
2. Now look for: a review prompt, a payout/receipt, anything added to the creator's public `/c/[username]`. ❌ Expect **nothing** (B4/C.3). This is the product gap to close.

**Flow 7 — Dashboards**
1. Check business + creator home: compare the "completed" count to reality. ❌ Expect it stuck at 0 (B4). Check "earnings" reflects accepted (not completed/paid) budgets (B5).

**Flow 8 — Security spot checks (do before public launch)**
1. Logged out, hit `/dashboard` → must redirect to `/login`. ✅
2. With just the anon key, query `profiles` for `email,phone where role='influencer'`. ❌ Expect it to return data (B2) — must be locked down.

---

## Part F — Prioritized Backlog (work top-down)

| Pri | Item | File / migration | Verified |
|---|---|---|---|
| 🔴 P0 | B1 — fix list-page advance (id type) | `dashboard/projects/page.tsx`, `api/projects/route.ts` | ✅ confirmed bug |
| 🔴 P0 | B2 — lock down influencer PII in RLS | new migration `051_*` | ⚠ re-verify on prod DB |
| 🔴 P0 | B3 — consolidate the two project state machines; delete empty `advance/`,`assets/` dirs | `api/projects/*` | ✅ confirmed |
| 🔴 P0 | B-deploy — separate prod Supabase + secrets in host store (Part A) | infra | ✅ |
| 🟠 P1 | B4 — fix "completed" metric source | both `*/dashboard/route.ts` | ✅ confirmed |
| 🟠 P1 | B5 — earnings = completed/paid, not accepted | `influencer/dashboard/route.ts` | ✅ confirmed |
| 🟠 P1 | B7 — per-role stage permissions | shared lifecycle module | ✅ confirmed |
| 🟠 P1 | B8 — validate `next` redirect param | login/signup pages | ⚠ re-verify |
| 🟠 P1 | B10 — remove management token from `.env.local`; declutter root | repo | ✅ |
| 🟠 P1 | Ops — add Sentry + confirm OTP rate limit + DB backups (Part A.5) | infra | ✅ pending |
| 🟠 P1 | B6 — payment decision (integrate gateway OR relabel milestones) | product | ✅ confirmed absent |
| 🟡 P2 | C.3 — reviews/ratings + creator showcase (the "benefit") | new tables + UI | ✅ confirmed absent |
| 🟡 P2 | D — per-project progress bar + next-action on dashboard home | dashboard views | ✅ |
| 🟡 P2 | B9 — dedup `record_profile_view` | RPC migration | ⚠ per V1 report |
| 🟡 P2 | B11 — discovery search/filter/pagination | `api/discover`, `discover/page.tsx` | ✅ confirmed |

**Suggested order:** B-deploy prep + B2 (security) → B1/B3 (core loop) → B4/B5/B7 (correct data & roles) → B6 decision → C.3 + D (make completion meaningful) → B9/B11 (polish).

---

---

## Part G — Build Spec: making completion meaningful

> **Purpose:** you will build the skeleton of these features, then hand it back for audit. This part is the *specification* to build against — schema DDL, RLS, API contracts, the lifecycle role model, and acceptance criteria. Build to these shapes and the later audit is fast. Conventions to keep: `profiles.id` is `UUID`; `campaign_projects.id` is `BIGINT`; RLS uses the participant `EXISTS` pattern from migration 020/039; migrations are append-only and numbered — next free numbers are **051+**. Put the shared TS lifecycle logic in `apps/web/src/lib/project-lifecycle.ts`.

The four pieces, in build order:

1. **G1 — Shared lifecycle module + role model** (unblocks everything; fixes B1/B3/B7)
2. **G2 — Reviews & ratings** (the cheapest "benefit for the creator")
3. **G3 — Payments** (makes money/earnings real; ties to B5/B6)
4. **G4 — Completion outcomes & dashboard progress** (creator showcase, reputation, progress bars)

---

### G1 — Shared lifecycle module + per-role stage permissions

**Goal:** one source of truth for stages, transitions, progress %, and *who* may perform each transition. Kill the duplicate state machines.

**Create `apps/web/src/lib/project-lifecycle.ts`:**
```ts
export const STAGES = [
  'collaboration_started','project_discussion','advance_payment',
  'content_planning','content_confirmation','shooting_in_progress',
  'editing_in_progress','sent_for_review','revisions',
  'final_approval','final_payment','project_completed',
] as const;
export type Stage = typeof STAGES[number];

export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  collaboration_started: ['project_discussion'],
  project_discussion:    ['advance_payment'],
  advance_payment:       ['content_planning'],
  content_planning:      ['content_confirmation'],
  content_confirmation:  ['shooting_in_progress'],
  shooting_in_progress:  ['editing_in_progress'],
  editing_in_progress:   ['sent_for_review'],
  sent_for_review:       ['revisions','final_approval'],
  revisions:             ['sent_for_review'],
  final_approval:        ['final_payment'],
  final_payment:         ['project_completed'],
  project_completed:     [],
};

// Who is allowed to MOVE OUT of a given stage. 'business' = owner, 'creator' = counterparty.
export const STAGE_ACTOR: Record<Stage, 'business' | 'creator' | 'either'> = {
  collaboration_started: 'either',
  project_discussion:    'either',
  advance_payment:       'business',   // payer confirms deposit
  content_planning:      'creator',
  content_confirmation:  'business',   // brand approves the concept
  shooting_in_progress:  'creator',
  editing_in_progress:   'creator',
  sent_for_review:       'creator',    // creator submits the draft
  revisions:             'creator',
  final_approval:        'business',   // brand approves final content
  final_payment:         'business',   // payer confirms final payment
  project_completed:     'either',
};

export const stageProgressPercent = (s: Stage) =>
  Math.round((STAGES.indexOf(s) / (STAGES.length - 1)) * 100);
```

**Refactor** `PATCH /api/projects/[id]` to import these and enforce, for `action:'advance'`:
- caller must be a participant (already checked);
- the caller's role must match `STAGE_ACTOR[currentStage]` (or `'either'`) — else `403 not_your_turn`;
- transition must be in `ALLOWED_TRANSITIONS[currentStage]`.

**Fix B1:** point `dashboard/projects/page.tsx` "Advance stage" at `PATCH /api/projects/{id}` with `{ action:'advance' }`. Remove the stage-advance branch from `PATCH /api/projects` (leave only cancellation there, or move cancellation to `[id]` too and delete the collection-level PATCH). Delete the empty `api/projects/[id]/advance/` and `api/projects/[id]/assets/` directories.

**Acceptance:**
- [ ] Advancing works from both the list page and the detail page (same endpoint).
- [ ] A creator gets `403 not_your_turn` trying to advance `final_approval`/`final_payment`; a business gets it trying to advance `shooting_in_progress`.
- [ ] `stageProgressPercent` used by the UI (see G4).
- [ ] Only one `ALLOWED_TRANSITIONS` definition exists in the codebase (grep proves it).

**Optional (stronger):** require **two-party confirmation** on `final_approval`, `final_payment`, and `project_completed` — store `stage_progress[stage].confirmed_by = [uuid,...]` and only transition when both participants have confirmed. Design the API as `action:'confirm'` that appends the caller, and auto-advance when both are present.

---

### G2 — Reviews & ratings (migration `051_project_reviews.sql`)

**Goal:** when a project completes, each party can rate the other; the creator's aggregate rating shows on their public profile and feeds discovery. This is the primary "benefit for the creator."

```sql
CREATE TABLE public.project_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   BIGINT NOT NULL REFERENCES public.campaign_projects(id) ON DELETE CASCADE,
  reviewer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT NOT NULL DEFAULT '',
  is_public    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, reviewer_id)          -- one review per project per side
);
CREATE INDEX project_reviews_reviewee_idx ON public.project_reviews(reviewee_id, created_at DESC);
ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;

-- INSERT: reviewer must be a participant of a COMPLETED project, reviewing the OTHER party.
CREATE POLICY project_reviews_insert ON public.project_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND reviewer_id <> reviewee_id
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND p.status = 'completed'
        AND auth.uid() IN (p.owner_user_id, p.counterparty_user_id)
        AND reviewee_id IN (p.owner_user_id, p.counterparty_user_id)
    )
  );

-- SELECT: participants see all reviews on their projects; anyone sees public reviews
-- ABOUT a user (needed for the public profile). Keep the "about a user" read to the RPC below.
CREATE POLICY project_reviews_select_participant ON public.project_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.campaign_projects p
            WHERE p.id = project_id
              AND auth.uid() IN (p.owner_user_id, p.counterparty_user_id))
  );
-- No UPDATE/DELETE policy → reviews are immutable (decide if you want an edit window).
```

**Aggregate for the public profile** — a `SECURITY DEFINER` RPC (mirrors the existing `get_public_influencer` pattern, returns only safe fields so it doesn't leak PII):
```sql
CREATE OR REPLACE FUNCTION public.get_creator_rating(p_user_id UUID)
RETURNS TABLE (avg_rating NUMERIC, review_count BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ROUND(AVG(rating)::numeric, 2), COUNT(*)
  FROM public.project_reviews
  WHERE reviewee_id = p_user_id AND is_public = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_rating(UUID) TO anon, authenticated;
```
(Plus a paginated `get_creator_public_reviews(p_user_id, limit, offset)` returning `rating, comment, created_at, reviewer_display_name` for the profile page.)

**API skeleton:**
- `POST /api/projects/[id]/reviews` → body `{ rating, comment, is_public }`; server sets `reviewer_id=auth.uid()`, derives `reviewee_id` = the other participant, relies on RLS to enforce "completed + participant". Return 409 if already reviewed.
- `GET  /api/projects/[id]/reviews` → both reviews on the project.
- Public profile pages (`/c/[username]`, `/b/[username]`) call the aggregate RPC.

**UI touchpoints:** on `project_completed`, show a "Rate your collaborator" prompt in the workspace; show ⭐ average + count and recent reviews on the public creator/business profile.

**Acceptance:**
- [ ] Can only review a **completed** project you participated in, once per side (409 on repeat).
- [ ] Cannot review yourself; cannot review a project you weren't in (RLS blocks).
- [ ] Public profile shows aggregate rating with no PII leak.

---

### G3 — Payments (migration `052_project_payments.sql`)

**Goal:** make the two payment stages real and make "earnings" mean money, not accepted budget. Two build options — **decide first, write the decision into `docs/DECISIONS.md`.**

- **Option A (recommended for India / ₹):** integrate **Razorpay**. Server creates an order, client completes payment, a **verified webhook** marks the payment `paid`. Advance the `advance_payment` / `final_payment` stages **only** when a matching payment is `paid`.
- **Option B (V1 off-platform):** no gateway; payments are **manually recorded** milestones (business marks "paid", creator confirms "received"). Relabel the stages in the UI so nobody expects escrow. Same table, `provider='manual'`.

```sql
CREATE TABLE public.project_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     BIGINT NOT NULL REFERENCES public.campaign_projects(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('advance','final')),
  amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency       TEXT NOT NULL DEFAULT 'INR',
  provider       TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'razorpay'
  provider_ref   TEXT,                                -- order/payment id from gateway
  status         TEXT NOT NULL DEFAULT 'pending'      -- pending | paid | failed | refunded
                 CHECK (status IN ('pending','paid','failed','refunded')),
  paid_at        TIMESTAMPTZ,
  created_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind)                           -- one advance + one final per project
);
CREATE INDEX project_payments_project_idx ON public.project_payments(project_id);
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;

-- Participants can SELECT; only the BUSINESS (owner/payer) can INSERT/UPDATE a manual record.
CREATE POLICY project_payments_select ON public.project_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_projects p
                 WHERE p.id = project_id
                   AND auth.uid() IN (p.owner_user_id, p.counterparty_user_id)));

CREATE POLICY project_payments_write ON public.project_payments
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.campaign_projects p
                     WHERE p.id = project_id AND p.owner_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.campaign_projects p
                     WHERE p.id = project_id AND p.owner_user_id = auth.uid()));
```
> For Option A, do **not** let the client set `status='paid'`. The gateway **webhook** (server, service-role, signature-verified — mirror `api/stream/webhook`) is the only thing that flips `status→paid` and `paid_at`. The stage advance for `advance_payment`/`final_payment` should check `EXISTS a paid payment of the right kind`.

**API skeleton:**
- `POST /api/projects/[id]/payments` → create a pending payment (kind, amount). Option A also returns a Razorpay order.
- `POST /api/payments/webhook` → (Option A) verify signature, mark paid.
- `PATCH /api/projects/[id]/payments/[paymentId]` → (Option B) mark `paid` / creator confirms received.

**Then fix B5:** redefine dashboard `total_earnings` = sum of `project_payments.amount WHERE status='paid'` for the creator's projects (not accepted budget). Business `total_spend` = same for their projects.

**Acceptance:**
- [ ] `advance_payment` cannot be advanced unless a `kind='advance'` payment is `paid` (Option A) or recorded (Option B).
- [ ] Client cannot self-report `paid` under Option A (only the verified webhook can).
- [ ] Dashboard earnings/spend reflect **paid** amounts.

---

### G4 — Completion outcomes & dashboard progress

**On `project_completed`, the system should now:**
1. Unlock the **review** prompt for both parties (G2).
2. Ensure the **final payment** is settled (G3) — ideally block completion until it is.
3. Add the project to the creator's **completed-work showcase** (opt-in) on `/c/[username]`: title + one asset (reuse `project_assets`); creator toggles visibility.
4. Feed **reputation** into discovery: extend `/api/discover` + the discover ordering to include `get_creator_rating` (avg + count) and completed-project count, so highly-rated creators surface first.

**Dashboard progress (answers "show project progress on the dashboard"):**
- Use `stageProgressPercent(stage)` from G1 to render a **progress bar per active project** on the home dashboards (`business-home.tsx`, `influencer-home.tsx`) and on each list card.
- Show a **"next action / whose turn"** label from `STAGE_ACTOR[currentStage]` ("Awaiting brand approval" vs "Awaiting creator upload").
- **Fix B4** while here: `active`/`completed` counts must come from `campaign_projects.status`, not the non-existent `collab_requests.status='completed'`.

**Acceptance:**
- [ ] Every active project on the dashboard shows a % progress bar and a "whose turn" hint.
- [ ] Completed count matches `campaign_projects` reality.
- [ ] A completed project can appear on the creator's public profile (opt-in) with a rating.

---

### Migration numbering summary (append-only)
| File | Adds |
|---|---|
| `051_project_reviews.sql` | reviews table + RLS + `get_creator_rating` / `get_creator_public_reviews` RPCs |
| `052_project_payments.sql` | payments table + RLS (+ webhook path for Option A) |
| `053_pii_lockdown.sql` | B2 — remove broad PII SELECT policies, add safe view/RPC access |
| *(app-only)* | `lib/project-lifecycle.ts` (G1), reviews/payments API routes, dashboard progress UI |

When the skeleton is built, bring it back and I'll audit: RLS correctness, that the webhook is the only `paid` writer, that the role model is actually enforced server-side (not just hidden in the UI), and that the dashboard numbers reconcile with the tables.

---

*End of audit. Nothing in the codebase was modified to produce this document.*
