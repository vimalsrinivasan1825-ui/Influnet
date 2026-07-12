# Influnet Platform — Architecture & Module Reference

> **Generated:** July 7, 2026  
> **Stack:** Next.js 16.2 (App Router) + React 19 + Supabase (PostgreSQL, Auth, RLS)  
> **State:** Zustand | **Styling:** Tailwind v4 + shadcn/ui | **Validation:** Zod v4  
> **Target:** ~2,000 users, moderate concurrency

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Map](#2-module-map)
3. [Module Deep-Dives](#3-module-deep-dives)
   - 3.1 [Authentication Module](#31-authentication-module)
   - 3.2 [Profile Module](#32-profile-module)
   - 3.3 [Discovery Module](#33-discovery-module)
   - 3.4 [Collaboration Requests Module](#34-collaboration-requests-module)
   - 3.5 [Projects Module](#35-projects-module)
   - 3.6 [Messaging Module](#36-messaging-module)
   - 3.7 [Dashboard Module](#37-dashboard-module)
   - 3.8 [Admin Module](#38-admin-module)
   - 3.9 [Landing Module](#39-landing-module)
   - 3.10 [Notifications Module](#310-notifications-module)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [API Reference](#5-api-reference)
6. [Database Schema](#6-database-schema)
7. [Code Quality Analysis](#7-code-quality-analysis)
   - 7.1 [OOP vs Functional Patterns](#71-oop-vs-functional-patterns)
   - 7.2 [Hardcoded Values Audit](#72-hardcoded-values-audit)
   - 7.3 [Coupling & Cohesion](#73-coupling--cohesion)
   - 7.4 [Test Coverage Gap](#74-test-coverage-gap)
8. [Security Architecture](#8-security-architecture)
9. [CI/CD Pipeline](#9-cicd-pipeline)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Vercel (Hosting)                         │
│                                                              │
│  ┌─────────────────────────────────────────┐                 │
│  │         Next.js 16 App Router            │                 │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐  │                 │
│  │  │ Pages   │  │ API      │  │ Middle- │  │                 │
│  │  │(React)  │  │ Routes   │  │ ware    │  │                 │
│  │  └────┬────┘  └────┬─────┘  └────────┘  │                 │
│  │       │            │                     │                 │
│  │  ┌────▼────────────▼──────────────────┐  │                 │
│  │  │         Zustand Stores              │  │                 │
│  │  │  (auth, messaging, notifications)   │  │                 │
│  │  └────────────────────────────────────┘  │                 │
│  └──────────────┬──────────────────────────┘                 │
│                 │ HTTPS / REST                                │
│  ┌──────────────▼──────────────────────────┐                 │
│  │            Supabase                      │                 │
│  │  ┌────────┬────────┬────────┬────────┐  │                 │
│  │  │ Auth   │ Post-  │ Realtime│ Storage│  │                 │
│  │  │        │ greSQL │ (WS)   │ (S3)   │  │                 │
│  │  └────────┴────────┴────────┴────────┘  │                 │
│  └─────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 User Roles

| Role | Signup Flow | Approval | Access |
|---|---|---|---|
| `business_owner` | 4-step wizard | Admin approval required | Full business dashboard |
| `influencer` | 4-step wizard | Instant (no approval) | Full creator dashboard |
| `admin` | Created via seed/SQL | N/A | Admin panel (all data) |

### 1.2 Core Domain: Collaboration Lifecycle

```
Discover ──→ Send Request ──→ Accept ──→ Project + Chat ──→ Stages ──→ Complete
   │             │               │             │                │           │
   ▼             ▼               ▼             ▼                ▼           ▼
 Search     collab_        collab_       campaign_        12-stage      Final
 creators   requests       requests     projects +        pipeline      payment
            (pending)      (accepted)   conversations     tracking      (future)
```

---

## 2. Module Map

```
src/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Landing page (hero, sections)
│   ├── layout.tsx                    # Root layout (fonts, metadata, Inter font)
│   ├── globals.css                   # Tailwind v4 + custom theme
│   ├── login/page.tsx                # Authentication: sign in
│   ├── signup/
│   │   ├── page.tsx                  # Role selection (Creator vs Business)
│   │   ├── influencer/page.tsx       # 4-step creator signup wizard
│   │   └── business/page.tsx         # 4-step business signup wizard
│   ├── setup/page.tsx                # Admin seed setup (dev only)
│   ├── dashboard/
│   │   ├── layout.tsx                # DashboardShell wrapper
│   │   ├── page.tsx                  # Business Owner Dashboard
│   │   ├── influencer/page.tsx       # Influencer Dashboard
│   │   ├── discover/page.tsx         # Role-aware discovery
│   │   ├── requests/page.tsx         # Collab requests (sent + received)
│   │   ├── messages/page.tsx         # Real-time messaging
│   │   ├── projects/page.tsx         # 12-stage campaign pipeline
│   │   ├── connections/page.tsx      # Network connections (placeholder)
│   │   ├── settings/page.tsx         # Profile settings
│   │   └── admin/
│   │       ├── page.tsx              # Admin overview dashboard
│   │       ├── approvals/page.tsx    # Business approval management
│   │       ├── users/page.tsx        # User management
│   │       ├── projects/page.tsx     # All projects (force-delete)
│   │       └── collabs/page.tsx      # All collab requests
│   └── api/                          # API Routes (REST)
│       ├── auth/register/            # POST: Register user profile
│       ├── discover/                 # GET: Role-aware discovery
│       ├── collabs/                  # CRUD: Collaboration requests
│       ├── collabs/[id]/             # GET: Single collab detail
│       ├── projects/                 # GET/PATCH: Campaign projects
│       ├── conversations/            # CRUD: Conversations
│       ├── conversations/[id]/messages/ # CRUD: Messages
│       ├── profile/                  # GET/PATCH: User profile
│       ├── business/dashboard/       # GET: Business metrics
│       ├── influencer/dashboard/     # GET: Influencer metrics
│       ├── admin/
│       │   ├── dashboard/            # GET: Platform stats
│       │   ├── businesses/           # GET/PATCH: Business approval
│       │   ├── users/                # GET: All users
│       │   ├── projects/             # GET/DELETE: All projects
│       │   ├── collabs/              # GET/DELETE/PATCH: All collabs
│       │   └── seed/                 # POST: Create admin (dev only)
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   │   └── button.tsx                # Base button component (variants)
│   ├── magicui/                      # Animated UI components
│   │   └── globe.tsx                 # WebGL interactive globe (cobe)
│   ├── landing/                      # Landing page sections
│   │   ├── header.tsx                # Navigation header
│   │   ├── hero.tsx                  # Main hero with animated elements
│   │   ├── vision.tsx                # Platform vision section
│   │   ├── how-it-works.tsx          # Step-by-step explainer
│   │   ├── creator-economy.tsx       # Market statistics
│   │   ├── creator-carousel.tsx      # Creator showcase carousel
│   │   ├── trust-verification.tsx    # Trust & safety section
│   │   ├── opportunities.tsx         # Opportunity highlights
│   │   ├── why-exists.tsx            # Problem-solution section
│   │   ├── orbiting-circles.tsx      # Animated orbit decoration
│   │   ├── trust-carousel.tsx        # Trust indicators carousel
│   │   ├── verified.tsx              # Verification badge showcase
│   │   ├── cta.tsx                   # Call-to-action
│   │   └── footer.tsx                # Site footer
│   └── dashboard/
│       ├── shell.tsx                 # Auth-gated layout + data loading
│       ├── sidebar.tsx               # Role-aware navigation sidebar
│       └── header.tsx                # Dashboard header (search, notifications)
├── lib/
│   ├── auth.ts                       # Server-side auth helpers (cookie-based)
│   ├── utils.ts                      # cn() utility (clsx + tailwind-merge)
│   ├── validators.ts                 # Zod schemas for all API payloads
│   └── supabase/
│       ├── client.ts                 # Singleton browser client (ssr)
│       ├── server.ts                 # Server client factory (service_role)
│       └── middleware.ts             # Cookie-based session refresh
├── store/
│   ├── auth-store.ts                 # Zustand: user, token, loading state
│   ├── messaging-store.ts            # Zustand: conversations, messages, typing
│   └── notification-store.ts         # Zustand: unread counts
└── middleware.ts                     # Next.js edge middleware (session redirect)
```

### 2.1 Module-to-Route Mapping

| Module | Pages | API Routes | DB Tables |
|---|---|---|---|
| Authentication | `/login`, `/signup/*` | `/api/auth/register` | `auth.users`, `profiles` |
| Profile | `/dashboard/settings` | `/api/profile` | `profiles`, `business_profiles`, `influencer_profiles` |
| Discovery | `/dashboard/discover` | `/api/discover` | `influencer_profiles`, `business_profiles`, `profiles` |
| Collab Requests | `/dashboard/requests` | `/api/collabs`, `/api/collabs/[id]` | `collab_requests`, `profiles` |
| Projects | `/dashboard/projects` | `/api/projects` | `campaign_projects`, `profiles` |
| Messaging | `/dashboard/messages` | `/api/conversations`, `.../messages` | `conversations`, `messages`, `conversation_participants` |
| Dashboard | `/dashboard`, `/dashboard/influencer` | `/api/business/dashboard`, `/api/influencer/dashboard` | `profiles`, `collab_requests`, `campaign_projects` |
| Admin | `/dashboard/admin/*` | `/api/admin/*` | All tables |
| Connections | `/dashboard/connections` | (placeholder) | `connections` |
| Notifications | (global, in shell) | (via dashboard API) | `collab_requests`, `conversations` |

---

## 3. Module Deep-Dives

### 3.1 Authentication Module

**Purpose:** Register, authenticate, and manage user sessions.

**Files:**
- `src/app/login/page.tsx` — Login form (email + password)
- `src/app/signup/page.tsx` — Role selection (creator vs business)
- `src/app/signup/influencer/page.tsx` — 4-step creator wizard
- `src/app/signup/business/page.tsx` — 4-step business wizard
- `src/app/api/auth/register/route.ts` — POST: calls `register_profile` RPC
- `src/lib/auth.ts` — Server-side cookie auth helpers
- `src/lib/supabase/client.ts` — Singleton browser client
- `src/lib/supabase/server.ts` — Server client (service_role)
- `src/lib/supabase/middleware.ts` — Cookie session refresh for edge
- `src/middleware.ts` — Route protection + redirect logic
- `src/store/auth-store.ts` — Client-side auth state (Zustand)

**Flow:**

```
User submits login form
    │
    ▼
supabase.auth.signInWithPassword({ email, password })
    │
    ├── Success: session + user returned
    │       │
    │       ▼
    │   Store token in localStorage
    │   FETCH: GET /api/profile (or direct DB query for role)
    │       │
    │       ▼
    │   Role-based redirect:
    │     'influencer' → /dashboard/influencer
    │     'admin'      → /dashboard/admin
    │     'business_owner' → /dashboard  (or pending-approval screen)
    │
    └── Error: display message on form
```

**Signup Flow (Influencer):**
```
Step 1 (Account): name, username, email, phone, password
    │
    ▼
Step 2 (Profile): gender, city, state, languages
    │
    ▼
Step 3 (Creator): primary niche, secondary niches, bio, social handles
    │
    ▼
Step 4 (Collab): content types, price range
    │
    ▼
Submit:
  1. supabase.auth.signUp({ email, password, data: payload })
  2. If session returned → POST /api/auth/register (calls register_profile RPC)
  3. RPC inserts into: profiles + influencer_profiles
  4. Redirect to /dashboard/influencer
```

**Signup Flow (Business):**
```
Same 4 steps with different fields:
Step 1: account info + company name + industry
Step 2: business type, GST, website, address
Step 3: budget, collab preferences
Step 4: review + submit

After submit: approval_status = 'pending_review'
User redirected with message "pending approval"
Cannot access dashboard until admin approves
```

**Security Notes:**
- Passwords handled entirely by Supabase Auth (never stored in app)
- JWT tokens stored in localStorage (vulnerable to XSS — known tradeoff)
- API routes verify tokens server-side via `supabase.auth.getUser()`
- Session refresh via `@supabase/ssr` middleware with cookie fallback
- **No rate limiting** on login attempts (v1 gap)

---

### 3.2 Profile Module

**Purpose:** Read and update user profiles (both base + role-specific).

**Files:**
- `src/app/api/profile/route.ts` — GET/PATCH for profile data
- `src/app/dashboard/settings/page.tsx` — Settings UI

**GET /api/profile flow:**
```
Request (Auth header: Bearer <JWT>)
    │
    ├── Verify JWT → supabase.auth.getUser()
    │
    ├── Query profiles table → get base profile (id, role, email, name, phone, location)
    │
    └── Role-specific enrichment:
        ├── business_owner → fetch business_profiles (company_name, industry, etc.)
        └── influencer → fetch influencer_profiles (username, bio, niche, etc.)
```

**PATCH /api/profile flow:**
```
Request (body: { name, phone, location, ...role-specific fields })
    │
    ├── Update profiles table (name, phone, location)
    │
    └── Role-specific update:
        ├── business_owner → update business_profiles
        └── influencer → update influencer_profiles
```

**Data Sent/Received:**
- Request sends: `{ name, phone, location, [role-specific fields] }`
- Response returns: full profile object with all fields

**Integration Points:**
- Uses Supabase client with user's JWT (respects RLS)
- Returns to: settings page UI
- No caching layer (always fetches fresh from DB)

---

### 3.3 Discovery Module

**Purpose:** Role-aware discovery — businesses find creators, creators find brands.

**Files:**
- `src/app/api/discover/route.ts` — GET: filters + search
- `src/app/dashboard/discover/page.tsx` — Discovery UI

**Flow:**
```
GET /api/discover
    │
    ├── Get current user's role
    │
    ├── if business_owner:
    │     SELECT from influencer_profiles (JOIN profiles)
    │     WHERE NOT user_id = current_user
    │     LIMIT 30
    │
    └── if influencer:
          SELECT from business_profiles (JOIN profiles)
          WHERE NOT user_id = current_user
          LIMIT 30
```

**Data Returned:**
| For Business | For Influencer |
|---|---|
| `user_id`, `username`, `bio`, `niche` | `user_id`, `company_name`, `industry` |
| `instagram_handle`, `youtube_handle` | `tagline`, `company_description` |
| `headline`, `availability_status` | `logo_url`, `website` |
| Profile: `name`, `location` | Profile: `name`, `location` |

**Integration Points:**
- Discovery page calls this on mount
- User clicks "Collaborate" → navigates to requests page with pre-filled data
- **No search/filter query params passed yet** (v1 returns all non-self users)

---

### 3.4 Collaboration Requests Module

**Purpose:** Business → Creator request lifecycle (send, accept, decline, cancel).

**Files:**
- `src/app/api/collabs/route.ts` — GET (list), POST (create), PATCH (update status)
- `src/app/api/collabs/[id]/route.ts` — GET (single detail)
- `src/app/dashboard/requests/page.tsx` — Requests UI (sent + received tabs)

**POST /api/collabs (Send Request):**
```
Validation
    │
    ├── Only business_owner can send requests
    ├── to_user_id must be valid UUID
    ├── project_title, project_description, budget (optional)
    │
    └── INSERT into collab_requests:
        { from_user_id, to_user_id, message, budget, status: 'pending' }
```

**PATCH /api/collabs (Accept/Decline):**
```
Request: { id, status }
    │
    ├── Verify user is participant (sender or receiver)
    ├── Update collab_requests.status
    │
    └── If status === 'accepted':
        ├── Auto-create campaign_project:
        │   { owner_user_id: businessId, counterparty_user_id: creatorId,
        │     title, description, budget, status: 'active',
        │     current_stage: 'collaboration_started' }
        │
        └── Auto-create conversation:
            ├── Check for existing conversation between pair
            ├── If not found: INSERT conversations + INSERT conversation_participants
            └── Auto-heal: projects route also checks for missing projects
```

**Data Sent/Received:**
- POST sends: `{ to_user_id, project_title, project_description, budget }`
- POST returns: `{ collab: { id, from_user_id, to_user_id, message, budget, status } }`
- PATCH sends: `{ id, status }`
- PATCH returns: `{ collab: { ...updated } }`

**Integration Points:**
- Accepting creates both a project AND a conversation (two downstream tables)
- Auto-heal logic in `/api/projects` also creates missing projects from accepted collabs
- Notifications: pending count shown in sidebar badge

---

### 3.5 Projects Module

**Purpose:** 12-stage collaborative campaign pipeline.

**Files:**
- `src/app/api/projects/route.ts` — GET (list + auto-heal), PATCH (advance stage)
- `src/app/dashboard/projects/page.tsx` — Projects UI

**12-Stage Pipeline:**
```
1. collaboration_started → 2. project_discussion → 3. advance_payment →
4. content_planning → 5. content_confirmation → 6. shooting_in_progress →
7. editing_in_progress → 8. sent_for_review → 9. revisions →
10. final_approval → 11. final_payment → 12. project_completed
```

**Cancellation Flow:**
```
User clicks "Request Cancellation"
    │
    ├── Sets cancel_requested_by = current_user_id
    │
    ├── Other party sees cancel request
    │   ├── ACCEPT → DELETE project (both parties agree)
    │   └── DECLINE → cancel_requested_by = null (project continues)
    └── Admin can also force-delete projects
```

**Data Sent/Received:**
- GET returns: `{ projects: [...] }` with joined profiles (owner + counterparty)
- PATCH sends: `{ id, current_stage?, status?, action? }`
- PATCH actions: `request_cancellation`, `decline_cancellation`, `accept_cancellation`
- PATCH returns: `{ project: { ...updated } }`

**Auto-Heal Logic (in GET):**
```
For each accepted collab request where user is participant:
    Check if campaign_project exists with matching owner/counterparty
    If missing → auto-create project (recovery from failed PATCH)
```

**Integration Points:**
- Created by collab acceptance
- Shows owner + counterparty profile data via Supabase joins
- Stage labels mapped from enum in frontend

---

### 3.6 Messaging Module

**Purpose:** Real-time direct messaging between collaboration partners.

**Files:**
- `src/app/api/conversations/route.ts` — GET (list), POST (create)
- `src/app/api/conversations/[id]/messages/route.ts` — GET (list), POST (send)
- `src/app/dashboard/messages/page.tsx` — Messaging UI
- `src/store/messaging-store.ts` — Zustand state for conversations

**Architecture:**
```
┌─────────────────────────────────────────┐
│           Messaging Page                 │
│                                          │
│  ┌─────────────────┐  ┌──────────────┐  │
│  │ Conversation List│  │ Message Area │  │
│  │ (sidebar)        │  │              │  │
│  │                  │  │  ┌────────┐  │  │
│  │  - Conv 1        │  │  │ Msg 1  │  │  │
│  │  - Conv 2 ◄      │  │  │ Msg 2  │  │  │
│  │  - Conv 3        │  │  │ Msg 3  │  │  │
│  └─────────────────┘  │  └────────┘  │  │
│                        │  [Input]     │  │
│                        └──────────────┘  │
└─────────────────────────────────────────┘
            │                    │
            ▼                    ▼
    GET /api/conversations   GET /api/conversations/{id}/messages
    POST /api/conversations  POST /api/conversations/{id}/messages
            │
            ▼
    Zustand Store (messaging-store.ts)
    ├── conversations: Conversation[]
    ├── activeConversationId: string | null
    ├── messages: Message[]
    ├── typingUsers: Map<`${convId}:${userId}`, boolean>
    └── + actions: setConversations, addMessage, updateTyping, etc.
```

**GET /api/conversations flow:**
```
    ├── Query conversation_participants WHERE user_id = current_user
    ├── Extract conversation_ids
    ├── Query conversations with participants + profiles (JOIN)
    └── Return conversations array
```

**POST /api/conversations flow:**
```
    ├── INSERT into conversations
    ├── INSERT 2 participants (current_user + other_user)
    └── Return new conversation
```

**GET /api/conversations/{id}/messages flow:**
```
    ├── Verify user is participant of conversation
    ├── Query messages WHERE conversation_id = id ORDER BY created_at ASC
    └── Return messages array
```

**POST /api/conversations/{id}/messages flow:**
```
    ├── Verify user is participant
    ├── INSERT into messages { conversation_id, sender_id, content }
    ├── UPDATE conversations SET updated_at = now()
    └── Return new message
```

**Integration Points:**
- Conversations created by collab request acceptance
- Messages page updates `user_presence` and `typing` states
- Notification store tracks unread message count
- **No real-time subscriptions yet** — messages fetched on page load

---

### 3.7 Dashboard Module

**Purpose:** Role-specific home screens with key metrics.

**Files:**
- `src/app/api/business/dashboard/route.ts` — Business metrics
- `src/app/api/influencer/dashboard/route.ts` — Creator metrics
- `src/app/dashboard/page.tsx` — Business dashboard UI
- `src/app/dashboard/influencer/page.tsx` — Creator dashboard UI

**Business Dashboard Data:**
```
GET /api/business/dashboard
    │
    ├── Profile data: name, company_name, industry, logo_url
    │
    ├── Stats:
    │   ├── active_collabs_count (accepted collabs + active projects)
    │   ├── completed_collabs_count (completed projects)
    │   ├── pending_collabs_count (pending collab requests)
    │   └── total_budget_sum (budget from collabs + projects)
    │
    └── Recent collabs:
        ├── Join collab_requests with profiles (influencer name)
        ├── Format for UI: name, amount, status, platform, reach
        └── Limit 4, ordered by created_at DESC
```

**Influencer Dashboard Data:**
```
GET /api/influencer/dashboard
    │
    ├── Profile data: name, username, niche, headline, bio, location
    │
    ├── Stats:
    │   ├── profile_views (0 — mock)
    │   ├── collab_requests (pending)
    │   ├── active_discussions (accepted)
    │   ├── active_projects (active campaign_projects)
    │   └── saved_by_businesses (0 — mock)
    │
    └── Trends: all 0 (mock)
```

**Dashboard Shell (src/components/dashboard/shell.tsx):**
```
On mount:
├── Load token from localStorage
├── Validate token → supabase.auth.getUser()
├── Fetch profile → supabase.from('profiles').select('*')
├── Check role + approval_status
│   ├── business_owner + pending_review → show "Under Review" screen
│   ├── business_owner + rejected → show "Not Approved" screen
│   └── else → render children (the actual dashboard content)
├── Fetch notification summary (unread messages, pending requests)
└── Fetch extended profile (business_profiles / influencer_profiles)
```

---

### 3.8 Admin Module

**Purpose:** Platform administration — user management, business approval, data oversight.

**Files:**
- `src/app/api/admin/dashboard/route.ts` — Platform stats
- `src/app/api/admin/businesses/route.ts` — List + approve/reject businesses
- `src/app/api/admin/users/route.ts` — List all users with role data
- `src/app/api/admin/projects/route.ts` — List + force-delete projects
- `src/app/api/admin/collabs/route.ts` — List + force-delete + override collabs
- `src/app/api/admin/seed/route.ts` — Create admin user (dev only)
- `src/app/dashboard/admin/page.tsx` — Admin home dashboard
- `src/app/dashboard/admin/approvals/page.tsx` — Business approval UI
- `src/app/dashboard/admin/users/page.tsx` — User management UI
- `src/app/dashboard/admin/projects/page.tsx` — Project management UI
- `src/app/dashboard/admin/collabs/page.tsx` — Collab management UI

**API Patterns (all admin endpoints):**
```
1. Extract Authorization header
2. Create Supabase client with user's JWT
3. Verify user exists → supabase.auth.getUser()
4. Verify admin role → query profiles WHERE role = 'admin'
5. Perform operation
6. Return response
```

**Admin Authorization Mechanism:**
- Role check: `SELECT role FROM profiles WHERE id = auth.uid()`
- RLS policies use SECURITY DEFINER function `is_admin()` to avoid recursion
- See: `supabase/migrations/038_add_admin_role.sql`

---

### 3.9 Landing Module

**Purpose:** Public-facing marketing site.

**Files:** All `src/components/landing/*.tsx` + `src/app/page.tsx`

**Sections (in order):**
1. `header.tsx` — Navigation (logo, links, Sign In / Get Started)
2. `hero.tsx` — Main value prop with animated globe + cards
3. `vision.tsx` — Platform vision statement
4. `creator-economy.tsx` — Market data statistics
5. `how-it-works.tsx` — 3-step explainer
6. `trust-verification.tsx` — Trust badges
7. `opportunities.tsx` — Feature highlights
8. `why-exists.tsx` — Problem/solution narrative
9. `creator-carousel.tsx` — Animated creator showcase
10. `orbiting-circles.tsx` — Decorative animation
11. `trust-carousel.tsx` — Trust indicator animations
12. `verified.tsx` — Verification feature showcase
13. `cta.tsx` — Call-to-action (signup buttons)
14. `footer.tsx` — Site footer with links

**Tech:** framer-motion animations, Tailwind gradients, no SSR data fetching

---

### 3.10 Notifications Module

**Purpose:** Unread message counts and pending request badges.

**Files:**
- `src/store/notification-store.ts` — Zustand: `{ unread_messages_count, pending_requests_count }`
- Integrated in `DashboardShell` — fetches summary on mount

**Flow:**
```
DashboardShell mounts
    │
    ├── FETCH (from separate notification API or collab/conversation count)
    │
    └── Update Zustand store → sidebar badges update reactively
```

---

## 4. Data Flow Diagrams

### 4.1 End-to-End: Business Creates Collaboration

```
Business Owner                    Influencer                         Database
     │                               │                                 │
     ├── Signs up (4-step)           │                                 │
     │  → POST /api/auth/register    │                                 │
     │                               │                                 ├── profiles (role: business_owner)
     │                               │                                 ├── business_profiles (pending_review)
     │                               │                                 │
     ├── Admin approves              │                                 │
     │  → PATCH /api/admin/businesses│                                 │
     │                               │                                 ├── business_profiles.approval_status = 'approved'
     │                               │                                 │
     │                               ├── Signs up (4-step)            │
     │                               │  → POST /api/auth/register     │
     │                               │                                 ├── profiles (role: influencer)
     │                               │                                 ├── influencer_profiles
     │                               │                                 │
     ├── Discovers influencer                                        │
     │  → GET /api/discover          │                                 │
     │                               │                                 │
     ├── Sends collab request        │                                 │
     │  → POST /api/collabs          │                                 │
     │                               │                                 ├── collab_requests (status: pending)
     │                               │                                 │
     │                               ├── Receives notification        │
     │                               │                                 │
     │                               ├── Accepts request              │
     │                               │  → PATCH /api/collabs          │
     │                               │    { status: 'accepted' }      │
     │                               │                                 ├── collab_requests.status = 'accepted'
     │                               │                                 ├── campaign_projects (new row)
     │                               │                                 ├── conversations (new row)
     │                               │                                 ├── conversation_participants (2 rows)
     │                               │                                 │
     ├── Sees project in dashboard   │                                 │
     ├── Opens conversation          │                                 │
     │                               │                                 │
     ├── Sends message               │                                 │
     │  → POST /api/conversations/   │                                 │
     │    {id}/messages              │                                 │
     │                               │                                 ├── messages (new row)
     │                               │                                 │
     ├── Advances project stage     │                                 │
     │  → PATCH /api/projects       │                                 │
     │    { current_stage: '...' }   │                                 │
     │                               │                                 ├── campaign_projects.current_stage
     │                               │                                 │
     ├── Cancels project (optional)  │                                 │
     │  → PATCH /api/projects       │                                 │
     │    { action: 'request_'       │                                 │
     │      'cancellation' }         │                                 │
     │                               │                                 ├── campaign_projects.cancel_requested_by
     │                               │                                 │
     │                               ├── Accepts cancellation         │
     │                               │  → PATCH /api/projects         │
     │                               │    { action: 'accept_'         │
     │                               │      'cancellation' }          │
     │                               │                                 ├── campaign_projects (DELETED)
```

### 4.2 Admin Management Flow

```
Admin                                  Database
  │                                       │
  ├── Logs in                          │
  │  → GETs redirected to /dashboard/admin
  │                                     │
  ├── Views platform stats             │
  │  → GET /api/admin/dashboard        │
  │                                     ├── Aggregate profiles, businesses,
  │                                     │   collabs, projects
  │                                     │
  ├── Reviews pending businesses       │
  │  → GET /api/admin/businesses       │
  │                                     ├── business_profiles + profiles
  │                                     │
  ├── Approves a business              │
  │  → PATCH /api/admin/businesses     │
  │    { user_id, approval_status:     │
  │      'approved' }                  │
  │                                     ├── business_profiles.approval_status
  │                                     │
  ├── Views all users                  │
  │  → GET /api/admin/users            │
  │                                     ├── profiles + extended profiles
  │                                     │
  ├── Views all projects               │
  │  → GET /api/admin/projects         │
  │                                     ├── campaign_projects + profiles
  │                                     │
  ├── Force-deletes problematic project│
  │  → DELETE /api/admin/projects      │
  │    { project_id }                  │
  │                                     ├── campaign_projects (DELETED)
  │                                     │
  └── Overrides collab request status  │
     → PATCH /api/admin/collabs        │
       { collab_id, status }           │
                                       ├── collab_requests.status
```

### 4.3 Data Entity Relationships

```
auth.users (Supabase Auth)
    │ (1:1)
    ▼
profiles
    │ (1:1)                    │ (1:1)
    ├──────────────────────────┤
    ▼                          ▼
business_profiles        influencer_profiles
    │                          │
    │ (1:N)                    │ (1:N)
    │                          │
    ▼                          ▼
collab_requests (from → to)
    │                          │
    │ (1:1 on accept)          │
    ▼                          │
campaign_projects              │
    │                          │
    │ (1:1)                    │
    ▼                          │
conversations                  │
    │                          │
    ├── conversation_participants (N:N users)
    │
    ├── messages (1:N)
    │
    └── user_presence (1:1 per user)
```

---

## 5. API Reference

| Method | Endpoint | Auth | Role Check | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/register` | Bearer JWT | None | Create profile via RPC |
| POST | `/api/admin/seed` | None | N/A (dev only) | Create admin account |
| GET | `/api/discover` | Bearer JWT | Business/Influencer | Discover opposite role |
| GET | `/api/collabs` | Bearer JWT | Any | List user's collab requests |
| POST | `/api/collabs` | Bearer JWT | Business only | Send collab request |
| PATCH | `/api/collabs` | Bearer JWT | Participant | Accept/decline request |
| GET | `/api/collabs/[id]` | Bearer JWT | Participant | Get single request |
| GET | `/api/projects` | Bearer JWT | Any | List user's projects |
| PATCH | `/api/projects` | Bearer JWT | Owner/Counterparty | Update stage/status |
| GET | `/api/conversations` | Bearer JWT | Any | List conversations |
| POST | `/api/conversations` | Bearer JWT | Any | Create conversation |
| GET | `/api/conversations/[id]/messages` | Bearer JWT | Participant | List messages |
| POST | `/api/conversations/[id]/messages` | Bearer JWT | Participant | Send message |
| GET | `/api/profile` | Bearer JWT | Any | Get profile data |
| PATCH | `/api/profile` | Bearer JWT | Any | Update profile |
| GET | `/api/business/dashboard` | Bearer JWT | Business | Dashboard metrics |
| GET | `/api/influencer/dashboard` | Bearer JWT | Influencer | Dashboard metrics |
| GET | `/api/admin/dashboard` | Bearer JWT | Admin | Platform stats |
| GET | `/api/admin/businesses` | Bearer JWT | Admin | List businesses |
| PATCH | `/api/admin/businesses` | Bearer JWT | Admin | Approve/reject |
| GET | `/api/admin/users` | Bearer JWT | Admin | List users |
| GET | `/api/admin/projects` | Bearer JWT | Admin | List projects |
| DELETE | `/api/admin/projects` | Bearer JWT | Admin | Force-delete project |
| GET | `/api/admin/collabs` | Bearer JWT | Admin | List collabs |
| DELETE | `/api/admin/collabs` | Bearer JWT | Admin | Force-delete collab |
| PATCH | `/api/admin/collabs` | Bearer JWT | Admin | Override status |

---

## 6. Database Schema

### Tables (18 total)

| Table | Primary Key | Foreign Keys | Key Columns |
|---|---|---|---|
| `profiles` | `id` (UUID, → auth.users) | — | `role` (enum), `email`, `name` |
| `business_profiles` | `user_id` (UUID) | → `profiles.id` | `company_name`, `approval_status` |
| `influencer_profiles` | `user_id` (UUID) | → `profiles.id` | `username`, `niche`, `price_range` |
| `collab_requests` | `id` (UUID) | → `profiles.id` (x2) | `from_user_id`, `to_user_id`, `status` |
| `campaign_projects` | `id` (UUID) | → `profiles.id` (x2) | `owner_user_id`, `current_stage` |
| `conversations` | `id` (UUID) | — | `updated_at` |
| `conversation_participants` | (composite) | → 2 FKs | `conversation_id`, `user_id` |
| `messages` | `id` (UUID) | → `conversations.id` | `body`, `sender_user_id` |
| `connections` | `id` (UUID) | → `profiles.id` (x2) | `relationship_status` |
| `user_presence` | `user_id` (UUID) | → `profiles.id` | `last_seen_at`, `typing_*` |
| `project_assets` | `id` (UUID) | → `campaign_projects.id` | `file_name`, `file_url` |
| `business_reviews` | `id` (UUID) | → 2 FKs | `rating`, `review` |
| `influencer_shortlists` | `id` (UUID) | → 2 FKs | Business saves creators |
| `creator_profile_views` | (composite) | → 2 FKs | View tracking |
| `profile_views` | (composite) | → 2 FKs | Profile view analytics |
| `profile_link_clicks` | (composite) | → 1 FK | Link tracking |
| `phone_otp_audit_log` | `id` (UUID) | — | OTP audit |
| `phone_otp_sessions` | `id` (UUID) | — | OTP sessions |

### Enums

| Enum | Values | Used In |
|---|---|---|
| `user_role` | `business_owner`, `influencer`, `admin` | `profiles.role` |
| `project_stage` | 12 values (see §3.5) | `campaign_projects.current_stage` |

### Key Indexes

- `profiles_role_idx` — Fast role-based queries
- `profiles_email_idx` — Login lookups

### RLS Policies

| Table | Policy | Effect |
|---|---|---|
| `profiles` | `select_own` | Users see own row |
| `profiles` | `select_public_influencer` | Authenticated users see influencer profiles |
| `profiles` | `select_admin` | Admins see all (uses `is_admin()` SECURITY DEFINER) |
| `business_profiles` | `select_own`, `update_own`, `update_admin` | Owners + admins |
| `influencer_profiles` | `select_all_authenticated`, `insert_own`, `update_own`, `select_admin` | Discovery + ownership |
| `campaign_projects` | `select_participant`, `update_participant`, `delete_participant`, `select_admin`, `delete_admin` | Participants + admins |
| `collab_requests` | `select_participant`, `insert_from`, `update_participant`, `select_admin`, `update_admin`, `delete_admin` | Participants + admins |

---

## 7. Code Quality Analysis

### 7.1 OOP vs Functional Patterns

**Assessment:** The codebase uses **functional and procedural patterns**, NOT classical OOP.

| Concept | Present? | Evidence |
|---|---|---|
| Classes / Inheritance | ❌ | No classes used anywhere |
| Interfaces / Types | ✅ | TypeScript interfaces in `types/index.ts` |
| Encapsulation | ⚠️ Partial | Zustand stores encapsulate state, but API routes are flat functions |
| Polymorphism | ❌ | No polymorphic patterns |
| Dependency Injection | ❌ | API routes create their own Supabase clients inline |
| Pure Functions | ⚠️ Partial | Zod validators are pure; API routes have side effects |
| Higher-Order Functions | ✅ | Zustand `create()` wrapper, `toggleArrayItem` in signup pages |

**Architectural Style:** The codebase follows **React functional component patterns** + **Next.js App Router conventions**. This means:
- Pages are `export default function Page()`
- API routes are `export async function GET/POST/PATCH/DELETE()`
- Components are arrow functions
- State management is hooks-based (Zustand)

**This is standard for modern Next.js projects** — OOP is not commonly used in this ecosystem.

### 7.2 Hardcoded Values Audit

| File | Hardcoded Value | Concern | Recommendation |
|---|---|---|---|
| `api/discover/route.ts` | `LIMIT 30` | Low — reasonable default | Make configurable via query param |
| `api/business/dashboard/route.ts` | `platform: 'Instagram'` | Medium — mocks data | Should come from actual collab data |
| `api/business/dashboard/route.ts` | `reach: '10K'` | Medium — mocks data | Same issue |
| `api/influencer/dashboard/route.ts` | `profile_views: 0` | Medium — mocks data | Implement view tracking |
| `api/influencer/dashboard/route.ts` | `saved_by_businesses: 0` | Medium — mocks data | Implement shortlist tracking |
| `api/influencer/dashboard/route.ts` | All `trends.*: 0` | Medium — mocks data | Implement trend calculations |
| `api/admin/seed/route.ts` | `ADMIN_EMAIL = 'admin@influnet.com'` | Low — dev only | Accept as parameter |
| `components/landing/*.tsx` | Copy text | Low — expected in marketing pages | Externalize to content files |
| `signup/influencer/page.tsx` | `NICHES`, `LANGUAGES`, `COLLAB_TYPES`, `PRICE_TIERS`, `INDIAN_STATES` | Medium — hardcoded arrays | Move to config/constants file |
| `signup/business/page.tsx` | Industry options | Medium — same issue | Move to config/constants file |

**Country-Specific Assumptions:**
- `INDIAN_STATES` array hardcodes India as the only location option
- `PRICE_TIERS` uses ₹ (Indian Rupee) — not configurable per region
- This is acceptable for v1 (India-focused) but limits global expansion

### 7.3 Coupling & Cohesion

**Good Practices:**
- ✅ API routes are self-contained (auth, validation, logic in one file)
- ✅ Zustand stores are single-purpose (auth, messaging, notifications)
- ✅ Database access centralized in Supabase client pattern
- ✅ Role-based logic in discovery module (clean branching)

**Problem Areas:**
| Pattern | Issue | Severity |
|---|---|---|
| Inline Supabase client creation | Every API route creates its own client (repeated ~40 lines) | Medium — violates DRY |
| Dynamic imports | `const { createClient } = await import('@supabase/supabase-js')` in every route | Low — but unusual pattern |
| Collab accept creates project + conversation | Two downstream side effects in PATCH handler | Medium — should be transactional |
| Auto-heal in GET /api/projects | Side effect in read operation violates CQRS | High — GET should not modify data |
| Messages store fetches all messages | No pagination; grows unbounded | Medium — OOM risk for active chats |
| `as any` type casts | Widespread `const p = profile as any` pattern | Medium — defeats TypeScript safety |

### 7.4 Test Coverage Gap

| Area | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| Auth (login, signup) | ❌ None | ✅ `tests/integration/api.test.ts` | ❌ None |
| Profile (CRUD) | ❌ None | ✅ `tests/integration/api.test.ts` | ❌ None |
| Discovery | ❌ None | ❌ None | ❌ None |
| Collab Requests (send/accept) | ❌ None | ✅ `tests/matchmaking.js` (partial) | ❌ None |
| Projects | ❌ None | ❌ None | ❌ None |
| Messaging | ❌ None | ❌ None | ❌ None |
| Dashboard | ❌ None | ❌ None | ❌ None |
| Admin | ❌ None | ❌ None | ❌ None |
| API routes authorization | ❌ None | ✅ `tests/integration/api.test.ts` | ❌ None |
| Zustand stores | ✅ `tests/unit/stores.test.ts` | ❌ None | ❌ None |
| Zod validation schemas | ✅ `tests/unit/validators.test.ts` | ❌ None | ❌ None |

**Existing test:** `tests/matchmaking.js` — Tests collab request + accept flow via direct Supabase API calls. Uses `.env` vars for connection. Tests: login, create users, send request, accept request, verify project + conversation created.

---

## 8. Security Architecture

### Authentication
- Supabase Auth handles password hashing and JWT issuance
- Tokens stored in `localStorage` (client-side)
- Server validates tokens via `supabase.auth.getUser()` in every API route
- 401 responses for missing/invalid tokens
- 403 responses for role violations

### Authorization (RLS)
- Row-Level Security enabled on all tables
- Policies enforce: own-row access, participant access, admin access
- Admin check uses `is_admin()` SECURITY DEFINER function (avoids RLS recursion)
- See: `supabase/migrations/038_add_admin_role.sql`

### API Authorization Patterns
```
Every API route:
1. Extract Authorization header
2. Create Supabase client with user's JWT
3. Call supabase.auth.getUser() to verify
4. Call supabase.from('profiles').select('role') to verify role
5. Perform operation with same client (RLS enforces row-level)
```

### Known Security Gaps
| Issue | Risk | Mitigation |
|---|---|---|
| localStorage token storage | XSS vulnerability | Use httpOnly cookies (future) |
| No rate limiting | Brute force / abuse | Supabase project-level limits available |
| No IP allowlisting | Admin endpoint exposure | Dev-only guard on seed endpoint |
| No audit logging | Cannot trace admin actions | Add audit table (future) |
| No CSRF protection | Cross-site request forgery | Next.js Server Actions have CSRF built-in (future) |

---

## 9. CI/CD & Deployment Pipeline

The codebase implements a complete 4-tier branch-to-environment lifecycle:
1. **Continuous Integration (`ci.yml`)**: Runs on all pushes and PRs to `dev`, `main`, and feature branches. Performs type checking, linting, unit tests, integration tests, and full E2E matchmaking tests.
2. **Dev Deployment (`deploy-dev.yml`)**: Automatically triggers on pushes to `dev` to compile and deploy preview builds to Vercel.
3. **Staging Deployment (`deploy-staging.yml`)**: Automatically triggers on pushes to `staging`. Builds a optimized multi-stage Docker container (using Next.js standalone output tracing), pushes it to Azure Container Registry (ACR), deploys it to the Staging Azure App Service, and executes the post-deploy smoke test (`scripts/smoke.mjs`).
4. **Production Deployment (`deploy-prod.yml`)**: Triggers on pushes to `main`. It promotes the exact container image built and tested in staging (by pulling and re-tagging `staging-latest` to `prod-latest`), deploys it to the Production Azure App Service under a manual-approval gate environment, and executes the post-deploy smoke test.
5. **Security & Dependency Audits (`codeql.yml` & `dependabot.yml`)**: CodeQL static analysis runs on all PRs to scan for vulnerabilities. Dependabot runs weekly scans to create dependency update PRs.

### Deployment Health Check & Smoke Test
- **`/api/health`**: A lightweight server endpoint returning `200 OK` if the app is active and can reach the Supabase database.
- **`scripts/smoke.mjs`**: A Node test runner executing against the newly deployed environment. Asserts health check response contents, resolves landing and auth login routes, and validates unauthorized redirect responses for private routes.


---

*This document was generated by AI-assisted codebase analysis. For questions or corrections, contact the Influnet development team.*
