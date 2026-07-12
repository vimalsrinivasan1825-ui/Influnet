# Influnet — V1 Readiness Report

**Date:** 2026-07-10
**Scope:** Verified audit of the codebase + live Supabase database against `deep_analysis_report.md`, plus a senior-architect review of what must be true before the initial version can be considered stable.

Every claim below was verified against the actual code and the **live database** (RPC existence, RLS policies, migration history, real HTTP behavior of the running dev server) — not assumed.

---

## 1. Executive Summary

The platform's core loops (auth → discovery → collab request → messaging → project workspace) largely exist. But V1 readiness is blocked by three classes of problems:

| Class | Verdict |
|---|---|
| **Silent security failures** | Route-protection middleware is **dead code** on Next.js 16 — every dashboard URL is server-reachable without login. PII (email/phone) of influencers is readable by anyone via RLS. |
| **Broken user-facing flows** | "Forgot password?" links to a page that **does not exist** (empty directory → 404). Business public profiles will break the moment middleware is fixed (missing from public paths). |
| **Missing table-stakes features** | Discovery has no search, no filters, no pagination (hard cap of 30 rows). No tests exist anywhere (0 test files). |

Your `deep_analysis_report.md` was directionally right but **stale in both directions**: two of its three "pending" items are already substantially done (CTA deep-linking, profile-view tracking), while it missed the highest-severity issues entirely (dead middleware, PII exposure, empty reset-password route).

---

## 2. Verification of Your Analysis Doc — Item by Item

### 2.1 Public Profile CTA loop (your Task 2.3) — ✅ ~80% DONE, 2 real gaps

Verified working:
- `login/page.tsx` reads `next` and routes to it after login for all three roles (lines 56–60), and forwards it to signup.
- Both `signup/business` and `signup/influencer` read `next` and `router.push(nextParam)` after signup, and forward it through the email-confirmation → login path.
- `dashboard/discover/page.tsx` **already implements** the `?request=<id>` deep link (lines 84–101): it reads `useSearchParams()`, finds the target, and auto-opens the collaboration modal, correctly skipping if a request was already sent.
- `record_profile_view` RPC **exists in the live DB** (verified via `pg_proc`) and correctly double-writes to `profile_views` (raw log) and `creator_profile_views` (per-business aggregate).

Real gaps:
1. **Deep-link only works if the target is in the first 30 results.** `/api/discover` hard-caps at `.limit(30)` with no way to fetch a specific user. A business clicking "Request Collaboration" on creator #31's public profile lands on discover and *nothing happens* — no modal, no error. Fix: when `?request=` is present and the target isn't in results, fetch that one profile directly (small API addition), or better, pass the request through a dedicated endpoint.
2. **No dedup/rate-limit on `record_profile_view`.** Verified: the function inserts a row into `profile_views` on *every* call, is `SECURITY DEFINER`, and is callable by the **anon** role. Anyone can `curl` it in a loop and inflate a creator's view counts / bloat the table. Fix: inside the RPC, skip insert if the same `(influencer, viewer/IP-day)` pair was recorded in the last N minutes; keep the aggregate table's upsert as-is.

### 2.2 Password Reset (your Task 2.4) — ❌ NOT DONE, and worse than the doc says

- The login page **already renders a "Forgot password?" link** pointing to `/reset-password`.
- `src/app/reset-password/` **exists but is completely empty** — no `page.tsx`. Clicking the link today = 404. This is a live broken link in the auth flow, not just a missing feature.
- No forgot-password (email entry) UI exists anywhere.

Required (as your doc says, plus edge cases in §5.1):
- `/reset-password` page with two modes: (a) no recovery session → email form → `supabase.auth.resetPasswordForEmail(email, { redirectTo })`; (b) recovery session present (from email link) → new-password form → `supabase.auth.updateUser({ password })`.
- Note: Supabase recovery links land the user with a session established via URL hash/`code` param — the page must call `supabase.auth.exchangeCodeForSession()` / listen for the `PASSWORD_RECOVERY` auth event before showing the form.

### 2.3 Discovery Search & Filtering (your Task 3.6) — ❌ NOT DONE (confirmed)

Verified: `/api/discover` is a bare `select … limit 30` with zero query params. The page has no search input, no filters, no pagination UI. Your doc's plan is correct. Concrete design in §6.3.

---

## 3. Critical Findings Your Doc Missed (fix before anything else)

### 3.1 🔴 P0 — Route-protection middleware is DEAD CODE

**Evidence:** `curl http://localhost:3000/dashboard` and `/dashboard/settings` with **no auth** both return **200** — the middleware's redirect-to-login never fires.

**Why:** Two compounding problems:
1. Next.js 16 **renamed the `middleware` file convention to `proxy`** (verified in this repo's own `node_modules/next/dist/docs/…/proxy.md`: *"The `middleware` file convention is deprecated and has been renamed to `proxy`"*).
2. The file must live **at the same level as `app`** — i.e. `apps/web/src/proxy.ts` for this project. The current file sits at `apps/web/middleware.ts` while the app lives in `src/`, so it's not picked up at all.

**Impact:** Every dashboard page renders server-side for unauthenticated visitors. Actual *data* is still protected because pages fetch via Bearer-token APIs client-side — but this is defense-in-depth lost, and any future server-rendered dashboard page would leak data outright.

**Fix (30 min):**
- Move + rename: `apps/web/middleware.ts` → `apps/web/src/proxy.ts`, export `proxy` instead of `middleware` (Next ships a codemod: `npx @next/codemod@canary middleware-to-proxy .`).
- **While you're in there, add `/b/` to `publicPaths`** — it's currently missing, so the moment the proxy starts working, every logged-out visit to a business public profile will bounce to `/login`. (This is a latent bug that "works" today only because the guard is dead.)
- Verify with the same curl checks: `/dashboard` → 307 to `/login`; `/c/vimal2123` and `/b/arjun123` → 200.

### 3.2 🔴 P0 — Influencer PII exposed via RLS

**Evidence (live DB `pg_policies`):** `profiles` has policy `influencer_profiles_select_public` with `qual: role = 'influencer'` — i.e. **any client, including anonymous**, can `select *` on every influencer's `profiles` row. That table includes `email` and `phone`.

**Impact:** A competitor can scrape every creator's email and phone number with the public anon key. This is the single most important data-protection issue in the app.

**Fix:** Replace the broad policy with column-safe access:
- Public profile data already flows through `SECURITY DEFINER` RPCs (`get_public_influencer`) which return a curated column list — the broad SELECT policy is unnecessary for the public page.
- If discover/messaging needs cross-user reads of `name`/`location`, either (a) create a `public_profiles` view exposing only safe columns and grant on the view, or (b) keep a narrow policy but move `email`/`phone` out of `profiles` into a `private_profile_data` table with owner-only RLS. Option (a) is less invasive for V1.
- Same review for `influencer_profiles_select_authenticated` / `business_profiles_select_authenticated` (`qual: true`): any logged-in user can read *all* columns — including `gst_number`, pricing, `registered_address`. Decide per-column what is genuinely public-to-members.

### 3.3 🟠 P1 — Secrets hygiene

- `apps/web/query_db.mjs` contains a hardcoded Supabase **personal access token** (`sbp_…`) with full management-API power over the project (I used it in this session to run DDL — that's how powerful it is). It's untracked, but one accidental `git add .` away from being in history. **Delete the file and revoke/rotate the token** (Supabase dashboard → Account → Access Tokens). Same for `test-get-creator.js` / `test-schema.js` (they only use env vars — fine — but they're clutter at repo root).
- `/api/admin/seed` exists as a route. Verify it's role-gated (and consider deleting it before production deploys — seed endpoints reachable in prod are a classic incident).

### 3.4 🟠 P1 — Auth/session architecture is three overlapping systems

Currently in simultaneous use:
1. `localStorage.getItem('influnet_token')` — hand-rolled token cache, passed as `Bearer` to APIs.
2. `supabase.createClient()` in-browser sessions (its own localStorage persistence).
3. `@supabase/ssr` cookie sessions (used by the middleware-that-doesn't-run and `createRSCClient`).

Risks: tokens in localStorage are readable by any XSS; the hand-rolled `influnet_token` can go stale while the Supabase client silently refreshes its own copy (classic "works for 1 hour then 401s" bug); three sources of truth for "who is logged in."

**V1 recommendation (pragmatic, not a rewrite):** keep the Bearer-token API pattern (it works and RLS enforces safety), but derive the token **only** from `supabase.auth.getSession()` at call time — never from `localStorage.influnet_token`. Delete the custom key entirely. Post-V1: consider moving fully to cookie-based `@supabase/ssr` so server components can fetch data directly.

---

## 4. What's Actually in Good Shape (verified)

So you know where *not* to spend time:

- **Public profiles**: `/c/[username]` and `/b/[username]` render correctly (fixed this session: RPCs repaired in live DB, migrations renumbered to 045/046 and recorded in history).
- **Profile settings**: username save + display works for both roles (fixed this session).
- **Collab request loop**: discover → modal → `POST /api/collabs` with Zod validation → requests page, with duplicate-send guarding (`sentIds`).
- **API layer discipline**: consistent `withAuth` (user-JWT + RLS, not service key — good), consistent `jsonError`, Zod schemas on writes. This is a solid foundation.
- **RLS on write paths**: insert/update policies on profile tables are correctly owner-scoped (verified in live DB).
- **Notifications pipeline**: migration 047 is applied (table + triggers live), API routes exist, realtime badge work is in progress in your working tree.
- **Business approval gating**: pending/rejected businesses get a gate screen in the shell.
- **Stream Chat integration**: token endpoint (fixed this session), webhook, channel API all present.

---

## 5. Edge Cases & Bottlenecks Per Flow (the "everything must work" list)

### 5.1 Auth
- [ ] Reset password: expired/reused recovery link → show clear error + re-request form (don't render the password form without a valid recovery session).
- [ ] `next` param must be validated as a **relative path** (`/…`) before `router.push(nextParam)` — currently an attacker can craft `?next=https://evil.com` for an open-redirect after login. One-line guard: `nextParam.startsWith('/') && !nextParam.startsWith('//')`.
- [ ] Email-confirmation dead ends: user signs up, closes tab, logs in unconfirmed — verify the error message tells them to check email rather than a generic failure.
- [ ] Session expiry mid-use: every `fetch` with a stale Bearer gets 401 — the shell should catch a 401 from `/api/*`, refresh via `supabase.auth.getSession()`, retry once, then redirect to login. Right now each page handles (or ignores) this differently.
- [ ] Duplicate signup with existing email → friendly message, not raw Supabase error.

### 5.2 Public profiles & CTA
- [ ] Deep-link target outside first 30 discover results (see §2.1 gap 1).
- [ ] Username changed after links were shared → old URL 404s. Acceptable for V1, but return a branded 404 page ("this creator moved") instead of the default.
- [ ] Username uniqueness: DB has `UNIQUE` on both tables, but the two namespaces are independent — `/c/acme` and `/b/acme` can both exist (fine, different routes) — however the **save path returns a raw 500** on duplicate. Map Postgres `23505` to a 409 with "username already taken" in `/api/profile` PATCH, and ideally add a debounced availability check in settings UI.
- [ ] Reserved usernames: block `admin`, `api`, `dashboard`, `login`, `signup`, `settings`, etc. at the validator level (`z.string().refine(...)`) so nobody claims `/c/admin`.
- [ ] `record_profile_view` spam (see §2.1 gap 2).

### 5.3 Discovery (when you build search)
- [ ] Search input must be debounced (300ms) and the query param driven (`?q=&niche=&page=`) so results are shareable/back-button-safe.
- [ ] Use `ilike` on `name/username/headline` for V1 (with `pg_trgm` GIN indexes: `CREATE INDEX ... USING gin (name gin_trgm_ops)`) — full-text search is overkill until you have >10k creators.
- [ ] **Keyset pagination** (cursor on `created_at,user_id`) over offset — offset pagination degrades linearly and double-shows rows when new creators sign up mid-scroll. If you want simple: offset is acceptable for V1 with `LIMIT 24` pages, but write the API contract as cursor-shaped (`?cursor=`) so you can swap internals later.
- [ ] Empty states per filter combination ("no Tech creators in Chennai — clear filters?").
- [ ] The discover API returns *all* columns the policy allows — after the §3.2 RLS fix, re-verify discover still gets `name`/`location` (it uses an `!inner` join on `profiles`).

### 5.4 Collab requests
- [ ] Double-submit: `sendRequest` guards with `submitting`, but the API should also enforce uniqueness (partial unique index on `(from_user_id, to_user_id) WHERE status='pending'`) — two tabs can currently create duplicate pending requests.
- [ ] Request to a user who deleted/was rejected → API should 404 cleanly.
- [ ] Budget: client sends `Number(form.budget)` — `NaN` if someone types `25,000`. Validate client-side and let Zod's `.positive()` be the backstop (it already is).

### 5.5 Messaging & notifications
- [ ] Stream Chat env vars absent → shell now silently skips (good); messages page should show a "messaging unavailable" state rather than infinite spinner.
- [ ] `disconnectUser()` race: shell connects/disconnects Stream on every dashboard mount; messages page has its own client. Two `connectUser` calls for the same user from different components can race — you already guard with `streamClient.userID === user.id`; keep the singleton pattern (`StreamChat.getInstance`) and never call `disconnectUser` from the shell if the messages page might be using it. Consider a single shared context/provider for the Stream client (post-V1 cleanup).
- [ ] Notification triggers (047): verify each trigger fires exactly once per event and that `link` paths match real routes. Realtime publication was **dropped and recreated** in 047 (`DROP PUBLICATION supabase_realtime`) — verify other realtime consumers (presence, typing, collab-request badge on `collaboration_requests`) still receive events, because that DROP removed every previously-published table. **This is a likely regression hiding in the working tree.**
- [ ] Unread counts: mark-read must be idempotent and scoped (`read_at IS NULL` filter in the update).

### 5.6 Projects workspace
- [ ] Stage transitions (`advance_payment` → … → `project_completed`): enforce legal transitions server-side (currently `ProjectUpdateSchema` accepts any stage in any order — an influencer could jump straight to `final_payment`). A simple allowed-transitions map in the API route is enough for V1.
- [ ] **Payments are referenced but not integrated** (verified: no gateway SDK anywhere). Decision needed for V1: (a) stages are manually confirmed by both parties ("mark advance as received") — recommended for V1; or (b) integrate Razorpay — significant scope (webhooks, refunds, disputes, payouts, compliance). Do **not** let stage names imply money moved when nothing verified it; add an explicit confirmation step by the receiving party.

### 5.7 Platform-wide bottlenecks
- [ ] **No rate limiting on any API route** (only the OTP flow has a DB-level limiter). Minimum V1: per-IP limit on auth endpoints, collab creation, and `record_profile_view`. On Vercel, `@upstash/ratelimit` is the standard cheap answer; or a simple Postgres-based token bucket since you already have the DB.
- [ ] **Zero tests** (0 `*.test.*`/`*.spec.*` files). See §6.4 for the minimal V1 test strategy.
- [ ] `/api/discover` and dashboards do unbounded `select *`-ish queries — fine at current scale; indexes + pagination (§5.3) cover this.
- [ ] Error observability: `jsonError` logs to console only. Add Sentry (or at minimum Vercel log drains) before real users hit errors you can't reproduce.
- [ ] Migration discipline: this week's incident (028/029 written but never applied, colliding numbers, DB drifted from files) will recur unless: one PR = one migration, applied via `supabase db push` (never SQL editor), numbering always max+1, and CI check that `supabase_migrations.schema_migrations` matches `supabase/migrations/`.

---

## 6. Senior-Architect Recommendations: Core Techniques for V1

### 6.1 Establish a single API contract
You're already 80% there with `withAuth` + Zod + `jsonError`. Finish it:
- Every route validates with Zod (some GET routes take unvalidated query params today — discover will, once search lands).
- Every error response is `{ error: string, code?: string }` — map known Postgres errors (23505 unique, 23503 FK) to 409/404 with human messages.
- Client-side: one `apiFetch()` helper that injects the token from `supabase.auth.getSession()`, handles 401-refresh-retry, and never calls `res.json()` without checking `res.ok` (this exact bug bit you twice this week — shell.tsx stream token, and every `err.json()` in catch blocks).

### 6.2 Security baseline (order of operations)
1. `src/proxy.ts` migration + `/b/` public path (§3.1) — 30 min.
2. RLS PII lockdown (§3.2) — half a day incl. re-verifying discover/messages.
3. Revoke the `sbp_` token, delete debug scripts (§3.3) — 15 min.
4. Open-redirect guard on `next` (§5.1) — 15 min.
5. Kill `influnet_token` localStorage usage (§3.4) — 1 day, touches many pages, do it once.
6. Rate limiting on auth + writes (§5.7).

### 6.3 Discovery search — concrete V1 design
- API: `GET /api/discover?q=&niche=&location=&price=&cursor=&limit=24`.
- Query: `ilike` on `name|username|headline` OR'd, `.contains('niche', [niche])` for the jsonb array, `.eq` city/state, price bucket ranges; order `created_at desc, user_id desc`; keyset cursor.
- Indexes: `pg_trgm` GIN on searched text columns; btree on `(city)`, GIN on `(niche)`.
- UI: debounced input + filter chips + "load more" (infinite scroll is a nice-to-have, button is fine for V1); all state in URL params.

### 6.4 Minimal testing strategy that actually pays for itself
Don't aim for coverage; aim for the money paths:
1. **API integration tests** (Vitest + a test Supabase project or `supabase start` local): profile PATCH (both roles, username conflict), collab create (duplicate guard), discover (filters + pagination), public RPCs (existing `test-get-creator.js` shows you already feel this need — formalize it).
2. **One Playwright smoke** per critical journey: signup → land on dashboard; login → edit username → view public profile; business → discover → send collab request. Run on CI against preview deploys.
3. RLS regression test: with the anon key, assert you *cannot* read `email`/`phone` from `profiles` — this locks in the §3.2 fix forever.

### 6.5 Migration & environment discipline
- All schema changes via numbered migration files, applied by `supabase db push`; CI compares applied history to the directory (a 10-line script — I can write it).
- Never the SQL editor for schema (data backfills okay, but record them).
- Introduce a staging Supabase project before launch; you are currently developing against what appears to be the only environment.

### 6.6 Launch checklist (Phase 3 gate)
- [ ] Error tracking (Sentry) wired for both client and API routes.
- [ ] `/api/admin/seed` deleted or hard-gated.
- [ ] Vercel (or host) env vars audited; no `NEXT_PUBLIC_` prefix on anything secret (checked today: STREAM_API_SECRET is correctly non-public).
- [ ] Branded 404/500 pages (`not-found.tsx`, `error.tsx` at app root).
- [ ] Custom domain + `NEXT_PUBLIC_SITE_URL` used in `resetPasswordForEmail` redirect and OG metadata (public profile metadata currently has no absolute URLs).
- [ ] Supabase: point-in-time recovery / backup plan confirmed; auth email templates branded.
- [ ] Basic analytics on the two conversion funnels (signup completion; profile-view → collab request).

---

## 7. Step-by-Step Execution Plan

Ordered so each step is independently shippable and testable. Estimates assume one developer.

### Phase 0 — Stop the bleeding (1–2 days)
| # | Task | Verify by |
|---|---|---|
| 0.1 | Migrate `middleware.ts` → `src/proxy.ts`, add `/b/` to public paths | curl: `/dashboard`→307, `/c/x` & `/b/x`→200 |
| 0.2 | Lock down `profiles` RLS (PII) | anon-key select on profiles returns no email/phone; discover & messages still work |
| 0.3 | Revoke `sbp_` token; delete `query_db.mjs`, root test scripts | token invalid via API |
| 0.4 | `next` open-redirect guard | `?next=https://evil.com` lands on `/dashboard` |
| 0.5 | Commit the in-flight notifications work (it's all uncommitted) after verifying the realtime-publication regression (§5.5) | presence/typing/badges still update live |

### Phase 1 — Complete the broken/missing core flows (3–5 days)
| # | Task | Verify by |
|---|---|---|
| 1.1 | Build `/reset-password` (both modes, §2.2) | full email round-trip on a real inbox; expired-link case |
| 1.2 | Deep-link fallback: fetch target profile when not in discover results | visit `/dashboard/discover?request=<id-of-31st-creator>` → modal opens |
| 1.3 | Username conflict → 409 + friendly message; reserved-name blocklist | save duplicate username → inline error, not 500 |
| 1.4 | `record_profile_view` dedup (per viewer per hour) | refresh public profile 10× → 1 row |
| 1.5 | Collab duplicate-pending unique index + API 409 | two tabs, same request → one row |

### Phase 2 — Discovery search & platform hardening (1 week)
| # | Task | Verify by |
|---|---|---|
| 2.1 | Discover API: q/niche/location/price/cursor + indexes (§6.3) | seeded 100 profiles; every filter combo returns correct pages |
| 2.2 | Discover UI: debounced search, filter chips, load-more, URL state | back button restores search state |
| 2.3 | `apiFetch()` helper: token from session, 401-retry, safe json | expire a session artificially → app recovers without logout loop |
| 2.4 | Remove `influnet_token` localStorage usage everywhere | grep returns 0 hits; all flows still work |
| 2.5 | Rate limiting on auth/collabs/profile-view | scripted 100 rps → 429s |
| 2.6 | Project stage transition validation + manual payment confirmation step | influencer cannot skip stages via API |

### Phase 3 — Test net + launch prep (3–4 days)
| # | Task |
|---|---|
| 3.1 | API integration tests for the §6.4 money paths + RLS regression test |
| 3.2 | 3 Playwright smoke journeys on CI |
| 3.3 | Sentry + branded 404/500 pages |
| 3.4 | Launch checklist (§6.6) walkthrough |
| 3.5 | Staging Supabase project + migration CI check |

**Total: roughly 3 working weeks to a genuinely hardened V1.**

---

## 8. Decisions You Need to Make (I recommend, you decide)

1. **Payments in V1:** manual two-party confirmation (recommended) vs. Razorpay integration (+1–2 weeks, real compliance surface).
2. **PII fix approach:** safe-columns view (recommended, fast) vs. splitting `email`/`phone` into a private table (cleaner, more churn).
3. **Pagination style:** cursor-shaped API from day one (recommended) vs. offset-now-migrate-later.
4. **Session architecture end-state:** keep Bearer-token APIs for V1 (recommended) and schedule the cookie/`@supabase/ssr` consolidation for V1.1, or bite it off now.
