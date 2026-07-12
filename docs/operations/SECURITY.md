# Influnet — Security Model & Audit History

**Canonical security doc.** Read the model section before writing any API route, RLS policy, or migration. The audit-history section is the running record of every finding and its status — add new findings here, don't spawn new `FIX_*` files.

---

## 1. The auth / data-access model (learn this first)

There are **exactly three** ways code touches the database. Never invent a fourth.

1. **User-scoped API routes** — every route in `apps/web/src/app/api/*` (except admin + webhooks) calls **`withAuth(req)`** from `apps/web/src/lib/api.ts`. It reads the `Authorization: Bearer <supabase access token>` header, builds a supabase-js client carrying that user's JWT, verifies the user server-side, and returns `{ supabase, user, role }`. Queries through that client run as Postgres role **`authenticated`** with the caller's `auth.uid()`. **RLS policies + column grants are the real security boundary — not the route code.** The proxy (`apps/web/src/proxy.ts`) does *not* cover `/api/*`, so each route must authorize itself.

2. **Admin routes** — **`withAdmin(req)`** runs `withAuth` requiring `role === 'admin'`, then returns a **service-role** client (bypasses RLS + column grants). Needed because migration 048 hides `email`/`phone` from the `authenticated` role and admin screens legitimately need them. Service-role key is **server-only**, never `NEXT_PUBLIC`.

3. **`SECURITY DEFINER` RPCs** — for anything atomic or that must read columns the client role can't (`accept_collab_request`, `get_own_profile`, `get_own_business_profile`, `search_influencers/businesses`, `get_public_influencer/business`). They run as the function owner, so **every RPC must validate `auth.uid()` itself**. Gold-standard example: `supabase/migrations/043_accept_collab_and_conversation_rpcs.sql`.

### The PII column-lockdown (the thing most likely to bite you)
Migration **048** did, for `public.profiles`:
```sql
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, role, name, location, created_at, updated_at) ON public.profiles TO authenticated;
```
Migration **053** did the same for `public.business_profiles` (granting back only `user_id, company_name, industry`).

**Consequence:** any query through a `withAuth` client that selects `email`/`phone` from `profiles`, or `gst_number`/`registered_address`/`marketing_budget` from `business_profiles` — **including embedded selects like `profiles!fk(name, email)`** — fails the *entire* query with `permission denied` (Postgres 42501), surfaced as a 500. When selecting from these tables with the user client, **stick to the granted columns**; read your own full row via `get_own_profile()` / `get_own_business_profile()`; read others' public data via the `get_public_*` RPCs.

### Conventions to keep
- Migrations are **append-only and numbered**; one change = one new `0XX_*.sql`. Never edit an applied migration. Apply with `supabase db push` (never the SQL editor).
- `profiles.id` is `UUID`; **`campaign_projects.id` is `BIGINT`** — FKs to it must be `bigint`.
- Validate input at the route with Zod `safeParse` and forward `result.data` (never the raw body — Zod strips hostile extra keys).
- Never return raw DB errors to the client; log server-side, return a generic message.
- Enforce authorization in the **DB (RLS)**, not only in the route — the REST API (PostgREST) is directly reachable with the anon key + any JWT.

---

## 2. Current security posture (as of 2026-07-12)

✅ **Closed / in good shape**
- Route protection proxy live (`src/proxy.ts`); logged-out `/dashboard/*` → `/login`; `/c/*`, `/b/*` public.
- Email/phone PII locked at the column level (048); business GST/address/budget locked (053).
- Privilege-escalation to `admin` via `/api/auth/register` closed (route Zod whitelist + hardened `register_profile` RPC).
- Open-redirect on `?next=` guarded in login/signup (relative-path check).
- Discovery via `SECURITY DEFINER` search RPCs (no raw table scrape); keyset pagination.
- Project lifecycle: single shared state machine (`lib/project-lifecycle.ts`) with a per-role actor model (`STAGE_ACTOR`) enforced server-side.
- Reviews: DB-level RLS enforces "completed project + participant + reviewee-is-counterparty" (not just the route).
- Stream token self-scoped; Stream webhook verifies `x-signature`.
- OTP rate-limited at the DB (migrations 022/026); `record_profile_view` deduped (048).
- `.env*` git-ignored; all API routes self-authorize via `withAuth`/`withAdmin`.

⚠️ **Open — operational, before real traffic** (see [DEPLOYMENT.md](DEPLOYMENT.md))
- **App-level rate limiting** (Upstash) — only OTP has a DB limit. Add to register/reviews/collabs/discover/stream-token.
- **Error monitoring** (Sentry) — none wired.
- **Separate prod Supabase project** + secrets in host store; remove `SUPABASE_ACCESS_TOKEN` from `apps/web/.env.local`.
- **DB backups / PITR** on prod.
- **Admin audit log** — approve/reject actions aren't recorded.

---

## 3. Audit history (findings ledger)

Legend: 🔴 blocker · 🟠 high · 🟡 medium · ⚪ low · **status**: ✅ fixed · ⏳ open · 🧭 decision.

### Round 3 — Pre-deploy tester pass (2026-07-12)
Full detail folded from the round-3 session. Fixes are in the working tree on `ui/redesign`.

| Sev | Finding | Status |
|---|---|---|
| 🔴 | Migration 051 `reviews.project_id` was `uuid` but `campaign_projects.id` is `BIGINT` → `supabase db push` would crash. | ✅ changed to `bigint` |
| 🔴 | Reviews `INSERT` RLS only checked the author → anyone could forge reviews via PostgREST. | ✅ RLS now requires completed + participant + reviewee-is-counterparty |
| 🟠 | `business_profiles` `gst_number`/`registered_address`/`marketing_budget` readable by any authenticated user (048 only covered `profiles`). | ✅ migration 053: revoke + grant safe cols + `get_own_business_profile()` RPC |
| 🟡 | Reviews route: wrong Next 16 param signature (never built), leaked DB errors, non-integer ratings. | ✅ fixed |
| 🔴 | Branch failed `tsc` in 3 places (stale `total_earnings`/`total_budget_sum`, Stream `total_unread_count`) — **would not build/deploy**. | ✅ fixed; build green |

### Round 2 — Cloud deployment deep audit (2026-07-12)
Source: `archive/2026-07-12_CLOUD_DEPLOYMENT_AND_AUDIT.md` (Part B). Most items were fixed during/after; a few are product decisions tracked in [ROADMAP.md](../product/ROADMAP.md).

| ID | Finding | Status |
|---|---|---|
| B1 | Projects-list "Advance stage" 400s (UUID schema vs BIGINT id) | ✅ fixed (shared lifecycle) |
| B2 | Influencer PII readable via RLS | ✅ handled by 048 column grants |
| B3 | Two divergent project state machines | ✅ consolidated into `lib/project-lifecycle.ts` |
| B7 | Stage transitions had no role model | ✅ `STAGE_ACTOR` enforced |
| B8 | Open-redirect via `next` | ✅ guarded |
| B9 | `record_profile_view` no dedup | ✅ 048 dedup |
| B10 | Secrets hygiene / repo clutter | 🟠 partial — remove `SUPABASE_ACCESS_TOKEN` from `.env.local` (DEPLOYMENT.md) |
| B11 | Discovery no search/filter/pagination | ✅ 048 search RPCs |
| B4/B5 | "Completed"/"earnings" metrics wrong source | ✅ derive from `campaign_projects.status`; label "Pipeline value" |
| B6 | Payments cosmetic (no gateway/records) | 🧭 decision — see ROADMAP.md |

### Round 1 — Pre-launch fix KT (2026-07-10)
Source: `archive/2026-07-10_FIX_INSTRUCTIONS_index.md` + `_detailed.md`. All blockers/highs fixed and verified (43/43 E2E green in that session).

| ID | Finding | Status |
|---|---|---|
| FIX-01 | Privilege escalation to `admin` via `/api/auth/register` (+ business self-approve) | ✅ route whitelist + RPC hardening |
| FIX-02 | `/api/collabs*` selected `email` → 500 for every user (Requests page dead) | ✅ removed PII selects |
| FIX-03 | Projects list advance/cancel always 400 (UUID vs BIGINT) | ✅ fixed |
| FIX-04 | Pending-requests badge always 0 (wrong table) | ✅ fixed |
| FIX-05 | Test suite red (stale tests) | ✅ green (38 unit pass) |
| FIX-06 | Sender could self-accept a collab request (RLS too broad) | ✅ tightened |
| FIX-07 | No rate limiting on any route | ⏳ open (Upstash pending) |
| FIX-08 | Conversation delete used wrong Management-API credential | ✅ fixed |
| FIX-09 | `/dashboard` not role-gated | ✅ fixed |
| FIX-10 | Realtime publication only has `notifications` | ✅ verified benign (only consumer) |
| FIX-11 | API hardening (validation, bounded queries, try/catch) | ✅ shared `withAuth` + Zod |
| FIX-12 | Cleanup: creds file, debug scripts, dup index | ✅ mostly (see B10) |

Also from round 1: dead route-protection middleware (Next 16 `middleware`→`proxy`) — ✅ fixed; three overlapping session sources (localStorage tokens) — ✅ consolidated to live Supabase session; public `/api/admin/seed` endpoint creating a hardcoded admin — ✅ deleted, password rotated.

---

## 4. If you find a new issue
1. Add a row to the ledger above (new round section at the top if it's a new pass).
2. Fix in a branch; enforce in the DB (RLS) where possible, not just the route.
3. Verify by driving the real flow (see [QA_AND_GO_LIVE.md](QA_AND_GO_LIVE.md)), not just typecheck.
4. Record what broke/how in `.agents/lessons_learned.md`.
