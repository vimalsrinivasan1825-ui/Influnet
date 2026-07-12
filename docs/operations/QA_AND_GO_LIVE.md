# Influnet — Go-Live Checklist, Manual QA & Path to a Solid Product

**Date:** 2026-07-12
**Branch:** `ui/redesign`
**Author:** Pre-deploy security + readiness audit (code + DB level)

This document has three parts:

1. **Part A — Current state** (what's done, what's not).
2. **Part B — Manual QA / test script** (run this before opening to external users).
3. **Part C — Roadmap to a solid product** (prioritized: launch blockers → hardening → growth).

> How to read priorities: **P0** = do before *any* public traffic · **P1** = do before *real/paid* traffic · **P2** = quality & growth, can follow after launch.

---

## Part A — Current state snapshot

### ✅ Already solid (verified in code)
- **Auth model:** all `/api/*` routes self-authorize via `withAuth` (JWT verified server-side, RLS-scoped client). Admin routes gated by `withAdmin` (role check → service-role client). The proxy (`src/proxy.ts`) redirects logged-out users away from `/dashboard/*`.
- **PII (email/phone):** locked at the **column** level — migration 048 revokes `SELECT` on `profiles` from `anon` + `authenticated` and grants back only safe columns. email/phone reachable only via `get_own_profile()` or admin service-role.
- **Open redirect:** login validates `next` is a relative path (`/login/page.tsx`).
- **Discovery:** server-side search + keyset pagination via `SECURITY DEFINER` RPCs (migration 048) — no raw table scrape.
- **Project lifecycle:** single shared state machine (`lib/project-lifecycle.ts`) with a **per-role actor model** (`STAGE_ACTOR`) enforced server-side in `api/projects/[id]/route.ts`.
- **Chat:** Stream token is self-scoped; webhook verifies `x-signature`.
- **OTP:** DB-level rate limit (migration 026).
- **Tests:** 38 unit tests pass; CI runs typecheck + lint + unit + integration + build + e2e.
- **Error UX:** `app/error.tsx` and `app/not-found.tsx` exist.

### 🔧 Fixed in this audit (were blocking)
- **Migration 051** `reviews.project_id` was `uuid` but `campaign_projects.id` is `BIGINT` → `supabase db push` would crash. Now `bigint`.
- **Review forgery:** reviews `INSERT` RLS only checked the author. Now requires completed project + participant + reviewee-is-counterparty (enforced in the DB, not just the route).
- **Business PII:** `gst_number`, `registered_address`, `marketing_budget` were readable by any logged-in user. Migration 053 now revokes table `SELECT` and grants only safe columns; owner reads via new `get_own_business_profile()` RPC.
- **Reviews route:** wrong Next.js 16 param signature (never built), leaked DB errors, accepted non-integer ratings — all fixed.
- **Broken build:** the branch failed `tsc` in 3 places (stale `total_earnings`/`total_budget_sum` vs renamed `pipeline_value`; Stream `total_unread_count` typing). Fixed — **build is now green (compile + typecheck + 41 pages).**

### ⛔ Not done — human/infra steps (see Part C)
- Separate **production** Supabase project (currently one project `jaajosocopoicmqcffuu` for everything).
- Secrets in the host's store; remove `SUPABASE_ACCESS_TOKEN` from `apps/web/.env.local`.
- **Error monitoring** (Sentry) — none wired.
- **App-level rate limiting** (Upstash) on public routes — only OTP has a DB limit.
- **DB backups / PITR** on prod.
- **Payments** — no gateway, no `payments` table (payment stages are cosmetic).
- Auth **Site URL + SMTP**, Stream **webhook URL** for the prod domain.

---

## Part B — Manual QA / Test Script

Run these **in order**. Each step says what to do and the **expected** result. If an ❌-marked "must fail" step *succeeds*, stop — that's a live vulnerability.

You'll need: 1 **admin** account, 2 **business** accounts (one you'll get approved, one rejected), 2 **creator** accounts in different niches. Create extra accounts across verticals (skincare / SaaS / restaurant; beauty / tech / food) to exercise discovery.

### Step 0 — Apply migrations & deploy
1. On the **production** Supabase project:
   ```bash
   supabase link --project-ref <PROD_REF>
   supabase db push
   ```
   ✅ **Expected:** applies cleanly through migration `053`. If it errors on `051`/`053`, stop and capture the output.
2. Deploy edge functions: `supabase functions deploy phone-otp && supabase functions deploy auth-signup`.
3. Deploy the web app with all prod env vars set **in the host** (never in git).
4. In Supabase Auth: set **Site URL** + **Redirect URLs** to the prod domain; configure **SMTP**.
5. In Stream dashboard: set webhook to `https://<domain>/api/stream/webhook`.

### Step 1 — Security spot-checks (the ones that matter most)
6. **Logged out**, open `/dashboard` → ✅ redirects to `/login`.
7. **Public profiles stay public:** open `/c/<creator-username>` and `/b/<business-username>` while logged out → ✅ both load (200).
8. **PII is not scrapable.** Using the anon key (or any test user's JWT) against the REST API:
   - `GET /rest/v1/profiles?select=email,phone` → ❌ **must return permission error / no email+phone**.
   - `GET /rest/v1/business_profiles?select=gst_number,registered_address,marketing_budget` → ❌ **must return permission error / empty**.
9. **Review forgery is blocked.** As creator A (with a valid JWT), POST directly to the REST API a review row for a project you're **not** in, or one that is **not** `completed` → ❌ **RLS must reject it**.
10. **Cross-tenant project access.** As user X, `GET /api/projects/<id-of-a-project-you-are-not-in>` → ❌ **403 Forbidden**.

### Step 2 — Admin gate
11. Log in as **admin** → `/dashboard/admin/approvals`. Approve business #1, reject business #2.
12. Log in as business #2 (rejected) → ✅ sees the "not approved" gate. Business #1 → ✅ full dashboard.

### Step 3 — Discovery & request (business → creator)
13. As approved business → `/dashboard/discover`. Try the **search box** and **filters** → ✅ results update; pagination works.
14. Open a creator → send a collab request with a **budget + message** → ✅ appears in that creator's `/dashboard/requests`.
15. Send a **second** request to the same creator while one is pending → ✅ blocked (one pending per pair).

### Step 4 — Accept & project creation (creator)
16. As the creator, **accept** → ✅ a project appears for **both** parties at `/dashboard/projects`, and a chat conversation exists.
17. Note the project **title** = first line of the request message. Send a request starting with a blank line → ✅ title falls back to "New Collaboration".

### Step 5 — Pipeline & the role model
18. Advance the pipeline from **both** the projects list page and the detail page → ✅ both work (same endpoint).
19. As the **creator**, try to advance `final_approval` and `final_payment` → ❌ **403 "Only the business can advance…"**.
20. As the **business**, try to advance `shooting_in_progress` / `editing_in_progress` → ❌ **403 "Only the creator can advance…"**.
21. Advance legitimately through to `project_completed` → ✅ status flips to `completed`.

### Step 6 — Workspace
22. In the detail page: add Kanban cards, set due dates / meeting links, drag between columns, **upload a deliverable** (≤25 MB) → ✅ all persist.

### Step 7 — Reviews (the completion payoff)
23. On the completed project, submit a **rating + comment** as each side → ✅ saves once.
24. Submit again → ❌ "You have already reviewed this project."
25. Open the creator's public `/c/<username>` → ✅ the rating/aggregate shows.

### Step 8 — Settings (watch this one — it exercises the PII fix)
26. As a **business owner**, open `/dashboard/settings` → ✅ **GST number / registered address / marketing budget load**, and **save** round-trips correctly. *(This is the single flow the migration-053 change could regress — verify carefully.)*
27. As a **creator**, edit bio/handles/pricing → ✅ saves.

### Step 9 — Dashboards
28. Business + creator home: ✅ active/completed counts reflect reality; the money figure reads **"Pipeline value"** (not "earnings") until real payments exist.

### Step 10 — Smoke & logs
29. Watch **Supabase logs** + **host (Vercel) logs** through all the above → ✅ no unexpected 500s.

**Green means:** if steps **8, 9, 16, 19–20, 23–24, and 26** pass and every ❌-"must fail" step fails as expected, the security fixes are proven live and the core loop works end-to-end.

---

## Part C — Roadmap to a Solid Product

### 🔴 P0 — Before any public traffic (infra & data safety)

1. **Separate production Supabase project.** Don't reuse the dev project (`jaajosocopoicmqcffuu`). Fresh project = prod; `db push` all 49 migrations; regenerate keys.
2. **Secrets hygiene.**
   - All secrets in the host's secret store (Vercel env, Production scope), never in git.
   - **Remove `SUPABASE_ACCESS_TOKEN`** (the `sbp_…` management token) from `apps/web/.env.local` — it's not needed at runtime and is one `git add -f` from disaster.
   - Confirm `SUPABASE_SERVICE_ROLE_KEY` and `STREAM_API_SECRET` are **server-only** (never `NEXT_PUBLIC_`).
3. **DB backups / PITR** enabled on the prod project. Verify a restore once.
4. **Make CI a merge gate.** The branch was shipped with a red build; CI (typecheck + lint + build + tests) already exists — require it to pass on `main` and block merges that fail. This alone would have caught the broken build.
5. **Apply & verify migrations on prod** (Part B Step 0). RLS and column grants only protect you once actually applied.

### 🟠 P1 — Before real / paying users

6. **Error monitoring (Sentry).** Nothing reports failures today except server logs. Add Sentry to `apps/web` (client + server + edge), wire it into `app/error.tsx` and route `catch` blocks. Non-negotiable for a real launch.
7. **App-level rate limiting (Upstash).** Only OTP has a DB limit. Add per-IP/per-user limits on: `POST /api/auth/register`, `POST /api/projects/[id]/reviews`, `POST /api/collabs`, `/api/discover`, and the Stream token route. Prevents spam/enumeration/cost blow-ups.
8. **Payments decision (currently the biggest product gap).** Payment stages are cosmetic — no gateway, no records. Choose:
   - **Option A (recommended, ₹/India):** integrate **Razorpay**. Add a `project_payments` table; a **signature-verified webhook** (mirror `api/stream/webhook`) is the *only* writer of `status='paid'`; gate `advance_payment`/`final_payment` on a matching paid record.
   - **Option B (V1 off-platform):** relabel the two payment stages as **manually-marked milestones** in the UI so no one expects escrow, and record them in the same table with `provider='manual'`.
   - Then fix "earnings"/"spend" to sum **paid** amounts, not accepted budgets.
9. **Admin audit log.** `withAdmin` gates admin routes, but approve/reject/user actions aren't recorded. Add an `admin_actions` table (actor, action, target, timestamp).
10. **Abuse & content safety.** Add basic length/'content' validation and (optionally) profanity/spam checks on free-text: request messages, review comments, project titles. Add a **report/block** path for messaging.
11. **Storage policy review.** Confirm `project-assets` / avatar / profile-photo buckets have correct public/private + size/type limits, and that asset URLs aren't guessable across tenants.
12. **Email deliverability.** Configure SMTP + verified `EMAIL_FROM`; test signup-confirmation and password-reset actually deliver in prod (they silently no-op without SMTP).

### 🟡 P2 — Quality, trust & growth

13. **Reputation → discovery.** Feed the new review aggregate + completed-project count into `search_influencers`/`search_businesses` ordering so highly-rated creators surface first.
14. **Completion showcase.** Let creators opt-in to show completed campaigns (title + one asset) on their public `/c/[username]` — social proof that makes completion meaningful.
15. **Dashboard "progress + whose turn."** Use `stageProgressPercent()` for a per-project progress bar and a "next action" label from `STAGE_ACTOR` ("Awaiting brand approval" / "Awaiting creator upload").
16. **Two-party confirmation** on money + completion stages (`final_approval`, `final_payment`, `project_completed`) — both parties confirm before it advances. Reduces disputes.
17. **Test coverage.** Add integration/e2e tests for the RLS invariants proven manually in Part B (PII lockdown, review forgery, cross-tenant 403, role model) so they can't silently regress. Un-skip the 6 integration tests against a seeded test project.
18. **Observability & performance.** Add structured logging, DB indexes review under load, and a `/healthz` endpoint. Consider a status page.
19. **Legal/compliance for public launch.** Terms of Service, Privacy Policy, cookie/consent handling, and a data-deletion path (GDPR/Indian DPDP) — required once you hold real user PII and process (or route) payments.
20. **Accessibility & responsive pass** on the redesigned dashboard (keyboard nav, focus states, mobile breakpoints, dark mode).

---

### Suggested execution order
**P0 (1–5)** → deploy to a locked-down prod → **Part B QA** → **P1 (6–12)** with payments (8) as the headline → re-run QA → **P2** iteratively.

You are **code-ready and security-ready** at the code level today. What stands between you and a confident public launch is the **infra checklist (P0)** and **monitoring + rate-limiting + payments (P1)** — none of which are code defects, all of which are operational decisions only you can execute.
