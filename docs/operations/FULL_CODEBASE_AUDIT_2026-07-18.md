# Full Codebase Audit — Influnet

**Date:** 2026-07-18
**Scope:** `apps/web` (Next.js 16 app) + `supabase/migrations` (001–068). Landing app reviewed at surface level only.
**Method:** Six-stage sweep — feature inventory → architecture/SOLID → security → reliability/edge-cases → automated checks (typecheck/lint/test/build) → this report.
**Verdict:** The app is in genuinely good shape for a v1. Automated checks are all green. The security model is layered and thoughtful (RLS + column grants + SECURITY DEFINER accessors + signed webhooks). The blockers that remain are mostly **operational** (migration lag, single-instance rate limiting) plus a handful of **product-safety gaps** (blocking not enforced, hard-delete of paid projects). None of these should cause the app to "break" for a normal user on day one, but several are worth closing before real money and real creators are on it.

---

## 0. How to read this report

Findings are severity-ranked. Severity means:

- **P0 — Fix before launch.** Data loss, money, or a real security hole.
- **P1 — Fix soon.** Correctness or safety gap that will bite under real usage.
- **P2 — Hardening.** Improves reliability/consistency; not urgent.
- **P3 — Polish.** Code hygiene, small cleanups.

Every finding lists the file so you can jump straight to it.

---

## 1. Automated checks — all green ✅

Run on 2026-07-18 against `apps/web`:

| Check | Result |
|---|---|
| `tsc --noEmit` (typecheck) | **Pass** (0 errors) |
| `eslint src` | **Pass** (0 errors, 31 warnings — all unused-vars / `<img>` hints) |
| `vitest run` | **Pass** — 118 passed, 6 skipped (integration suite gated on live env) |
| `next build` (production) | **Pass** (exit 0, standalone output) |

This is a strong baseline: the code compiles, lints, tests pass, and it builds for production. The 31 lint warnings are cosmetic (dead imports, `<img>` vs `next/image`) and are listed in §7.

---

## 2. Feature inventory

The product is a two-sided influencer↔brand marketplace. Monorepo (`turbo`) with two apps: `landing` (marketing) and `web` (the product). Stack: Next.js 16 (App Router, `output: standalone`), React 19, Supabase (Postgres + Auth + RLS), Stream Chat, Razorpay, Cloudinary, Apify/HikerAPI for Instagram, Zod validation, Zustand state, Tailwind v4.

**42 API routes** across these domains:

| Domain | Routes | Notes |
|---|---|---|
| Auth / onboarding | `auth/register`, `auth/check-username`, `auth/scrape-instagram` | Registration via `register_profile` RPC; IG prefill unauthenticated + rate-limited |
| Profiles | `profile`, `profile/refresh` | Role-based (business/influencer); PII behind SECURITY DEFINER accessors |
| Discovery | `discover` | Business→creator search via `search_influencers` RPC (curated columns only) |
| Collaborations | `collabs`, `collabs/[id]` | Request → accept → auto-creates project + conversation |
| Messaging | `conversations`, `conversations/[id]`, `.../messages`, `stream/token`, `stream/channel`, `stream/webhook` | Stream Chat mirrored into Postgres via signed webhook |
| Projects / stages | `projects`, `projects/[id]` (+ `activity`, `cards`, `change-requests`, `payments`, `reviews`, `stage-entries`, `stage-items`) | 12-stage lifecycle state machine with bilateral sign-off |
| Payments | `projects/[id]/payments`, `payments/webhook` | Razorpay orders + signed webhook; env-gated with manual fallback |
| Verification | `verification`, `verification/ownership` | Live IG verification via provider abstraction |
| Uploads | `uploads/sign` | Signed Cloudinary direct-upload |
| Notifications | `notifications`, `notifications/summary` | In-app + optional email |
| Reports / blocks | `reports`, `blocks` | User safety primitives |
| Admin | `admin/{dashboard,users,businesses,collabs,projects,reports,verifications}` | Service-role, role-gated |
| Public | `b/[username]`, `c/[username]`, `vf/[code]`, `influnet/[slug]` | Public profiles + verification landing |
| Ops | `health` | Health probe |

**68 SQL migrations**, 32 tables with RLS enabled, ~25 SECURITY DEFINER RPCs. This is a mature schema.

---

## 3. Architecture & SOLID assessment

Overall the architecture is **layered cleanly**: route handlers are thin-ish controllers, `src/lib/*` holds domain/service logic, and the database enforces its own invariants (defense in depth). Here's the SOLID scorecard with evidence.

### Single Responsibility (SRP) — **B**
- **Good:** `lib/` modules are well-separated — `rate-limit.ts`, `payments/razorpay.ts`, `storage/cloudinary.ts`, `notify.ts`, `activity.ts`, `project-lifecycle.ts` each own one concern. `api.ts` centralizes `withAuth`/`withAdmin`/`jsonError`.
- **Weak spot:** [`app/api/projects/[id]/route.ts`](apps/web/src/app/api/projects/[id]/route.ts) is a **650-line PATCH handler** dispatching 11 different actions (advance, signoff, skip, completion, update, 3× cancellation…). This is the single biggest SRP violation in the codebase — it's really 11 command handlers wearing one trench coat. It works and is well-commented, but it's the file most likely to grow bugs during future edits. **Recommendation (P2):** extract a `projectActions/` module with one function per action, dispatched by a small map. No behavior change, much safer to evolve.

### Open/Closed (OCP) — **A−**
- The **Instagram/verification provider selector** ([`lib/instagram.ts`](apps/web/src/lib/instagram.ts)) is a textbook OCP/DIP win: Apify and HikerAPI implement the same interface, selected at runtime, and consumers depend on the abstraction (`InstagramProfile`, `InstagramProviderError`) not the concrete provider. Adding a third provider requires no consumer changes.
- The **stage lifecycle** (`STAGES`, `ALLOWED_TRANSITIONS`, `STAGE_ACTOR` in [`project-lifecycle.ts`](apps/web/src/lib/project-lifecycle.ts)) is data-driven — transitions are a table, not `if/else`. Good.

### Liskov / Interface Segregation — **N/A-ish (A)**
- Little classical inheritance (React + functional TS). The provider modules are structurally-typed and interchangeable, which is the LSP spirit. No fat interfaces observed.

### Dependency Inversion (DIP) — **B+**
- Payments, storage, and verification are all **env-gated behind capability checks** (`isRazorpayConfigured()`, `isCloudinaryConfigured()`, `activeProvider()`), so the app degrades gracefully when an integration is absent. That's inversion done pragmatically.
- **Weak spot:** Supabase client construction is duplicated inline in several routes (`createClient(URL, ANON_KEY, { global: { headers }})`) instead of always going through `withAuth`. See §4 P2 — this is both a DIP and a DRY issue.

### Cross-cutting observations
- **Consistency debt (P2):** Two error-handling patterns coexist. Most routes use the shared `jsonError` from `lib/api.ts` (logs server-side, hides internals). But [`reviews/route.ts`](apps/web/src/app/api/projects/[id]/reviews/route.ts) defines its **own local `jsonError`**, and it plus `stream/*`, `business/dashboard`, `influencer/dashboard` build the Supabase client inline rather than via `withAuth`. Same for `stream/token`, `stream/channel`, `scrape-instagram`. Not wrong, but it's four slightly different spellings of the same thing.
- **`require()` inside handlers (P3):** [`projects/[id]/route.ts:106`](apps/web/src/app/api/projects/[id]/route.ts) and the sign-off/skip branches use `const { … } = require('@/lib/project-lifecycle')` mid-function. In an ESM/Next build this works but defeats static analysis and tree-shaking, and `Stage` is imported as a value only to be used as a type. Convert to top-level `import`.

---

## 4. Security review

**Headline: the security posture is strong.** Auth is enforced server-side on every mutating route, RLS is broad, PII is column-locked, and both external webhooks verify HMAC signatures. The findings below are gaps at the edges, not a broken core.

### What's done right (keep it)
- **Every** admin route goes through `withAdmin` (JWT + `role === 'admin'` check) before getting a service-role client. No admin route is unguarded.
- **Both webhooks verify signatures** over the raw body with constant-time compare: Razorpay ([`payments/razorpay.ts:103`](apps/web/src/lib/payments/razorpay.ts)) and Stream ([`stream/webhook/route.ts:23`](apps/web/src/app/api/stream/webhook/route.ts)).
- **Self-approval is blocked** at registration — `approvalStatus` is stripped from the payload ([`auth/register/route.ts:30`](apps/web/src/app/api/auth/register/route.ts)) *and* the RPC guards it (migration 061).
- **PII is column-locked**: `email`/`phone` on `profiles` (048) and `gst_number`/`registered_address`/`marketing_budget` on `business_profiles` (053) are revoked from the authenticated role; owners read their own via SECURITY DEFINER RPCs.
- **Reviews can't be forged** even via direct PostgREST — the INSERT RLS policy (051) requires the caller be a participant of a *completed* project and only review the *other* party.
- **Payment gates can't be hand-ticked** when Razorpay is on: [`stage-items/route.ts:97`](apps/web/src/app/api/projects/[id]/stage-items/route.ts) blocks marking a payment gate done unless a `paid` ledger row exists.
- **Upload signatures** are server-side and the destination folder is server-chosen (can't be spoofed) — [`uploads/sign/route.ts`](apps/web/src/app/api/uploads/sign/route.ts).

### Findings

**P1 — Blocking is not enforced anywhere.** `user_blocks` is written by [`blocks/route.ts`](apps/web/src/app/api/blocks/route.ts) and read by a few UI components, but **no server path consults it**. `get_or_create_conversation` (migration 043), `messages` POST, `collabs` POST, and the Stream flow never check for a block. A blocked user can still open a conversation and message the person who blocked them. For a two-sided marketplace this is a real safety gap. **Fix:** enforce blocks in `get_or_create_conversation` and `messages` POST (and ideally `collabs` POST), or add a block predicate to the relevant RLS policies.

**P1 — Any user can cold-DM any other user.** `get_or_create_conversation(user1, user2)` only checks the caller is one of the pair — there's no requirement of an accepted collab, connection, or mutual interest. Combined with the missing block enforcement, this is a spam/harassment vector. **Fix:** gate conversation creation on an existing relationship (accepted collab / connection), or at minimum rate-limit + block-check it.

**P1 — Messaging and most mutating routes have no rate limit.** 23 of the mutating routes have no `enforceRateLimit`, including `messages` POST, `conversations` POST, `projects/[id]` PATCH, `profile` PATCH, and `reviews` POST. Message-send with no limit is the most abusable. Rate limiting exists and is good — it's just not applied broadly. **Fix:** add `enforceRateLimit` to message-send and other write paths (see also P0 infra below re: making it actually distributed).

**P2 — In-process rate limiter is per-instance until Upstash is wired.** [`rate-limit.ts`](apps/web/src/lib/rate-limit.ts) is correctly written to auto-upgrade to Upstash, but until `UPSTASH_REDIS_REST_URL/TOKEN` are set, the limiter is a per-instance floor. On serverless/multi-instance (Azure Container Apps / Vercel) the effective limit is `limit × instanceCount`, and it resets on cold start. This is the same "infra pending" item from prior audits — flagging it here because several new routes will rely on it. **Fix:** provision Upstash before relying on rate limits for abuse control.

**P2 — Inconsistent client construction bypasses the `withAuth` contract.** `reviews`, `stream/token`, `stream/channel`, `business/dashboard`, `influencer/dashboard`, and `scrape-instagram` build the Supabase client inline instead of via `withAuth`. They still authenticate correctly (except the intentionally-public `scrape-instagram`), but each is a place where the auth contract could drift. Reviews in particular re-implements auth *and* error handling locally. **Fix:** route them through `withAuth`.

**P2 — `error.message` returned to the client in 19 handlers.** e.g. [`business/dashboard/route.ts:142`](apps/web/src/app/api/business/dashboard/route.ts), all `admin/*` routes, `influencer/dashboard`, `stream/webhook`, `auth/register`. This can leak DB/internal details to the client on a 500. The shared `jsonError` already does the right thing (logs internally, returns a generic message) — these routes just don't use it. **Fix:** replace `NextResponse.json({ error: error.message }, {status:500})` with `jsonError(500, 'Internal server error', error)`.

**P3 — PostgREST `.or()` filter string interpolation.** e.g. `collabs`/`conversations` use `.or(\`from_user_id.eq.${user.id},...\`)`. `user.id` is a server-verified JWT UUID, so this is **not currently exploitable**, but the pattern is fragile — if any user-controlled value ever flows into an `.or()` string it becomes injectable. **Fix:** keep such interpolation restricted to server-verified UUIDs only; consider a helper that asserts UUID shape.

---

## 5. Reliability & edge-case review

**P0 (data integrity) — Accepting a cancellation HARD-DELETES the project and cascades to the payment ledger.** [`projects/[id]/route.ts:615`](apps/web/src/app/api/projects/[id]/route.ts) (`accept_cancellation`) runs `DELETE FROM campaign_projects`. FKs on `project_payments` (059), `project_activity` (062), and `reviews` (051) are all `ON DELETE CASCADE`, so **paid payment records, the activity audit trail, and reviews are destroyed with the project.** Worse, `request_cancellation` has **no status guard** — nothing stops a cancellation being requested (and accepted) on a project that already took an advance payment or even completed. Destroying financial records is a compliance and reconciliation problem, and it's irreversible. **Fix:** soft-delete (status = `cancelled` + `cancelled_at`) instead of hard delete; keep `project_payments` immutable. If a hard delete must stay, block it once any payment row exists.

**P1 — Migration lag is the standing #1 risk (from prior audits, still live).** Per project memory, the hosted DB has been running behind the migration set (051→068 range historically unapplied at various points). Multiple routes are written to *degrade gracefully* when a table/column is missing (`PGRST205` → empty result; "apply migration 056" hints). That defensiveness is good, but it means **features silently no-op if migrations aren't applied**, which reads as "working" locally and "broken" in prod. **Fix:** confirm every migration through 068 is applied to staging/prod, and add the health check in §8. I could not verify the live DB state from here.

**P1 — Payment webhook depends on a ledger row that a graceful-degrade path may never create.** In [`projects/[id]/payments/route.ts:100`](apps/web/src/app/api/projects/[id]/payments/route.ts), if the `project_payments` insert fails with `PGRST205` (table not migrated) the route **still returns the Razorpay order to the browser** and the user can pay. The webhook then finds "no ledger row for order," reports it, and returns 200 — so **a real payment can be captured by Razorpay with nothing recorded on our side.** This only triggers when migration 059 isn't applied, but it's exactly the migration-lag failure mode above, now touching money. **Fix:** if the ledger insert fails, do not hand back a payable order — fail closed (503) so no money moves without a record.

**P2 — Stage advance "fails open" when the checklist table is missing.** [`projects/[id]/route.ts:137`](apps/web/src/app/api/projects/[id]/route.ts) skips the required-items gate if `project_stage_items` errors. Reasonable for resilience, but combined with migration lag it means payment/approval gates can be bypassed by simply not having migration 054 applied. Acceptable *if* migrations are guaranteed applied (see P1 above); risky otherwise.

**P2 — Stream webhook trusts channel→conversation mapping without membership re-check.** [`stream/webhook/route.ts`](apps/web/src/app/api/stream/webhook/route.ts) inserts a message as `senderId` into `conversationId` derived from the channel name, using the service role, after verifying Stream's signature. The signature makes this low-risk, but there's no check that `senderId` is actually a participant of that conversation — it trusts Stream entirely. **Fix (defense in depth):** verify the sender is a participant before inserting.

**P2 — `notify`/`logActivity` are best-effort but some run before the response is returned.** The project PATCH handler `await`s notifications and activity writes inside the request path. They're wrapped defensively in places (payment webhook) but not everywhere; a slow `notifyUser` extends response latency. Low impact, worth knowing. **Fix:** fire-and-forget non-critical writes, or move to a queue.

**P3 — `reviews` route passes the raw URL `id` string as `project_id`** (a bigint column) without `parseInt`. PostgREST coerces it, but a non-numeric id yields a DB error surfaced as 500 rather than a clean 400. Minor.

---

## 6. Per-feature health scorecard

| Feature | Health | Notes |
|---|---|---|
| Auth / registration | 🟢 Strong | Self-approval blocked at route + RPC; role guarded |
| Profiles / PII | 🟢 Strong | Column grants + SECURITY DEFINER accessors |
| Discovery | 🟢 Strong | Curated-column RPC; role-gated |
| Collaborations | 🟢 Good | State-machine guarded; approval gate enforced server-side |
| Messaging | 🟡 Gaps | No block enforcement, no rate limit, cold-DM allowed |
| Projects / stages | 🟡 Watch | Solid logic but 650-line handler; hard-delete on cancel (P0) |
| Payments | 🟡 Watch | Signed webhook + gate integrity good; ledger-insert-fail path (P1) |
| Verification | 🟢 Strong | Clean provider abstraction; graceful fallback |
| Uploads | 🟢 Strong | Server-signed, folder locked |
| Admin | 🟢 Good | Uniformly role-gated; leaks `error.message` (P2) |
| Notifications | 🟢 Good | Best-effort, non-blocking mostly |
| Reports / blocks | 🟡 Gaps | Blocks stored but not enforced (P1) |

---

## 7. Lint warnings (all non-blocking)

31 warnings, 0 errors. All are either unused imports/vars or `<img>`→`next/image` hints:
- Unused vars: `change-requests/route.ts:158`, `projects/[id]/route.ts:80,106`, `stream/webhook/route.ts:4`, `api.ts:3-4`, `creator-profile.ts:197`, `server-rsc.ts:21`, several component imports (`Compass`, `Circle`, `Download`, `verifiedBadge`, `err`).
- `<img>` element: `error.tsx:32`, `not-found.tsx:17`.
- One `react-hooks/exhaustive-deps` in `project-flow.tsx:68`.

Worth a 20-minute cleanup pass but nothing here affects correctness.

---

## 8. Prioritized action plan

**Before launch (P0):**
1. Stop hard-deleting projects on cancellation — soft-delete and preserve `project_payments`. ([`projects/[id]/route.ts:615`](apps/web/src/app/api/projects/[id]/route.ts))
2. Confirm all migrations through 068 are applied to staging + prod; add a startup/health assertion that key tables exist (turn silent graceful-degrade into a loud alarm).

**Soon after (P1):**
3. Fail closed on payment order creation if the ledger insert fails — never hand back a payable order without a record. ([`payments/route.ts:100`](apps/web/src/app/api/projects/[id]/payments/route.ts))
4. Enforce `user_blocks` in conversation creation + message send (+ collab requests).
5. Gate cold conversations behind an existing relationship, or rate-limit + block-check them.
6. Add `enforceRateLimit` to message-send and other write routes.

**Hardening (P2):**
7. Provision Upstash so rate limits are actually distributed.
8. Replace all `error: error.message` 500s with the shared `jsonError`.
9. Route the inline-client routes (`reviews`, `stream/*`, dashboards) through `withAuth`.
10. Add participant re-check in the Stream webhook before inserting messages.
11. Refactor the 650-line project PATCH into per-action handlers.

**Polish (P3):**
12. Convert mid-function `require()` to top-level imports.
13. Clear the 31 lint warnings.
14. `parseInt` the project id in the reviews route.

---

## 9. Bottom line

You asked whether this is "a strong one" that "should not break." **Structurally, yes** — the code compiles, tests pass, builds clean, and the security architecture is better than most v1s (layered RLS, column grants, signed webhooks, server-side authorization on every mutation). The real risks are not in the code logic; they're at the **operational seams**: (1) migrations must actually be applied or features silently no-op, (2) the cancellation path can destroy financial records, and (3) two safety primitives (blocking, message rate-limiting) are built but not wired into the enforcement path. Close the P0s and the four P1s and this is a solid, launch-ready foundation.
