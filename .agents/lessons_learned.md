# Living Lessons-Learned & Module Tracker

This file tracks the current implementation state of each system module, issues encountered, fixes applied, and core architectural lessons learned.

---

## 1. System Modules Status

### Auth Pages (Login / Signup)
*   **State**: Complete (V1 UI Blueprint).
*   **Files**:
    *   [login/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web/src/app/login/page.tsx)
    *   [signup/influencer/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web/src/app/signup/influencer/page.tsx)
    *   [signup/business/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web/src/app/signup/business/page.tsx)
*   **Details**: Apple-style premium card containers on light theme backdrops (`#fafafb`) with soft pink/purple gradient glows. Focus states styled with pink highlights. Ready to be wired to the Supabase client.

### Dashboard Portal (`/dashboard`)
*   **State**: Complete (V1 UI Blueprint).
*   **Files**:
    *   [dashboard/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web/src/app/dashboard/page.tsx)
*   **Details**: High-fidelity bento-grid dashboard (no scroll, fits exactly into `100vh - 56px` viewport).
*   **Visual Elements**:
    *   Interactive SVG Campaign Reach Area Chart (gridlines, trend vectors, Friday peak indicator).
    *   Activity Heatmap Calendar (W1-W7, Mon-Sun activity blocks with color-coded density matching git contribution grids).
    *   Niche ROI horizontal bars.
    *   Weekly recruits vertical column chart.
    *   Action items task check-list tracker.

### Vision pedastal element
*   **State**: Complete.
*   **Files**:
    *   [vision.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web/src/components/landing/vision.tsx)
*   **Details**: Uses high-fidelity template asset centerpiece with overlay animated check-cards doing smooth parallax animations.

---

## 2. Issues & Resolutions Log

### Issue 1: WebGL Canvas White Globe rendering invisible on light backgrounds
*   **Problem**: In the MagicUI Globe component, setting the continental base color to white (`[1, 1, 1]`) rendered it invisible against the white card backdrop.
*   **Fix**: Modified `globe.tsx` config to slate grey `[0.35, 0.35, 0.4]` for continental base landmass dots.

### Issue 2: Button text color clashes with legacy site rules
*   **Problem**: Global style defaults overrode interactive anchor and button colors, reverting them to dark slate.
*   **Fix**: Forced absolute white color rules (`!text-white`) inside layout containers.

### Issue 3: Flex children percentage height collapsing to 0
*   **Problem**: Putting `height: {percentage}%` on relative containers inside a parent flexbox without an explicit height collapsed the layout.
*   **Fix**: Bound the heights directly to the relative grid areas and element container heights.

---

## 3. Core Architectural Lessons Learned

1.  **Strict Viewport Fitting**: Avoid vertical scroll pages inside dashboards using:
    ```css
    height: calc(100vh - 56px);
    overflow: hidden;
    ```
2.  **Modular CSS overrides**: Use inline Tailwind utility classes directly in Next.js subpages rather than appending global stylesheet classes to make them highly isolated.
3.  **Supabase Auth Wiring**: Ensure all middleware redirection logic is handled in `middleware.ts` before component page mounts to prevent flashing or screen redraws.

---

## 4. Backend Phase 2 & Phase 3 (API Wiring)

### Scope
* Built `GET`, `POST`, `PATCH` handlers for `/api/collabs` and `/api/collabs/[id]` to manage collaboration requests.
* Built `GET`, `POST` handlers for `/api/conversations` and `/api/conversations/[id]/messages` to manage chat threads and messaging.
* Built `GET /api/business/dashboard` to aggregate actual database statistics (active collabs, budget sum) for the business dashboard.
* Wired the Requests page (`/dashboard/requests`) and Messages page (`/dashboard/messages`) to their respective endpoints, implementing Supabase Realtime subscriptions for live messaging.

### Broken & Resolved
* **Problem**: When passing `params` to Next.js API route handlers in Next.js 15, TypeScript threw errors because `context.params` is now expected to be a `Promise`.
* **Fix**: Updated all dynamic route handlers (`[id]/route.ts`) to use `context: { params: Promise<{ id: string }> }` and awaited `const { id } = await context.params;`.

### Key Lessons
* **Next.js 15 Route Params**: Always `await params` in route handlers for dynamic segments. E.g., `const { id } = await context.params;`.
* **Supabase Realtime**: Using `supabase.channel().on('postgres_changes', ...)` is highly effective for live chat messaging without requiring WebSockets or polling middleware on the API side.
### Discover & Collab Pipeline (2025-07-07)
* **Scope**: Role-aware Discover page, proper Collaborate modal, request pipeline with auto-project creation, and E2E state syncing.
* **Resolved**:
  * Discover now shows Creators to Business Owners and Businesses to Creators — two different views from one page.
  * The `receiver_id` / `to_user_id` mismatch bug fixed.
  * Added the "Collaborate" modal with Project Title, Budget, and Message fields.
  * Accepting a request now auto-creates a `campaign_projects` row AND a `conversations` thread atomically on the server.
  * **Auth Sync Bug**: Fixed a bug where `RequestsPage` could not retrieve the client session user ID (remained `null`), causing all sent/received cards to be filtered out of the view. Resolved by replacing raw `@supabase/supabase-js` with the project's standard `@/lib/supabase/client` helper which correctly synchronizes session state from browser cookies.
  * **Discover CTA Reload State**: Fixed CTA reverting from "Request Sent" back to "Collaborate" on page refresh. Resolved by fetching existing collab requests on discover mount to initialize the `sentIds` state from the database.
  * **Session Token Expiry Bug**: Fixed a bug where client-side API fetches using `localStorage.getItem('influnet_token')` would fail with `401 Unauthorized` after 1 hour (JWT expiration). Resolved by dynamically retrieving the fresh, auto-refreshed access token via `sb.auth.getSession()` directly from the Supabase client session in `projects/page.tsx`.

### Key Lessons
* **Next.js 15 Route Params**: Always `await params` in route handlers for dynamic segments. E.g., `const { id } = await context.params;`.
* **Supabase Realtime**: Using `supabase.channel().on('postgres_changes', ...)` is highly effective for live chat messaging without requiring WebSockets or polling middleware on the API side.
* **Component Fetching**: When doing purely client-side fetching in the dashboard, `Authorization: Bearer ${token}` headers must be manually attached to `fetch` calls since Next.js API routes don't automatically parse `localStorage` tokens.
* **Role-Aware APIs**: Always read the user's role from `profiles.role` in the API before deciding what data to return. Don't trust the frontend to send the role — derive it server-side.
* **Auth Helper Consistency**: Always use the unified client creator (`@/lib/supabase/client`) in client pages/components rather than importing `@supabase/supabase-js` directly. The former correctly configures cookie storage mapping that syncs with Next.js middleware and SSR handlers.
* **Unidirectional Database Validation**: Assert roles on the server inside API handlers for operations that should only be allowed for one role (e.g. creating collab requests). Do not rely solely on front-end rendering constraints.
* **Dynamic Session Tokens**: Avoid pulling raw static tokens from `localStorage` directly for API fetches. Instead, fetch the fresh, auto-refreshed access token via `supabase.auth.getSession()` to prevent `401 Unauthorized` errors when user sessions exceed the JWT lifespan (1 hour).

### Shared Projects & Unidirectional Requests (2025-07-07)
* **Scope**: Enforced unidirectional request rules (brands-to-creators only), created backend + frontend API for `campaign_projects` management, and built the premium campaign stage tracker dashboard page.
* **Resolved**:
  * Added validation in `POST /api/collabs` restricting requests to users with `'business_owner'` role (returns `403 Forbidden`).
  * Replaced CTA button with a clean "Verified Brand Partner" indicator for creators in `discover/page.tsx`.
  * Implemented `GET` and `PATCH` in `/api/projects/route.ts` to list campaigns and transition stages.
  * Implemented interactive timeline and advancement button in `/dashboard/projects/page.tsx` transitioning projects across stages.
  * Created `supabase/cleanup.sql` with inspection and deletion commands for database cleanup.
  * **RLS Insert Policy Fix**: Created migration `036_fix_campaign_projects_insert_policy.sql` changing `campaign_projects` RLS policy to allow insertions by either the owner or the counterparty. This ensures creator-side accept actions can create project rows.
  * **Self-Healing Reconciliation**: Added a background healing logic in the `GET /api/projects` endpoint. When loaded, it automatically reconciles any accepted collaborations that are missing database project entries due to prior RLS failures.
  * **Unified Stepper Stages**: Updated the stages keys to match the 12 schema-migrated stages and redesigned the stepper layout to be fully responsive.
  * **E2E Integration Test Suite**: Developed `tests/matchmaking.js` testing role signups, unidirectional pitching constraints (403), duplicate pending requests (database key constraints), request acceptance, self-healing project generation under RLS context, and stage advancement.
  * **Minimal Premium Dashboards Redesign**: Completely rewrote both the Business Owner dashboard (`src/app/dashboard/page.tsx`) and the Creator dashboard (`src/app/dashboard/influencer/page.tsx`) to remove funky inline styling. Refactored layout to use minimal, high-fidelity Apple-style cards, clean inline SVG sparkline curves, and Lucide React icons.
  * **Dynamic Token Fetching on Dashboards**: Added dynamic Supabase session token fetch to dashboard route handlers, preventing `401 Unauthorized` errors when user session cookie expires or changes.

### Key Lessons
* **Database RLS Constraints**: RLS policies for `INSERT` operations must verify the identity of the user executing the transaction. If the frontend action is triggered by the counterparty (e.g. Creator accepting a Collab request), the insert policy must permit `auth.uid() = counterparty_user_id` instead of only checking `owner_user_id`.
* **API Self-Healing Pattern**: Implementing automatic reconciliation inside read endpoints helps heal legacy or failed database states without requiring complex manual data migrations.
* **Supabase RPC Registration Requirement**: When testing supabase user creation, call the `/api/auth/register` endpoint (which runs `public.register_profile(payload)`) immediately after `auth.signUp()` to ensure roles and profile details are created in the database. Without it, the user will trigger `403 Forbidden` on role-validated endpoints.

### Phase 1: Production Polish — COMPLETED

#### Sprint 4: Admin Panel
* **Admin Role Added**: Added `'admin'` to `UserRole` type in `types/index.ts`
* **Admin API Routes Created**:
  * `GET /api/admin/dashboard` — Platform stats (users, businesses, influencers, collabs, projects)
  * `GET /api/admin/businesses` — List all business profiles with approval status
  * `PATCH /api/admin/businesses` — Approve or reject a business account
  * `GET /api/admin/users` — List all platform users with enriched role-specific data
* **Admin Dashboard Pages Created**:
  * `/dashboard/admin/page.tsx` — Overview with metrics grid (total users, businesses, influencers, pending approvals) and collaboration/project stats
  * `/dashboard/admin/approvals/page.tsx` — Business approval management with pending/reviewed sections, approve/reject buttons
  * `/dashboard/admin/users/page.tsx` — All users list with search, role badges, approval status indicators
* **Sidebar Updated**: Admin users see Admin Home, Approvals, Users navigation items (indigo theme). Fixed TypeScript badge property access.

#### Sprint 5: Business Approval Flow
* **Approval Gate in Dashboard Shell**: Unapproved businesses (`pending_review` or `rejected`) are blocked from seeing the dashboard. They see a clean "Account Under Review" or "Account Not Approved" screen with explanation and sign-out button.
* **API-Level Authorization**: All admin routes verify `role === 'admin'` on every request server-side.

#### Sprint 6: Settings Wired
* **Profile API Created**:
  * `GET /api/profile` — Returns base profile + extended profile (business_profiles or influencer_profiles) based on role
  * `PATCH /api/profile` — Updates base profile fields (name, phone, location) + role-specific fields
* **Settings Page Rewired**: Light theme, fetches profile on mount, saves changes via PATCH to `/api/profile`, updates localStorage cache, shows success/error states

### Phase 1: Security & Route Lockdowns — COMPLETED (July 12, 2026)

#### Scope
* Built `lib/project-lifecycle.ts` to centralize the 12-stage pipeline state machine, role authorization for transitions, and cancellation actions.
* Refactored `/api/projects/[id]/route.ts` to use the shared lifecycle module for stage advancement and project cancellations.
* Removed duplicate state machines and `PATCH` logic from `/api/projects/route.ts`.
* Updated frontend API calls in `dashboard/projects/page.tsx` to use the new `/api/projects/[id]` route structure.
* Created Migration `053_pii_lockdown.sql` to explicitly drop the broad `SELECT` policy on `public.profiles` that exposed influencer email and phone numbers to anonymous users.
* Verified that the open redirect vulnerability on the `?next=` parameter in `login/page.tsx`, `signup/business/page.tsx`, and `signup/influencer/page.tsx` was properly handled via strict string matching (`n.startsWith("/") && !n.startsWith("//")`).

#### Broken & Resolved
* **Duplicate State Machines**: Previously, stage advancement logic was duplicated across collection routes and item routes, with the frontend pointing to the collection route by mistake. Consolidating this completely into the `[id]` route enforces strict REST patterns and single-source-of-truth authorization.

#### Key Lessons
* Abstracting state machine and transition permissions into a pure shared module (`lib/project-lifecycle.ts`) keeps API routes clean and makes the transition logic highly testable.
* Always enforce the "next" redirect parameter to be relative (`startsWith("/")` and not `startsWith("//")`) to prevent open redirect phishing vulnerabilities on authentication pages.

#### Next Target
* Phase 2: Launch-Prep (Dashboard Metrics, Reviews/Ratings, Progress Bars).

### Phase 0: Repo Stabilization — COMPLETED (July 10, 2026)

#### Scope
* Deep-audited the full project against `PROJECT_ANALYSIS.md` and `EXECUTION_PLAN.md`.
* Confirmed `.env*` files were **already gitignored** and **never tracked** in git history — the audit's concern was valid as a precaution but no actual exposure through git exists.
* Created `apps/web/.env.example` documenting all required env vars (including new `RESEND_API_KEY` / `EMAIL_FROM` / `NOTIFY_EMAILS_ENABLED` for Phase 2).
* Committed the entire ~13,400-line pending codebase in 11 logical, reviewable chunks on the `dev` branch.

#### Commit Series
1. `phase0: untrack env files, add .env.example with all required vars`
2. `phase0: add agent workflow docs and project docs`
3. `phase0: add shadcn/ui setup, utils, and full type definitions`
4. `phase0: add all API routes (auth, collabs, projects, conversations, discover, profile, admin, stream, notifications, dashboards)`
5. `phase0: add admin panel pages and dev setup page`
6. `phase0: add project Kanban workspace and signup role-select page`
7. `phase0: add Stream Chat integration lib`
8. `phase0: add test suite (unit, integration, E2E matchmaking) and CI workflow`
9. `phase0: add Supabase migrations 036-042 and cleanup.sql`
10. `phase0: wire dashboard pages, auth pages, shell, sidebar, landing components`
11. `phase0: gitignore supabase/.temp CLI artifacts`

#### Broken & Resolved
* `.env.example` was initially caught by the `.env*` gitignore rule — resolved by adding `!.env.example` exception to `apps/web/.gitignore`.
* `supabase/.temp/` (CLI artifacts) got staged with `git add -A` — resolved by adding it to the root `.gitignore` and un-staging before commit.

#### Key Lessons
* **TypeScript was already clean** (`tsc --noEmit` → 0 errors) on the full uncommitted codebase before any changes — a strong sign of quality work.
* **Always check `git ls-files` to confirm actual tracking state** before assuming a file is in history. The audit's concern about env files was accurate as a best practice, but the actual `.gitignore` already protected them.
* **Commit in logical dependency order**: new deps (package.json) → types → lib utilities → API routes → pages → migrations → tests → CI. This way each commit is independently buildable.

### Task 1.1: Fix Stream Chat Auth — COMPLETED (July 10, 2026)

#### Scope
* Refactored `/api/stream/token/route.ts` and `/api/stream/channel/route.ts` to read the `Authorization` header and authenticate via standard anon-key Supabase client instead of relying on the service-role client (`createServerClient()`).
* Hardened `/api/stream/channel` to verify that both `user.id` and `otherUserId` are legitimate participants in `conversation_participants` for the requested `conversationId` (returning 403 or 400 otherwise).
* Updated frontend fetches in `src/app/dashboard/messages/page.tsx` to actively grab the current Supabase session and pass `Authorization: Bearer <token>`.

#### Broken & Resolved
* **Stream Chat auth was returning 401**: The service role client in API routes didn't hold a user session, so `auth.getUser()` always failed. Switching to reading the `Authorization` header with the anon-key client fixed this.

### Task 1.2: Refactor Conversation API to use RPC — COMPLETED (July 10, 2026)

#### Scope
* Refactored `POST /api/conversations` (which is used when a user starts a chat from the active projects list) to use the `get_or_create_conversation` RPC instead of executing raw SQL via the Supabase Management API.

#### Broken & Resolved
* **Raw SQL execution was a severe security and stability risk**: Using the management API bypasses RLS and could lead to SQL injection or break if the management API token is invalid/revoked. Replaced it with the `rpc()` method on the standard client, making it safe and atomic.

### Task 1.3: Atomic Collab Acceptance — COMPLETED (July 10, 2026)

#### Scope
* Replaced the node.js side multi-step creation logic (updating collab status, checking/creating conversations, inserting projects) in `PATCH /api/collabs` with an atomic RPC call (`accept_collab_request`).
* Removed the "auto-heal" loop in `GET /api/projects` that was previously needed to patch broken or race-condition project states.

#### Broken & Resolved
* **Node backend multi-step inserts**: The sequence of inserts wasn't wrapped in a transaction, so if a user accepted a collab and the server errored out halfway, the system reached an inconsistent state. The `accept_collab_request` RPC runs inside a Postgres transaction, guaranteeing success or complete rollback.

### Task 1.4: Implement notifications summary route — COMPLETED (July 10, 2026)

#### Scope
* Created `apps/web/src/app/api/notifications/summary/route.ts` to implement the missing endpoint used by the frontend top navigation bell.
* The endpoint uses standard Supabase auth (anon-key + Authorization header) to return pending collab requests directed to the user.

#### Broken & Resolved
* **Missing route causing 404s**: The top navigation bell was constantly polling an endpoint that didn't exist, spamming the network tab with 404s and keeping the bell from showing any real notification count.

#### Next Target
* **Task 2.1** — Implement email notifications via Resend (the primary real-world alert pipeline).

### Monorepo Refactor (2026-07-10)
* **Scope**: Restructured the repo into a Turborepo monorepo: `influnet-app/` → `apps/web/`, npm workspaces root, `turbo.json` pipeline (build/lint/typecheck/test/dev), CI updated to root installs + `--workspace=web` commands. Deleted all legacy code (`influnet/`, `influnet.io/`, `scripts/`, `messaging-widget/`, `signup-widget/`, firebase/replit config, ~21,900 files incl. committed node_modules) — preserved at git tag `legacy-archive`.
* **Broken & Resolved**:
  * Unit tests failed after the fresh workspace install with `localStorage is not defined`. Root cause: `jsdom` existed only in the old `package-lock.json` (never declared in `package.json`), so the clean install dropped it, and `vitest.config.ts` uses `environment: 'node'`. Fix: added `jsdom` as a declared devDependency and a `// @vitest-environment jsdom` directive to `tests/unit/stores.test.ts`.
  * `git rm` with multiple paths aborts entirely if one path is untracked (`graphify-out`) — remove untracked dirs with plain `rm -rf`.
* **Key Lessons**:
  * Never rely on undeclared packages that happen to be in the lockfile — a workspace migration regenerates the lockfile from `package.json` only.
  * `git mv <dir>` moves untracked files inside the dir too (node_modules, .env.local came along physically) — convenient but check for stray generated dirs afterwards.
  * Turbo cache verified working: second `npm run build` = FULL TURBO (23ms).
* **Next Target**: Phase 1 of `.agents/EXECUTION_PLAN.md` (Task 1.1 Stream auth fix). Human still owes the Phase 0 key-rotation checklist.

### Task 1.5: Shared API Client Refactor — COMPLETED (July 10, 2026)

#### Scope
* Built `withAuth` helper in `src/lib/api.ts` to encapsulate Supabase client creation, JWT authorization header parsing, and error normalization.
* Refactored `/api/collabs`, `/api/collabs/[id]`, `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/cards`, `/api/projects/[id]/cards/[cardId]`, `/api/conversations`, `/api/conversations/[id]`, and `/api/conversations/[id]/messages` to use `withAuth`.
* Implemented strict Zod schemas for all payload validations (e.g. `ProjectUpdateSchema`, `PostConversationSchema`, `PostMessageSchema`).
* Ensured error payloads follow the standard `jsonError` structure for 400, 401, 403, 404, and 500 status codes.

#### Broken & Resolved
* **Duplicate / Unsafe Supabase clients**: Routes were manually parsing the auth header and spinning up Supabase clients inline, leading to repetitive boilerplates and potential misconfiguration of `user`. Replaced everything with `withAuth`.
* **Payload discrepancies**: Enforced strict `snake_case` in Zod schemas for payload matching across frontend to backend to database.

#### Key Lessons
* Centralizing authentication logic saves enormous amounts of boilerplate and prevents edge cases where a route forgets to check `userError`.
* Validating bodies via `safeParse` rather than raw destructuring prevents subtle bugs (e.g. `undefined` fields silently passing through update operations).

#### Next Target
* **Task 2.1** — Implement email notifications via Resend (the primary real-world alert pipeline).

### Task 2.3: Public Creator Profile (Link-in-Bio) — COMPLETED (July 10, 2026)

#### Scope
* Built public creator profile pages at `/c/[username]`.
* Added `record_profile_view` and `record_profile_link_click` RPC functions to securely track analytics for anonymous users viewing profiles.
* Refactored Auth pages (`/signup`, `/signup/influencer`, `/signup/business`, `/login`) to support and persist a `?next=` search parameter. This allows users coming from a "Request Collaboration" link on a creator's profile to be smoothly redirected to their intended destination after signing up or logging in.

#### Broken & Resolved
* **Missing Suspense boundary**: Added Next.js `React.Suspense` wrappers around all auth pages and discover page components that use `useSearchParams()` to prevent build errors and ensure proper client-side rendering.
* **Lost redirect param**: Ensured the `?next=` param is passed through all steps of the signup/login flow, including links between signup and login screens.

#### Key Lessons
* **Next.js Client Components**: When using `useSearchParams()` in a Client Component (`'use client'`), the component *must* be wrapped in a `<Suspense>` boundary if the page is dynamically rendered, otherwise Next.js will throw an error or de-opt the entire route to client-side rendering during build.
* **Anonymous DB Writes**: Use `SECURITY DEFINER` RPC functions in Supabase to allow anonymous (unauthenticated) users to trigger inserts/updates (like tracking analytics) without exposing raw table access.

### Fixing Missing Real-time Unread Badge and 404 for Business Profile
*   **Scope:** Added Stream Chat real-time event listener to global dashboard `shell.tsx` for updating unread message badge. Created missing `/b/[username]` public profile view for businesses.
*   **Broken & Resolved:** 
    *   **Real-time Badge Not Updating:** The `shell.tsx` component was incorrectly listening for inserts on the Postgres `messages` table, but the app uses Stream Chat. I resolved this by instantiating `StreamChat` directly in `shell.tsx` and listening to `message.new` and `message.read` events. Because `messages/page.tsx` uses `StreamChat.getInstance()`, the instances are seamlessly shared without causing duplicate connections.
    *   **404 on Business Profile Links:** The user was testing username creation as a Business Owner and hitting `/c/[username]`, which returned a 404 because `get_public_influencer` correctly filters by the `influencer` role. I fixed this by adding the missing `username` column to `business_profiles`, creating the `/b/[username]` route exclusively for businesses, and updating the Settings UI to show the correct `influnet.app/b/` link prefix for business roles.
*   **Key Lessons:** Ensure that Supabase real-time subscriptions are pointing to tables that are actively being used. If a third-party service (like Stream Chat) manages its own data, you must attach listeners to their specific client APIs to reflect real-time global state (like a sidebar badge).
*   **Next Target:** Complete the remaining user workflows, email notifications if needed, and polish edge cases.

## Fix: Real-time Message Badge & Public Profile 404s
1. **Scope**: Wired up Stream Chat listeners in `shell.tsx` for real-time unread badges; fixed missing `username` on `business_profiles`; created `/b/[username]` route; fixed RPC variable ambiguity (`ip` vs table alias).
2. **Broken & Resolved**:
   - Issue: Global notification badge didn't update on new messages because the original db logic relied on manual reloading, and `messages` table was deprecated.
   - Fix: Initialized `StreamChat` client in the global layout shell, bound to `message.new` and `message.read` to update badge counts in real-time.
   - Issue: `/c/[username]` build crashed due to importing non-existent `Instagram`/`Youtube` icons from `lucide-react`.
   - Fix: Removed invalid imports and used inline SVGs.
   - Issue: `get_public_influencer` RPC failed with `column reference "ip.user_id" is ambiguous`.
   - Fix: Renamed the PL/pgSQL variable from `ip` to `v_ip`.
3. **Key Lessons**:
   - When declaring `RECORD` or `%ROWTYPE` variables in PL/pgSQL, do not use names that collide with table aliases in the function's SQL queries.
   - Always verify `lucide-react` exports; icons like Instagram/Twitter are omitted in some versions due to branding policies.
4. **Next Target**: Task 8: Stage Transition Validation, PII leak fix & Branded Error Pages.

### Task 8: Stage Transition Validation, PII leak fix & Branded Error Pages — COMPLETED (July 10, 2026)

#### Scope
* Implemented a strict stage transition validation state machine in both the main `PATCH /api/projects` and single `PATCH /api/projects/[id]` API routes.
* Removed the PII `email` field from the profiles join selects in the campaign project list and detail API routes to satisfy standard privacy lockdowns.
* Created custom, branded, premium 404 (`not-found.tsx`) and 500 (`error.tsx`) pages using Influnet design aesthetic (Plus Jakarta Sans, light theme, glowing cards, custom SVGs).

#### Broken & Resolved
* **Unvalidated stage progression**: Users could call `update_stage` with arbitrary JSON objects, potentially bypassing the linear stage advancement logic or injecting incorrect statuses/started/completed timestamps. Enforced stage key checks against the `STAGES` enum, sanitized the inputs to ignore status/dates, and validated transitions against an `ALLOWED_TRANSITIONS` map.
* **Stale next/types compiler errors**: After deleting old setup/seed pages, the Next.js `.next` folder kept stale generated TS types. Running a clean build after deleting `apps/web/.next` resolved this.

#### Key Lessons
* Enforcing state machine transitions at the API level prevents users from manipulating client-side payloads to bypass linear flows.
* Next.js App Router root `error.tsx` must be a client component (`'use client'`) and receive standard error boundary props (`error` & `reset`), while `not-found.tsx` can be a normal component.

#### Next Target
* Disabling Discover Feed while preserving deep-linking collaboration request modal.

### Disabling Discover Feed while Preserving Deep-Linking Modal — COMPLETED (July 10, 2026)

#### Scope
* Commented out the 'Discover' navigation item in `apps/web/src/components/dashboard/sidebar.tsx` so users cannot access it from the dashboard.
* Modified the `/dashboard/discover` page to automatically redirect users to `/dashboard` if accessed directly (i.e. without the `?request=` deep-link query parameter).
* Preserved the deep-link collaboration request modal flow. When a user clicks 'Request Collaboration' on a creator's public profile, they sign up/log in, get redirected to `/dashboard/discover?request=<creator_id>`, and the collaboration request form opens automatically.
* Redirected users to `/dashboard/requests` upon successful submission of the collaboration request, or to `/dashboard` if they click "Cancel" to close the modal.

#### Broken & Resolved
* **Discover feed visibility**: Initially, we needed to make sure businesses could only connect via direct creator profile links rather than browsing an empty/incomplete search feed. Restricting page access unless `request` query parameter is present completely hides the browse state while preserving the functional collaboration creation flow.

#### Key Lessons
* To restrict visibility of incomplete/empty search directories for early-stage platforms, hidding navigation links and redirecting direct accesses without parameter context is highly effective, while still allowing the core transactional loops (like deep-linked transaction requests) to work seamlessly.

#### Next Target
* Task 3.1: Shared API Client Migration.

### Shared API Client Migration (Task 3.1) — COMPLETED (July 10, 2026)

#### Scope
* Centralized all dashboard client page and component requests under the shared `apiFetch` utility (`apps/web/src/lib/api-client.ts`).
* Refactored 12 files across dashboards, settings, projects, requests, messages, shell, and admin workspaces to use `apiFetch` instead of manual token-injecting `fetch` calls.
* Eliminated repetitive session retrieval and header building logic from client components.

#### Broken & Resolved
* **res.data null typecheck error**: In `projects/[id]/page.tsx`, TypeScript raised TS18047 because `apiFetch` returns `data: T | null`. Resolved by adding the non-null assertion operator (`!`) where proper presence check guards were already executed.

#### Key Lessons
* centralizing API fetch wrappers with built-in token injection guarantees that credentials are consistently passed and avoids repetitive auth code clutter in page routes.
* TS type refinement for API results should be done cleanly via non-null assertions or explicit type narrowings.

#### Next Target
* Task 3.2: Extract Constants & De-duplicate Signup Data.

### Constants Extraction & Signup De-duplication (Task 3.2) — COMPLETED (July 10, 2026)

#### Scope
* Created a centralized constants database in `apps/web/src/lib/constants.ts` hosting niches, states, language options, collab types, price tiers, industries, business types, and budget ranges.
* De-duplicated and removed all local copies of arrays in `signup/influencer/page.tsx`, `signup/business/page.tsx`, and `dashboard/discover/page.tsx`.

#### Broken & Resolved
* No compiler errors encountered; verified all imports resolved cleanly.

#### Key Lessons
* Storing configurations, static menus, categories, and tags in a centralized place makes updates trivial and prevents configuration drift between user signup types.

#### Next Target
* Remaining Task 3 items (such as metrics, decompositions, bento charts).

### Pre-Launch Security Fixes (FIX_INSTRUCTIONS_2026-07-10) — COMPLETED (July 10, 2026)

#### Scope
* **Blocker 1 (Privilege Escalation):** Added `RegisterProfileSchema` to `validators.ts` with `role` locked to `['business_owner', 'influencer']`. Rewrote `api/auth/register/route.ts` to validate the body before calling the RPC (returns 400 for `role=admin`). Created migration `049_register_profile_role_guard.sql` with an `IF r NOT IN (...)` guard inside the DB function as defense-in-depth. Pushed successfully to the remote database.
* **Blocker 2 (Red Test Suite):** Rewrote `validators.test.ts` to use actual snake_case field names (`to_user_id`, `content_types`, `availability_status`, `company_name`). Updated `stores.test.ts` to reflect in-memory-only token storage. Fixed `api.test.ts` to skip gracefully when env vars are absent using `describe.skipIf`. Added `.env.test.example`. Result: **38 passing, 6 skipped (0 failed)**.
* **Blocker 3 (Wrong Notification Table):** Fixed `api/notifications/summary/route.ts` — changed `collaboration_requests` → `collab_requests`, `business_id` → `from_user_id`, `influencer_id` → `to_user_id`, and stopped silently swallowing errors.
* **High 5 (Broken Conversation Delete):** Replaced Management API raw SQL delete (which requires a personal access token, not service-role key) with `supabase.from('conversations').delete()`. Created migration `050_conversations_delete_policy.sql` adding a `FOR DELETE` RLS policy for participants. `ON DELETE CASCADE` handles messages + participants automatically. Pushed successfully to the remote database.
* **Medium 6 (No Role Gating):** Added role-based redirect in `dashboard/page.tsx` — influencers redirect to `/dashboard/influencer`, admins to `/dashboard/admin`.
* **Medium 7 (Realtime Publication):** Added clarifying comment to migration `047` documenting that only `notifications` is in the realtime publication by design.

#### Broken & Resolved
* **`describe.skipIf` still crashes with `createClient()` at scope level** — Vitest evaluates the describe body to register tests even when skipped. Resolved by moving `createClient()` inside each `it()` callback so it's never evaluated at module parse time.
* **TypeScript `property 'role' does not exist on type 'never'`** — Supabase client infers a narrow return type from `.select('role')`. Resolved by casting to `{ role?: string } | null` on the result.

#### Key Lessons
* `describe.skipIf` only skips test execution — it still runs the describe body to register the tests. Any side-effectful statements (like `createClient()`) at describe scope will still execute. Always keep heavy initialization inside `it()` or `beforeAll()`.
* Never silently ignore database errors with `if (!error && count)`. Swallow errors like this create silent-wrong bugs that are far harder to debug than loud failures.
* The Supabase Management API (`api.supabase.com`) requires a **personal access token** (`sbp_...`), not a service-role key. Using a service-role key there returns 401 silently.
* Using the CLI access token `SUPABASE_ACCESS_TOKEN` directly in commands or `.env.local` simplifies push operations.

#### Next Target
* High 4 (Rate Limiting — needs Upstash credentials from user).
* Medium 9 (N+1 query fix in conversations list).
* Medium 8 (Sentry — needs DSN from user).

### Core-Loop Hardening + E2E Harness — COMPLETED (July 11, 2026)

#### Scope
* **Medium 9 (N+1 in conversations list):** Replaced per-project profile/business/influencer queries in `api/conversations/route.ts` with one batched `profiles` query plus one query per role table, stitched in memory via Maps. Query count is now flat regardless of project count. Profile-fetch errors are surfaced as 500s instead of silently producing empty partners.
* **Collab routes broken by PII lockdown:** Migration 048 revoked `SELECT` on `profiles.email` for the `authenticated` role, but `GET /api/collabs` and `GET /api/collabs/[id]` still embedded `email` in their profile selects → both returned 500 (the requests page was broken). No frontend consumer read those emails; removed the column from both embeds.
* **Conversations-list messages embed:** was returning *every* message of *every* conversation while the UI renders only the last-message preview. Now ordered desc + `limit(1, { referencedTable: 'messages' })`.
* **Messages GET cap:** `GET /api/conversations/[id]/messages` capped at the latest 200 (returned oldest-first).
* **Profile PATCH robustness:** admin role crashed with a TypeError (`validatedData` undefined) → now a clean 403; base `name/phone/location` now come from the validated payload (`BusinessProfileUpdateSchema` gained the base fields).
* **Notifications API robustness:** PATCH validates JSON + action with Zod (bad JSON / unknown action → 400); GET clamps `limit` to 1–100 and `offset` ≥ 0.
* **E2E harness:** `apps/web/scripts/e2e-exercise.mjs` (`npm run test:e2e`) seeds temp users (business, 2 influencers, admin) via the management API, runs 43 checks across every core loop, and cleans up after itself. All 43 green against the dev stack.

#### Broken & Resolved
* **GoTrue rejects hand-seeded auth.users rows** with "Database error querying schema" if the token columns (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) are NULL — seed them as empty strings, and add a matching `auth.identities` row.
* **Enum inserts through `UNION ALL` lose their type** — cast explicitly (`'business_owner'::public.user_role`).

#### Key Lessons
* **Column-level `GRANT SELECT (…)` breaks every existing embed that selects a revoked column.** After adding column grants, grep all PostgREST selects/embeds for the revoked columns (`email`, `phone`) — the failure mode is a 500 on a previously-working route.
* Supabase JS embeds accept per-embed ordering/limits: `.order('created_at', { referencedTable: 'messages', ascending: false }).limit(1, { referencedTable: 'messages' })` — use this instead of fetching whole child tables for previews.
* The E2E harness pattern (seed → exercise API → assert → SQL-verify → cleanup) catches integration breakage that unit tests and typecheck cannot (both were green while the requests page 500'd).

#### Environment Issues Resolved
* `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local` was updated by the user to the correct `eyJ...` JWT service role token. The personal access token (`sbp_...`) was removed.
* Staging/production migrations (051 to 056) were pushed successfully using the Supabase CLI using the linked project tokens.

### CI/CD Pipeline & Operations Setup (2026-07-12)
* **Scope**: Multi-stage Dockerfile and .dockerignore for standalone container building; health check API route (`/api/health`); smoke test script (`scripts/smoke.mjs`); deploy-dev, deploy-staging, deploy-prod Github Actions workflows; dependabot and CodeQL static analysis workflows.
* **Broken & Resolved**:
  * **055 Migration Grant Mismatch**: Pushing migrations failed initially on `055_verification_system.sql` due to a mismatch in `admin_decide_verification` parameters inside the `GRANT` statement (called with 7 arguments instead of 6). Resolved by correcting the `GRANT` statement signature in the migration file.
  * **Next.js 16 Proxy Convention**: Verified that path routing and authorization checks are routed via the newer `src/proxy.ts` middleware. Asserts redirects properly.
  * **Flex Shrink Misalignment on Kanban Board**: Flex containers without explicit minimum sizes can shrink on smaller viewports. Add explicit `flex-shrink: 0` and `min-height` settings to sticky calendar headers and columns to maintain precise layout grid alignment.

### Key Lessons
* Next.js `output: 'standalone'` is critical for Next.js container builds as it optimizes the build footprint by including only the files trace-required for node execution.
* When executing multi-stage DB migrations, ensure the parameter count in `GRANT EXECUTE ON FUNCTION` exactly matches the function's declaration. A mismatch triggers a database compilation error that rolls back subsequent migrations.
* Always enforce `flex-shrink: 0` on flex items that have rigid, absolute height/width coordinates (like Kanban or calendar grid blocks) to prevent browser rendering engines from auto-scaling and misaligning cells.

#### Next Target
* Upstash Rate Limiting and Sentry error logging integration.
* Proceed with Razorpay payment integration and schema checks.

### Instagram Auto-Populate for Influencer Signup (2026-07-14)
#### Scope
* **Feature**: Added a "Connect Instagram" step (Step 1) to the influencer signup flow `apps/web/src/app/signup/influencer/page.tsx` that fetches public profile data using the `fetchInstagramProfile` utility and pre-fills the signup form (First/Last Name, Bio).
* **API Route**: Created `apps/web/src/app/api/auth/scrape-instagram/route.ts` which is unauthenticated but strictly rate-limited using the in-house/Upstash rate limiting solution.
* **Payload Update**: Follower counts retrieved from Instagram are now sent directly in the registration payload, ensuring the `instagram_followers` field is populated on account creation for immediate sorting/ranking capability.

#### Broken & Resolved
* **Followers Missing in Payload**: The `instagram_followers` field was needed in the payload, but was only checked during verification. I confirmed `lib/validators.ts` (`RegisterProfileSchema`) supported `instagramFollowers` and wired it into the frontend state correctly.

#### Key Lessons
* Unauthenticated scraping API routes are high-risk targets for abuse. They MUST be wrapped in strict rate limits (e.g., 5 hits/min per IP) before shipping to production.

#### Next Target
* The codebase is now complete. The remaining gate is strictly infrastructure (Setting Supabase production keys, Upstash Redis keys). Proceed with deployment and infrastructure validation.
