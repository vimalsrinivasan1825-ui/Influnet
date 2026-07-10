# Influnet — Full Codebase Analysis & Project State

> **Generated:** July 10, 2026 · from a full audit of the repository on branch `dev`
> **Purpose:** One document that explains the business, the architecture, what exists today,
> what is broken, what is missing, and what to do next.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Business — What Influnet Is](#2-the-business--what-influnet-is)
3. [Repository Anatomy — Three Generations of Code](#3-repository-anatomy--three-generations-of-code)
4. [Architecture of the Active App (`influnet-app`)](#4-architecture-of-the-active-app-influnet-app)
5. [Feature Status Matrix — What Has Been Built](#5-feature-status-matrix--what-has-been-built)
6. [Frontend Analysis](#6-frontend-analysis)
7. [Backend Analysis](#7-backend-analysis)
8. [Database & Migrations Analysis](#8-database--migrations-analysis)
9. [Security Analysis](#9-security-analysis)
10. [Testing & CI/CD](#10-testing--cicd)
11. [What Needs To Be Fixed — Prioritized](#11-what-needs-to-be-fixed--prioritized)
12. [Gap Analysis — Product Vision vs. What Exists](#12-gap-analysis--product-vision-vs-what-exists)
13. [Recommended Roadmap](#13-recommended-roadmap)
14. [Quick Reference — How to Run](#14-quick-reference--how-to-run)

---

## 1. Executive Summary

**Influnet is an influencer-marketing matchmaking platform for the Indian market.** Businesses
discover creators, send collaboration requests, and — once a creator accepts — get an
auto-created project workspace (12-stage pipeline + Kanban cards) and a chat thread. An admin
role gates business accounts behind manual approval.

**Current state in one paragraph:** The product has gone through three generations of code
(static SPA on Firebase → patch-script era → the current Next.js 16 + Supabase app). The active
app (`influnet-app/`) has a complete signup/login flow, role-aware dashboards, discovery,
collab requests, an auto-created project pipeline with a Kanban workspace, an admin panel, and
a messaging page recently migrated to Stream Chat. TypeScript compiles clean, a CI pipeline and
a small test suite exist. **However**, a large amount of this work (the entire `src/app/api/`
directory, admin pages, Kanban workspace, tests, CI) is **uncommitted** on the `dev` branch,
and the audit found several **critical issues**: secrets (`.env.local` with the Supabase
service-role key and Stream API secret) are tracked in git; the Stream Chat token endpoint
cannot authenticate users (messaging is broken as written); one API route executes
string-interpolated raw SQL through the Supabase Management API; and the product's **core
promise — instant notifications to creators — does not exist yet** (no push/email/in-app
notification delivery, and the `/api/notifications/summary` endpoint the UI calls was never
built). The public "link-in-bio" creator profile — the heart of the acquisition loop — exists
only in the legacy static site and has not been ported to the Next.js app.

**Top 5 actions (detail in §11):**

1. **Rotate all leaked keys** (Supabase service-role, access token, Stream secret) and purge
   `.env` / `.env.local` from git history.
2. **Fix Stream Chat authentication** so messaging works end-to-end.
3. **Build the notification pipeline** — this *is* the product's differentiator.
4. **Port the public creator profile (link-in-bio)** into the Next.js app.
5. **Commit the pending work** (~13,400 lines) in reviewable chunks and harden the collab/project
   API (authorization gaps, validation, transactionality).

---

## 2. The Business — What Influnet Is

### 2.1 The Problem

Creators and businesses today connect through Instagram DMs and email:

- Average response time is hours to a day; many messages get no response at all.
- Large creators route inboxes through managers, adding more delay.
- Businesses lose campaign momentum waiting; creators miss deals they never saw.

### 2.2 The Solution

**Influnet instantly notifies creators when a business sends a verified collaboration
request**, so conversations start in minutes instead of days.

The **link-in-bio model** is the acquisition engine: a creator places their Influnet profile
link in their social bios. A business clicks it, submits a request, and the collaboration
begins inside Influnet — requests, chat, project pipeline, and (in the future) payments all in
one place.

> Mission: *Less waiting. Less effort. More collaborations. More success.*
> (Source: `docs/the-ides.md`)

### 2.3 User Roles & Value Loops

| Role | How they join | Gate | What they get |
|---|---|---|---|
| `influencer` (creator) | 4-step signup wizard | Instant access | Profile link for bio, incoming verified requests, chat, project tracker |
| `business_owner` | 4-step signup wizard | **Admin approval required** (`pending_review` → `approved`/`rejected`) | Creator discovery, send requests, campaign pipeline, spend tracking |
| `admin` | Seeded via SQL/dev endpoint | n/a | Approvals, user/project/collab oversight, force-delete |

### 2.4 The Core Domain Loop

```
Discover ──→ Send Request ──→ Accept ──→ Project + Chat ──→ 12 Stages ──→ Complete
 (business    (collab_          (creator     (campaign_        (pipeline +     (final
  searches     requests,         accepts)     projects +        Kanban cards)   payment —
  creators)    pending)                       conversation                      future)
                                              auto-created)
```

Requests are **unidirectional**: only businesses can initiate (enforced server-side with a
403 for non-business senders). Creators see a "Verified Brand Partner" indicator instead of a
request button.

### 2.5 Market Focus

V1 is **India-first**: hardcoded Indian states, ₹ price tiers, GST number on business signup,
and phone OTP via the Indian SMS provider **2Factor**. This is a deliberate v1 scope decision,
not an accident — but it is baked into UI constants rather than configuration (see §6.3).

---

## 3. Repository Anatomy — Three Generations of Code

The repo contains **three coexisting generations** of the product. Understanding this is
essential to not get lost:

```
Influnet/
├── influnet-app/          ← GEN 3 (ACTIVE): Next.js 16 App Router + Supabase app
├── supabase/              ← ACTIVE: 39 SQL migrations, 2 edge functions, config
├── docs/                  ← ACTIVE: architecture, Supabase setup, OTP setup, audits
├── .agents/               ← ACTIVE: AI-agent workflow rules + lessons-learned log
├── .github/workflows/     ← ACTIVE: CI pipeline (uncommitted)
│
├── influnet/              ← GEN 1 (LEGACY): static SPA served by Firebase Hosting.
│                            Vite-built bundle + ~40 runtime JS/CSS "patch" files
│                            (supabase-auth-bridge.js intercepts /api/* calls,
│                            public-influencer-profile.js, phone-otp-verification.js, …)
├── influnet.io/           ← GEN 1 source: the original React source the static
│                            bundle was built from
├── scripts/               ← GEN 1 tooling: ~60 Node/PowerShell scripts that patched
│                            the *compiled* JS bundle (find-*/patch-*/fix-* scripts)
├── messaging-widget/      ← GEN 2: standalone Vite+React floating chat widget
├── signup-widget/         ← GEN 2: a single extracted signup step component
├── firebase.json           ← Firebase Hosting config for the legacy site
├── .replit / main.py       ← abandoned Replit/CloudRun deploy experiment
└── graphify-out/           ← generated AST code-graph artifacts (tooling output)
```

**Why this matters:**

- The **legacy generation is dead weight but contains features not yet ported** — most
  importantly the public creator profile (`influnet/public-influencer-profile.js`), forgot-
  password flow, and the phone-OTP verification UI.
- The `scripts/` directory documents a painful era of patching a compiled bundle because
  source access was lost — the Next.js rewrite exists precisely to escape that. Nothing in
  `scripts/` should be needed going forward.
- Two hosting worlds: legacy site → **Firebase Hosting**; the Next.js app targets **Vercel**
  (per `docs/ARCHITECTURE.md`). Long-term there should be one.

### 3.1 Git State (as of this audit)

- Branches: `dev` (current), `main`; remote on GitHub.
- Only ~9 commits of history; **the entire backend (`src/app/api/`), admin pages, Kanban
  workspace, tests, CI workflow, and shadcn/ui setup are untracked/uncommitted** —
  `git diff --stat` shows ~13,400 pending insertions across 25+ modified files plus dozens of
  new files. All recent phases live only on this machine until committed.

---

## 4. Architecture of the Active App (`influnet-app`)

### 4.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.9 |
| UI runtime | React | 19.2.4 |
| Styling | Tailwind CSS v4 + shadcn/ui + tw-animate-css | 4.x |
| Animation | framer-motion, cobe (WebGL globe) | 12.x |
| State | Zustand | 5.x |
| Validation | Zod | 4.x |
| Drag & drop | @dnd-kit (Kanban) | 6.x |
| Charts | Recharts + hand-rolled SVG | 3.x |
| Database/Auth | Supabase (PostgreSQL + RLS + Auth + Storage) | supabase-js 2.110 |
| Chat | **Stream Chat (GetStream)** | stream-chat 9.x |
| SMS OTP | 2Factor via Supabase Edge Function | — |
| Tests | Vitest (+ node script E2E) | 3.x |
| Target scale | ~2,000 users, moderate concurrency | — |

### 4.2 System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                     │
│                                                                 │
│  Pages (React 19, client-heavy)      Edge middleware            │
│   /login /signup/* /dashboard/*  ←→  (cookie session refresh,   │
│   landing page                        redirect unauth → /login) │
│            │                                                    │
│            │ fetch + Bearer <supabase JWT>                      │
│            ▼                                                    │
│  API Routes (/api/*) — per-request Supabase client with the     │
│  caller's JWT → RLS enforced; a few routes use service-role     │
│            │                                                    │
└────────────┼────────────────────────────────────────────────────┘
             ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│         Supabase          │        │      Stream Chat          │
│  Auth · Postgres+RLS ·    │        │  (GetStream) messaging    │
│  Storage · Edge Functions │        │  channels `conv_<uuid>`   │
│  (phone-otp, auth-signup) │        │  server-issued tokens     │
└──────────────────────────┘        └──────────────────────────┘
```

### 4.3 Authentication Flow

1. **Session transport is hybrid** (a real source of complexity):
   - `@supabase/ssr` browser client keeps the session in **cookies** (synced by
     `middleware.ts` on every request).
   - The dashboard shell **also mirrors** the access token and user object into
     `localStorage` (`influnet_token`, `influnet_user`) for legacy compatibility.
   - Client pages fetch a **fresh token** via `sb.auth.getSession()` before API calls
     (a hard-won lesson — static tokens expire after 1 h and caused 401 bugs).
2. **Route protection**: `middleware.ts` redirects unauthenticated users to `/login` for all
   non-public paths; logged-in users hitting `/login` bounce to `/dashboard`.
3. **API authorization**: every route re-creates a Supabase client with the caller's
   `Authorization: Bearer` header, calls `auth.getUser()`, and (where needed) checks
   `profiles.role` server-side. RLS is the second line of defense.
4. **Role routing**: shell redirects `influencer` → `/dashboard/influencer`,
   `business_owner` → `/dashboard`; unapproved businesses see an "Under Review"/"Not
   Approved" gate screen instead of dashboard content.

### 4.4 Data Model (core entities)

```
auth.users ──1:1── profiles (role: business_owner | influencer | admin)
                     │ 1:1                        │ 1:1
                     ▼                            ▼
             business_profiles           influencer_profiles
             (company, GST,              (username, niche, bio, socials,
              approval_status)            price_range, availability)
                     │                            │
                     └────────── collab_requests ─┘        from → to, status:
                                       │                   pending/accepted/declined
                                       │ on accept (server-side)
                     ┌─────────────────┴──────────────────┐
                     ▼                                    ▼
             campaign_projects  ── conversation_id ──  conversations
             (BIGINT id, 12-stage enum,                   │
              status, budget,                             ├── conversation_participants
              cancel_requested_by)                        ├── messages
                     │                                    └── user_presence
                     └── project_cards (Kanban: stage_key, position,
                         due_date, meeting_link, color, status)
```

Supporting tables: `connections`, `project_assets`, `business_reviews`,
`influencer_shortlists`, `creator_profile_views`, `profile_views`, `profile_link_clicks`,
`phone_otp_sessions`, `phone_otp_audit_log`, `onboarding_progress`-related columns.

**The 12-stage pipeline** (`project_stage` enum):
`collaboration_started → project_discussion → advance_payment → content_planning →
content_confirmation → shooting_in_progress → editing_in_progress → sent_for_review →
revisions → final_approval → final_payment → project_completed`

### 4.5 Module → Route → Table Map

| Module | Pages | API | Tables |
|---|---|---|---|
| Auth | `/login`, `/signup`, `/signup/influencer`, `/signup/business` | `POST /api/auth/register` (RPC `register_profile`) | `profiles`, role tables |
| Discovery | `/dashboard/discover` | `GET /api/discover` | `influencer_profiles` ⇄ `business_profiles` |
| Requests | `/dashboard/requests` | `GET/POST/PATCH /api/collabs`, `GET /api/collabs/[id]` | `collab_requests` |
| Projects | `/dashboard/projects`, `/dashboard/projects/[id]` (Kanban) | `GET/PATCH /api/projects`, `GET/PATCH/DELETE /api/projects/[id]`, `…/cards`, `…/cards/[cardId]` | `campaign_projects`, `project_cards` |
| Messaging | `/dashboard/messages` | `GET/POST /api/conversations`, `DELETE /api/conversations/[id]`, `…/messages`, `POST /api/stream/token`, `POST /api/stream/channel` | `conversations`, `messages`, participants + **Stream Chat** |
| Dashboards | `/dashboard` (business), `/dashboard/influencer` | `GET /api/business/dashboard`, `GET /api/influencer/dashboard` | aggregates |
| Admin | `/dashboard/admin` + `approvals`, `users`, `projects`, `collabs` | `GET/PATCH/DELETE /api/admin/*`, `POST /api/admin/seed` (dev) | all |
| Profile | `/dashboard/settings` | `GET/PATCH /api/profile` | `profiles` + role tables |
| Connections | `/dashboard/connections` | — (placeholder) | `connections` |
| Landing | `/` (14 sections) | — | — |
| Setup | `/setup` (dev admin seeding) | `POST /api/admin/seed` | — |

### 4.6 Messaging Architecture — Important Evolution

Messaging has **two overlapping implementations**:

1. **Supabase-native** (older): `conversations` / `messages` tables, REST routes, and
   (historically) Supabase Realtime `postgres_changes` subscriptions.
2. **Stream Chat** (current direction, uncommitted): the messages page now connects to
   GetStream (`stream-chat-react` UI), with channels keyed `conv_<conversationId>`. Supabase
   tables remain the **source of truth for which conversations exist** (the sidebar list),
   while Stream handles live message transport/UI.

This hybrid is reasonable, but the integration is **currently broken** (see §11 P0-2) and the
Supabase `messages` table no longer receives what users type into Stream — meaning message
history lives only in Stream while `/api/conversations/[id]/messages` still reads the old
table. This split-brain needs a deliberate decision (see §13).

---

## 5. Feature Status Matrix — What Has Been Built

Legend: ✅ working · 🟡 partial/mocked · 🔴 broken as written · ⬜ not started

| Feature | Status | Notes |
|---|---|---|
| Landing page (14 sections, animations, globe) | ✅ | Polished; committed |
| Role-select signup + 4-step influencer wizard | ✅ | India-specific constants hardcoded |
| 4-step business wizard + review step | ✅ | Ends in `pending_review` |
| Login + role-based redirect | ✅ | Hybrid cookie/localStorage session |
| Business approval gate (admin approves) | ✅ | Gate screen in shell |
| Admin panel (5 pages: stats, approvals, users, projects, collabs) | ✅ | Server-side role checks on every route |
| Discovery (role-aware, both directions) | 🟡 | Works, but **no search, no filters, no pagination** (flat `LIMIT 30`) |
| Send collab request (modal: title, budget, message) | ✅ | Business-only, enforced 403 |
| Accept/decline request → auto-create project + conversation | 🟡 | Works, but non-transactional; sender can "accept" own request (§11 P1-1) |
| 12-stage project pipeline + stage advancement | ✅ | Both parties can advance |
| Project Kanban workspace (`/projects/[id]`, dnd-kit cards) | ✅ | Cards with due dates, colors, meeting links; RLS-scoped |
| Mutual cancellation flow (request → accept/decline) | ✅ | Delete on mutual consent; admin force-delete |
| Messaging UI (Stream Chat) | 🔴 | Token route can't authenticate the caller — connection always fails (§11 P0-2) |
| Manual "start conversation" (POST /api/conversations) | 🔴 | Raw SQL via Management API with the wrong credential type (§11 P0-3) |
| Notification badges (sidebar) | 🔴 | Shell calls `/api/notifications/summary` — **route does not exist**; badges hardcoded to 0 |
| **Instant notification delivery (the core product promise)** | ⬜ | No email/push/SMS/in-app-realtime notification pipeline at all |
| **Public creator profile / link-in-bio** | ⬜ | Exists only in the legacy static site; no `[username]` route in the Next.js app |
| Business dashboard metrics | 🟡 | Real counts + budget sum, but `platform: 'Instagram'`, `reach: '10K'` are hardcoded |
| Influencer dashboard metrics | 🟡 | Requests/projects real; `profile_views`, `saved_by_businesses`, all trends = 0 (mock) |
| Settings / profile edit | ✅ | GET/PATCH wired for both roles |
| Connections page | ⬜ | 20-line placeholder (schema exists: migration 029) |
| Phone OTP (2Factor) | 🟡 | Edge functions + migrations exist; UI lives in the **legacy** site, not ported |
| Forgot password | ⬜ | Legacy-only (`influnet/forgot-password.js`); `/reset-password` is whitelisted in middleware but no page exists |
| Payments (advance/final) | ⬜ | Stage names reserve the slots; nothing implemented |
| File sharing / deliverables (`project_assets`) | ⬜ | Table exists; no UI/API |
| Reviews & ratings (`business_reviews`) | ⬜ | Table exists; no UI/API |
| Shortlists/saves (`influencer_shortlists`) | ⬜ | Table exists; no UI/API |
| Unit + integration + E2E tests | 🟡 | Good skeleton (stores, validators, authz, matchmaking); most features untested |
| CI pipeline (GitHub Actions) | 🟡 | 6 jobs defined; **uncommitted**, lint is `continue-on-error` |

---

## 6. Frontend Analysis

### 6.1 What's Good

- **Consistent design language**: premium Apple-style light theme (`#fafafb` backdrops,
  `rounded-2xl`, Plus Jakarta Sans/Inter, soft pink/purple glows) applied across auth,
  dashboards, and admin. The `.agents/AGENTS.md` "zero-scroll dashboard" policy
  (`h-[calc(100vh-56px)] overflow-hidden`) is honored.
- **Role-aware rendering** done once in shared components (`sidebar.tsx` switches nav by
  role; discover renders two views from one page).
- Hand-rolled **SVG charts** (area chart, heatmap, ROI bars) instead of placeholder images.
- Typecheck passes clean (`npx tsc --noEmit` → 0 errors).

### 6.2 Structural Issues

| Issue | Where | Impact |
|---|---|---|
| **Monolithic page components** | `projects/[id]/page.tsx` (831 lines), `messages/page.tsx` (753), `signup/influencer/page.tsx` (467) | Hard to test/reuse; extract sub-components + hooks |
| **`as any` casts everywhere** | most pages & routes (`profile as any`) | Defeats the `Database` types that already exist in `src/types/index.ts` (598 lines) |
| **Inline `style={{}}` objects mixed with Tailwind** | shell gate screen, several dashboards | Two styling systems in one file; pick Tailwind |
| **Duplicated fetch boilerplate** | every page re-implements "get session → get token → fetch with Bearer" | Extract a `useApi()`/`apiFetch()` helper |
| **State stores underused** | `messaging-store.ts` still models the pre-Stream world (typing maps, message arrays) and is now largely dead code | Delete or rewrite around Stream |
| **Legacy CSS files imported globally** | `src/app/*.css` (7 files ported from the static site, e.g. `business-dashboard-layout.css`) | Conflicts caused the `!text-white` workarounds; migrate into components and delete |
| **Sidebar badges hardcoded** | `shell.tsx:186-187` passes `unreadMessages={0} pendingRequests={0}` | Badges can never show anything |

### 6.3 Hardcoded Content Audit

- `INDIAN_STATES`, `NICHES`, `LANGUAGES`, `COLLAB_TYPES`, `PRICE_TIERS` (₹) live inside the
  signup pages → move to `src/lib/constants.ts` (single source, reusable in settings/discover
  filters later).
- Landing copy inline in components — acceptable for marketing pages.
- Admin seed credentials `admin@influnet.com` / `Admin@123` hardcoded in
  `api/admin/seed/route.ts` (see §9).

---

## 7. Backend Analysis

### 7.1 The Standard Route Pattern (and its cost)

Every route hand-rolls the same ~25 lines:

```ts
const authHeader = req.headers.get('Authorization');
const { createClient } = await import('@supabase/supabase-js');   // dynamic import, every call
const supabase = createClient(URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
const { data: { user } } = await supabase.auth.getUser();
// … then per-route logic, RLS enforces rows
```

This is *correct* (user-scoped client → RLS applies) but repeated across ~20 routes with no
shared helper, no Zod validation (despite `src/lib/validators.ts` defining schemas for every
payload — **they are never imported by any route**), and `console.log` statements that leak
user IDs and auth-header prefixes into production logs.

**Fix pattern:** one `withAuth(handler, { role?: 'business_owner' | 'admin' })` wrapper +
`schema.parse(body)` per route.

### 7.2 Route-by-Route Findings

| Route | Finding | Severity |
|---|---|---|
| `PATCH /api/collabs` | Any participant can set any status — **the business sender can "accept" its own request**; `status` value not validated against the enum; no Zod | High |
| `PATCH /api/collabs` (accept branch) | Creates conversation + project as **separate non-transactional inserts** with errors only logged — partial failure leaves inconsistent state (the auto-heal exists to paper over this) | High |
| `GET /api/projects` | **Auto-heal writes inside a GET** (creates missing projects from accepted collabs). Violates CQRS, can race with the PATCH accept path → duplicate projects (no unique constraint on the pair) | High |
| `POST /api/conversations` | Builds **string-interpolated SQL** and executes it via the **Supabase Management API**, using `SUPABASE_SERVICE_ROLE_KEY` as the bearer — the Management API requires a *personal access token*, so this likely 500s in any environment where it wasn't hand-tested; UUID regex is the only injection guard. Migration 042 created a proper `add_conversation_participant` RPC — use it | Critical |
| `POST /api/stream/token` | Uses the **service-role** client and calls `auth.getUser()` **without the caller's JWT** (and the client fetch sends no Authorization header) → always 401 → **Stream messaging cannot connect** | Critical |
| `POST /api/stream/channel` | Same broken auth pattern; also **no verification that the caller is a participant** of `conversationId` before creating/joining the channel — with auth fixed, any user could join any conversation's channel | Critical |
| `GET /api/conversations` | N+1 query pattern: per-project partner profile + role-table lookups in a loop (`Promise.all` of 3 queries × N projects) | Medium |
| `POST /api/admin/seed` | Hardcoded admin credentials; guarded by `NODE_ENV !== 'production'` but the creds are now public in git | Medium |
| `GET /api/discover` | No search/filter/pagination params; flat `limit(30)`; discovery quality will collapse past a few dozen users | Medium |
| Dashboards | `platform: 'Instagram'`, `reach: '10K'`, `profile_views: 0`, `trends: 0` mocked | Medium |
| `/api/notifications/summary` | **Called by the shell, never implemented** | High |
| All routes | Error responses leak raw `error.message` from Postgres to clients | Low-Med |

### 7.3 Supabase Edge Functions

- `supabase/functions/phone-otp` — 2Factor SMS OTP (send/verify, rate-limited via
  migrations 022/026, audit-logged). Wired to the **legacy** signup UI only.
- `supabase/functions/auth-signup` — server-side signup helper.
- Deployment scripts exist (`scripts/deploy-phone-otp.ps1` — Windows-only, note the machine
  is now macOS).

---

## 8. Database & Migrations Analysis

### 8.1 Shape

- **39 migration files** (`001` → `042`; numbers 009, 016, 028 are gaps — presumably deleted
  experiments; harmless but worth noting for anyone reconciling against the live DB).
- Well-designed core: enums for roles/stages, `updated_at` triggers, targeted indexes
  (`profiles_role_idx`, `project_cards_project_idx`), `SECURITY DEFINER` helpers to avoid RLS
  recursion (`is_admin()`, `add_conversation_participant()`, `register_profile()`).
- RLS enabled on all tables with sensible policies (own-row, participant, admin).
- History shows healthy iterative fixes: `036` fixed the project-insert policy so the
  *counterparty* (creator accepting) can insert; `037` added cancellation columns; `038` added
  the admin role + policies; `039–041` added/evolved Kanban cards.

### 8.2 Issues & Risks

| Issue | Detail |
|---|---|
| **Doc drift** | `docs/ARCHITECTURE.md` says `campaign_projects.id` is UUID — it is actually `BIGINT GENERATED … AS IDENTITY` (migration 006). Kanban FK (`project_cards.project_id BIGINT`) matches reality. Trust migrations, not the doc |
| **No uniqueness on project pairs** | Auto-heal + accept can both insert `campaign_projects` for the same collab (race) — consider `UNIQUE (owner_user_id, counterparty_user_id, source_collab_id)` and, better, an `accept_collab()` RPC doing request+project+conversation in **one transaction** |
| **No FK from projects to the originating collab** | `campaign_projects` has no `collab_request_id`, so reconciliation is by user-pair heuristics — one pair with two different campaigns can't be represented faithfully |
| **Message history split-brain** | New messages go to Stream; `messages` table stops growing but old routes still read it |
| **`schema_migrations` discipline** | Migrations were applied ad-hoc (PowerShell scripts, dashboard SQL editor). Adopt `supabase db push`/`migration up` as the only path |
| **Orphaned analytics tables** | `profile_views`, `creator_profile_views`, `profile_link_clicks`, `business_reviews`, `influencer_shortlists` have no producing/consuming code in the Next.js app yet (legacy site wrote some) |

---

## 9. Security Analysis

### 9.1 Critical

1. **Secrets committed to git.** `influnet-app/.env` and `influnet-app/.env.local` are
   *tracked* (confirmed via `git ls-files`) and `.env.local` contains
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` (a personal access token that can run
   arbitrary SQL via the Management API), and `STREAM_API_SECRET`. If this repo has ever been
   pushed anywhere shared, treat all of these as compromised.
   **Action:** rotate all four keys in the Supabase & Stream dashboards, add `.env*` to
   `.gitignore`, `git rm --cached` them, and rewrite history (`git filter-repo`) before any
   further pushes.
2. **Raw SQL execution endpoint pattern** (`POST /api/conversations`, `POST /api/admin/seed`)
   routes application traffic through the Supabase **Management API**. Even with the UUID
   regex guard, an app server holding a PAT that can execute arbitrary SQL is a single bug away
   from full DB compromise. Replace with the migration-042 RPC / normal client calls, and keep
   the PAT out of runtime env entirely.
3. **Stream channel route lacks participant authorization** (once its auth is fixed) — any
   authenticated user could open any conversation's channel.

### 9.2 Known/Accepted Gaps (documented, still open)

| Gap | Risk | Suggested fix |
|---|---|---|
| JWT mirrored in `localStorage` | XSS token theft | Rely solely on the httpOnly-cookie session that `@supabase/ssr` already maintains; delete the localStorage mirror |
| No rate limiting on auth/API | Brute force, abuse | Supabase auth rate limits + middleware limiter (e.g. Upstash) |
| No CSRF story for API routes | Bearer-token model mostly mitigates; cookie-auth'd routes (stream/*) would be exposed once fixed | Prefer Authorization-header pattern consistently |
| Hardcoded admin creds in seed route | Anyone reading the repo knows the dev admin password | Require env-provided creds even in dev |
| `console.log` of user IDs / auth-header prefixes | PII in logs | Strip or gate behind `NODE_ENV` |
| Raw DB error messages returned to clients | Schema disclosure | Map to generic messages, log details server-side |
| No audit logging of admin actions | Untraceable force-deletes/approvals | `admin_audit_log` table |

### 9.3 What's Done Right

- Passwords never touch app code (Supabase Auth).
- RLS on every table; role checks server-side, never trusted from the client.
- Unidirectional request rule enforced in API (403) *and* exercised by the E2E test.
- Dev-only guard on the seed endpoint; UUID validation before SQL interpolation.

---

## 10. Testing & CI/CD

### 10.1 Tests (all uncommitted)

| Suite | File | Covers |
|---|---|---|
| Unit | `tests/unit/stores.test.ts` | Zustand stores |
| Unit | `tests/unit/validators.test.ts` | Zod schemas (ironically, the schemas the API doesn't use) |
| Integration | `tests/integration/api.test.ts` | Signup + 401s on unauthenticated API access |
| E2E | `tests/matchmaking.js` | Full loop: signup both roles → 403 on creator-initiated request → send → duplicate-pending constraint → accept → project + conversation created → stage advancement |
| Manual | `tests/messages-api.js` | Messaging endpoints |

Gaps: no tests for projects PATCH/cancellation, Kanban cards, admin routes, profile PATCH,
discover, dashboards, or the Stream integration. No component/UI tests.

### 10.2 CI (`.github/workflows/ci.yml`, uncommitted)

Six jobs: typecheck → lint (⚠️ `continue-on-error: true` — lint failures don't block) →
unit tests → integration tests (builds, boots `next start`, hits localhost) → E2E matchmaking
(against the real Supabase project via repo secrets) → production build.
Reasonable design; needs secrets configured in GitHub and the lint gate enabled once the
existing warnings are cleaned.

---

## 11. What Needs To Be Fixed — Prioritized

### P0 — Do before anything else (days)

| # | Fix | Files |
|---|---|---|
| P0-1 | **Rotate leaked credentials** (service-role key, PAT, Stream secret, admin password) and purge `.env*` from git tracking + history; add `.env*` to `influnet-app/.gitignore` | `influnet-app/.env`, `.env.local`, `.gitignore` |
| P0-2 | **Fix Stream auth**: in `/api/stream/token` and `/api/stream/channel`, authenticate the caller from their Supabase JWT (Authorization header or `@supabase/ssr` cookie client), not the service-role client; send the header from `useStreamConnect`/`ensureChannel`; verify channel membership against `conversation_participants` before `ensureStreamChannel` | `src/app/api/stream/token/route.ts`, `…/channel/route.ts`, `src/app/dashboard/messages/page.tsx:58,158`, `src/lib/stream.ts` |
| P0-3 | **Remove Management-API SQL execution** from `POST /api/conversations` — use the normal user client + `add_conversation_participant` RPC (migration 042) or a single `create_conversation(other_user_id)` RPC | `src/app/api/conversations/route.ts:141-190` |
| P0-4 | **Commit the pending work** in logical chunks (api routes / admin / kanban / tests / CI) so `dev` on the remote reflects reality and CI starts running | repo-wide |

### P1 — Correctness & product-critical (1–2 weeks)

| # | Fix | Files |
|---|---|---|
| P1-1 | Restrict collab status transitions: only the **receiver** may accept/decline, only the **sender** may cancel; validate `status` ∈ enum; wire `CollabRequestSchema` | `src/app/api/collabs/route.ts` (PATCH) |
| P1-2 | Make **accept atomic**: one Postgres RPC (`accept_collab_request`) that updates the request, creates the project (with `collab_request_id` FK + unique constraint), and ensures the conversation — then delete the auto-heal from `GET /api/projects` | new migration + `collabs/route.ts`, `projects/route.ts:26-63` |
| P1-3 | Implement `/api/notifications/summary` (pending requests + unread counts) and wire real values into the sidebar badges | new route, `shell.tsx:92,186-187`, `notification-store.ts` |
| P1-4 | **Build the instant-notification pipeline (MVP)**: DB `notifications` table + insert on collab events + Supabase Realtime subscription in the shell + email via Resend/Postmark on request-received. This is the product's stated reason to exist | new migration, new route, shell |
| P1-5 | **Port the public creator profile** `/(c|creator)/[username]` — SSR page with profile, socials, "Request Collaboration" CTA for the link-in-bio loop (public RLS read already exists via `get_public_influencer` fixes, migration 027) | new page + route |
| P1-6 | Create `withAuth()` route wrapper + apply Zod validators to every mutating route; remove `console.log` PII and raw error passthrough | `src/lib/` + all `api/*` |
| P1-7 | Decide the messaging source of truth (recommended: **Stream for transport + webhook to persist into `messages`** for ownership of data) and delete the dead path (`messaging-store.ts`, old messages routes if unused) | messaging module |

### P2 — Quality & scale (ongoing)

- Discovery: search by name/niche/location, filters, pagination; use the shortlist table.
- Replace dashboard mocks (`reach`, `platform`, `profile_views`, trends) with real queries
  (`creator_profile_views`, `profile_link_clicks` already exist).
- Drop the localStorage token mirror; standardize on cookie session + `getSession()`.
- Extract signup constants; split the 400–800-line pages into components; remove `as any`
  by using the generated `Database` types.
- Remove/quarantine legacy: `scripts/` patch era, `update_hero.js`/`update_header.js`,
  `.replit`/`main.py`, `graphify-out/` (add to `.gitignore`), and plan the Firebase→one-host
  consolidation.
- Enable the ESLint gate in CI; add tests for projects/cancellation/cards/admin.
- Update `docs/ARCHITECTURE.md` (BIGINT project ids, Stream messaging, cards/stream routes).
- Add `reset-password` page (middleware already whitelists it) and port phone-OTP UI.
- Rate limiting, admin audit log, error-mapping middleware.

---

## 12. Gap Analysis — Product Vision vs. What Exists

The vision (`docs/the-ides.md`) makes four promises. Status of each:

| Promise | Status | Gap |
|---|---|---|
| "Instantly notifies creators when a business sends a request" | ❌ **Not built** | No notification delivery of any kind (no email, push, SMS, or in-app realtime). Requests are only visible if the creator happens to open `/dashboard/requests`. **This is the single most important missing piece — without it, Influnet is a directory, not a speed layer.** |
| "Add your Influnet profile link to your social bio" | ❌ Not in the active app | Public profile page exists only in the legacy static site. No public route, no link analytics surfaced (table exists), no OG cards |
| "Receive and manage collaboration requests in one place" | ✅ Mostly | Requests + projects + (once fixed) chat work end-to-end inside the dashboard |
| "Build successful partnerships and grow your network" | 🟡 Partial | 12-stage pipeline + Kanban is genuinely strong; connections page is a stub; reviews/ratings and payments not started |

Also implied but absent: **verification** ("verified collaboration requests") — there is
admin approval for businesses (good) but no creator verification, and the landing page's
trust/verification sections describe features that don't exist yet.

---

## 13. Recommended Roadmap

### Phase 0 — Stabilize (this week)
Rotate secrets, purge from history, commit the pending work behind PRs, get CI green,
fix Stream auth + conversations POST, land the atomic-accept RPC. *Exit criteria: a new
developer can clone, run, and message between two test accounts.*

### Phase 1 — Ship the actual value proposition (2–3 weeks)
1. Notifications MVP: `notifications` table → realtime bell + badges → transactional email
   on "request received" and "request accepted".
2. Public creator profile + link-in-bio flow (`influnet.com/c/username`), with
   `profile_link_clicks` tracking and a business-facing "Request Collaboration" entry point
   that works for **logged-out** businesses (capture → signup → request).
3. Port forgot-password + phone-OTP UI from legacy.
*Exit criteria: a creator can put their link in an Instagram bio and get an email + in-app
alert within seconds of a request.*

### Phase 2 — Depth & retention (3–5 weeks)
Discovery search/filters/pagination, shortlists, real dashboard analytics (views/clicks),
file deliverables (`project_assets`), reviews at `project_completed`, connections page.

### Phase 3 — Monetization & trust (later)
Payment milestones (advance/final stages → Razorpay for India), creator verification badges,
admin audit log, rate limiting, and the decision to sunset Firebase legacy hosting entirely.

---

## 14. Quick Reference — How to Run

```bash
# Active app
cd influnet-app
npm install
# .env.local requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, STREAM_API_KEY, NEXT_PUBLIC_STREAM_API_KEY, STREAM_API_SECRET
npm run dev          # http://localhost:3000
npm run build        # production build + type/route verification
npm test             # vitest (unit + integration)
node tests/matchmaking.js   # E2E against live Supabase

# Legacy static site (Firebase)
firebase emulators:start --only hosting   # http://localhost:5000
firebase deploy --only hosting

# Database
supabase db push     # apply migrations (preferred over ad-hoc SQL editor)
```

**Key project facts:** Supabase project ref `hrpaqufvjcihnjrjnpej` · branches `dev`/`main` ·
CI in `.github/workflows/ci.yml` · agent workflow rules in `.agents/AGENTS.md` · running
history in `.agents/lessons_learned.md`.

---

*This analysis was produced by a full read of the repository: all API routes, the dashboard
and signup pages, stores, lib helpers, middleware, all 39 migrations, edge-function config,
tests, CI, both legacy generations, and every document in `docs/`. Where this file and
`docs/ARCHITECTURE.md` disagree (e.g. `campaign_projects.id` type, messaging transport),
this file reflects the code as it exists on July 10, 2026.*
