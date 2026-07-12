# Influnet — Execution Plan & Agent Work Order

> **Created:** July 10, 2026
> **Audience:** A coding agent (or developer) executing tasks on this repo, one task at a time.
> **Source of truth for findings:** [docs/PROJECT_ANALYSIS.md](../docs/PROJECT_ANALYSIS.md) — read it first.
> **Behavioral rules:** [.agents/AGENTS.md](AGENTS.md) — mandatory. Log outcomes in [.agents/lessons_learned.md](lessons_learned.md).

This document is a **prioritized work order**. Execute phases in order. Within a phase,
tasks are ordered by dependency. Do not start a later phase while an earlier phase has
unfinished ❗-marked tasks. Each task states: objective, context, files, steps, acceptance
criteria, and verification. Do not expand scope beyond the task you were given.

---

## Global Rules (apply to every task)

1. **Work only inside `apps/web/` and `supabase/`** unless the task says otherwise.
   (The repo is a Turborepo monorepo since July 10, 2026: the Next.js app lives in
   `apps/web/`, installs run from the repo **root** via npm workspaces. All legacy code
   was deleted — recover via git tag `legacy-archive` if ever needed.)
2. **Verify before you finish.** Minimum bar for every task (run from the repo root):
   ```bash
   npm run typecheck                    # must exit 0
   npm run test:unit --workspace=web    # must pass
   npm run build                        # must succeed for tasks touching routes/pages
   ```
   For API tasks, also exercise the route (curl or a small script) against `npm run dev`.
3. **Match existing patterns**: App Router conventions, functional components, Tailwind v4,
   the premium light-theme aesthetic (`#fafafb`, `rounded-2xl`), Lucide icons, zero-scroll
   dashboards. This Next.js version may differ from your training data — check
   `apps/web/node_modules/next/dist/docs/` when unsure (see `apps/web/AGENTS.md`).
4. **Dynamic route params are Promises** in this Next.js version:
   `const { id } = await context.params;`
5. **Never hardcode tokens**; client-side fetches must get a fresh token via
   `(await sb.auth.getSession()).data.session?.access_token` and send it as
   `Authorization: Bearer <token>`.
6. **Migrations**: new SQL files go in `supabase/migrations/` numbered `043_...` upward,
   idempotent where possible (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`
   before `CREATE POLICY`). Apply with `supabase db push`. Never run ad-hoc SQL from app code.
7. **Commits**: one task = one commit (or a small series), message format
   `phaseN: <imperative summary>`. Never commit `.env*` files.
8. **When a task is done**, append a short entry to `.agents/lessons_learned.md`
   (scope, what broke, resolution, lessons) per the AGENTS.md workflow.
9. **Do not delete user data or run destructive SQL** against the live Supabase project
   without explicit human confirmation.

---

## Phase 0 — Repo Stabilization & Security ❗ (blocking everything)

> **STATUS: ✅ COMPLETE (July 10, 2026).** Env files untracked, `.env.example` added,
> pending work committed on `dev`, and additionally the repo was restructured into a
> Turborepo monorepo (`influnet-app/` → `apps/web/`, legacy deleted at tag
> `legacy-archive`). **The human key-rotation checklist in Task 0.1 step 5 remains
> outstanding** — keys are still exposed in git history until rotated + history rewritten.

### Task 0.1 ❗ Stop tracking secrets; prepare for key rotation

**Objective:** No secret material tracked by git; repo safe to push.

**Context:** `apps/web/.env` and `apps/web/.env.local` are git-tracked.
`.env.local` contains `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` (a personal
access token that can execute arbitrary SQL), and `STREAM_API_SECRET`.

**Steps:**
1. Append to `apps/web/.gitignore`:
   ```
   # env files — never commit
   .env
   .env.*
   !.env.example
   ```
2. `git rm --cached apps/web/.env apps/web/.env.local` (files stay on disk).
3. Create `apps/web/.env.example` listing every required variable name with placeholder
   values and a one-line comment each:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `STREAM_API_KEY`, `NEXT_PUBLIC_STREAM_API_KEY`, `STREAM_API_SECRET`.
   Note: `SUPABASE_ACCESS_TOKEN` must **not** be listed — after Task 1.2 the app no longer
   uses it at runtime.
4. Commit: `phase0: untrack env files, add .env.example`.
5. **HUMAN ACTION REQUIRED — do not attempt yourself; print this checklist and stop:**
   - Rotate the Supabase service-role key and anon key (Supabase Dashboard → Settings → API).
   - Revoke the leaked personal access token (Supabase account → Access Tokens).
   - Rotate the Stream API secret (GetStream Dashboard).
   - Update `.env.local` locally and GitHub Actions secrets.
   - If the repo was ever pushed with these files, rewrite history
     (`git filter-repo --path apps/web/.env --path apps/web/.env.local --invert-paths`)
     and force-push after coordinating with all clones.

**Acceptance criteria:** `git ls-files | grep -E '\.env'` returns only `.env.example`;
app still boots with local `.env.local`.

### Task 0.2 ❗ Commit the pending work in reviewable chunks

**Objective:** Get `dev` to reflect reality (~13,400 uncommitted insertions) so CI can run.

**Steps (suggested commit series — keep each buildable):**
1. `phase0: add shadcn/ui setup, lib/utils, components.json`
2. `phase0: add API routes (auth, discover, collabs, projects, conversations, profile, dashboards)`
3. `phase0: add admin panel (pages + api)`
4. `phase0: add project kanban workspace (pages, cards api, migrations 036-042)`
5. `phase0: add stream chat integration (lib/stream, api/stream, messages page)`
6. `phase0: add tests and CI workflow`
7. `phase0: add docs (ARCHITECTURE, PROJECT_ANALYSIS, agents workflow)`
8. Modified-file changes (`globals.css`, landing components, signup pages, etc.) grouped
   logically with the commit that owns them.

Run `npx tsc --noEmit` before the first commit; if anything fails, fix before committing.
Do **not** push until Task 0.1's human checklist is confirmed done.

**Acceptance criteria:** `git status` clean (except local env files); every commit builds.

---

## Phase 1 — Make the Core Logic Work ❗ (backend correctness)

> Goal of this phase: a business and a creator can sign up, connect, accept a request,
> get exactly one project + one conversation, and **chat successfully** — with correct
> authorization at every step.

### Task 1.1 ❗ Fix Stream Chat authentication (messaging is currently dead)

**Objective:** `/dashboard/messages` connects to Stream and two users can exchange messages.

**Context:** `src/app/api/stream/token/route.ts` and `…/stream/channel/route.ts` call
`auth.getUser()` on the **service-role** client, which has no user session → always 401.
The client (`messages/page.tsx:58` and `:158`) sends no `Authorization` header either.
Additionally, the channel route never verifies the caller participates in the conversation.

**Steps:**
1. In both stream routes, adopt the standard route pattern used by `api/collabs/route.ts`:
   read the `Authorization` header, build an anon-key client with that header, and
   `auth.getUser()` on it. Keep `createServerClient()`/`getStreamClient()` only for the
   Stream server SDK calls (token creation, upsert, channel create) — those legitimately
   need server credentials.
2. In `POST /api/stream/channel`, before `ensureStreamChannel(...)`:
   - Query `conversation_participants` for `conversationId`.
   - Require the caller's `user.id` to be a participant → else 403.
   - Require `otherUserId` to be a participant → else 400. (Do not trust the client pair.)
3. In `src/app/dashboard/messages/page.tsx`, update both fetches to attach the fresh token:
   ```ts
   const { data: { session } } = await sb.auth.getSession();
   headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
   ```
4. Do not change `src/lib/stream.ts` token/channel logic except: replace the two `as any`
   casts with proper `stream-chat` types if the SDK exposes them; otherwise leave as is.

**Verification:** with `npm run dev` running and two test accounts (use
`tests/matchmaking.js` users or create fresh ones): log in as each in two browser profiles,
accept a collab, open Messages on both sides, send a message each way. Console must show no
`[Stream] Connection failed`.

**Acceptance criteria:** streamStatus reaches `connected`; a non-participant calling
`POST /api/stream/channel` with someone else's conversation id receives 403.

### Task 1.2 ❗ Remove Management-API raw SQL from `POST /api/conversations`

**Objective:** Conversation creation uses normal Supabase clients + RPC; the runtime app
never talks to `api.supabase.com`.

**Context:** `src/app/api/conversations/route.ts:141-190` interpolates user input into SQL
and posts it to the Supabase Management API using the wrong credential type. Migration 042
already provides `add_conversation_participant(p_conversation_id, p_user_id)`
(SECURITY DEFINER, ON CONFLICT DO NOTHING).

**Steps:**
1. Write migration `043_create_conversation_rpc.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION public.create_conversation_with(p_other_user_id UUID)
   RETURNS UUID
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   DECLARE v_conv UUID;
   BEGIN
     -- reuse an existing 1:1 conversation if present
     SELECT cp1.conversation_id INTO v_conv
     FROM conversation_participants cp1
     JOIN conversation_participants cp2 USING (conversation_id)
     WHERE cp1.user_id = auth.uid() AND cp2.user_id = p_other_user_id
     LIMIT 1;
     IF v_conv IS NOT NULL THEN RETURN v_conv; END IF;

     INSERT INTO conversations DEFAULT VALUES RETURNING id INTO v_conv;
     INSERT INTO conversation_participants (conversation_id, user_id)
     VALUES (v_conv, auth.uid()), (v_conv, p_other_user_id)
     ON CONFLICT DO NOTHING;
     RETURN v_conv;
   END; $$;
   GRANT EXECUTE ON FUNCTION public.create_conversation_with(UUID) TO authenticated;
   ```
2. Replace the entire `runSql` block in the POST handler with:
   `const { data, error } = await supabase.rpc('create_conversation_with', { p_other_user_id: other_user_id });`
   using the caller-JWT client (so `auth.uid()` resolves to the caller). Return
   `{ conversation: { id: data } }`.
3. Keep the UUID-format validation of `other_user_id`; additionally verify the target user
   exists in `profiles` (404 if not).
4. Grep the app for any other `api.supabase.com` usage; the only remaining one allowed is
   `api/admin/seed/route.ts` (dev-only; Phase 2 hardens it).

**Acceptance criteria:** creating a conversation works for two users with **no**
`SUPABASE_ACCESS_TOKEN` and **no** `SUPABASE_SERVICE_ROLE_KEY` in env for this route;
calling twice returns the same conversation id.

### Task 1.3 ❗ Atomic collab acceptance (single RPC) + retire the auto-heal

**Objective:** Accepting a request updates the request, creates exactly one project, and
ensures the conversation — atomically, with duplicates impossible.

**Context:** `PATCH /api/collabs` performs 3+ separate writes with errors only logged;
`GET /api/projects:26-63` compensates by creating "missing" projects on read (side effect
in a GET, race → duplicate projects). `campaign_projects` has no link to the originating
request and no uniqueness.

**Steps:**
1. Migration `044_atomic_accept_collab.sql`:
   - `ALTER TABLE campaign_projects ADD COLUMN IF NOT EXISTS collab_request_id UUID REFERENCES collab_requests(id);`
   - `CREATE UNIQUE INDEX IF NOT EXISTS campaign_projects_collab_uniq ON campaign_projects (collab_request_id) WHERE collab_request_id IS NOT NULL;`
   - `CREATE OR REPLACE FUNCTION public.accept_collab_request(p_request_id UUID) RETURNS JSONB`
     — SECURITY DEFINER; inside one function body (one transaction):
     a. Load the request; **require `auth.uid() = to_user_id` and `status = 'pending'`**,
        else `RAISE EXCEPTION`.
     b. `UPDATE collab_requests SET status = 'accepted' …`.
     c. Reuse/create conversation via the same logic as `create_conversation_with`
        (call it, or inline).
     d. `INSERT INTO campaign_projects (…, collab_request_id, conversation_id) …
        ON CONFLICT (collab_request_id) DO NOTHING;` then select the project row.
     e. Return `jsonb_build_object('collab', …, 'project', …, 'conversation_id', …)`.
   - Grant execute to `authenticated`.
2. Rewrite `PATCH /api/collabs`:
   - Body schema (see Task 1.5): `{ id: uuid, status: 'accepted' | 'declined' | 'cancelled' }`.
   - `accepted` → only via `supabase.rpc('accept_collab_request', …)` (caller-JWT client).
   - `declined` → allowed only when caller is `to_user_id` and status is `pending`.
   - `cancelled` → allowed only when caller is `from_user_id` and status is `pending`.
   - Any other transition → 403/400. Remove the permissive `.or()` participant update.
3. Delete the auto-heal block from `GET /api/projects` (lines 25-63). One-time cleanup:
   write `supabase/cleanup_duplicate_projects.sql` (SELECT-only detection query + commented
   DELETE) for a human to review — do not run it.
4. Update `tests/matchmaking.js` expectations if response shapes changed.

**Acceptance criteria:** matchmaking E2E passes; accepting twice returns exactly one
project; the **sender cannot accept their own request** (403); `GET /api/projects`
performs zero writes.

### Task 1.4 ❗ Implement `/api/notifications/summary` + live sidebar badges

**Objective:** The badge counts the shell already asks for exist and are real.

**Context:** `src/components/dashboard/shell.tsx:92` fetches `/api/notifications/summary`
(404 today) and passes hardcoded zeros to the sidebar (`shell.tsx:186-187`).
`src/store/notification-store.ts` already models `{ unread_messages_count, pending_requests_count }`.

**Steps:**
1. Create `src/app/api/notifications/summary/route.ts` (standard auth pattern):
   - `pending_requests_count`: `collab_requests` where `to_user_id = user.id AND status = 'pending'`
     (for influencers) — for business owners count their *sent pending* separately if cheap,
     else return 0 for that role.
   - `unread_messages_count`: return 0 for now with a `// TODO: wire Stream unread via webhook (Task 2.2)`
     — do not fake it.
2. In the shell, send the Bearer token with the fetch (it currently sends none), store the
   result via `setSummary`, and pass store values into `<DashboardSidebar …>` instead of `0`s.
3. Re-fetch the summary when the route changes (cheap: `usePathname()` effect) so accepting
   a request clears the badge.

**Acceptance criteria:** creator with a pending request sees a non-zero badge on Requests;
badge updates after accept/decline; no 404s in the network tab.

### Task 1.5 Shared route helper + input validation + log hygiene

**Objective:** Every mutating route validates input with the existing Zod schemas; auth
boilerplate is written once; production logs stop leaking PII.

**Context:** ~20 routes duplicate a ~25-line auth preamble; `src/lib/validators.ts` is
never imported; routes `console.log` user ids and auth-header prefixes and return raw
Postgres error messages.

**Steps:**
1. Create `src/lib/api.ts`:
   ```ts
   export async function withAuth(req: Request, opts?: { role?: UserRole }): Promise<
     | { ok: true; supabase: SupabaseClient<Database>; user: User; role: UserRole }
     | { ok: false; res: NextResponse }>
   ```
   Encapsulate: header check → client with caller JWT → `getUser()` → optional
   `profiles.role` check. Include a `jsonError(status, publicMessage)` helper that logs the
   real error server-side (`console.error`) but returns a generic message.
2. Migrate all routes under `src/app/api/` to `withAuth` **without changing behavior**
   (except where later tasks specify). Mechanical refactor; keep diffs reviewable —
   one commit for the helper, one per route group.
3. Wire validators: `CollabRequestSchema` (POST collabs — note the route field names must
   be reconciled: route uses `to_user_id/project_title/...`, schema uses `toUserId/...`;
   **adapt the schema to the wire format actually used by the frontend**, don't break the UI),
   `ProfileUpdateSchema`/`BusinessProfileUpdateSchema` (PATCH profile), `MessageSchema`
   (messages POST), plus new small schemas for collab PATCH and project PATCH
   (validate `current_stage` against the 12-stage enum, `status`, `action`).
4. Delete or `NODE_ENV`-gate every `console.log` in `src/app/api/**`; keep `console.error`
   through `jsonError`.

**Acceptance criteria:** `grep -rn "await import('@supabase/supabase-js')" src/app/api | wc -l`
→ 0; invalid payloads return 400 with field errors; matchmaking E2E still passes.

### Task 1.6 Messaging source of truth — persist Stream messages back to Postgres

**Objective:** Influnet owns its message history even though Stream handles transport.

**Context:** With Stream live, the `messages` table stops receiving rows, but
`/api/conversations/[id]/messages` and future analytics read it. Decision (from
PROJECT_ANALYSIS §11 P1-7): **Stream for transport, webhook for persistence**.

**Steps:**
1. Create `src/app/api/stream/webhook/route.ts`:
   - Verify Stream's webhook signature (`x-signature` header, HMAC-SHA256 with
     `STREAM_API_SECRET`; the `stream-chat` SDK exposes `client.verifyWebhook(body, sig)`).
   - On `message.new`: map `channel_id` (`conv_<uuid>` → uuid), insert into `messages`
     `(conversation_id, sender_user_id, body)` with the **service-role** client (webhooks
     have no user JWT — this is the one legitimate service-role write path), and
     `UPDATE conversations SET updated_at = now()`.
   - Return 200 fast; ignore event types you don't handle.
2. Document (in the route's header comment + README section) the human step: configure the
   webhook URL in the GetStream dashboard.
3. Leave the old `GET /api/conversations/[id]/messages` as the history read API. Delete
   `src/store/messaging-store.ts` and its imports if truly unused (`grep` first).

**Acceptance criteria:** with the webhook configured (or simulated via a signed local POST),
sending a Stream message creates a `messages` row; unsigned requests are rejected 401.

---

## Phase 2 — Ship the Core Product Promise

> Influnet's differentiator is *instant notification* + *link-in-bio*. Neither exists yet.

### Task 2.1 ❗ Notifications pipeline (table → realtime → bell)

**Objective:** A creator sees an in-app notification within seconds of receiving a request.

**Steps:**
1. Migration `045_notifications.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS public.notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     type TEXT NOT NULL,                -- 'collab_request' | 'collab_accepted' | 'collab_declined' | 'project_stage' | 'message'
     title TEXT NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     link TEXT,                         -- in-app path, e.g. /dashboard/requests
     read_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
     ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
   ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
   -- select_own / update_own (mark read) policies; inserts happen via SECURITY DEFINER triggers
   ```
   Plus **triggers** (preferred over app-code inserts so no path can forget):
   - AFTER INSERT ON `collab_requests` → notify `to_user_id` (`'collab_request'`).
   - AFTER UPDATE OF status ON `collab_requests` → notify `from_user_id` on
     accepted/declined.
2. API: `GET /api/notifications` (list, paginated `?before=`), `PATCH /api/notifications`
   (`{ ids: [...] } | { all: true }` → set `read_at`). Use `withAuth`.
3. Frontend: add a bell to `src/components/dashboard/header.tsx` with unread dot + dropdown
   (latest 10, mark-read on open, link navigation). Subscribe in the shell via Supabase
   Realtime:
   ```ts
   sb.channel('notifications').on('postgres_changes',
     { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
     handler).subscribe()
   ```
   (Enable realtime for the table in the migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;`)
4. Fold `pending_requests_count` from Task 1.4 into this store so badges and bell agree.

**Acceptance criteria:** two browsers — business sends request, creator's bell updates
**without reload**; marking read persists across reloads.

### Task 2.2 Email notification on request received/accepted

**Objective:** Creators who aren't in the app still learn about requests within a minute.

**Steps:**
1. Add [Resend](https://resend.com) (`RESEND_API_KEY`, `EMAIL_FROM` env; update
   `.env.example` + CI secrets doc). Create `src/lib/email.ts` with
   `sendCollabRequestEmail(to, { businessName, projectTitle, budget })` and
   `sendCollabAcceptedEmail(...)` — clean HTML consistent with the brand.
2. Send from the API layer (in `POST /api/collabs` success path and inside the accept flow
   response handling — **not** from DB triggers), fire-and-forget with error logging; email
   failure must never fail the API response.
3. Add an env kill-switch `NOTIFY_EMAILS_ENABLED=true|false` (default false in dev).

**Acceptance criteria:** with the flag on and a real key, sending a request delivers an
email to the creator's address; with the flag off, no send is attempted.

### Task 2.3 ❗ Public creator profile — the link-in-bio page

**Objective:** `https://<host>/c/<username>` renders a public, shareable creator profile
with a "Request Collaboration" CTA. This is the acquisition loop.

**Context:** Only the legacy site has this (`influnet/public-influencer-profile.js` — read
it for field/layout reference, do not port code). DB support exists: public influencer RLS
(`select_all_authenticated` — see step 2), `get_public_influencer` RPC (migrations 021/024/027),
`profile_link_clicks`, `creator_profile_views`.

**Steps:**
1. Create `src/app/c/[username]/page.tsx` as a **server component** (SSR — must work
   logged-out and be crawlable):
   - Fetch via the `get_public_influencer(username)` RPC using the anon server-side client
     (no service role). If the RPC's shape is insufficient, extend it in a migration rather
     than widening table RLS.
   - Render: name, username, avatar, headline, bio, niches, location, social links,
     price-range band, availability badge. `notFound()` for unknown usernames.
   - `generateMetadata()` with OG title/description (use `influnet/opengraph.jpg` style as
     reference; a static OG image is fine for v1).
2. Confirm anonymous read works: if `influencer_profiles` policies require `authenticated`,
   add a migration exposing only the public columns to `anon` **through the RPC**
   (SECURITY DEFINER), not via table-level policy.
3. Add `'/c'` to the public paths in `apps/web/middleware.ts:38`.
4. CTA logic: logged-in `business_owner` → open the existing collaborate modal flow
   (deep-link `/dashboard/discover?request=<user_id>` and handle the param there);
   logged-out → `/signup/business?next=/c/<username>`; store `next` and honor it after
   signup/login (small addition to login/signup redirect logic).
5. Track: on page view insert into `profile_views`/`creator_profile_views` (RPC or
   anon-permitted insert with rate guard); on CTA click, `profile_link_clicks`.
6. Surface the link in the creator's settings page: read-only field
   `<host>/c/<username>` + copy button.

**Acceptance criteria:** logged-out browser renders the profile with correct OG tags
(`curl -s | grep og:`); unknown username → 404; CTA routes correctly in all three auth
states; view rows appear.

### Task 2.4 Password reset flow

**Objective:** Users can recover accounts (middleware already whitelists `/reset-password`).

**Steps:**
1. Add "Forgot password?" on `/login` → `supabase.auth.resetPasswordForEmail(email,
   { redirectTo: <host>/reset-password })`.
2. Create `src/app/reset-password/page.tsx`: handles the recovery session, two password
   fields with the existing 6-char minimum, `supabase.auth.updateUser({ password })`,
   success → `/login`. Match the auth-pages visual style.

**Acceptance criteria:** full loop works against the live Supabase project with a test
account; wrong/expired link shows a friendly error, not a crash.

---

## Phase 3 — Frontend Hardening & UX Completion

### Task 3.1 Shared API client on the frontend

Create `src/lib/api-client.ts` — `apiFetch(path, init?)` that: gets a fresh session token,
attaches the Bearer header + JSON content-type, throws a typed error on `!res.ok`.
Migrate all dashboard pages/components (`grep -rn "Authorization: \`Bearer" src/app src/components`)
to it. **Acceptance:** zero inline Bearer constructions outside `api-client.ts`; all pages
still load their data.

### Task 3.2 Extract constants & de-duplicate signup data

Create `src/lib/constants.ts` exporting `INDIAN_STATES`, `NICHES`, `LANGUAGES`,
`COLLAB_TYPES`, `PRICE_TIERS`, business `INDUSTRIES`/`BUSINESS_TYPES` (lift them verbatim
from `signup/influencer/page.tsx` and `signup/business/page.tsx`). Import everywhere they
appear (signup, settings). **Acceptance:** the arrays exist in exactly one file; wizards
render identically.

### Task 3.3 Decompose the monolith pages

Split, without visual changes (verify by side-by-side screenshots via the dev server):
- `dashboard/projects/[id]/page.tsx` (831 lines) → `components/projects/`:
  `kanban-board.tsx`, `stage-column.tsx`, `project-card.tsx`, `card-modal.tsx`,
  `use-project-cards.ts` (data + dnd handlers).
- `dashboard/messages/page.tsx` (753) → `components/messages/`:
  `conversation-list.tsx`, `chat-window.tsx`, `use-stream-client.ts`.
- `signup/influencer/page.tsx` (467) → per-step components + `use-signup-wizard.ts`.
One page per commit. **Acceptance:** `tsc` clean; every page ≤ ~250 lines; behavior identical.

### Task 3.4 Kill `as any` / adopt the Database types

`grep -rn "as any" src/ | wc -l` → drive toward 0 by using the `Database` generics already
in `src/types/index.ts` (typed `.from()` results, typed route payloads from the Zod schemas
via `z.infer`). Allowed exceptions: third-party SDK gaps (Stream) — mark each with
`// TODO(types)`. **Acceptance:** count reduced to those marked exceptions only.

### Task 3.5 Real dashboard metrics

Replace mocks: business dashboard `platform`/`reach` → derive from the collab/creator data
or drop the columns from the UI; influencer `profile_views` → count from
`creator_profile_views`/`profile_views` (now written by Task 2.3), `saved_by_businesses` →
count `influencer_shortlists`; trends → simple week-over-week counts. If a metric has no
real source yet, **remove it from the UI** rather than showing fake zeros.
**Acceptance:** no hardcoded metric literals in `api/*/dashboard/route.ts`.

### Task 3.6 Discovery search, filters, pagination

`GET /api/discover`: accept `q` (name/username/company ilike), `niche`, `location`,
`page`/`per_page` (default 24, max 50) and return `{ items, page, has_more }`. UI: search
input (debounced 300 ms), niche chips (from constants), location select, "Load more".
Keep the two role-aware branches. **Acceptance:** URL-driven state
(`/dashboard/discover?q=…&niche=…`) survives reload; empty-state design for no results.

### Task 3.7 Legacy CSS cleanup

The 7 ported global CSS files in `src/app/` (`business-dashboard-layout.css`,
`dashboard-fonts.css`, `dashboard-sidebar-hover.css`, etc.): find what still consumes each
(`grep` class names across `src/`), migrate needed rules into component-level Tailwind,
delete the rest, and remove the now-unneeded `!important`/`!text-white` overrides where
safe. One file per commit with before/after screenshots. **Acceptance:** files deleted;
no visual regressions on landing, login, dashboards.

### Task 3.8 Session simplification

Remove the `localStorage` token mirror (`influnet_token`, `influnet_user`) from
`shell.tsx` and any consumer (`grep -rn "influnet_token\|influnet_user" src/`); rely on the
cookie session + `getSession()` everywhere (Task 3.1 already funnels this through
`apiFetch`). Keep the auth store but hydrate it from `getSession()`.
**Acceptance:** grep returns nothing; login → dashboard → refresh → API calls all work;
sign-out clears session fully.

---

## Phase 4 — Tests, CI, and Docs

### Task 4.1 Test the new core

Vitest coverage for: accept-flow RPC behavior via API (sender-cannot-accept, double-accept
idempotency), collab PATCH transition matrix, notifications summary + list/mark-read,
conversation RPC reuse, stream webhook signature rejection, public profile 200/404.
Extend `tests/matchmaking.js` to assert a notification row is created on request.
**Acceptance:** `npm test` green locally; new tests fail if the guarded behavior regresses
(spot-check by temporarily reverting one guard).

### Task 4.2 CI hardening

In `.github/workflows/ci.yml`: remove `continue-on-error: true` from ESLint (fix
outstanding lint errors first — run `npx eslint src/` and clean), add
`npx tsc --noEmit` where missing, document required GitHub secrets in the workflow header
comment. **Acceptance:** pipeline green on `dev` push with lint enforced.

### Task 4.3 Documentation sync

Update `docs/ARCHITECTURE.md`: BIGINT project ids, Stream messaging + webhook persistence,
new routes (stream, cards, notifications, public profile), accept-RPC flow, removed
auto-heal. Update `README.md` env var list. Append phase summaries to
`.agents/lessons_learned.md`. **Acceptance:** a new agent reading only `docs/` +
`.agents/` gets no false claims about the system.

---

## Explicitly Out of Scope (do NOT do unless a new work order says so)

- Payments/Razorpay, creator verification badges, reviews UI, connections page build-out,
  file deliverables UI — Phase 5+, not scheduled here.
- Any work in the legacy directories, Firebase config, or `.replit`.
- Deleting the live Firebase hosting or DNS changes.
- Schema changes beyond the migrations specified above.
- UI redesigns — the current visual language is approved; preserve it.

## Task Tracking Protocol

When executing this plan, for each task:
1. Announce the task ID you are starting.
2. Re-read the referenced files before editing (they may have drifted since this plan).
3. Implement → verify (per-task criteria + global rules) → commit → log lesson.
4. If a task's context no longer matches reality (file moved, bug already fixed), **stop and
   report** instead of improvising a new scope.

Dependency chain, summarized:
`0.1 → 0.2 → {1.1, 1.2} → 1.3 → 1.4 → 1.5 → 1.6 → 2.1 → {2.2, 2.3, 2.4} → 3.x (any order, 3.1 first) → 4.x`
