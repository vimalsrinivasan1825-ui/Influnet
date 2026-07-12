# Influnet — Pre-Launch Fix Instructions (KT)

**Date:** 2026-07-10
**Author of audit:** production-readiness review
**Audience:** a competent developer who does **not** know this codebase's architecture yet.
**How to use this doc:** Each item below is self-contained. Do them in the order given (blockers first). For each you get: what's wrong, why it matters, the exact files, a step-by-step fix, the gotchas that will bite you, and how to verify. After you finish each one, tick its checkbox and note anything surprising so we can review together.

> **Golden rule for this repo:** this is **Next.js 16** (App Router, `proxy` not `middleware`) and **Supabase with Row-Level Security (RLS)**. Security is enforced in **three layers**: (1) `proxy.ts` route protection, (2) `withAuth`/`withAdmin` in API routes, (3) Postgres RLS policies + `SECURITY DEFINER` RPCs. Never assume the client is trustworthy — every check must also hold server-side. Read `apps/web/AGENTS.md` before writing code; APIs differ from older Next.js.

---

## 0. Architecture you need before touching anything (10-minute KT)

**Request flow:**
```
Browser (React client components)
  → apiFetch()  [apps/web/src/lib/api-client.ts]  — injects Bearer token from the live Supabase session
    → /api/* route handler  [apps/web/src/app/api/**/route.ts]
      → withAuth(req) or withAdmin(req)  [apps/web/src/lib/api.ts]  — verifies JWT + role
        → Supabase client (RLS enforced)  OR  SECURITY DEFINER RPC (runs as definer, bypasses RLS)
          → Postgres  [schema defined in supabase/migrations/*.sql, applied in number order]
```

**Key facts that are non-obvious:**

1. **Auth token = the Supabase session, nothing else.** There is no more `localStorage.influnet_token` (it was removed this cycle). Client calls go through `apiFetch()` which calls `getAuthToken()` → `supabase.auth.getSession()`. Do not reintroduce token caching.

2. **Two kinds of DB access in API routes:**
   - `withAuth(req)` returns a Supabase client **scoped to the caller's JWT** — every query is subject to RLS. This is the default and the safe one.
   - `withAdmin(req)` returns a **service-role client that bypasses RLS entirely**. It is only handed out after verifying the caller's role is `admin`. This is powerful — anything that can flip a user to `admin` is a full compromise (this is Blocker #1).

3. **`SECURITY DEFINER` RPCs run with the privileges of their owner, not the caller** — they bypass RLS on purpose, so they must do their own authorization checks internally (e.g. `IF auth.uid() <> ... THEN RAISE EXCEPTION`). `register_profile`, `accept_collab_request`, `get_own_profile`, `search_influencers` are all this kind.

4. **Migrations are plain SQL files run in numeric order.** The live DB may have drifted from the files historically (see `docs/HANDOFF_2026-07-10.md`). When you add schema, create the **next-numbered** file (currently the last is `048`, so the next is `049`), and apply it with `supabase db push` — never paste into the SQL editor. One PR = one migration.

5. **Table naming trap:** the real collaboration table is **`collab_requests`** with columns **`from_user_id` / `to_user_id`**. There is NO table called `collaboration_requests` and NO columns `business_id` / `influencer_id`. Code that references those is a bug (this is Blocker #3).

6. **The enum `public.user_role` has three values:** `business_owner`, `influencer`, `admin` (`supabase/migrations/001_profiles_auth.sql:8`). `admin` being a legal enum value is the crux of Blocker #1.

---

# BLOCKERS — must be fixed before any real user touches the app

---

## ☐ Blocker 1 — Privilege escalation: any user can make themselves `admin`

### What's wrong
The registration endpoint takes the request body and passes it **straight to a database function with zero validation**. The database function reads `role` from that body and writes it to the user's profile row — and will happily write `role = 'admin'`. Once a user is `admin`, the admin API routes hand them a **service-role client** that can read every user's email/phone and perform every admin action.

### Why it matters
This is a full authentication-bypass / privilege-escalation. It single-handedly defeats every other security fix in this cycle (the PII lockdown, the admin gating, everything). A logged-in user needs one `curl` to own the platform. This is the reason the app is currently NO-GO.

### The exact exploit (understand it before you fix it)
1. User signs up normally (or already has an account) → they have a valid JWT.
2. They call:
   ```
   POST /api/auth/register
   Authorization: Bearer <their real token>
   Content-Type: application/json

   { "name": "x", "role": "admin" }
   ```
3. Route `apps/web/src/app/api/auth/register/route.ts` passes the body untouched to the `register_profile` RPC.
4. RPC `supabase/migrations/031_onboarding_progress.sql` (function `register_profile`) does:
   - `r := (payload->>'role')::public.user_role;` — no whitelist, `'admin'` casts fine.
   - `INSERT INTO public.profiles (... role ...) VALUES (uid, r, ...) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role` — so even an **existing** influencer/business gets their role overwritten to `admin`.
5. Now `withAdmin()` (`apps/web/src/lib/api.ts:18`) passes its role check for this user and returns a service-role client.

### Files involved
- `apps/web/src/app/api/auth/register/route.ts` (the route — no validation)
- `supabase/migrations/031_onboarding_progress.sql` (the `register_profile` function — no role guard)
- `apps/web/src/lib/validators.ts` (`RegisterSchema` lives here — note its limitations below)
- `apps/web/src/app/signup/business/page.tsx` and `apps/web/src/app/signup/influencer/page.tsx` (callers — so you don't break them)

### Fix — do BOTH layers (defense in depth)

**Layer A — validate in the API route (application layer).**

⚠️ **Gotcha you must handle:** You cannot just drop the existing `RegisterSchema` onto this route. The actual signup payload sent to `/api/auth/register` **does not include `email` or `password`** (those go to `supabase.auth.signUp()` separately — see `signup/business/page.tsx:57-95`). But `RegisterSchema` marks `email` and `password` as **required**. If you validate the register body with `RegisterSchema` as-is, **every real signup will start failing** with a validation error. Verify the real payload shape first (it's camelCase: `name`, `role`, `companyName`, `phone`, `businessType`, `industry`, `city`, `state`, etc.).

Create a **dedicated schema** for this endpoint instead of reusing `RegisterSchema`. In `apps/web/src/lib/validators.ts` add:

```ts
// Server-side guard for the register_profile payload. Note: email/password are
// NOT part of this body (they go to supabase.auth.signUp separately), so they
// are absent here. The critical field is `role` — it must never be 'admin'.
export const RegisterProfileSchema = z.object({
  role: z.enum(['business_owner', 'influencer']),   // <-- 'admin' deliberately excluded
  name: z.string().min(1),
  phone: z.string().optional(),
  // business fields
  companyName: z.string().optional(),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().optional(),
  gstNumber: z.string().optional(),
  registeredAddress: z.string().optional(),
  marketingBudget: z.string().optional(),
  businessUsername: z.string().optional(),
  approvalStatus: z.string().optional(),
  // influencer fields
  username: z.string().optional(),
  bio: z.string().optional(),
  niche: z.array(z.string()).optional(),
  // shared / location
  city: z.string().optional(),
  state: z.string().optional(),
  location: z.string().optional(),
  collabPreferences: z.array(z.string()).optional(),
  instagramHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  twitterHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  linkedinHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  gender: z.string().optional(),
  languages: z.array(z.string()).optional(),
  collabTypes: z.array(z.string()).optional(),
  priceRange: z.string().optional(),
}).passthrough();
```
> `.passthrough()` keeps any extra fields the RPC reads that aren't listed, so you don't silently drop profile data. The one field we lock down is `role`. **Confirm against both signup pages that every key they send is either listed or intentionally passed through — do not lose a field.**

Then rewrite `apps/web/src/app/api/auth/register/route.ts` to validate before calling the RPC:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RegisterProfileSchema } from '@/lib/validators';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const rawPayload = await req.json();
    const parsed = RegisterProfileSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid registration payload', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const payload = parsed.data;   // role is guaranteed business_owner | influencer

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data, error } = await supabase.rpc('register_profile', { payload });
    if (error) {
      console.error('Error calling register_profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Unexpected error in register route:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
```

**Layer B — guard inside the database function (data layer).** This is the layer that survives even if someone later calls the RPC from somewhere else. Create the **next migration** `supabase/migrations/049_register_profile_role_guard.sql`. Copy the *entire current* `register_profile` function body from `031_onboarding_progress.sql` (it must be `CREATE OR REPLACE` so you don't lose logic), and add the guard right after `r := (payload->>'role')::public.user_role;`:

```sql
-- 049: prevent privilege escalation via register_profile.
-- Re-declares register_profile identically to 031 EXCEPT for the role guard.
-- (Paste the full body from 031 here; only the added lines below are new.)
CREATE OR REPLACE FUNCTION public.register_profile(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  r public.user_role;
  -- ... (keep ALL other DECLARE lines from 031) ...
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  r := (payload->>'role')::public.user_role;

  -- >>> NEW: never allow self-service admin creation <<<
  IF r NOT IN ('business_owner', 'influencer') THEN
    RAISE EXCEPTION 'Invalid role for self-registration: %', r;
  END IF;

  -- ... (rest of the function EXACTLY as in 031) ...
END;
$$;
```

⚠️ **Gotcha:** `CREATE OR REPLACE FUNCTION` replaces the whole body. You must paste the *complete* existing function and only insert the guard — if you paste a truncated version you'll delete the profile-insert logic. Diff your new file's body against `031` line-by-line before applying.

### How to verify
1. **Exploit is dead (data layer):** as a normal logged-in influencer, `curl -X POST /api/auth/register -H "Authorization: Bearer <token>" -d '{"name":"x","role":"admin"}'` → must return **400** (app layer) and, if you bypass the route and call the RPC directly, must **RAISE EXCEPTION** (data layer).
2. **Normal signup still works:** complete a real business signup and a real influencer signup through the UI end-to-end → profile row created, no validation error, no lost fields (check the DB row has company/industry/etc.).
3. **Audit existing data:** run `SELECT id, email, role FROM profiles WHERE role = 'admin';` against the live DB and confirm every admin is one you created intentionally. If an unexpected admin exists, someone may have already used this — investigate and demote.

---

## ☐ Blocker 2 — Test suite is red and out of sync with the code

### What's wrong
`npx vitest run` (from `apps/web`) reports **6 failed / 27 passed across 3 files**. The failures are stale tests, not product bugs:
- `tests/unit/validators.test.ts` — feeds **camelCase** keys (`toUserId`, `contentTypes`) into schemas that expect **snake_case** (`to_user_id`, `content_types`), and asserts an availability-status rejection that the schema doesn't enforce. The product client actually sends the correct snake_case shape, so the app works — the tests are wrong.
- `tests/unit/stores.test.ts` — asserts the **old** `localStorage.influnet_token` behavior that was deliberately removed this cycle. The store no longer persists tokens (`apps/web/src/store/auth-store.ts`).
- `tests/integration/api.test.ts` — fails to even construct a client: `Error: supabaseUrl is required` (no test env wired up).

### Why it matters
A red suite is a broken smoke alarm. Nobody can tell a real regression from the pre-existing noise, so the next bug ships silently. You need a **green baseline** so that "tests pass" means something before launch.

### Files involved
- `apps/web/tests/unit/validators.test.ts`
- `apps/web/tests/unit/stores.test.ts`
- `apps/web/tests/integration/api.test.ts`
- Reference (do not change to match tests — change tests to match these): `apps/web/src/lib/validators.ts`, `apps/web/src/store/auth-store.ts`

### Fix — step by step
1. **Fix the validator tests to the real schema shape.** Open `apps/web/src/lib/validators.ts` and use it as the source of truth. Change test inputs to snake_case:
   - `CollabRequestSchema`: `to_user_id` (not `toUserId`); optional `project_title`, `project_description`, `message`, `budget`.
   - `ProjectCreateSchema`: `counterparty_user_id`, `name`, `content_types` (array, min 1), optional `budget`, `duration_days`.
   - Delete or rewrite the "rejects invalid availability status" test: `ProfileUpdateSchema.availability_status` is `z.enum(['open','limited','paused'])`, so test that `'super_busy'` is rejected using the field name `availability_status` (snake_case), not `availabilityStatus`.
2. **Fix the store tests to current behavior.** In `tests/unit/stores.test.ts`, remove the two assertions that expect `localStorage.getItem('influnet_token')` to be set/cleared by `setToken`. The store now keeps the token **in memory only** (`setToken: (token) => set({ token })`). Assert on `useAuthStore.getState().token` instead. Keep the `logout()` test (it still clears legacy keys defensively).
3. **Make the integration suite honest.** It needs a running app + Supabase and real env vars. Two acceptable options — pick one and document it:
   - (a) Gate it behind env: at the top, `describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)(...)` so it's skipped (not failed) when env is absent, and add a `.env.test` template. OR
   - (b) Move it to a separate `test:integration` script that only runs in CI with secrets, and keep `npm test` = unit only.
   Do **not** leave it throwing at import time.

### Gotchas
- Do not "fix" the product to match the tests. The product shape (snake_case, no localStorage token) is correct and intentional. Tests bend to code here.
- After editing, run `npx vitest run` and confirm **0 failed**. Skipped is fine for integration if env is absent; failed is not.

### How to verify
`cd apps/web && npx vitest run` → all green (unit passing, integration passing or explicitly skipped). Commit the green baseline separately so the diff is reviewable.

---

## ☐ Blocker 3 — "Pending requests" notification count is always 0 (wrong table)

### What's wrong
`apps/web/src/app/api/notifications/summary/route.ts` queries a table **`collaboration_requests`** with columns **`business_id`** / **`influencer_id`** (lines ~28-39). That table and those columns **do not exist**. The real table is `collab_requests` with `from_user_id` / `to_user_id`. The query errors, but the error is swallowed by `if (!error && count)`, so `pending_requests_count` silently stays `0` forever.

### Why it matters
The pending-request badge (a core "you have work to do" signal for both businesses and influencers) never appears. It looks like the feature works — it just always returns zero. Silent-wrong is worse than loud-broken.

### The correct semantics (from the schema)
`collab_requests` (`supabase/migrations/002_collab_and_messages.sql`): `from_user_id` = the business who sent it, `to_user_id` = the influencer who receives it, `status` in `('pending','accepted','declined','cancelled')`.
- **Business owner** should see the count of requests **they sent** that are still pending → `from_user_id = user.id AND status = 'pending'`.
- **Influencer** should see the count of requests **they received** that are still pending → `to_user_id = user.id AND status = 'pending'`.

### Fix
In `apps/web/src/app/api/notifications/summary/route.ts`, replace the two blocks:

```ts
let pendingRequests = 0;
if (auth.role === 'business_owner') {
  const { count, error } = await supabase
    .from('collab_requests')                 // was: collaboration_requests
    .select('id', { count: 'exact', head: true })
    .eq('from_user_id', user.id)             // was: business_id
    .eq('status', 'pending');
  if (error) throw error;                    // don't swallow — surface it
  pendingRequests = count ?? 0;
} else if (auth.role === 'influencer') {
  const { count, error } = await supabase
    .from('collab_requests')
    .select('id', { count: 'exact', head: true })
    .eq('to_user_id', user.id)               // was: influencer_id
    .eq('status', 'pending');
  if (error) throw error;
  pendingRequests = count ?? 0;
}
```
> Note the change from `if (!error && count)` to `if (error) throw error;` — the whole reason this bug hid for so long is that the error was ignored. Let it propagate to the `catch` so the next such mistake is visible.

### Gotcha
RLS on `collab_requests` only lets a user see rows where they are `from_user_id` or `to_user_id` (`002_collab_and_messages.sql`), which matches these filters — so the count under `withAuth` (RLS-scoped) is correct. Don't switch this to a service-role client.

### How to verify
1. As a business owner with 2 pending sent requests → `GET /api/notifications/summary` returns `pending_requests_count: 2`.
2. As the influencer who received them → returns `2` for that influencer.
3. Accept/decline one → count drops by one on refresh.

---

# HIGH — fix before real traffic (not necessarily before the very first login)

---

## ☐ High 4 — No rate limiting on any route

### What's wrong
No API route throttles requests. Login, signup, collab creation, profile-view recording, messaging — all unbounded. (Only the phone-OTP flow has a DB-level limiter.)

### Why it matters
- Login with no throttle = credential stuffing / brute force.
- Collab creation with no throttle = spam blasts to every creator.
- These are the endpoints attackers hit first.

### Recommended approach (pragmatic for V1 on Vercel)
Use `@upstash/ratelimit` + Upstash Redis (works on serverless/edge, free tier is enough for launch). If you'd rather not add a dependency, a Postgres token-bucket works too since the DB is already there — but Upstash is less code.

### Fix — step by step
1. Add deps: `npm i @upstash/ratelimit @upstash/redis` (in `apps/web`).
2. Create `apps/web/src/lib/ratelimit.ts`:
   ```ts
   import { Ratelimit } from '@upstash/ratelimit';
   import { Redis } from '@upstash/redis';

   const redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL / _TOKEN

   // Tune per endpoint. Sliding window is a good default.
   export const authLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 m') });
   export const writeLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 m') });

   export function clientKey(req: Request) {
     // Vercel sets x-forwarded-for; fall back for local dev.
     return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
   }
   ```
3. Apply to the sensitive routes. In each, before doing work:
   ```ts
   import { authLimiter, clientKey } from '@/lib/ratelimit';
   const { success } = await authLimiter.limit(clientKey(req));
   if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
   ```
   Minimum set to cover:
   - Auth: any login/signup-adjacent server route, and **`/api/auth/register`** (`authLimiter`, keyed by IP; consider also keying by `user.id` after auth).
   - Writes: **`/api/collabs` POST** and **`/api/conversations/[id]/messages` POST** (`writeLimiter`).
   - `record_profile_view` is called from the public profile pages — rate-limit whichever route/RPC entry point triggers it (it already has in-DB dedup, so this is belt-and-suspenders).
4. Add the Upstash env vars to `.env.local` and to Vercel project settings. **Do not** prefix them with `NEXT_PUBLIC_` (they're secret).

### Gotchas
- Rate-limit **before** the expensive work (before DB calls), but **after** cheap header checks.
- Keying purely by IP punishes users behind shared NAT; for authed write endpoints, prefer keying by `user.id`. For pre-auth endpoints (login), IP is all you have.
- Local dev has no `x-forwarded-for`; the fallback key prevents crashes but means no real limiting locally — that's fine.

### How to verify
Script 30 rapid POSTs to `/api/collabs` → you should start getting `429` after the window limit. Confirm a normal user clicking once every few seconds never sees a 429.

---

## ☐ High 5 — Conversation delete uses the wrong API and will fail at runtime

### What's wrong
`apps/web/src/app/api/conversations/[id]/route.ts` (DELETE) builds raw SQL and sends it to the **Supabase Management API** (`https://api.supabase.com/v1/projects/{ref}/database/query`), authenticated with `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. The Management API requires a **personal access token (`sbp_...`)**, not a service-role or anon key — so this call almost certainly returns 401 and the delete fails.

### Why it matters
It's a broken feature (users can't delete conversations), not a security hole — the route does correctly (a) verify the caller is a participant and (b) validate the UUID format before interpolation, so there's no injection or authz bypass. But it doesn't work, and routing DB writes through the Management API is the wrong pattern entirely.

### Good news from the schema
You don't need raw SQL. `messages` and `conversation_participants` both have `conversation_id ... REFERENCES conversations(id) ON DELETE CASCADE` (`supabase/migrations/002_collab_and_messages.sql:82,94`). So deleting the `conversations` row cascades to its messages and participants automatically.

### Fix
Replace the Management-API block with an ordinary authenticated client delete (keep the existing participant check and UUID validation exactly as they are):

```ts
// caller is verified a participant above; UUID already validated above.
const { error: delErr } = await supabase
  .from('conversations')
  .delete()
  .eq('id', id);      // cascades to messages + participants via FK ON DELETE CASCADE

if (delErr) return jsonError(500, 'Failed to delete conversation', delErr);
return NextResponse.json({ ok: true });
```

⚠️ **Gotcha — RLS DELETE policy:** `withAuth` runs under RLS. Check whether `conversations` has a `FOR DELETE` policy for participants. Grep shows delete policies exist for `campaign_projects`, `collab_requests`, `project_cards`, storage — but I did **not** find one for `conversations`/`messages`. If there's no DELETE policy, this delete will silently affect 0 rows (RLS denies it). You have two choices:
   - (a) Add a migration `049+` with a `FOR DELETE` policy on `conversations` allowing a participant to delete (`USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = id AND cp.user_id = auth.uid()))`). Preferred.
   - (b) Do the delete with a service-role client **after** the participant check (you already verified authorization in the route). Acceptable, but (a) is cleaner and keeps enforcement in the DB.
   Verify which is needed by testing — if the client delete returns success but the row survives, it's RLS.

### How to verify
1. As a participant, DELETE the conversation → returns `{ ok: true }` **and** `SELECT * FROM conversations WHERE id = ...` returns no row, and its messages/participants are gone too.
2. As a **non**-participant → still 403 (unchanged).
3. Malformed id → still 400 (unchanged).

---

# MEDIUM — schedule shortly after launch (won't block, but will bite)

---

## ☐ Medium 6 — No role gating on `/dashboard`

**What's wrong:** an influencer who navigates to `/dashboard` (the business dashboard) gets the business shell and `/api/business/dashboard`. Data is RLS-safe so nothing leaks, but they see a broken/empty business screen.
**Fix:** in the dashboard layout or the `/dashboard` page, read the role (from the profile fetch already happening) and redirect: influencers → `/dashboard/influencer`, admins → `/dashboard/admin`, business owners stay. The login page already does this role-routing after login (`apps/web/src/app/login/page.tsx:54-58`) — mirror that logic in the layout so deep links are also corrected.
**Files:** `apps/web/src/app/dashboard/layout.tsx`, `apps/web/src/app/dashboard/page.tsx`.
**Verify:** logged in as influencer, manually visit `/dashboard` → redirected to `/dashboard/influencer`.

---

## ☐ Medium 7 — Realtime publication regression (latent)

**What's wrong:** `supabase/migrations/047_notifications_pipeline.sql:27-30` runs `DROP PUBLICATION supabase_realtime; CREATE PUBLICATION supabase_realtime;` then re-adds **only** `notifications`. Any table that previously relied on Postgres realtime (presence, typing indicators, live collab-request badges) lost its feed.
**Why it matters now:** nothing visibly breaks *today* because the only realtime consumer in the current code is the notifications channel in `apps/web/src/components/dashboard/shell.tsx`. But the next person who adds a live badge on another table will find it silently doesn't fire, and won't know why.
**Fix (choose one):**
   - (a) If presence/typing/collab-badges are meant to be live, add a migration `049+` that re-adds them: `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;` for each.
   - (b) If they're not used, add a one-line comment at the top of a relevant file / this doc stating "only `notifications` is in the realtime publication by design" so nobody assumes otherwise.
**Verify:** `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` lists exactly the tables you intend.

---

## ☐ Medium 8 — No error observability

**What's wrong:** `jsonError` (`apps/web/src/lib/api.ts:6`) only `console.error`s. In production you won't see errors real users hit.
**Fix:** wire Sentry (`@sentry/nextjs`) for both client and server; at minimum send `jsonError`'s 500s to it. Also confirm Vercel log drains are on.
**Verify:** trigger a deliberate 500 in a preview deploy → it appears in Sentry with a stack trace.

---

## ☐ Medium 9 — N+1 query in conversations list

**What's wrong:** `apps/web/src/app/api/conversations/route.ts:57-91` loops over projects and fires 2-3 separate profile/business/influencer queries **per project** inside `Promise.all`. Fine at 10 records; a latency problem as project counts grow.
**Fix:** collect all partner IDs first, then do **one** `profiles` query with `.in('id', partnerIds)` and one each for business/influencer profiles, and stitch in memory. Or push it into a single RPC/view.
**Verify:** seed ~50 projects for one user; measure `/api/conversations` response time before/after — should be roughly flat instead of linear in project count.

---

# Cross-cutting things NOT to break while you work

- **Don't reintroduce `localStorage.influnet_token`.** Token comes only from the Supabase session via `apiFetch`/`getAuthToken`.
- **Don't add `NEXT_PUBLIC_` to any secret.** That prefix ships the value to the browser. Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `STREAM_API_SECRET`, `UPSTASH_*`.
- **Don't paste schema changes into the Supabase SQL editor.** New numbered migration file + `supabase db push`. Next number is **049**.
- **Don't switch RLS-scoped routes to service-role** to "make a query work." If a query returns nothing under `withAuth`, the fix is usually a missing RLS policy, not bypassing RLS. The only legitimate service-role users are the admin routes (post role-check) and the Stream webhook (no user JWT).
- **Every new write route validates its body with a Zod schema** and returns `{ error: string }` with a proper status (map Postgres `23505` → 409, `23503` → 404, as existing routes do).
- **Read `apps/web/AGENTS.md`** — this is a modified Next.js 16; check `node_modules/next/dist/docs/` before using an API you're unsure about.

---

# Suggested order & PR boundaries

1. **PR 1 — Blocker 1** (register validation + RPC guard migration 049). Highest priority, smallest blast radius. Verify the live admin audit query.
2. **PR 2 — Blocker 3** (summary table fix) + **Blocker 2** (green the tests). Small, and the test suite should be green *before* the bigger PRs so it can catch them.
3. **PR 3 — High 5** (conversation delete) + any needed RLS DELETE policy migration.
4. **PR 4 — High 4** (rate limiting).
5. **PR 5 — Mediums** (6-9), individually or batched.

For each PR: one logical change, verification steps from this doc run and pasted into the PR description, and a note of anything that didn't match these instructions (schema drift, missing policy, etc.) so we can reconcile.

---

# Quick verification cheat-sheet (run from `apps/web`)

```bash
npx tsc --noEmit          # must be clean (it currently is)
npx vitest run            # must be green after Blocker 2
npx next build            # must succeed (it currently does)
```
Plus the per-item manual checks above (curl the register exploit, check the summary counts, delete a conversation, hammer a write endpoint for 429s).

---

**When you've done a batch, send it back with:** which checkboxes are ticked, the verification output for each, and anything surprising. I'll re-audit the diff and tell you what's cleared and what still needs work.
