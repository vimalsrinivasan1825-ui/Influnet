# Influnet — End-to-End Flow Analysis

> **Living document.** Last updated: July 29, 2026  
> **Purpose:** Map every user journey end-to-end so we can write comprehensive Playwright E2E tests and identify UX gaps before launch.  
> **Status:** Analysis complete — ready for E2E test scripting.

---

## Table of Contents

1. [Who Uses This App](#1-who-uses-this-app)
2. [Flow 1: Creator Registration & Onboarding](#2-flow-1-creator-registration--onboarding)
3. [Flow 2: Business Registration & Onboarding](#3-flow-2-business-registration--onboarding)
4. [Flow 3: Public Profile & Discovery](#4-flow-3-public-profile--discovery)
5. [Flow 4: Collaboration Request](#5-flow-4-collaboration-request)
6. [Flow 5: Project Lifecycle (12 Stages)](#6-flow-5-project-lifecycle-12-stages)
7. [Flow 6: Project Cancellation](#7-flow-6-project-cancellation)
8. [Flow 7: Project Completion & Reviews](#8-flow-7-project-completion--reviews)
9. [Flow 8: Messaging & Notifications](#9-flow-8-messaging--notifications)
10. [Flow 9: Settings, Profile & Verification](#10-flow-9-settings-profile--verification)
11. [Flow 10: Admin Panel](#11-flow-10-admin-panel)
12. [Mobile Parity Map](#12-mobile-parity-map)
13. [Edge Cases & Gap Analysis](#13-edge-cases--gap-analysis)
14. [E2E Test Plan](#14-e2e-test-plan)

---

## 1. Who Uses This App

| Role | Label in DB | Description |
|------|------------|-------------|
| **Creator** | `influencer` | Content creator with Instagram/YouTube. Gets discovered, receives collaboration requests, delivers content. |
| **Business** | `business_owner` | Brand/company. Discovers creators, sends collaboration requests, pays for content. |
| **Admin** | `admin` | Internal platform administrator. Approves businesses, manages verification, reviews reports. |

**Key rule:** The app is invite-only via public profile links. There is **no open discovery** — users get found through their `/c/[username]` public profile link which they share on their Instagram bio, LinkedIn, etc.

---

## 2. Flow 1: Creator Registration & Onboarding

### 2.1 Entry Points

| Entry Point | Route | Who lands here |
|-------------|-------|---------------|
| Landing page | `/` → CTA → `/signup?next=/c/[username]` | Anyone |
| Public profile "Work with me" | `/c/[username]` → `/signup?next=/c/[username]` | Brand visiting a creator's public profile |
| Direct navigation | `/signup` | Anyone |

### 2.2 Role Selection

**Page:** `/signup` (static server page)

1. User sees two cards: "I'm a creator" and "I'm a business"
2. "I already have an account" link → `/login`
3. Clicking "I'm a creator" → `/signup/influencer?next=...`

### 2.3 Creator Signup Wizard (4 Steps)

**Page:** `@/components/signup/influencer-wizard` (multi-step form)

#### Step 1: Basic Info
| Field | Type | Required |
|-------|------|----------|
| Full name | Text | ✅ |
| Email | Email | ✅ |
| Password | Password (min 8 chars) | ✅ |
| Phone | Phone (optional) | ❌ |

#### Step 2: Social Links
| Field | Type | Required |
|-------|------|----------|
| Instagram handle | Text | ✅ (used for scraping) |
| YouTube channel | Text | ❌ |
| Other social links | Text array | ❌ |

**Critical path:** Instagram handle is REQUIRED for verification. The server fires a scrape job via Apify/HikerAPI during signup. If no Instagram, the creator cannot be verified.

#### Step 3: Profile Details
| Field | Type | Required |
|-------|------|----------|
| Bio | Textarea | ❌ |
| Headline | Text (max 80 chars) | ❌ |
| Niche(s) | Multi-select from list | ✅ |
| Price range | Select (budget range) | ❌ |
| Location (city/state) | Text | ❌ |
| Languages | Multi-select | ❌ |

**Niches available** (from `packages/core/src/constants.ts`):  
Tech, Fashion, Beauty, Travel, Food, Fitness, Lifestyle, Gaming, Music, Dance, Comedy, Education, Photography, Business, Sports, Health, Parenting, Automotive, Pets, Art, DIY, Home & Garden, Books, Environment, Spiritual, Finance, Social Impact, Craftsmanship, Other

#### Step 4: Audience & Preferences
| Field | Type | Required |
|-------|------|----------|
| Audience locations | Up to 5 entries with % | ❌ |
| Age ranges | Up to 4 slices with % | ❌ |
| Gender split | Up to 3 entries with % | ❌ |
| Collaboration types | Multi-select | ❌ |
| Account type | Personal / Brand / Both | ❌ |

### 2.4 Post-Signup Actions

1. **Account created** via `POST /api/auth/register` which calls `register_profile` RPC
2. **Email confirmation required** — Supabase sends confirmation email
3. **Instagram scrape triggered** — `POST /api/auth/scrape-instagram` runs (Apify/HikerAPI)
4. **Public profile link generated** — Creator sees their `/c/{username}` link on the home screen with a "Copy link" button
5. **Verification flow begins** — Creator must put the link in their Instagram bio, then click "Verify" on the app
6. **Welcome screen** — First-time creator sees onboarding tips and the public profile link prominently

### 2.5 First-Time Creator Experience (Home Screen)

After login, creators land on **`/dashboard/home`**. The home screen shows:

- **Profile card** — Name, handle, social links, niche badges
- **"Copy public link" button** — Prominent, with toast notification on copy
- **"Connect Instagram" callout** — If no Instagram snapshot exists yet (yellow warning card)
- **Analytics grid** — Followers, Engagement rate, Avg views, Subscribers (if scraped)
- **Ongoing collaborations** — Empty state with "Nothing in flight"
- **Collaboration counters** — Ongoing (0), Completed (0), Needs you (0), Awaiting them (0)
- **Audience split** — Locations, Age range, Gender (if self-reported)
- **Brand ratings** — Empty until first review
- **"Open full dashboard"** link to `/dashboard/influencer`

**UX Check:**
- ✅ Public profile link is prominent and copyable
- ✅ Instagram connection prompt is visible
- ⚠️ The wizard doesn't clearly explain that the link must go into Instagram bio
- ⚠️ "Connect Instagram" card shows even when scraping is already in progress

---

## 3. Flow 2: Business Registration & Onboarding

### 3.1 Entry Points

| Entry Point | Route | Notes |
|-------------|-------|-------|
| Public profile "Work with me" | `/c/[username]` → `/signup?next=/c/[username]` | Most common — brand clicks creator's public link |
| Direct signup | `/signup` → `/signup/business` | Less common |
| Login | `/login` | Returning business |

### 3.2 Business Signup Wizard (4 Steps)

#### Step 1: Basic Info
| Field | Required |
|-------|----------|
| Company name | ✅ |
| Email | ✅ |
| Password | ✅ |
| Phone | ❌ |

#### Step 2: Business Profile
| Field | Required |
|-------|----------|
| Industry | ✅ (select from list) |
| Business type | ❌ (select: Agency / Brand / Startup / Other) |
| Website | ❌ |
| Company tagline | ❌ |
| Logo URL | ❌ (upload via Cloudinary) |

#### Step 3: Preferences
| Field | Required |
|-------|----------|
| Collaboration types interested in | ❌ |
| Budget range | ❌ |
| Preferred niches | ❌ |

#### Step 4: Review & Submit
- Review all info
- Agree to terms
- Submit → account enters **"pending approval"** state

### 3.3 Business Approval Flow

1. Business signs up → `approval_status = 'pending'`
2. Business sees **`/pending`** screen with "Your account is under review" message
3. Admin reviews in **Admin Panel** (`/dashboard/admin`)
4. Admin clicks "Approve" or "Reject"
5. If approved:
   - Business receives email notification
   - Business can now log in and access dashboards
   - First login redirects to `/dashboard` (business home)
6. If rejected:
   - Business receives email notification
   - Account stays in pending state
   - Can contact support via email

### 3.4 Business First Login

After approval, business lands on **`/dashboard`**. The home screen shows:

- **Profile card** — Company name, industry, logo
- **Stats counters** — Active collabs (0), Completed (0), Pending requests (0), Pipeline value (₹0)
- **Weekly spend chart** — Empty
- **Pipeline data** — Empty
- **Recent collaborations** — Empty
- **"Discover creators" CTA** — Prominent button to `/dashboard/discover`

**UX Check:**
- ✅ Business clearly sees discovery as the next action
- ✅ Stats show zeros clearly — not confusing
- ⚠️ No onboarding tutorial/wizard on first login
- ⚠️ No explanation of what "Pipeline value" means

---

## 4. Flow 3: Public Profile & Discovery

### 4.1 Public Profile (`/c/[username]`)

**Server component** — renders server-side for SEO/social sharing.

**What it shows:**
- **Header** — Avatar, name, headline, verification badge
- **Social stats** — Instagram followers, engagement rate, avg views
- **YouTube stats** — Subscribers, avg views (if connected)
- **Recent posts grid** — Up to 6 Instagram thumbnails with view/like counts
- **Latest videos** — Up to 6 YouTube thumbnails
- **Audience split** — Self-reported locations, ages, genders with progress bars
- **Portfolio/Proof of work** — Delivered projects, brand collaborations
- **Past collaborations** — Auto-generated list of brands worked with (from completed projects)
- **Reviews** — Star rating, count, recent review excerpts
- **CTA button** — "Work with me" (changes based on viewer state):

| Viewer State | CTA Label | Destination |
|-------------|-----------|-------------|
| Anonymous | Work with me | `/signup?next=/c/[username]` |
| Signed-in business, no prior contact | *(same)* | `/dashboard/requests/new?to={userId}` |
| Signed-in business, pending request | Request sent | `/dashboard/requests` |
| Signed-in business, active project | View project | `/dashboard/projects/{id}` |
| Signed-in creator (owner) | Edit profile | `/dashboard/settings` |
| Other signed-in | Back to dashboard | `/dashboard` |

### 4.2 Discovery (`/dashboard/discover`)

**For businesses only.** Shows a list of creators. Currently:
- **Flat list** — No search, no filters, no pagination (LIMIT 30)
- **Not paginated** — Quality collapses past a few dozen users
- **Only shows creators** who have completed their profile

**Note:** The discover page currently returns a 404 and is disabled in the sidebar for most users. The primary discovery mechanism is the **public profile link**.

### 4.3 Verification & Badge

**Verification process:**
1. Creator sets Instagram handle in profile
2. System scrapes Instagram data (followers, posts, engagement)
3. Creator copies their `/c/[username]` link
4. Creator pastes the link into their Instagram bio
5. Creator clicks "Verify" in the app
6. System checks the Instagram bio for the link
7. If found → **verified badge** appears on public profile + home card
8. If not found → "Verification pending" state

**Verification statuses:** `unverified` → `pending` → `verified` → `failed`

**UX Check:**
- ✅ Verification badge clearly visible on profile and home
- ✅ Auto-collaborations are from completed projects (can't be faked)
- ⚠️ No "how to verify" tutorial/guide shown to new creators
- ⚠️ Verification step instructions are minimal

---

## 5. Flow 4: Collaboration Request

### 5.1 Sending a Request (Business → Creator)

**Trigger:** Business clicks "Work with me" on a creator's public profile.

**Path flow:**
1. Business lands on `/dashboard/requests/new?to={creatorUserId}`
2. Form appears with:
   - Creator's name/avatar (pre-filled from profile)
   - Project title (required)
   - Budget range/initial offer (required)
   - Description/message to creator (required)
   - Timeline expectations (optional)
3. Business fills form and clicks "Send request"
4. `POST /api/collabs` → creates `collab_requests` row
5. Business sees success toast, option to "Go to requests" or "Back to dashboard"

**Validation:**
- Server enforces: `from_user_id` must be a business, `to_user_id` must be a creator
- Can't send duplicate pending request to same creator
- Can't send request if already in an active project together
- Rate limited: `collabs:create` (10 req/60s per user)

### 5.2 Receiving & Responding (Creator side)

**Creator sees request in:**
- Requests screen (`/dashboard/requests`) — shows with "Awaiting reply" badge
- Home screen counter — "Needs you" count includes pending requests
- Push notification — if Expo push token registered
- In-app notification bell — shows unread count

**Creator actions:**

| Action | Result |
|--------|--------|
| **Accept** | Calls `PATCH /api/collabs { id, status: 'accepted' }` → runs `accept_collab_request` RPC → creates collab_request, campaign_project, and conversation atomically |
| **Decline** | Calls `PATCH /api/collabs { id, status: 'declined' }` → request status changes, business sees "Declined" badge with trash icon |
| **Discuss** | Can message via the conversation screen before deciding |

### 5.3 Post-Acceptance

When a creator accepts:
1. **Campaign project created** — Initial project with `status: 'in_discussion'`, stage `collaboration_started`
2. **Conversation created** — A Stream Chat conversation is created between both parties
3. **Both parties see** the project in their respective dashboards with status "In discussion"
4. **Notifications sent** to both parties
5. **Activity log** records the acceptance event

### 5.4 Terms Discussion & Project Creation

After acceptance, the conversation phase begins:
1. Business and creator discuss terms in the Stream Chat
2. Business proposes terms via the "Create project" form in the conversation
3. Form includes: title, deliverables, budget (advance + final), timeline, milestones
4. Creator reviews and either accepts or proposes changes
5. Once both agree → the project moves from `in_discussion` to active status
6. Project is fully created with the agreed terms

---

## 6. Flow 5: Project Lifecycle (12 Stages)

### 6.1 Stage Definitions

| # | Stage Key | Actor | Description |
|---|-----------|-------|-------------|
| 1 | `collaboration_started` | Either | Project created, collaboration begins |
| 2 | `project_discussion` | Either | Discussing deliverables and timeline |
| 3 | `advance_payment` | **Business** | Business pays advance (deposit) |
| 4 | `content_planning` | **Creator** | Creator plans content strategy |
| 5 | `content_confirmation` | **Business** | Business approves content concept |
| 6 | `shooting_in_progress` | **Creator** | Creator shoots/records content |
| 7 | `editing_in_progress` | **Creator** | Creator edits and refines content |
| 8 | `sent_for_review` | **Business** | Content sent for business review |
| 9 | `revisions` | **Creator** | Creator makes requested changes |
| 10 | `final_approval` | **Business** | Business gives final OK |
| 11 | `final_payment` | **Business** | Business pays remaining amount |
| 12 | `project_completed` | Either | Project is signed off as complete |

**Allowed transitions:**
```
collaboration_started → project_discussion
project_discussion    → advance_payment
advance_payment       → content_planning
content_planning      → content_confirmation
content_confirmation  → shooting_in_progress
shooting_in_progress  → editing_in_progress
editing_in_progress   → sent_for_review
sent_for_review       → revisions OR final_approval
revisions             → sent_for_review
final_approval        → final_payment
final_payment         → project_completed
```

### 6.2 Stage Advancement Flow

**Who can advance:** Defined by `STAGE_ACTOR`:
- `either` — Both business and creator can advance
- `business` — Only the project owner (business) can advance
- `creator` — Only the counterparty (influencer) can advance

**API:** `PATCH /api/projects/{id}` with `{ stage: '*', action: 'advance' }`

**Stage sign-off mechanism:**
1. The actor clicks "Advance to next stage" button
2. System checks: all required checklist items for current stage are complete
3. If items are blocking → error prompt showing incomplete items
4. If all clear → actor's sign-off is recorded (`owner_signoff_at` or `creator_signoff_at`)
5. **Mutual sign-off stages** require BOTH parties to sign off before advancing
6. When both have signed off → stage advances automatically

**Mutual sign-off stages** (both must agree):  
`final_approval`, `advance_payment`, `final_payment` — and any stage where money changes hands.

**Sign-off screen** (web): `/dashboard/projects/{id}`
- Shows stage timeline with completed/stuck stages clearly indicated
- Only the current stage has action buttons
- Other stages are read-only

**Sign-off screen** (mobile): `app/projects/[id]/stage/[stage]`
- Shows checklist items with toggle
- Shows stage entries/notes
- "Advance" button at bottom
- Similar restrictions as web

### 6.3 Stage Checklist Items

**Each stage has blocking items** defined in `lib/project-stage-items.ts`:
- Items are toggleable checkboxes
- `POST /api/projects/{id}/stage-items` to create custom items
- `PATCH /api/projects/{id}/stage-items` to toggle `done` status
- Blocking items prevent stage advancement until complete

**Default blocking items per stage:**

| Stage | Required Items |
|-------|---------------|
| collaboration_started | Terms agreed, Budget set |
| project_discussion | Timeline confirmed, Deliverables defined |
| advance_payment | Payment method set, Advance amount confirmed |
| content_planning | Content brief submitted, Mood board approved |
| content_confirmation | Concept approved by brand |
| shooting_in_progress | Location/schedule confirmed |
| editing_in_progress | Raw footage submitted |
| sent_for_review | Draft delivered to brand |
| revisions | Revision notes addressed |
| final_approval | Final content approved |
| final_payment | Final invoice submitted, Payment confirmed |
| project_completed | All deliverables handed over, Both parties sign off |

### 6.4 Payments (Razorpay Integration)

**Two payment stages:**
1. **Advance payment** (Stage 3) — Deposit, configured as % of total
2. **Final payment** (Stage 11) — Remaining balance on completion

**Payment flow:**
1. `POST /api/projects/{id}/payments` → creates Razorpay order
2. `PaymentGate` component opens Razorpay checkout
3. Razorpay handles the card/UPI/netbanking UI
4. Webhook (`/api/webhooks/razorpay`) confirms payment
5. Payment marked as `completed` in DB
6. If advance payment is verified → stage automatically advances
7. Receipt/transaction record stored in `project_payments` table

**Payment validation:**
- Payment amounts are server-derived, never client-supplied (security)
- Can't pay more than the agreed budget
- Can't skip advance payment stage
- Refund handling: Razorpay API for partial/full refunds

### 6.5 Change Requests

**Purpose:** Allow either party to propose changes to project terms.

**API:** `POST/GET/PATCH /api/projects/{id}/change-requests`

**Flow:**
1. User clicks "Propose change" on project detail screen
2. Form opens with editable fields: title, deliverables, budget, advance amount, due date
3. User changes one or more fields and submits
4. Change request created with status `pending` and diff of changes
5. Other party sees notification + change request in the project page
6. Other party can **Accept** or **Reject**
7. If accepted → project terms are updated
8. If rejected → change request is closed with reason

**Mobile parity:** ✅ Implemented in `components/project-change-requests.tsx`

### 6.6 Project Activity Timeline

**API:** `GET /api/projects/{id}/activity`

**Records:**
- Stage advancements (who, when, from/to)
- Checklist items toggled
- Change requests proposed/resolved
- Payments made
- Sign-offs recorded
- Cancellations
- Review submissions

**Displayed on:** Project detail page (web) and project screen (mobile)

### 6.7 Kanban Board (Web Only)

**Purpose:** Project management workspace within each project.

**Features:**
- Drag-and-drop cards across columns (by stage)
- Card colors, due dates, meeting links
- Column-level actions (add card, clear column)
- Resize cards vertically (span multiple dates)
- Gantt-like timeline across columns

**Note:** The Kanban is a visual supplement — it doesn't control stage advancement. Stage advancement only happens through the timeline/sign-off UI.

---

## 7. Flow 6: Project Cancellation

### 7.1 Cancellation Flow

**Two types of cancellation:**
1. **Mutual cancellation** — Both parties agree to cancel
2. **Admin cancellation** — Admin forcefully cancels (for policy violations)

**Mutual cancellation flow:**
1. Either party clicks "Request cancellation" on project page
2. A reason must be selected from predefined list:
   - Timeline issues
   - Budget disagreement
   - Quality concerns
   - Changed requirements
   - Communication issues
   - Personal reasons
   - Other (with free text)
3. Cancellation request sent to other party
4. Other party reviews and **Accepts** or **Rejects**
5. If accepted → project status changes to `cancelled`
6. If rejected → project continues, cancellation request is closed
7. Cancellation records are stored (who initiated, reason, resolution)

**15-day retention:**
- `deleted_at` column on `campaign_projects`
- When cancelled, `deleted_at = NOW() + 15 days`
- Project remains visible for 15 days after cancellation
- After 15 days, project is hidden from lists (but not deleted from DB)
- Both parties can still view the cancelled project during this window

**Cancelled project UX:**
- **Web:** Red/danger-themed banner with cancellation reason, read-only view, no action buttons, ActivityTimeline still visible but read-only
- **Mobile:** Red-tinted UI (danger palette from `deal-state-style.ts`), read-only, no stage advancement buttons
- **API:** All PATCH endpoints check for `cancelled` status and return 409

### 7.2 Deletion Hardening

The following API routes check for cancelled/deleted status and block mutations:
- `PATCH /api/projects/{id}` — Status check before any update
- `PATCH /api/projects/{id}/stage-items` — Block toggle if cancelled
- `POST /api/projects/{id}/payments` — Block payment if cancelled
- `POST /api/projects/{id}/change-requests` — Block proposals if cancelled

---

## 8. Flow 7: Project Completion & Reviews

### 8.1 Completion Flow

1. Final payment confirmed (Stage 11 → 12)
2. Both parties sign off on project completion
3. Project status becomes `completed`
4. `completed_at` timestamp recorded
5. Project added to **both** parties' portfolios
6. Both parties receive notification

### 8.2 Review Submission

**Who can review?**
- Business can review the creator (rate the creator's work)
- Creator can review the business (rate the collaboration experience)
- Must have an active or completed project together
- One review per project per party (cannot re-review)

**Review form:**
- Star rating (1-5)
- Comment/feedback (optional, max 2000 chars)
- Submitted via `POST /api/projects/{id}/reviews`

**Where reviews appear:**
- **Creator's public profile** (`/c/[username]`) — Visible to anyone
- **Creator's home** (`/dashboard/home`) — In the "Brand ratings" section
- **Business reviews** are internal (not public)

**Mobile parity:** ✅ `components/project-reviews.tsx` with `StarPicker` — already wired into project detail screen

### 8.3 Portfolio & Proof of Work

**Automatic additions:**
- Completed projects automatically appear in the creator's portfolio
- Brands the creator worked with appear as "past collaborations"

**Manual entries:**
- Creators can add manual portfolio entries (external links)
- `POST /api/portfolio` — Add entry with URL, title, brand name, description
- `PATCH /api/portfolio` — Toggle visibility on public profile
- `DELETE /api/portfolio` — Remove entry

**Visibility control:**
- Portfolio section can be toggled on/off on public profile
- Individual entries can be hidden without deleting

---

## 9. Flow 8: Messaging & Notifications

### 9.1 Stream Chat Integration

**Architecture:**
- Powered by [Stream Chat](https://getstream.io/chat/) (hosted service)
- Server generates Stream tokens via `POST /api/stream/token`
- Channels are created per conversation
- Webhook receives events for push notifications
- Stream's UI kit handles the chat interface

**Chat features:**
- Text messages, image attachments
- Read receipts
- Typing indicators
- Message history (capped at 200 per fetch)
- Conversation list with latest message preview
- Partner name and avatar in chat header

**Unread badge:**
- `notifications` table tracks unread messages per conversation
- Bell icon in header shows total unread count
- Tab badges on Requests/Projects tabs

### 9.2 Push Notifications

**Expo Push Notifications** for mobile:

| Event | Notification Type | Recipient |
|-------|------------------|-----------|
| New collaboration request | `collab_request` | Creator |
| Request accepted | `collab_accepted` | Business |
| Request declined | `collab_declined` | Business |
| Stage advanced | `stage_advanced` | Both parties |
| Payment required | `payment_required` | Business |
| Payment received | `payment_received` | Creator |
| New message | `message` | Chat recipient |
| Change request proposed | `change_request` | Both parties |
| Project completed | `project_completed` | Both parties |
| Project cancelled | `project_cancelled` | Both parties |

**Token management:**
- Token registered via `POST /api/profile/push-token` on app launch
- Token cleared on sign-out (prevents stale pushes)
- Device tokens stored in `expo_push_tokens` table

### 9.3 In-App Notification Bell

- Located in dashboard header (web) / top bar (mobile)
- Shows unread count badge
- Click to open notification panel/feed
- Mark individual notifications as read
- Poll-based (60s interval) + Realtime fast path
- Web uses `useNotificationSummary` hook, mobile uses `notification-summary.ts`

---

## 10. Flow 9: Settings, Profile & Verification

### 10.1 Settings Page

**Access:** `/dashboard/settings` (web) / `app/settings.tsx` (mobile)

**Sections:**
1. **Profile** — Edit name, bio, headline, location
2. **Social links** — Instagram handle, YouTube handle, other links
3. **Profile details** — Niche, price range, languages, collaboration types
4. **Audience** — Self-reported audience demographics (locations, ages, genders)
5. **Public profile** — Username (slug), visibility toggles for sections
6. **Instagram scraping** — Trigger rescrape, see last fetch date
7. **Verification** — Start verification process, check status
8. **Notifications** — Push notification preferences
9. **Blocked accounts** — View/manage blocked users
10. **Account deletion** — Request account deletion (with confirmation flow)
11. **Sign out** — Logout button

### 10.2 Profile Editing

**Fields that affect public profile:**
- Avatar/photo (upload via Cloudinary)
- Bio
- Headline
- Niche(s)
- Price range
- Location
- Languages
- Instagram handle
- YouTube channel
- Username (slug for `/c/{username}`)

**Visibility toggles** (per section on public profile):
- Instagram posts grid
- YouTube videos
- Portfolio items
- Reviews/ratings
- Audience demographics

### 10.3 Instagram Scraping

**Trigger:**
- Automatic on signup
- Manual via "Refresh Instagram data" button in settings
- Rate limited to 5 requests per IP per minute

**Data scraped:**
- Follower count
- Post count
- Average views per post
- Engagement rate
- Recent posts (up to 6 thumbnails with views/likes)
- Bio text (for verification link check)

**Service used:** Apify/HikerAPI (depends on configuration)

### 10.4 YouTube Scraping

**Trigger:**
- When YouTube handle is set in profile
- Manual via "Refresh YouTube data" button

**Data scraped:**
- Subscriber count
- Average views
- Recent videos (up to 6 thumbnails with views/likes/title)

---

## 11. Flow 10: Admin Panel

### 11.1 Admin Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard/admin` | Main admin home — stats, pending actions |
| Users | `/dashboard/admin/users` | View/manage all users |
| Businesses | `/dashboard/admin/businesses` | Approve/reject business accounts |
| Creators | `/dashboard/admin/creators` | View creator accounts, manage verification |
| Projects | `/dashboard/admin/projects` | View all projects, force cancel |
| Reports | `/dashboard/admin/reports` | Review user reports |
| Verification | `/dashboard/admin/verification` | Manage creator verification requests |
| Settings | `/dashboard/admin/settings` | Platform-wide settings |

### 11.2 Admin Actions

| Action | Endpoint | Description |
|--------|----------|-------------|
| Approve business | `POST /api/admin/approve-business` | Sets `approval_status = 'approved'` |
| Reject business | `POST /api/admin/reject-business` | Sets `approval_status = 'rejected'` |
| Force cancel project | `POST /api/admin/cancel-project` | Forcefully cancels a project (with reason) |
| Manage user roles | `PATCH /api/admin/users/{id}` | Change user role |
| View reports | `GET /api/admin/reports` | List user-submitted reports |
| Resolve report | `PATCH /api/admin/reports/{id}` | Mark report as resolved |
| Verify creator | `POST /api/admin/verify-creator` | Manually verify a creator account |

### 11.3 Admin API Security

- All admin routes use `withAdmin` helper
- Requires `service_role` Supabase client
- Role must be `admin` in profiles table
- Rate limited separately from user routes

---

## 12. Mobile Parity Map

### 12.1 Screen Coverage

| Web Screen | Mobile Screen | Status |
|-----------|--------------|--------|
| `/login` | `app/(auth)/login.tsx` | ✅ Complete |
| `/signup` | `app/(auth)/signup/index.tsx` | ✅ Complete |
| `/dashboard/home` (creator) | `app/(tabs)/home.tsx` | ✅ Complete |
| `/dashboard` (business) | `app/(tabs)/home.tsx` | ✅ Complete |
| `/dashboard/projects` | `app/(tabs)/projects.tsx` | ✅ Complete |
| `/dashboard/projects/{id}` | `app/projects/[id]/index.tsx` | ✅ Complete |
| Stage detail | `app/projects/[id]/stage/[stage].tsx` | ✅ Complete |
| `/dashboard/requests` | `app/(tabs)/requests.tsx` | ✅ Complete |
| Request detail | `app/requests/[id].tsx` | ✅ Complete |
| `/dashboard/messages` | `app/(tabs)/messages.tsx` | ✅ Complete |
| Inside conversation | conversational view (app/_layout push) | ✅ Complete |
| `/dashboard/settings` | `app/settings.tsx` | ✅ Complete |
| `/dashboard/profile` | `app/(tabs)/profile.tsx` | ✅ Complete |
| Change requests | `components/project-change-requests.tsx` | ✅ Complete (wired into project detail) |
| Reviews | `components/project-reviews.tsx` | ✅ Complete (wired into project detail) |
| `/dashboard/discover` | ❌ Not available | ⚠️ Breakable — discover is disabled on web too |
| `/dashboard/connections` | ❌ Not available | ⚠️ Planned |
| Admin panel | ❌ Not available | ❌ Not needed for mobile |
| Public profile (`/c/[username]`) | WebView or native | ✅ Native render |
| Kanban board | ❌ Not available | ⚠️ Desktop-only feature |
| `/dashboard/activity` | ❌ Not available | ⚠️ Minor — not yet built on web either |
| Business-specific dashboard | `home.tsx` handles both | ✅ Complete |

### 12.2 Mobile-Specific Features

| Feature | Description |
|---------|-------------|
| Push notifications | Expo Push — registered on login, cleared on logout |
| Realtime updates | Supabase Realtime for collab_requests, projects, profiles, blocks, notifications |
| 60s poll fallback | `notification-summary.ts` polls on interval for badge counts |
| Pull-to-refresh | All list screens support pull-to-refresh |
| App state handling | Realtime reconnects on foreground |
| Sign-out safety | Coordinated teardown: stop realtime → clear push token → disconnect Stream → clear cache → sign out |
| Deep linking | Public profile links can open the mobile app |

### 12.3 Mobile Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No Instagram verification flow | Creator can't verify from mobile | Medium |
| No profile edit (inline) | Must go to web settings | Low (app/settings.tsx covers basics) |
| No Kanban board | Complex project management only on web | Low (desktop-only feature) |
| No admin panel | Admin actions only on web | Very Low |
| No discover page | Matching web behavior (web is disabled too) | None |

---

## 13. Edge Cases & Gap Analysis

### 13.1 Identified Edge Cases

| # | Edge Case | Current Behavior | Should Fix? |
|---|-----------|-----------------|-------------|
| EC-01 | Business sends request to creator, creator deletes account | Request stays pending forever | Low — rare, handle via admin |
| EC-02 | Both parties try to advance stage simultaneously | First one gets through, second gets 409 | ✅ Handled |
| EC-03 | Payment initiated but webhook never arrives | Payment shows as pending | Medium — add timeout/webhook health check |
| EC-04 | Instagram bio link check times out | Verification fails | ✅ Handled (timeout fallback) |
| EC-05 | Creator changes Instagram handle mid-project | Old handle still in profile | Medium — should re-scrape |
| EC-06 | Business approved → logs in → no projects yet | Shows empty state with discover CTA | ✅ Handled |
| EC-07 | Two browsers, same account, one signs out | Other browser session stays valid | ✅ Handled via 401 interceptor |
| EC-08 | Project cancelled → both parties try to act | All mutations return 409 | ✅ Hardened |
| EC-09 | Payment succeeds → screen doesn't refresh | User sees "pending" until manual refresh | Medium — add Realtime event for payments |
| EC-10 | User blocks someone mid-conversation | Conversation stays open but no new messages | ✅ Block check in Stream chat |
| EC-11 | 15 days pass, cancelled project disappears | `deleted_at` filter hides it from lists | ✅ Implemented |
| EC-12 | Creator has no Instagram | Can't be verified, no social stats shown | ✅ Shows warning card instead |

### 13.2 UX Improvement Suggestions

| # | Issue | Suggestion |
|---|-------|-----------|
| UX-01 | No onboarding tutorial after signup | Add a 3-step walkthrough on first login (for both roles) |
| UX-02 | Creator doesn't know to copy link to Instagram bio | Add tooltip/guide explaining the verification process step-by-step |
| UX-03 | Business sees "Pipeline value" with no explanation | Add tooltip: "Total value of all ongoing collaborations" |
| UX-04 | Change request diff is hard to read | Add visual diff highlighting (green for added, red for removed) |
| UX-05 | Discover page is disabled with 404 | Either remove sidebar link or show "Coming soon" placeholder |
| UX-06 | No email notifications for critical events | Add transactional emails (request received, payment confirmed) |
| UX-07 | Kanban board is overwhelming on first use | Add empty state with "Create your first card" CTA |
| UX-08 | Mobile settings doesn't show Instagram connect flow | Add inline Instagram connection on mobile |
| UX-09 | No way to report a user from mobile | Add report action to profile overflow menu |
| UX-10 | Cancellation reason list might not cover edge cases | Add "Other" with free text + admin review for unusual cases |

### 13.3 Security Considerations

| # | Concern | Current State |
|---|---------|---------------|
| S-01 | Rate limiting on auth endpoints | ✅ `auth:register` (10/60s), `auth:scrape-instagram` (5/60s) |
| S-02 | Rate limiting on API routes | ✅ Added to 9 critical routes |
| S-03 | JWT session management | ✅ Supabase Auth with 1hr token refresh |
| S-04 | PII column lockdown | ✅ Migration 048 — profile queries mask sensitive fields |
| S-05 | Admin role enforcement | ✅ `withAdmin` helper + `service_role` client |
| S-06 | Request direction enforcement | ✅ Business → Creator only (server 403) |
| S-07 | Duplicate request prevention | ✅ Server-side check before creation |
| S-08 | Payment amount integrity | ✅ Server-derived, never client-supplied |
| S-09 | File upload validation | ✅ Cloudinary upload via signed URL |
| S-10 | Unauthorized handler | ✅ 401 intercepts clear session + redirect |

---

## 14. E2E Test Plan

### 14.1 Prerequisites

**Before running E2E tests:**
1. Local dev server running (`npm run dev` in `apps/web`)
2. Supabase local instance or linked remote database
3. Test creator account with real Instagram handle (or mock scraping)
4. Test business account (pre-approved)
5. Admin account for approval flow
6. Playwright installed (v1.62.0+)

**Test data needed:**
- A creator's Instagram handle (for scraping)
- A YouTube channel (optional)
- An email for the business account
- Razorpay test API keys (for payment flow tests)

### 14.2 Test Scenarios

#### Scenario 1: Creator Full Onboarding
```
1. Navigate to /signup
2. Click "I'm a creator"
3. Fill Step 1: name, email, password
4. Fill Step 2: Instagram handle
5. Fill Step 3: bio, niche, price range
6. Fill Step 4: audience demographics
7. Submit → verify redirect to /dashboard/home
8. Verify: profile card visible, public link shown
9. Copy public link → verify clipboard
10. Verify Instagram connect prompt visible
```

#### Scenario 2: Business Full Onboarding
```
1. Navigate to public profile: /c/{creatorUsername}
2. Click "Work with me"
3. Select "I'm a business" → /signup/business
4. Fill company name, email, password
5. Fill industry, website, tagline
6. Set preferences and submit
7. Verify redirect to /pending
8. Log in as admin → approve business
9. Log in as business → verify /dashboard loads
```

#### Scenario 3: Collaboration Request Flow
```
1. Business navigates to creator's public profile
2. Clicks "Work with me"
3. Fills request form: title, budget, message
4. Submits → verify success toast
5. Check requests screen → verify "Awaiting reply"
6. Log in as creator
7. Check requests screen → verify incoming request
8. Accept request → verify project created
9. Verify conversation created
```

#### Scenario 4: Project Stage Advancement
```
1. Both parties on project detail page
2. Current stage: collaboration_started
3. Actor advances → next stage appears
4. Verify checklist items toggleable
5. Verify blocking items prevent advancement
6. Verify mutual sign-off stages require both parties
7. Complete all stages through to project_completed
```

#### Scenario 5: Payment Flow (Mock)
```
1. Reach advance_payment stage
2. Business clicks "Make payment"
3. Razorpay checkout opens (test mode)
4. Complete payment with test card
5. Verify payment recorded
6. Verify stage advances
```

#### Scenario 6: Change Request Flow
```
1. On active project, propose a change
2. Modify budget and deliverables
3. Submit change request
4. Other party sees the request
5. Accept → verify project terms updated
6. OR Reject → verify request closed
```

#### Scenario 7: Project Cancellation
```
1. On active project, initiate cancellation
2. Select reason, submit
3. Other party sees cancellation request
4. Accept cancellation
5. Verify project shows as cancelled (red banner)
6. Verify no action buttons available
7. Verify read-only access still works
```

#### Scenario 8: Review & Completion
```
1. Complete a project (all 12 stages)
2. Business navigates to completed project
3. Submits review: rating + comment
4. Creator navigates to home screen
5. Verify rating appears in "Brand ratings" section
6. Verify public profile shows the review
```

#### Scenario 9: Profile & Verification
```
1. Creator sets Instagram handle in settings
2. Triggers scrape → verify data appears
3. Sets username → verify public profile accessible
4. Toggles section visibility → verify public profile reflects changes
5. Copies public link → verify link works when pasted in browser
```

#### Scenario 10: Messaging & Notifications
```
1. Both parties in an active project
2. Send message from one side
3. Verify message appears on other side
4. Check notification bell for unread count
5. Notification bell updates via Realtime (web) or poll (mobile)
```

### 14.3 Screenshots to Capture

| # | Screenshot | Scenario |
|---|-----------|----------|
| 1 | Landing page hero | Before test |
| 2 | /signup role selection | Scenario 1, Step 2 |
| 3 | Creator wizard Step 1 | Scenario 1, Step 3 |
| 4 | Creator wizard Step 2 (social links) | Scenario 1, Step 4 |
| 5 | Creator wizard Step 3 (profile) | Scenario 1, Step 5 |
| 6 | Creator wizard Step 4 (audience) | Scenario 1, Step 6 |
| 7 | Creator home screen (first login) | Scenario 1, Step 7 |
| 8 | Public profile /c/[username] | Scenario 2, Step 1 |
| 9 | /signup role selection (business path) | Scenario 2, Step 2 |
| 10 | Business wizard Step 1 | Scenario 2, Step 4 |
| 11 | Pending approval screen | Scenario 2, Step 7 |
| 12 | Admin approve business screen | Scenario 2, Step 8 |
| 13 | Business dashboard (first login) | Scenario 2, Step 9 |
| 14 | Collab request form | Scenario 3, Step 3 |
| 15 | Request sent confirmation | Scenario 3, Step 4 |
| 16 | Creator requests screen (incoming) | Scenario 3, Step 7 |
| 17 | Project created confirmation | Scenario 3, Step 8 |
| 18 | Project detail (stage timeline) | Scenario 4, Step 2 |
| 19 | Stage checklist items | Scenario 4, Step 4 |
| 20 | Payment screen | Scenario 5, Step 2 |
| 21 | Change request proposal form | Scenario 6, Step 2 |
| 22 | Cancellation reason selection | Scenario 7, Step 2 |
| 23 | Cancelled project (red banner) | Scenario 7, Step 5 |
| 24 | Review submission form | Scenario 8, Step 3 |
| 25 | Brand ratings on home screen | Scenario 8, Step 5 |
| 26 | Settings page | Scenario 9, Step 1 |
| 27 | Verification flow screen | Scenario 9, Step 2 |
| 28 | Messaging screen | Scenario 10, Step 2 |
| 29 | Notification bell with unread count | Scenario 10, Step 4 |
| 30 | Mobile home screen | Scenario 1 (mobile) |
| 31 | Mobile projects screen (bucketed) | Scenario 4 (mobile) |
| 32 | Mobile change request UI | Scenario 6 (mobile) |

### 14.4 Test Infrastructure

**Page objects to create:**
- `LandingPage` — landing page interactions
- `SignupPage` — role selection
- `CreatorWizardPage` — 4-step wizard
- `BusinessWizardPage` — 4-step wizard
- `LoginPage` — sign in
- `DashboardHomePage` — creator/business home
- `ProjectDetailPage` — project with stages
- `StageDetailPage` — stage checklist and actions
- `PublicProfilePage` — /c/[username] view
- `RequestsPage` — collaboration requests
- `SettingsPage` — profile settings
- `MessagesPage` — chat interface
- `AdminPage` — admin actions
- `MobileHomePage` — mobile home (Appium)

**Test runners:**
- **Web:** Playwright (v1.62.0+) with `@playwright/test`
- **Mobile:** Detox or Appium (future)

**CI integration:**
- Run on every PR via GitHub Actions
- Screenshots uploaded as artifacts
- Visual regression diff on staging

---

> **Next steps:**
> 1. Review this analysis for completeness
> 2. Create Playwright page objects per 14.4
> 3. Write test scenarios as `.spec.ts` files
> 4. Run against local dev server with test credentials
> 5. Capture screenshots at every step
> 6. Analyze UX from screenshots (using `thinker-gpt`)
> 7. Fix identified gaps
