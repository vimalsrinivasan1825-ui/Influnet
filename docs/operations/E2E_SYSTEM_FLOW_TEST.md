# End‑to‑End System Flow — Manual Test Guide & Backend Walkthrough

> Written 2026‑07‑12. Traced directly from source + verified against the live Supabase
> project `jaajosocopoicmqcffuu`. This is the "nothing hidden" reference: for every flow it
> lists **what the user sees → what they do → what happens in the backend → what rows change →
> what they receive → how to verify it**. Pair it with [QA_AND_GO_LIVE.md](QA_AND_GO_LIVE.md)
> (shorter smoke script) and [ARCHITECTURE.md](../architecture/ARCHITECTURE.md).

---

## 0. How to watch the backend while you test

You need **three windows open** the whole time:

1. **The app** — two browsers (or one normal + one incognito) so you can be a **business** and a
   **creator** at the same time. A third incognito for the **admin**.
2. **Supabase Dashboard → Table Editor / SQL Editor** (project `jaajosocopoicmqcffuu`) — to watch
   rows appear. Verification SQL is given per‑flow below.
3. **Supabase Dashboard → Authentication → Users** and **Logs → Auth / Edge Functions**, plus the
   **GetStream dashboard** (Chat → Explorer) for messages.

### The tables that matter (what to keep open)
| Table | What lands here |
|---|---|
| `auth.users` | The login identity (email, password, `raw_user_meta_data`) |
| `profiles` | The base row for every user (role, name, phone, location) |
| `business_profiles` / `influencer_profiles` | Role‑specific data + `approval_status` (business) |
| `collab_requests` | Every collaboration request (status: pending/accepted/declined/cancelled) |
| `campaign_projects` | The project created when a request is accepted (12‑stage pipeline) |
| `conversations` + `conversation_participants` | The 1:1 chat thread |
| `messages` | A **mirror** of Stream messages (written by the webhook) |
| `notifications` | In‑app bell notifications (the only "notify" mechanism in the app) |
| `project_stage_items` | Per‑stage checklist gates |
| `reviews`, `creator_verifications`, `reports`, `user_blocks`, `profile_views` | Trust/safety + analytics |

### ⚠️ Things I confirmed that change how you should read this guide
These are **facts from the code**, not opinions — read them before testing so results aren't surprising:

1. **Phone OTP is NOT in the signup UI.** The `phone-otp` / `auth-signup` edge functions exist and
   are fully built, but the actual signup pages (`/signup/influencer`, `/signup/business`) call
   `supabase.auth.signUp()` directly and treat **phone as optional with no OTP step**. Don't expect
   an SMS during signup. (See §1.)
2. **The only emails are Supabase's own auth emails** (confirm‑email, password reset). There are
   **no transactional emails** for "new request", "request accepted", "stage changed", etc.
3. **Notifications are in‑app only** and are created by **DB triggers on `collab_requests` only**
   (new request → creator; accepted/declined → business). There is **no** notification trigger for
   new **messages** or for **stage changes** — message unread counts come from Stream, not from the
   `notifications` table. (Verified in migration `047`.)
4. **Chat runs on Stream**, and a signed **webhook** mirrors each message into the Postgres
   `messages` table. That webhook uses `SUPABASE_SERVICE_ROLE_KEY`.
5. **Config issue found (fix before trusting message persistence):** in `apps/web/.env.local`,
   `SUPABASE_SERVICE_ROLE_KEY` is set to an `sbp_…` **personal access token**, not a `service_role`
   JWT. The live REST API rejects it (`401 Invalid API key`). Any server path using the service role
   — the **Stream webhook**, `lib/supabase/server.ts`, the service fallback in `lib/api.ts` — will
   fail. Practical effect: **messages appear live in Stream but are NOT saved to Postgres `messages`**
   until the correct `service_role` key (a `eyJ…` JWT from Supabase → Settings → API) is in place.
6. **Hosted DB may be behind on migrations `051`–`057`** (reviews, stage‑items, verification,
   completion, private assets). The API routes **fail open** (they log and skip the feature rather
   than 500), so if reviews/verification/checklist gates seem to "do nothing", check the migration
   state first with the query in §11.

---

## FLOW A — Creator signs up and gets their link

**Goal:** a creator (influencer) registers, lands in their dashboard, and gets a shareable
link‑in‑bio URL to paste into Instagram.

### A1. What the user does (UI)
Route: `/signup` → picks **"I'm a creator"** → `/signup/influencer`. A 4‑step wizard:

| Step | Fields (required in **bold**) |
|---|---|
| 1 Account | **First name, Last name, Username, Email, Password** · Phone (optional) |
| 2 Profile | **Gender, City, State, ≥1 Language** |
| 3 Creator | **Primary niche, Bio, ≥1 of Instagram/YouTube/Twitter** · secondary niches |
| 4 Collab | **≥1 content type, Price tier** |

`Create account` is only enabled when the current step's required fields pass (`canProceed()`).

### A2. What happens in the backend (step by step)
On submit (`handleSubmit`, `signup/influencer/page.tsx`):
1. Builds a `payload` (name = "First Last", role `influencer`, username, niche array = `[primary, ...secondary]`, handles, `collabTypes`, `priceRange`, etc.).
2. `sb.auth.signUp({ email, password, options:{ data: payload } })` → creates the **`auth.users`** row with the payload copied into `raw_user_meta_data`.
3. **Branch on email confirmation** (Supabase Auth setting):
   - **Confirmations OFF** → `signUp` returns a `session` immediately → the page POSTs to
     `/api/auth/register` with `Authorization: Bearer <access_token>`.
   - **Confirmations ON** → `session` is `null` → user is redirected to
     `/login?message=Check your email to confirm your account`. **No profile row is created yet.**
     (Profile only gets created on the first authenticated call — currently there is no
     post‑confirmation auto‑register, so with confirmations ON a creator can land on login with only
     an `auth.users` row. Worth deciding: keep confirmations OFF, or add a post‑confirm register.)
4. `/api/auth/register` validates the body with `RegisterProfileSchema` (Zod) — **role is forced to
   `business_owner|influencer`; `admin` is rejected 400** — then calls the `register_profile(payload)`
   RPC as the logged‑in user.
5. `register_profile` (SECURITY DEFINER, migration `049`) runs one transaction:
   - Re‑checks the role guard (no self‑service `admin`).
   - `INSERT … ON CONFLICT` into **`profiles`** (id = auth uid, role, email, name, phone, location).
   - Validates the username (`is_valid_influnet_username`, `is_username_globally_taken`).
   - `INSERT … ON CONFLICT` into **`influencer_profiles`** with `onboarding_step = 2`,
     `is_profile_complete = false`, pricing derived from the tier (`influencer_pricing_from_tier`).
6. On success the page `router.push('/dashboard/influencer')`.

### A3. What the user receives
- Redirect into **`/dashboard/influencer`** (Creator home).
- Their profile is **live immediately** at `/c/<username>` (public, anon‑readable via
  `get_public_influencer`).
- **No email, no SMS, no notification.** (First real "reward" is the link — see A5.)

### A4. Verify in the backend
```sql
-- newest creator end to end
select u.email, p.role, p.name, ip.username, ip.onboarding_step, ip.is_profile_complete
from auth.users u
join profiles p on p.id = u.id
join influencer_profiles ip on ip.user_id = u.id
order by u.created_at desc limit 1;
```
Expected: one row, `role=influencer`, `onboarding_step=2`, `is_profile_complete=false`.

Public read works (this is exactly what a visitor's browser calls — try it with the **anon** key):
```
POST /rest/v1/rpc/get_public_influencer   body: { "p_slug": "<username>" }
→ 200 with the public profile JSON (null if slug doesn't exist)
```
> I ran this against the live project: `get_public_influencer` and `get_public_business` return **200**,
> and a raw anon `SELECT` on `profiles` returns **401 permission denied** — i.e. RLS is doing its job
> (only the curated RPC fields ever leave the DB).

### A5. The link the creator shares (link‑in‑bio)
- The creator finds it in **Dashboard → Settings**: shown as `influnet.app/c/<username>` with a link to `/c/<username>`.
- Two public URLs both resolve to the profile:
  - `/c/<username>` — the canonical public profile page.
  - `/influnet/<username>` — the "link‑in‑bio" alias; it looks up the slug via
    `get_public_influencer` and **redirects** to `/c/<username>` (404 if slug unknown).
- **Test:** open `/c/<username>` and `/influnet/<username>` in a logged‑out incognito window — both
  render the profile; the `/influnet/…` one should 301/redirect to `/c/…`.

---

## FLOW B — Business discovers the creator from the link

**Goal:** the business owner taps the creator's Instagram link, sees the profile, wants to reach out.

### B1. What the visitor sees on `/c/<username>` (logged out)
Cover image, avatar, name + verified tick (if verified), headline, location/languages, follower
stats (Instagram/YouTube/TikTok, only if > 0), About, content categories, availability, starting
price, social links. Plus a **CTA button** whose text/target depends on who's viewing:

| Viewer | CTA text | CTA target |
|---|---|---|
| Logged out | **Request Collaboration** | `/signup/business?next=/c/<username>` |
| Logged‑in **business** | Request Collaboration | `/dashboard/discover?request=<creatorUserId>` |
| The creator themselves | Edit Profile | `/dashboard/settings` |
| Logged‑in creator (someone else) | Back to Dashboard | `/dashboard` |

So a brand‑new business owner is pushed to **sign up first**, and after signup the `next` param
brings them back to the creator — where the CTA now deep‑links into Discover with the request modal
pre‑opened (see Flow D).

### B2. Backend on profile view
- `get_public_influencer(p_slug)` (anon) returns the curated profile.
- Fire‑and‑forget `record_profile_view(p_influencer_user_id, p_viewer_user_id)` logs the view
  (viewer id is null when logged out).

### B3. Verify
```sql
select count(*) from profile_views where influencer_user_id = '<creatorUserId>';
```
Increments on each page load (subject to whatever de‑dupe `record_profile_view` applies).

---

## FLOW C — Business signs up (and the approval gate)

**Goal:** the interested business registers. Unlike creators, businesses are **gated behind admin
approval** before they can use the dashboard.

### C1. UI — `/signup/business`, 4 steps
| Step | Fields (required in **bold**) |
|---|---|
| 1 Account | **Full name, Company name, Work email, Password** · Phone (optional) |
| 2 Company | **Business type, Industry** · Website |
| 3 Verify & address | **City, State, Registered address** · GST number |
| 4 Intent | **Monthly marketing budget** · shows "your account will be reviewed" notice |

Button reads **"Submit for review"**.

### C2. Backend
Same shape as A2, but `register_profile` writes a **`business_profiles`** row with
`approval_status = 'pending_review'` (default). Redirect target after submit is `/dashboard`.

### C3. The gate (what the business sees next)
`components/dashboard/shell.tsx` loads the session, and **if role = business_owner and
`approval_status ∈ {pending_review, rejected}`** it renders a full‑screen gate instead of the
dashboard:
- `pending_review` → **"Account under review"** (clock icon, "usually within 1–2 business days").
- `rejected` → **"Account not approved"** (X icon, contact support).

So a freshly signed‑up business **cannot** discover, message, or send requests until an admin
approves them.

### C4. Admin approves
1. Admin logs in → `/dashboard/admin/approvals`.
2. Sees the pending business; clicks **Approve** (or Reject).
3. That calls `PATCH /api/admin/businesses` `{ user_id, approval_status:'approved' }` →
   updates `business_profiles.approval_status`.
4. Business **reloads** → gate disappears → full dashboard.

> Admin accounts are **not** self‑registerable (the role guard blocks it). An admin is created
> manually (see `ADMIN_CREDENTIALS.local.txt` / migration `038`).

### C5. Verify
```sql
select bp.company_name, bp.approval_status, p.name, u.email
from business_profiles bp
join profiles p on p.id = bp.user_id
join auth.users u on u.id = bp.user_id
order by bp.created_at desc limit 5;
```
Watch `approval_status` flip `pending_review → approved` after the admin action.

---

## FLOW D — Business sends a collaboration request

**Goal:** approved business reaches out to the creator. **Direction matters: only a business owner
can initiate a request** (`POST /api/collabs` is `withAuth(req,{role:'business_owner'})`).

### D1. UI
Two ways in:
- From the creator's public profile CTA (logged‑in business) → `/dashboard/discover?request=<creatorId>`,
  which auto‑opens the request modal for that creator.
- From **Dashboard → Discover** directly: search/filter creators (server‑side
  `search_influencers` RPC), click a creator, **Send request**.

The modal collects: **Project title** (required), Budget (optional, positive number), Message.

### D2. Backend
`sendRequest()` → `POST /api/collabs` with `{ to_user_id, project_title, project_description, budget }`:
1. `withAuth` requires role `business_owner`.
2. Validates via `CollabRequestSchema`.
3. Inserts **`collab_requests`**: `from_user_id` = business, `to_user_id` = creator,
   `message` = `title \n\n description`, `budget`, `status = 'pending'`.
4. **Unique constraint**: a second pending request to the same creator → `23505` →
   API returns **409 "You already have a pending request"** (the UI marks it as already sent).
5. **DB trigger `on_collab_request_insert`** fires → inserts a **`notifications`** row for the
   **creator**: type `collab_request`, "New Collaboration Request", link `/dashboard/requests`.

### D3. What each side receives
- **Business:** the creator now shows as "Requested" in Discover; the request appears under
  **Requests → Sent** (status Pending, cancellable).
- **Creator:** an **in‑app notification** (bell) appears in real time (Supabase Realtime is enabled
  on the `notifications` table). It links to `/dashboard/requests`. **No email/SMS.**

### D4. Verify
```sql
-- the request
select id, status, from_user_id, to_user_id, budget, message
from collab_requests order by created_at desc limit 1;

-- the notification that fired for the creator
select user_id, type, title, link, read_at
from notifications order by created_at desc limit 1;   -- type = 'collab_request'
```

---

## FLOW E — Creator reviews & accepts → project + chat auto‑created

### E1. UI — `/dashboard/requests`
- **Incoming** section shows the request card (business name, project title, budget).
- Creator can **Accept** or **Decline**. (The business side sees the same request under **Sent** with
  a **Cancel** button while it's pending.)

### E2. Backend on **Accept**
`handleAction(id,'accepted',otherUserId)` → `PATCH /api/collabs {id,status:'accepted'}`:
1. Route calls the **`accept_collab_request(request_id)`** RPC (migration `043`, atomic,
   SECURITY DEFINER). It enforces **only the receiver (creator) can accept**, and is **idempotent**.
2. In one transaction it:
   - Sets `collab_requests.status = 'accepted'`.
   - **Ensures a `conversations` row** + two `conversation_participants` (business + creator).
   - **Creates the `campaign_projects` row**: `owner_user_id`=business, `counterparty_user_id`=creator,
     title/description from the request message, `budget`, `status='active'`,
     `current_stage='collaboration_started'`, `conversation_id`, `collab_request_id`
     (a **unique index** guarantees exactly one project per request).
3. **DB trigger `on_collab_request_update`** fires → inserts a **`notifications`** row for the
   **business**: type `collab_accepted`, "Request Accepted", link `/dashboard/projects`.
4. The Requests page also fires a best‑effort `POST /api/conversations` (harmless no‑op — the RPC
   already created the conversation; `get_or_create_conversation` just returns the existing one).

**On Decline:** status → `declined`; trigger fires `collab_declined` notification to the business;
**no** project/conversation created. **On Cancel** (business, while pending): status → `cancelled`
(no notification trigger for cancel).

### E3. What each side receives
- **Business:** `collab_accepted` bell notification → a new **Project** appears under
  `/dashboard/projects` at stage *Collaboration Started*, and a **conversation** appears in Messages.
- **Creator:** the request card flips to **Active**; the same project + conversation appear for them.

### E4. Verify (the "one accept → three rows" invariant)
```sql
select cr.status,
       cp.id as project_id, cp.current_stage, cp.status as project_status,
       cp.conversation_id, cp.collab_request_id
from collab_requests cr
join campaign_projects cp on cp.collab_request_id = cr.id
order by cr.created_at desc limit 1;
-- expect: status=accepted, current_stage=collaboration_started, project_status=active,
-- conversation_id not null.

-- both participants exist on the conversation
select user_id from conversation_participants
where conversation_id = '<conversation_id from above>';   -- exactly 2 rows

-- acceptance is idempotent: accepting again must NOT create a 2nd project
select count(*) from campaign_projects where collab_request_id = '<request id>';  -- always 1
```

---

## FLOW F — The 12‑stage project pipeline (stage by stage)

The project runs through a **fixed 12‑stage pipeline** (`lib/project-lifecycle.ts`). Each stage has
(a) **who** may advance it, (b) an optional **required checklist** that gates advancing, and (c) a
next stage.

| # | Stage (`current_stage`) | Label | Who can advance (`STAGE_ACTOR`) |
|---|---|---|---|
| 1 | `collaboration_started` | Collaboration Started | either |
| 2 | `project_discussion` | Discussion | either |
| 3 | `advance_payment` | Advance Payment | **business** (payer confirms deposit) |
| 4 | `content_planning` | Content Planning | **creator** |
| 5 | `content_confirmation` | Content Confirmation | **business** (approves concept) |
| 6 | `shooting_in_progress` | Shooting in Progress | **creator** |
| 7 | `editing_in_progress` | Editing in Progress | **creator** |
| 8 | `sent_for_review` | Sent for Review | **creator** (submits draft) → can go to `revisions` **or** `final_approval` |
| 9 | `revisions` | Revisions | **creator** → back to `sent_for_review` |
| 10 | `final_approval` | Final Approval | **business** (approves final content) |
| 11 | `final_payment` | Final Payment | **business** (confirms final payment) → then dual‑confirm completion |
| 12 | `project_completed` | Completed | — (terminal; unlocks reviews) |

### F1. UI — `/dashboard/projects/[id]`
- A **stage tracker** with progress %, the current stage's **checklist**, and an **Advance** button.
- A **Kanban / calendar** board of `project_cards` (drag/drop, add, clear column, resize span).
- **Chat** entry, reviews (once completed), and a **cancellation** control.

### F2. Backend on **Advance** (`PATCH /api/projects/[id] {action:'advance'}`)
1. Verifies the caller is a participant (owner or counterparty).
2. Computes the caller's role in the project (`business` if owner else `creator`).
3. **Actor gate:** if `STAGE_ACTOR[current]` ≠ `either` and ≠ caller's role → **403** ("Only the
   business/creator can advance…"). *This is enforced server‑side, not just hidden in the UI.*
4. **Checklist gate:** loads `project_stage_items` for the current stage; if any **required** item
   is unchecked → **409** with the list of blocking labels. (If table `054` isn't applied, it
   **fails open** and lets you advance — logs a warning.)
5. Enforces the **transition map** (`ALLOWED_TRANSITIONS`) — e.g. you can't skip stages; a bad
   `stage_key` → 400.
6. Updates `campaign_projects.current_stage`, stamps `stage_progress[old]=completed` /
   `stage_progress[new]=current`, sets `status='completed'` iff moving to `project_completed`.

### F3. Special: dual‑confirm completion (stage 11 → 12)
Reaching **Completed** is **not** a single click. At `final_payment` each side calls
`PATCH … {action:'confirm_completion'}`:
- Sets `owner_confirmed_complete` / `counterparty_confirmed_complete` for the caller.
- Only when **both** are true does it move to `project_completed` + `status='completed'`.
- If the confirmation columns (migration `056`) aren't there, the API returns a clear 400 telling
  you to apply the migration (fails safe).

### F4. Checklist items (`/api/projects/[id]/stage-items`)
Toggling an item → `POST /api/projects/[id]/stage-items`. Required items must be done before F2's
checklist gate lets you advance. Which items are "blocking" is decided by
`lib/project-stage-items.ts` (`blockingItems`).

### F5. Cancellation
- Either participant → `request_cancellation` (sets `cancel_requested_by`).
- The other party → `accept_cancellation` (**deletes the project row**) or `decline_cancellation`
  (clears the flag). You **cannot** accept your own request.

### F6. Verify each advance
```sql
select current_stage, status, stage_progress,
       owner_confirmed_complete, counterparty_confirmed_complete
from campaign_projects where id = <project_id>;
```
Test matrix worth walking:
- Advance from `advance_payment` **as the creator** → expect **403** (business‑only).
- Advance from `content_planning` **as the business** → expect **403** (creator‑only).
- Try to advance with a required checklist item unchecked → expect **409** + blocking labels.
- At `sent_for_review`, advance to `revisions`, then back to `sent_for_review`, then to
  `final_approval` — confirm the loop works.
- Confirm completion from only one side → stays at `final_payment`; from both → `project_completed`.

---

## FLOW G — Chat / messaging

**Goal:** business and creator message each other. Chat is powered by **Stream**; Postgres keeps a
mirror.

### G1. Entry points
- **Dashboard → Messages** (`/dashboard/messages`) lists conversations + project partners.
- The **business public profile** `/b/<username>` has a **Message** CTA →
  `/dashboard/messages?new=<businessUserId>` (for logged‑in creators).
- A project's chat opens the conversation created at acceptance.

### G2. What happens under the hood
1. On open, the client gets a **Stream user token**: `POST /api/stream/token` (auth'd) →
   `ensureStreamUser` upserts the user into Stream and returns a token.
2. Starting a thread: `POST /api/conversations {other_user_id}` →
   `get_or_create_conversation` returns/creates the DB conversation (+participants).
3. `POST /api/stream/channel {conversationId, otherUserId}` — verifies **both** users are
   participants (403 if caller isn't, 400 if the other isn't), then creates/ensures the Stream
   channel **`conv_<conversationId>`** with both members.
4. The UI mounts Stream's `<Chat><Channel><MessageList/><MessageInput/>`.
5. When a message is sent, Stream delivers it live to the other member **and** calls our
   **webhook** `POST /api/stream/webhook` (`message.new`, signature‑verified). The webhook uses the
   **service‑role** client to `INSERT` into `messages` and bump `conversations.updated_at`.

### G3. What each side receives
- The message in real time (Stream).
- Unread badge in the shell — driven by **Stream** (`total_unread_count`), merged into the
  notifications summary. **Not** a `notifications` row (no message trigger exists).

### G4. Verify
- **Live path:** open the same conversation in both browsers, send a message → it appears instantly
  on the other side, and in **GetStream dashboard → Chat → channel `conv_<id>`**.
- **Persistence path:** `select * from messages where conversation_id = '<id>' order by created_at;`
  → **⚠️ this only fills in if the Stream webhook is configured AND the `service_role` key is valid.**
  With the current mislabeled key (see §0.5), Stream will show messages but this table stays empty.
  To make G4's SQL pass: set the real `service_role` JWT and point the Stream webhook at
  `<app-url>/api/stream/webhook`.

---

## FLOW H — Trust, safety & reviews (only after completion / as needed)

- **Reviews** (`/api/projects/[id]/reviews`, migration `051`): once a project is `project_completed`,
  each side can leave a rating/review of the other; it surfaces on the public profile. Verify:
  `select * from reviews where project_id = <id>;`
- **Creator verification badge** (migration `055`, `lib/verification*.ts`): a creator submits social
  proof; an admin approves it → `creator_verifications` row → the ✔ tick renders on `/c/<username>`
  and `profile.isVerified` is true. Admin surface: `/dashboard/admin/verifications`.
- **Reports** (`/api/reports`): a participant can report the other from the project page →
  `reports` row → admin reviews at `/dashboard/admin/reports`.
- **Blocks** (`/api/blocks`, `user_blocks`): blocking prevents further requests/messages.

> If any of these "do nothing", check migration state (§11) first — the routes fail open when their
> tables aren't present yet.

---

## 9. Admin flows (quick matrix)

| Page | Does | API |
|---|---|---|
| `/dashboard/admin` | Overview counts | `GET /api/admin/dashboard` |
| `/dashboard/admin/approvals` | Approve/reject businesses (the gate in Flow C) | `PATCH /api/admin/businesses` |
| `/dashboard/admin/verifications` | Approve creator verification badges | `/api/admin/verifications` |
| `/dashboard/admin/users` | List users, see roles + approval status | `GET /api/admin/users` |
| `/dashboard/admin/projects` | Inspect all projects | `GET /api/admin/projects` |
| `/dashboard/admin/collabs` | Inspect all collab requests | `GET /api/admin/collabs` |
| `/dashboard/admin/reports` | Review reports | `/api/admin/reports` |

Verify an admin can reach these and a non‑admin gets **403/redirect** (admin routes are role‑guarded).

---

## 10. Negative & security scenarios to run (don't skip these)

1. **Role guard on registration:** call `/api/auth/register` with `role:'admin'` → **400**
   (and the RPC also rejects it). No admin can be self‑created.
2. **Only businesses send requests:** as a **creator**, `POST /api/collabs` → **403**.
3. **Only the receiver accepts:** as the **business** (sender), try to accept your own request →
   RPC raises `only_receiver_can_accept`.
4. **Duplicate request:** send a 2nd pending request to the same creator → **409**.
5. **Project access control:** as a non‑participant, `GET/PATCH /api/projects/[id]` → **403/404**.
6. **Stage actor gate:** advance a business‑only stage as the creator (and vice‑versa) → **403**.
7. **Checklist gate:** advance with a required item unchecked → **409** with blocking labels.
8. **Chat membership:** `POST /api/stream/channel` for a conversation you're not in → **403**.
9. **RLS on raw tables:** anon `SELECT` on `profiles` → **401** (verified live). Public data only
   ever comes through the `get_public_*` RPCs.
10. **Webhook signature:** `POST /api/stream/webhook` without/with a bad `x-signature` → **401**.
11. **Business gate:** a `pending_review` business is blocked from the dashboard (Flow C3); confirm
    they truly can't reach Discover/Messages by URL either.

---

## 11. Backend verification cheat‑sheet

**Which migrations are applied on the hosted DB** (run in Supabase SQL editor):
```sql
select version from supabase_migrations.schema_migrations order by version;
-- confirm 051..057 are present; if not, reviews/stage-items/verification/completion
-- features fail open (they won't error, they just no-op).
```

**Full funnel for one test pair:**
```sql
select 'auth' src, count(*) from auth.users
union all select 'profiles', count(*) from profiles
union all select 'influencer', count(*) from influencer_profiles
union all select 'business', count(*) from business_profiles
union all select 'requests', count(*) from collab_requests
union all select 'projects', count(*) from campaign_projects
union all select 'conversations', count(*) from conversations
union all select 'messages', count(*) from messages
union all select 'notifications', count(*) from notifications;
```

**Trigger sanity (are the notification triggers installed?):**
```sql
select tgname, tgrelid::regclass as table
from pg_trigger
where tgname in ('on_collab_request_insert','on_collab_request_update');
-- expect both, on public.collab_requests
```

---

## 12. What I verified from my side (2026‑07‑12)

| Check | Result |
|---|---|
| `tsc --noEmit` on `apps/web` | ✅ **Passes, 0 errors** |
| Live backend reachable | ✅ project `jaajosocopoicmqcffuu` responds |
| `get_public_influencer` / `get_public_business` RPCs (anon) | ✅ **200** (return null for unknown slug) — public profile path works |
| RLS on `profiles` (anon direct read) | ✅ **401 permission denied** — lockdown working |
| `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` | ❌ **Wrong key type** — it's an `sbp_…` PAT, REST returns `401 Invalid API key`. Breaks the Stream webhook + all service‑role server paths. Replace with the `service_role` **JWT** (`eyJ…`) from Supabase → Settings → API. |
| Phone OTP in signup UI | ⚠️ **Not wired** — edge functions exist but signup uses `auth.signUp` directly; phone optional, no OTP. |
| Message / stage‑change notifications | ⚠️ **No DB triggers** — only `collab_requests` insert/update create notifications. |

**Things only you can do (I did not, on purpose):** creating real auth accounts, sending real
messages/requests, and approving accounts — those write to the live DB / external services, so they're
left as the manual steps above. Everything read‑only I could verify is in the table.
