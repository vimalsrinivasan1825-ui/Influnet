# Influnet — Pre-Launch Fix Instructions (KT Document)

**Date:** 2026-07-10
**Audience:** A developer who writes good code but has never seen this codebase.
**Source:** Full production-readiness audit of branch `dev` (typecheck ✅, `next build` ✅, test suite ❌ 6/33 failing).

Read the **Architecture Primer** first — every fix below assumes you understand it. Then work the fixes in order. Each fix is self-contained: context (why it's a problem), exact files/lines, step-by-step change, pitfalls, and a verification recipe. Do not skip the verification steps — several of these bugs were "fixed" before and regressed silently.

---

## Architecture Primer (10 minutes — read this first)

### Repo layout
- Turborepo monorepo. The only app is **`apps/web`** — Next.js **16** (App Router). ⚠️ Next 16 has breaking changes vs. what you may know: the middleware file convention is renamed to **`proxy`** and lives at `apps/web/src/proxy.ts`. Before touching framework-level files, read the matching doc in `apps/web/node_modules/next/dist/docs/`.
- Database is **Supabase (Postgres + RLS + GoTrue auth)**. All schema lives in numbered SQL files in `supabase/migrations/`. **Highest number today is 048 — your first new migration is 049.** One fix = one migration file. Apply with `supabase db push` (never the SQL editor for schema).
- Real-time chat is **Stream Chat** (`stream-chat` SDK). Supabase Realtime is used for one thing only: the notifications bell.

### The auth/data-access pattern (critical to understand)
There are exactly **three** ways code touches the database. Never invent a fourth:

1. **User-scoped API routes** — every route in `apps/web/src/app/api/*` (except admin/webhook) calls `withAuth(req)` from `apps/web/src/lib/api.ts`. It reads the `Authorization: Bearer <supabase access token>` header, builds a supabase-js client *carrying that user's JWT*, and returns `{ supabase, user, role }`. All queries through that client run as the Postgres role **`authenticated`** with the caller's `auth.uid()` — so **RLS policies and column-level grants are the real security boundary**, not the route code.
2. **Admin routes** — `withAdmin(req)` (same file) first runs `withAuth` requiring `role === 'admin'` on the caller's `profiles` row, then returns a **service-role** client (bypasses RLS and column grants). This exists because migration 048 hides `email`/`phone` from the `authenticated` role, and admin screens legitimately need them.
3. **SECURITY DEFINER RPCs** — for anything that must be atomic or must read columns the client role can't (e.g. `accept_collab_request`, `get_own_profile`, `search_influencers`). These run as the function owner (superuser-ish), so **every RPC must validate `auth.uid()` itself** — see `supabase/migrations/043_accept_collab_and_conversation_rpcs.sql` for the gold-standard example.

### Column-level PII lockdown (migration 048) — the thing most likely to bite you
`supabase/migrations/048_security_and_search.sql` did:
```sql
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, role, name, location, created_at, updated_at)
  ON public.profiles TO authenticated;
```
Consequence: **any query through a `withAuth` client that selects `email` or `phone` from `profiles` — including embedded selects like `profiles!fk(name, email)` — fails the entire query with `permission denied` (Postgres 42501), which our routes surface as a 500.** This is the root cause of FIX-02. When you write any new select against `profiles` with the user client, stick to the six granted columns.

### Client-side fetching
All dashboard pages call APIs via `apiFetch()` in `apps/web/src/lib/api-client.ts` — it pulls the token from the live Supabase session (never localStorage) and returns `{ ok, status, data, error }` without ever throwing on JSON parsing. Use it for any new client fetch.

### Key domain objects
- `profiles` (1 row per user; `role` = `business_owner` | `influencer` | `admin`) + role-specific extension tables `business_profiles` / `influencer_profiles`.
- `collab_requests` (UUID id) — business sends to influencer; accepting (via RPC) atomically creates a `campaign_projects` row + a conversation.
- `campaign_projects` — ⚠️ **`id` is `BIGINT`**, not UUID (root cause of FIX-03). Has a 12-stage pipeline (`collaboration_started` → … → `project_completed`) with a server-side allowed-transitions map.
- `conversations` / `conversation_participants` / `messages` — mirrored into Stream Chat; `messages.conversation_id` and `conversation_participants.conversation_id` both have `ON DELETE CASCADE` to `conversations`.
- `notifications` — filled by DB triggers (migration 047), consumed via Supabase Realtime in `apps/web/src/components/dashboard/shell.tsx`.

### How to verify anything locally
```bash
cd apps/web
npm run dev                     # dev server on :3000
npx tsc --noEmit                # typecheck
npx vitest run                  # tests
npx next build                  # production build
```
For API checks, grab a real token: log in on the dev site, then in the browser console:
`(await (await import('/src/lib/supabase/client')).createClient().auth.getSession()).data.session.access_token` — or copy it from the Network tab's `Authorization` header. Then:
```bash
curl -s http://localhost:3000/api/collabs -H "Authorization: Bearer $TOKEN" | head -c 400
```

---

## Fix Index (work top to bottom)

| ID | Severity | One-liner |
|----|----------|-----------|
| FIX-01 | 🔴 Blocker | Any user can become admin via `/api/auth/register` (also: business can self-approve) |
| FIX-02 | 🔴 Blocker | `/api/collabs` + `/api/collabs/[id]` select `email` → 500 for every user → Requests page dead |
| FIX-03 | 🔴 Blocker | Projects list page: stage-advance & cancellation always 400 (UUID schema vs BIGINT id) |
| FIX-04 | 🟠 High | Pending-requests badge always 0 (queries a table that doesn't exist) |
| FIX-05 | 🟠 High | Test suite red — 6 stale tests, integration suite can't even start |
| FIX-06 | 🟠 High | Sender can self-accept a collab request via direct table update (RLS too broad) |
| FIX-07 | 🟠 High | No rate limiting on any API route |
| FIX-08 | 🟡 Medium | Conversation delete calls the Supabase Management API with the wrong credential → always fails |
| FIX-09 | 🟡 Medium | `/dashboard` not role-gated (influencer sees empty business dashboard) |
| FIX-10 | 🟡 Medium | Realtime publication only contains `notifications` (latent regression trap) |
| FIX-11 | 🟡 Medium | API hardening batch (unvalidated inputs, unbounded queries, missing try/catch) |
| FIX-12 | ⚪ Low | Cleanup: credentials file, debug scripts, duplicate index, observability |

Suggested commit order = the order above. One commit per FIX, message prefix `fix(security):`, `fix(api):`, `test:`, `chore:` as appropriate.

---

## FIX-01 🔴 Privilege escalation to admin via `/api/auth/register`

### Context
`apps/web/src/app/api/auth/register/route.ts` takes the raw request body and passes it **unvalidated** as `payload` to the `register_profile` RPC. The RPC (defined in `supabase/migrations/031_onboarding_progress.sql`, line ~33) does:

```sql
r := (payload->>'role')::public.user_role;   -- no whitelist; 'admin' is a valid enum value
INSERT INTO public.profiles (id, role, ...) VALUES (uid, r, ...)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, ...   -- overwrites existing role too
```

So any logged-in user can `POST /api/auth/register` with `{"role":"admin","name":"x"}` and become admin — including **existing** users, thanks to `ON CONFLICT DO UPDATE`. Once `profiles.role = 'admin'`, `withAdmin()` in `apps/web/src/lib/api.ts` hands them a **service-role client**: every user's email/phone, business approval powers, everything.

**Second hole in the same RPC:** it inserts `approval_status` from the payload — `COALESCE(payload->>'approvalStatus', 'pending_review')`. A business signup can send `"approvalStatus": "approved"` and skip admin review entirely.

Good news: the legit clients (`apps/web/src/app/signup/business/page.tsx` and `signup/influencer/page.tsx`) hardcode `role` and never send `approvalStatus`, `email`, or `password` in this payload — so a strict server-side whitelist breaks nothing.

### Fix — two layers, do BOTH (defense in depth)

**Layer 1 — validate at the route.** In `apps/web/src/app/api/auth/register/route.ts`:
1. Import `RegisterSchema` from `@/lib/validators` — it already exists and its `role` enum is `['business_owner', 'influencer']` (no admin).
2. `safeParse` the body; on failure return 400 with `result.error.format()` (copy the pattern from `apps/web/src/app/api/collabs/route.ts` POST).
3. **Forward `result.data`, never the raw body.** Zod strips unknown keys by default, so `approvalStatus` (or anything else hostile) can't ride through.
4. Pitfall: `RegisterSchema` includes `email`/`password` as **required** fields, but the signup pages don't send them in this payload (auth happens separately via `supabase.auth.signUp`). Don't "fix" the pages — relax the schema for this route instead: create `RegisterProfileSchema = RegisterSchema.omit({ email: true, password: true })` in `apps/web/src/lib/validators.ts` and use that. Keep `RegisterSchema` itself unchanged (unit tests reference it).
5. Pitfall: check both signup pages' payload objects (business page line ~57, influencer equivalent) field-by-field against the schema before you finish — any field the page sends that the schema lacks will be **silently stripped** and that datum lost at signup. Business sends: `name, role, companyName, phone, businessType, industry, website, city, state, registeredAddress, gstNumber, marketingBudget, location`. All exist in `RegisterSchema` today, but verify the influencer page too.

**Layer 2 — harden the RPC.** New migration `supabase/migrations/049_harden_register_profile.sql`:
1. Copy the full `CREATE OR REPLACE FUNCTION public.register_profile(payload JSONB)` body from migration 031 (it's the latest definition — confirm with `grep -rln register_profile supabase/migrations/` that nothing after 031 redefines it).
2. Right after `r := (payload->>'role')::public.user_role;` add:
   ```sql
   IF r NOT IN ('business_owner', 'influencer') THEN
     RAISE EXCEPTION 'invalid_role';
   END IF;
   ```
3. Change the profiles upsert so an existing role can never be changed by this path:
   ```sql
   ON CONFLICT (id) DO UPDATE SET
     role = public.profiles.role,   -- keep existing role, ignore payload on re-register
     name = EXCLUDED.name, ...
   ```
   (Re-registration happens legitimately — migrations 032/033 exist because influencer signup can be resumed — so don't `RAISE` on conflict, just refuse to move the role.)
4. In the `business_profiles` insert, replace `COALESCE(payload->>'approvalStatus', 'pending_review')` with the literal `'pending_review'`, and in its `ON CONFLICT (user_id) DO UPDATE` remove/keep-existing the `approval_status` assignment so re-registering can't reset or set it. Approval must only ever change via `PATCH /api/admin/businesses`.

**Layer 3 — audit for exploitation.** Run against the live DB (read-only):
```sql
SELECT id, email, role, created_at, updated_at FROM public.profiles WHERE role = 'admin';
```
Every row must be a known admin account. If anything unexpected shows up, treat it as an incident (reset the row's role, rotate the admin password, check `campaign_projects`/`collab_requests` for tampering).

### Verify
```bash
# as a normal logged-in influencer's token:
curl -s -X POST http://localhost:3000/api/auth