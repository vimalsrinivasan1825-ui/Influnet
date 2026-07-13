# Influnet — Full Flow Audit (Onboarding → Verification → Collaboration → Impact)

**Date:** 2026-07-13 · **Branch:** `feat/creator-public-profile` · **Scope:** audit + recommendations, no code changed.

All claims below are read from source. File references are relative to `apps/web/` unless they start with `supabase/`.

> **Migration caveat that colours everything:** per project memory, the hosted DB is behind local migrations (051→057 are unapplied on the hosted instance). Several features below are *code-complete but not live* because their migration hasn't been pushed. Where that matters I say so. The audit judges the code as written.

---

## Flow 1 — Creator signup & verification

### 1a. Soft vs. hard signup

**Current state.** Signup is **soft on the backend, hard in the client wizard** — and the hardness is cosmetic.

- The account is created by `supabase.auth.signUp()` in `src/app/signup/influencer/page.tsx:115` with the whole profile blob in `options.data`. The auth user exists the moment this returns; nothing about profile completeness or verification can block it.
- The profile row is written by `register_profile` (latest def: `supabase/migrations/049_register_profile_role_guard.sql`). It **requires** a valid, unique `username` for influencers (`:112-117`) and derives location/pricing, but **every social handle, bio, niche, follower count is optional** at the DB layer.
- "Hardness" lives only in the client stepper's `canProceed()` (`signup/influencer/page.tsx:83-89`): step 3 requires `primaryNiche && bio && (instagram || youtube || twitter)`. This is client-only gating — a direct call to `/api/auth/register` (`src/app/api/auth/register/route.ts`) with just role+username+email succeeds. `RegisterProfileSchema` (in `src/lib/validators.ts`) is the only server guard; it does not require a handle.

**Verdict:** **Soft signup** with a client-side wizard that *feels* hard. At least one social handle is required by the UI but not enforced server-side.

**Open question:** Is "at least one social handle" meant to be a real invariant? If yes it belongs in `RegisterProfileSchema` + `register_profile`, not just `canProceed()`.

### 1b. Fields at signup vs. later

**Collected at signup** (influencer wizard → `register_profile`):
`firstName+lastName→name`, `username`, `email`, `phone` (optional), `password`, `gender`, `city`, `state`, `languages[]`, `primaryNiche + secondaryNiches → niche[]`, `bio`, `instagramHandle`, `youtubeHandle`, `twitterHandle`, `collabTypes[]`, `priceRange` (→ derives `pricing_min/max`). The insert also *accepts* `instagramFollowers/facebookFollowers/youtubeSubscribers/tiktokFollowers` and extra handles (`049:122-149`) **but the wizard never collects them**, so they default to `0`.

**Collected later** (public-profile setup / settings — `src/app/dashboard/settings`, avatar/photo storage migrations 013/025): avatar, profile photos, follower counts, extra social links, headline. The **public creator profile analytics (posts, avg views, reach, engagement) are not collected at all — they are mock** (see Flow 4).

**Gap:** follower counts are structurally reachable (`register_profile` writes them) but no form ever populates them, and — critically — the verification scorer needs them (below).

### 1c. Is verification synchronous / blocking?

**No, and correctly so.** Nothing calls `/api/verification` during signup. Verification is a **manual, on-demand** action: the only trigger is the "Run verification" button in `src/components/dashboard/verification-panel.tsx:42`. Migration `055` header and the `verification_status` state machine explicitly state **nothing blocks access**; the badge is the only effect. Account access is never gated on verification. ✅ Matches intent.

### 1d. Verification pipeline — current vs. intended

**Intended:** scrape submitted socials/business data → LLM scores signals → compare to threshold → auto-approve above, escalate to human below (never auto-reject).

**Current implementation** (`src/lib/verification-scraper.ts`, `src/lib/verification.ts`, `src/app/api/verification/route.ts`):

| Stage | Intended | Actual |
|---|---|---|
| Scrape | Fetch IG/YT/website/registry | **No network fetch.** `buildSignals` only checks *structural validity* of user-submitted strings (URL regex, GSTIN regex, handle regex). Comment at top of `verification-scraper.ts` is explicit about this. |
| Score | LLM confidence | **Deterministic heuristic** (`scoreBusinessSignals`/`scoreCreatorSignals`). `verification.ts` comment: "Swap `scoreWithAI` for a real Claude call later" — that function does not exist. |
| Threshold | auto-approve / escalate | Present and correct: `AUTO_APPROVE_THRESHOLD=0.85`, `ESCALATE_THRESHOLD=0.5`, fraud flags force `in_review`, never `rejected` (`decide()`). Enforced again in DB: `submit_verification` rejects any status outside `pending|in_review|needs_more_info|verified` (`055:161`). |
| Persist | queue + audit | `verification_checks` (audit trail w/ score/reason/signals) written; `submit_verification` RPC. **`verification_jobs` queue table exists but is never enqueued or drained** — no worker. The "async pipeline" is aspirational. |

**Two concrete correctness bugs in the current scorer:**

1. **Creators can essentially never auto-verify.** `scoreCreatorSignals` awards points for `follower_count>=1000` (+0.15) and `last_post_days_ago<=30` (+0.20), but `buildCreatorSignals` **never sets those fields** (it only reads bio/niche/handles/phone — not `instagram_followers` which exists in the DB). Max reachable score = 0.35 (1 handle) +0.15 (2 handles) +0.15 (bio matches niche) = **0.65 → always `in_review`.** Every creator is force-escalated to a human. Businesses *can* hit 0.85+ (website + name-in-domain + valid GST + contactable = 0.90).
2. Follower data the platform already stores (`influencer_profiles.instagram_followers`) is not passed into the scraper input (`route.ts:69-75` selects only `bio, niche, *_handle`), so even the heuristic can't use real reach.

**Gap summary:** thresholds/decision/audit = built and sound. Scraping = absent (honest structural-only stub). LLM scoring = absent. Async queue = table-only. Creator auto-approve = broken by missing signal wiring.

### 1e. Admin review gap

**This is the biggest divergence in Flow 1.** There are **two disconnected admin approval systems**, and the rich one is not surfaced in any UI:

- **Legacy, and the only one with a page:** `src/app/dashboard/admin/approvals/page.tsx` → `GET/PATCH /api/admin/businesses`. It shows **business registrations only**, with company/name/email/industry/city and Approve/Reject. **No creators, no AI score, no signals, no scraped evidence.** This is the "username + approve/decline" the brief describes.
- **New, rich, but headless:** `GET/PATCH /api/admin/verifications` (`src/app/api/admin/verifications/route.ts`) returns the full escalation queue for **both roles** with `ai_score, ai_reason, ai_signals`, name/email, and lets the admin `verified|rejected|needs_more_info` via `admin_decide_verification`. **No page or component calls this route** (grep: only the route file references it). The admin sidebar links only to `approvals` and `users`.

**Fields the admin currently cannot see but needs:** the AI score & reasoning (`ai_score`/`ai_reason`), the structured signals (`ai_signals` — handles live, GST valid, website resolves, flags), the raw submitted data for creators (bio, niche, handles, followers), the full submitted business data beyond name/industry (GST, website, budget are fetched by `/api/admin/businesses` but the row UI only renders name/email/industry/city — see `approvals/page.tsx:168-177`), and the audit history (`verification_checks` per user).

**Fix (structural):** build `src/app/dashboard/admin/verifications/page.tsx` on the existing `/api/admin/verifications` API; fold the legacy business-approvals screen into it (or make `admin_decide_verification` the single write path — it already keeps `business_profiles.approval_status` in sync, `055:224-231`). This is mostly UI; the data + write RPC already exist.

---

## Flow 2 — Business discovery & connect

### 2a. Viewing a public profile

**Current.** `/c/[username]` (`src/app/c/[username]/page.tsx`) reads via an **anon Supabase client** through `get_public_influencer`. **No login required to view** — a business owner arriving from an IG/YT bio link sees the profile. ✅ Matches intent. View is recorded fire-and-forget (`record_profile_view`).

### 2b. Account / verification needed to connect?

- **To view:** nothing.
- **To send a request:** the profile CTA for a logged-out viewer is "Work with me" → `/signup/business?next=/c/…` (`c/[username]/page.tsx:71`). So a **business account is required** to request. `POST /api/collabs` enforces `role: 'business_owner'` (`src/app/api/collabs/route.ts:43`).
- **Verification is NOT required** to send a request — there is no `verification_status` check anywhere in the collab path. A brand-new unverified business can request immediately.

**Open question:** Is that intended? Requiring an account but not verification is a reasonable low-friction default, but it means creators receive requests from unvetted businesses (mitigated only by the report/block system, migration 056).

### 2c. Request → accept → project

**Current** (`src/app/api/collabs/route.ts` + `supabase/migrations/043`):

- Request carries `project_title` + `project_description` + optional `budget` (`CollabRequestSchema`), concatenated into `collab_requests.message` (`route.ts:62`). Title is later recovered as line 1.
- Accept: `PATCH` → `accept_collab_request` RPC (`043:71`). Atomic: marks request accepted, ensures a conversation, creates one `campaign_projects` row at stage `collaboration_started`, idempotent via unique index on `collab_request_id`. ✅ Solid.
- **Decline:** `PATCH status:'declined'` just updates the row (`route.ts:138-147`). No notification, no project, no cooldown.
- **Re-request after decline:** the unique index `collab_requests_one_pending_per_pair` (`002:30`) only blocks a second *pending* row. Once declined, a business **can send a new request** — good — but there's **no rate limit / cooldown**, so a business can re-spam a creator who declined. (Block exists as the only defense.)

**Gap:** decline is silent (creator's "no" gives the business no signal); no anti-spam on re-request.

---

## Flow 3 — Project collaboration (12 stages)

### 3a. Stage definitions

**Formally defined**, single source of truth in `src/lib/project-lifecycle.ts`: 12 stages `collaboration_started → project_discussion → advance_payment → content_planning → content_confirmation → shooting_in_progress → editing_in_progress → sent_for_review → revisions → final_approval → final_payment → project_completed`. Plus `ALLOWED_TRANSITIONS` (linear + the `sent_for_review ⇄ revisions` loop) and `STAGE_ACTOR` (who may advance each stage).

**Nit / latent bug:** `campaign_projects.current_stage` DB default is the legacy `'lead_received'` (`006:13`) which is **not** in `STAGES`. New projects override it to `collaboration_started` in the accept RPC, so it's only a hazard if a project is ever inserted without going through `accept_collab_request` (then `STAGES.indexOf` returns -1 and `advance` 400s — `route.ts:119`).

### 3b. Rigid model vs. real behaviour

The model is **strictly linear with one revision loop**, gated by required checklist items (`project_stage_items`, migration 054; enforced server-side in `route.ts:131-149`). Where reality diverges:

| Stage / reality | Model assumes | Real-world | Flag |
|---|---|---|---|
| `revisions` | one loop back to `sent_for_review` | multiple revision rounds, revisions after "final" | Loop supports *repeat* round-trips (OK), but there's **no path back from `final_approval`/`final_payment`** to revisions — post-final change = stuck or cancel. **Too rigid.** |
| `advance_payment` / `final_payment` | single boolean confirm by business | partial payments, milestones, delayed payment | No amount tracking, no partial state. Payment is a checklist toggle, not money. **Structural gap.** |
| any stage | forward only (`ALLOWED_TRANSITIONS`) | going *back* a stage (re-plan, re-shoot) | **No backward transitions** except the one revisions loop. Renegotiating scope mid-project isn't representable. **Too rigid.** |
| silence / ghosting | n/a | a party goes dark for weeks | **No timeouts, no nudges, no stalled-state.** A project sits in a stage forever with no signal. **Missing entirely.** |
| `project_discussion` before payment | linear | deal falls through in discussion | Only exit is cancel (delete). No "lost/archived" outcome distinct from mutual cancel. |

Actor gating is sensible (`STAGE_ACTOR`), and advancement is genuinely enforced server-side (not just UI), which is good.

### 3c. Tracking mechanics

- **Stage entry/exit:** captured in `campaign_projects.stage_progress` JSONB — on `advance`, the old stage gets `status:'completed', completed_at` and the new gets `status:'current', started_at` (`route.ts:168-180`). So **per-stage timestamps exist.**
- **Time-in-stage / total duration:** **not computed anywhere.** The timestamps are stored but never turned into durations or surfaced.
- **`history` JSONB** column exists (`006:15`) but is **never written** — the intended audit log lives only in `logger.info` lines (`route.ts:197`), i.e. logs, not queryable data.
- **`updated_at`** bumps on every change.

### 3d. Dashboard population for an in-progress project

- **Creator dashboard** (`/api/influencer/dashboard`) & **Business dashboard** (`/api/business/dashboard`): both compute `active_projects`, `completed_projects`, budget/pipeline, and a weekly trend from **collab_requests**, not from stage data. Neither shows current stage, time-in-stage, or whose turn it is. Recent-collabs list maps status crudely (`pending→Negotiation, accepted→In Progress`).
- **Project detail** (`src/app/dashboard/projects/[id]/page.tsx`): this is where stage board, checklist, reviews, cancellation, report/block actually live.
- **Admin view** (`/api/admin/dashboard`): **counts only** (users, collabs, projects by status). No per-project drill-down, no stalled-project detection, no verification-queue or reports-queue counts. `src/app/dashboard/admin/projects/page.tsx` and `/api/admin/projects` exist for a list.

**Gap:** dashboards are collab/budget-centric; the 12-stage pipeline data (current stage, time-in-stage, blocked-on-whom) is captured but **not surfaced** on any of the three dashboards.

---

## Flow 4 — Post-project impact (both accounts)

**Headline finding: completion closes the Kanban card and unlocks reviews, and almost nothing else. The reputation/impact layer is largely un-built or dead scaffolding.**

### 4a. Two-way review — EXISTS ✅

Both directions work. `reviews` table (migration 051) with a per-`(project_id, from_user)` unique. `POST /api/projects/[id]/reviews` lets either participant review the other, gated on `status='completed'` (`reviews/route.ts:77`), and the RLS re-enforces "participant of a *completed* project reviewing the other participant" at the DB level (`051:28-41`) — forgery-resistant. Completion itself is **dual-confirm** (both parties, `route.ts:220-282`, migration 056), so "completed" is meaningful.

### 4b. Where the review goes — the broken connection

**Reviews are written and displayed only on the project detail page** (`projects/[id]/page.tsx:1241`). They **do not roll up anywhere:**

- **No reputation/trust score** exists. Grep for `reputation|trust_score|avg_rating|completion_rate|top_performer` → nothing in app logic. `verified_badge` (identity) is the only score-like signal, and the brief explicitly wants track-record separate from it.
- **Public creator profile** (`src/lib/public-profile/creator-profile.ts`): **does not read reviews at all.** Analytics are **mock** (`MOCK` block, `:127`; mock ON by default, `resolveMockMode`). No completed-collaboration count, no brand names/logos, no category tags from past projects, no aggregate rating. The floating "Verified" badge is even shown **unconditionally** regardless of `isVerified` (`:222`).
- **Public business profile** (`get_public_business`, migration 046): returns a `trusted_partner` boolean that is a **manually-set column**, not derived from completions or creator reviews. No completed-project count, no creator-reviews aggregate.

### 4c. `connections` — fully dead scaffolding

The `connections` table (migration 029) models exactly the reputation ladder the brief wants — `projects_completed`, `relationship_status ('new'|'active'|'trusted'|'top')`, `messages_count`, `last_interaction_at`. **It is never written to.** Grep confirms no `INSERT INTO connections` / `.from('connections')` in `src/` or migrations beyond the DDL. `accept_collab_request` doesn't create a connection; completion doesn't increment `projects_completed`. The types exist (`src/types/index.ts:193,440`) and there's a `/dashboard/connections` page, but the data never populates. **The "Top Performer / trusted" tier is defined and orphaned.**

### 4d. Discovery / ranking impact — none

`search_influencers` / `search_businesses` (migration 048) order by **`user_id`** (`048:99,156`) — arbitrary UUID order. No ranking by rating, completions, or recency. A strong track record has **zero** effect on discovery position, and there is no visible tier badge.

### 4e. Metrics — captured vs. should-be

| Metric | Creator | Business | Status |
|---|---|---|---|
| Completed projects | ✔ computed (dashboard) | ✔ computed (dashboard) | **live** (count of `status='completed'`) |
| Completion rate (accepted vs finished) | ○ derivable | ○ derivable | **not computed** |
| Average rating | — | — | **not computed** (reviews never aggregated) |
| Avg time-to-complete | — | — | **not computed** (stage timestamps exist, unused) |
| Repeat-business / repeat-creator rate | — | — | **not computed** (concurrent-project data exists) |
| Response/acceptance time on requests | — | — | **not computed** (`collab_requests.created_at`/`updated_at` exist) |
| Time-to-respond per stage | — | — | **not computed** (`stage_progress` timestamps exist, unused) |

Everything except raw completed-count is **absent**, though the **raw data to compute most of them already exists** (reviews, stage_progress timestamps, collab timestamps). Where they should surface: own dashboard (all), own public profile (completed count, avg rating, categories, tier), admin analytics (completion rate, response times, stalled projects).

---

## Edge cases

1. **Second/concurrent project, same business+creator?** **Yes, allowed.** The unique index only prevents a second *pending request* (`002:30`) and one project *per collab_request* (`043:13`). After a request is accepted (or declined), the business can send another request → another accepted → **another project**. No guard against duplicate active projects between the same pair.
2. **New request while creator is mid-project?** **Allowed and unmanaged.** No check on the creator's active-project load. They just get another request; accepting spawns a parallel project. No capacity/availability concept.
3. **Cancellation / abandonment mid-stage.** Modeled as a request/accept handshake (`request_cancellation → accept_cancellation`, `route.ts:341-411`). **`accept_cancellation` hard-deletes the `campaign_projects` row** (`route.ts:395-400`). Consequences: the project vanishes (no "cancelled" archive/analytics), any `reviews`/`project_assets`/`stage_items` cascade-delete, and a mid-project abandonment leaves **no trace** for reputation (a serial abandoner looks clean). **Abandonment ≠ ghosting:** silent inactivity has no handling at all (3b).
4. **Active project while verification pending?** **Yes — nothing is gated on verification** (by design, Flow 1c). A fully unverified creator and unverified business can run a project end-to-end, including payments-as-checkboxes and reviews. **Open question:** should *anything* (e.g. the `final_payment` gate, or being *discoverable*) require verification? Right now the badge is purely cosmetic.
5. **Other undefined/mishandled:**
   - `campaign_projects.current_stage` default `lead_received` not in `STAGES` (3a) — latent 400.
   - Declined request is silent; no re-request cooldown (2c) — spam vector.
   - `history` JSONB and `verification_jobs` queue are schema-only, never used — dead columns/tables.
   - Reviews are editable/deletable by the author indefinitely (`051:46-56`) — a bad review can be deleted after the fact.

---

## Messaging & feature scope

**Dual messaging systems coexist:**
- **Internal:** `conversations` / `conversation_participants` / `messages` (migration 002), created by `accept_collab_request`, with full RLS, attachments (019), presence/typing (004/005), unread tracking, and REST routes under `/api/conversations`.
- **Stream Chat (getstream):** the actual `/dashboard/messages` UI (`messages/page.tsx`) renders `stream-chat-react`, with `/api/stream/{token,channel,webhook}` and `src/lib/stream.ts`.

So there are **two parallel chat stacks** — an internal one wired into the project lifecycle, and a third-party one driving the UI. That's cost, surface area, and drift (which is the source of truth for unread counts / a project's thread?).

**Recommendation (scope):**
- **Cut one messaging stack.** For "minimize friction, speed up collab," pick Stream *or* internal, not both. Internal is already integrated with projects/RLS/notifications and has no per-seat cost; Stream gives polished UI for free. Given the lifecycle integration, **collapsing onto the internal stack** (and dropping Stream) removes an external dependency and the sync problem — unless the polished UI is a hard product requirement.
- **Keep & finish:** the 12-stage board, checklist gates, dual-confirm completion, two-way reviews, report/block — these are the core value.
- **Cut / defer:** presence + typing indicators (004/005) are friction-neutral polish; the `connections` CRM layer (favorites/notes/relationship tiers) is unbuilt — either wire it to real completion data or remove it rather than ship a dead page.
- **Simplify:** payment "stages" are checkboxes pretending to be money — either integrate real payments or rename them to "payment confirmed" acknowledgements so nobody mistakes the gate for an escrow.

---

## Prioritized punch list

**P0 — correctness / trust integrity**
1. **Fix creator scoring** so verification can actually resolve: pass `instagram_followers`/`youtube_subscribers`/last-post into `buildCreatorSignals`, or drop the unreachable follower/recency terms from `scoreCreatorSignals`. Today every creator is force-escalated. *(quick win)*
2. **Build the admin verification page** on the existing `/api/admin/verifications` (score, reason, signals, both roles) and retire/merge the legacy business-only `approvals` screen. Data + write RPC already exist. *(structural, but mostly UI)*
3. **Stop reviews being deletable after the fact**, or snapshot rating into an aggregate at write time so deletion can't launder a bad review. *(quick win)*

**P1 — the impact loop the product is built around**
4. **Aggregate reviews → a rating on public profiles** (creator and business) and read it in `creator-profile.ts` / `get_public_business` instead of mock/manual flags. *(structural)*
5. **Populate `connections` (or delete it):** increment `projects_completed` and advance `relationship_status` on dual-confirm completion; wire the completed-collaboration count + brand names + category tags onto the public profile. *(structural)*
6. **Rank discovery** by track record (rating, completions, recency) instead of `ORDER BY user_id`; add a "Top Performer" tier from real data. *(structural)*
7. **Turn stored timestamps into metrics:** compute avg time-to-complete, time-in-stage, response/acceptance time from `stage_progress` + `collab_requests` and surface on dashboards + admin analytics. *(structural, data already exists)*

**P2 — lifecycle realism & anti-abuse**
8. **Handle ghosting/stalls:** stalled-stage detection + nudges from the `started_at` timestamps already captured. *(structural)*
9. **Preserve cancelled/abandoned projects** as an archived state instead of hard-delete, so abandonment counts against reputation and analytics survive. *(quick win → structural)*
10. **Notify on decline + add a re-request cooldown** to close the spam vector. *(quick win)*
11. **Decide the verification-gate question:** should discoverability or the final-payment gate require a verified badge? Currently the badge is cosmetic. *(product decision)*

**P3 — scope reduction**
12. **Collapse to one messaging stack** (recommend internal; drop Stream) to kill the dual-source-of-truth. *(structural)*
13. **Enqueue/drain `verification_jobs` or remove it**; same for the unused `history` JSONB. *(cleanup)*
14. **Add the "≥1 social handle" invariant server-side** if it's a real rule (currently client-only). *(quick win)*

**Undefined behaviour needing a product decision (not code):** duplicate concurrent projects per pair (edge 1), creator capacity limits (edge 2), whether verification gates anything (edge 4/P2-11), and whether payment stages represent real money or acknowledgements.
