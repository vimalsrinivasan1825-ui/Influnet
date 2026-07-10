# Living Lessons-Learned & Module Tracker

This file tracks the current implementation state of each system module, issues encountered, fixes applied, and core architectural lessons learned.

---

## 1. System Modules Status

### Auth Pages (Login / Signup)
*   **State**: Complete (V1 UI Blueprint).
*   **Files**:
    *   [login/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/influnet-app/src/app/login/page.tsx)
    *   [signup/influencer/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/influnet-app/src/app/signup/influencer/page.tsx)
    *   [signup/business/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/influnet-app/src/app/signup/business/page.tsx)
*   **Details**: Apple-style premium card containers on light theme backdrops (`#fafafb`) with soft pink/purple gradient glows. Focus states styled with pink highlights. Ready to be wired to the Supabase client.

### Dashboard Portal (`/dashboard`)
*   **State**: Complete (V1 UI Blueprint).
*   **Files**:
    *   [dashboard/page.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/influnet-app/src/app/dashboard/page.tsx)
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
    *   [vision.tsx](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/influnet-app/src/components/landing/vision.tsx)
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

### Next Target
* Phase 2: Payments & Notifications (milestone payments, email notifications)
* Public creator profile page (link-in-bio for social sharing)
* Expand the campaign projects section to allow counterparty deliverables file sharing and tracking


