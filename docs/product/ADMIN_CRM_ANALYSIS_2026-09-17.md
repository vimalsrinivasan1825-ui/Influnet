# Admin CRM & Analytics — Deep Analysis and Build Plan

**Date:** 2026-09-17 · **Scope:** web admin console (`/dashboard/admin/*`) and the
mobile push/in-app surfaces it has to drive · **Status:** ✅ built 2026-09-17 (migrations 152–160, dev)

**Inputs**
- The client developer's (Kesavan's) list: push notifications split by influencer/owner;
  broadcasts with text message, in-app pop-ups and tutorials; deleted users; payment details
  (pending / failed / success, subscription or renewal); OTP logs; error logs.
- Five sidebar screenshots from the client's other admin consoles (a real-estate app and a
  shop app). Their sections: Founder Dashboard, Product Analytics, Daily User/Order Metrics,
  Overview, Customer Tracking, Incomplete Signups, Buyers, Deleted Users, User Activity (+
  details), Heatmap, Web Analytics, App/Shop Analytics, Property Analytics (total / sold /
  deleted / archived), Contacts, Favourites, Pinned, Reminders, Site Visits, Sharing,
  Notifications, Commission, Payment Analytics (payments / premium subscribers / renewal
  reminders), Match System (local / global), Report Builder, CRM Added Users, Support,
  Broadcasts, Scheduled Pushes, Push Notifications, Privacy Policy, Delete Account.

**Companion docs:**
- [../architecture/ADMIN_CRM_BUILD_GUIDE.md](../architecture/ADMIN_CRM_BUILD_GUIDE.md) — conventions, traps and recipes for extending it.
- [../operations/ADMIN_CRM.md](../operations/ADMIN_CRM.md) — **how to run what was built**.

> ## ✅ BUILT — 2026-09-17
> This plan was implemented the same day: migrations **152–160** (applied on
> **dev** only), 17 new admin screens, the broadcast engine, and the mobile and
> web changes that feed them. What is built, what still needs a founder step
> (secrets, per-admin logins, iOS push, the mobile OTA), and the known limits are
> in [../operations/ADMIN_CRM.md](../operations/ADMIN_CRM.md). The estimates and
> phases below are kept as written, as the record of what was planned.

---

## 0. TL;DR

1. **The admin console already has a better base than it looks.** It has 17 pages, two
   admin tiers, a live activity feed, a creator funnel, and screens for support, reports,
   feedback, email log, audit log, rate limits, vendor kill switches and Sentry/PostHog
   read-back. The gap is **breadth of business analytics** and **anything outbound**.
   The admin cannot yet send a push, broadcast, pop-up or tutorial to anyone.
2. **Most of the analytics can come from data we already store.** Campaigns, projects,
   requests, payments, profile views, link clicks, contact reveals, saved items, pins, OTP
   sessions, email deliveries and notifications with read receipts are all in Postgres
   today, and none of them has an admin chart.
3. **Six signals are not recorded anywhere, and no amount of dashboard work can recover
   them.** Each needs a small new table first:
   - **Daily active users history.** `profiles.last_active_at` is overwritten, so yesterday's
     DAU is gone.
   - **Deleted users.** Deletion is a hard cascade. Self-deletion leaves no trace at all.
   - **Devices, platform and app version.** There is one push token per account and no
     platform or version.
   - **Push delivery and opens.** Sends are fire-and-forget with no log.
   - **Searches and matches.** Discover queries are not logged.
   - **Pending Pro checkouts.** No row is written when a Pro order is created.
4. **Push and broadcast is the largest new system.** It needs a device table, a broadcast
   table, a per-recipient delivery log, audience segments, a scheduler and a receipt poller.
   The Expo sending code in `lib/notify.ts` already works. It just only does one user at a
   time.
5. **Suggested order** (details in §8):
   - Phase 0: foundations and fixing the Overview numbers.
   - Phase 1: Kesavan's six items.
   - Phase 2: analytics depth.
   - Phase 3: CRM, report builder and rich push.

   Rough total: **8–11 developer-weeks** for one full-stack developer who knows the repo.
6. **Four issues I found while reading** are listed in §9. The worst: the Overview KPIs
   will silently stop counting once any table passes the API row cap. I have not fixed any
   of them.

---

## 1. Translating the reference consoles to Influnet

The reference apps sell properties and products. Influnet runs a two-sided marketplace:
businesses and creators meet, agree a deal, and run a 12-stage project with payment gates.
Most reference sections have a direct counterpart. A few do not apply, and copying them
would build the wrong thing.

| Reference section | Influnet equivalent | Data exists? |
|---|---|---|
| Founder Dashboard | One-screen business health: signups, activation, GMV, Pro revenue, liquidity (requests→projects) | Mostly yes |
| Overview | Existing `/dashboard/admin`. Needs fixing (see §9.1) | Yes |
| Product Analytics | Funnels for **both** sides, retention cohorts, time-to-first-project | Partly (creator funnel only) |
| Daily User Metrics | Signups / DAU / WAU / MAU per day, by role and platform | Signups yes; **DAU no** |
| Daily Order Metrics | Daily **marketplace** metrics: requests, deals, projects, payments, completions | Yes |
| Customer Tracking | Per-user lifecycle stage and timeline (signed up → verified → first request → first project → paid → repeat) | Yes (derivable) |
| Incomplete Signups | Auth users with no profile; creators stuck before ownership/verification; businesses stuck in approval | Partly |
| Buyers | **Paying businesses**: anyone who paid a project payment or bought Pro | Yes |
| Deleted Users | Tombstone list with reason, role, dates, what they had done | **No** |
| User Activity / Details | Existing Live activity feed plus per-user activity (`admin_get_user_activity`, migration 108) | Yes |
| Heatmap | (a) day × hour activity heatmap; (b) web click heatmap via PostHog | (a) **no**; (b) off by design |
| Web Analytics | PostHog pageviews, Web Vitals (already read on Observability, super admin only) | Built, needs keys |
| App Activity | Mobile DAU, sessions, platform split, app version adoption, push opt-in rate | **No** |
| Property Analytics (total/sold/deleted/archived) | **Campaigns** (draft / pending_review / live / closed / expired / removed) and **Projects** (active / completed / cancelled / manually deleted) | Yes |
| Contacts | Business contact reveals (migration 138) | Yes |
| Favourites | Saved creators and campaigns (`saved_items`, migration 123) | Yes |
| Pinned Properties | Pinned conversations (`conversation_pins`, 138) | Yes |
| Reminders | Re-engagement nudges (142) and, new, renewal reminders | Nudges yes |
| Site Visits | Creator profile views, business profile views, link-in-bio clicks | Yes |
| Sharing | Profile link shares | **No** (clicks only) |
| Notifications | In-app notification volume, read rate, by type | Yes (`notifications.read_at`) |
| Commission | **Does not apply today.** Influnet takes no cut of project payments. Revenue is Pro subscriptions. Show "Platform revenue" instead, and add commission only if the business model changes | n/a |
| Payments | Project payments (created / paid / failed / refunded) **and** Pro payments | Project yes; Pro partly |
| Premium Subscribers | Pro subscribers: active / in grace / expired / churned, MRR | Yes (current state only) |
| Renewal Reminders | Pro periods expiring in 7 / 3 / 1 days, with an automatic push and email | Derivable, no sender |
| Local / Global Match | Discover analytics: same-city vs any-city matches, zero-result searches, request conversion from search | **No** (searches not logged) |
| Report Builder | Saved, parameterised reports with CSV export | No |
| CRM Added Users | Leads the team adds by hand (brands and creators not yet signed up), with owner, stage, notes and follow-ups | No |
| Support | Existing `/dashboard/admin/support` | Yes |
| Broadcasts / Scheduled Pushes / Push Notifications | New comms system (§5) | **No** |
| Privacy Policy | Existing `/legal/[slug]` | Yes |
| Delete Account | Public account-deletion page. Google Play requires a web URL, and Apple requires in-app deletion. Mobile today only opens a `mailto:` (§9.3) | **No** |

---

## 2. What the admin console has today

### 2.1 Pages and who can see them

Admin tiers come from migrations 150/151. **Admin** is the client/business login, gated by
`withAdmin`. **Super admin** is the developer, gated by `withSuperAdmin`. Navigation lives in
`apps/web/src/components/dashboard/sidebar.tsx` (`BUSINESS_ADMIN_NAV`, `DEV_ADMIN_NAV`).

| Page | Tier | Data source | What it gives |
|---|---|---|---|
| Overview `/dashboard/admin` | admin | `/api/admin/dashboard`, loads whole tables | 4 KPI tiles, user-mix donut, request/project counts |
| Live activity | admin | `get_platform_activity`, `get_platform_pulse` (099) | Derived event feed + 24h counters |
| Analytics | admin | `get_admin_growth_series`, `get_admin_funnel`, `get_admin_support_stats` (098), `get_admin_engagement_stats` (113) | Daily area chart (≤180 d), creator funnel, support stats |
| Approvals | admin | businesses + verifications routes | Business approval, creator verification queue |
| Campaigns | admin | `/api/admin/campaigns` | Campaign list and moderation |
| Support | admin | `support_tickets`, `ticket_messages` | Ticket inbox |
| Reports | admin | `user_reports`, `report_remarks` | Moderation queue |
| Feedback | admin | `product_feedback` | Feedback inbox |
| Users (+ detail) | admin | `profiles` + `auth.users` via Admin API | List, orphaned auth accounts, last sign-in, edit, hard delete |
| Projects (+ detail) / Requests | admin | `campaign_projects`, `collab_requests` | Lists, inspect, delete |
| System health | super | `/api/admin/health` | DB, vendors, cron status |
| Vendors | super | `feature_flags` + circuit breakers (149) | Kill switches |
| Observability | super | Sentry API + PostHog query API | Unresolved errors, usage, Web Vitals |
| Rate limits | super | `rate_limit_stats` (109) | Throttling hits |
| Email | super | `email_deliveries` (100) | Email send log |
| Audit log | super | `admin_audit_log` (070) | Who did what |
| Issues & fixes | super | `admin_issues` (101) | Internal tracker |

### 2.2 Honest limits of what exists

- **Overview counts are computed in Node from full-table selects.** They are wrong past the
  API row cap (§9.1) and get slower with every signup.
- **Analytics has one chart** (signups / requests / projects / completed / tickets per day)
  and a **creator-only** funnel. It has none of the following:
  - business funnel
  - revenue or GMV
  - retention or cohorts
  - DAU/WAU/MAU
  - platform split
  - period-over-period comparison
- **Days are UTC.** `current_date` and `created_at::date` run in the database's UTC zone,
  so activity between 00:00 and 05:30 IST lands on the previous day.
- **"Completed" per day is approximated** from `updated_at`, because `campaign_projects` has
  no `completed_at` (see the comment in migration 098).
- **No CSV export** on any admin table.
- **Nothing outbound.** The only automatic outreach is the daily re-engagement nudge cron
  (`/api/cron/nudges`, migration 142), and it is not configurable from the admin.
- **The chart kit is small but usable.** `components/ui/chart.tsx` wraps Recharts and
  exports `AreaChart`, `BarChart`, `DonutChart`, `Sparkline`, `ChartLegend` and
  `CHART_COLORS`. There is no funnel chart, cohort grid, heatmap, KPI-with-delta tile,
  date-range picker or reusable data table with export yet.

---

## 3. Which data exists, and which never gets recorded

This section decides what is cheap and what is not. A chart can only show a signal that is
being recorded, so every **No** below has to be fixed with a table before its screen can
show history. History starts from the day the table ships. There is no backfill.

| Signal | Recorded? | Where / why not |
|---|---|---|
| Signups by role, date | ✅ | `profiles.created_at`, `role`; `auth.users.created_at` |
| Orphan signups (auth user, no profile) | ✅ | Admin API `listUsers` vs `profiles`; already surfaced on Users |
| Wizard abandonment **before** an auth user exists | ❌ | Only as PostHog `signup_started` if keyed; nothing server-side |
| Phone OTP sends / verifies / failures | ✅ | `phone_otp_sessions`, `phone_otp_audit_log` (022), written by the `phone-otp` edge function. No admin screen |
| Email OTP / magic link / confirm mail | ⚠️ | Sent by **Supabase Auth**, not us. Visible only in Supabase Auth logs |
| Last active time | ⚠️ | `profiles.last_active_at` (142): **latest only**, overwritten, 30-min throttle |
| Daily / hourly active history (DAU, heatmap) | ❌ | Nothing keeps a per-day row |
| Device, platform, OS, app version | ❌ | Not sent to the server at all |
| Push token | ⚠️ | `profiles.expo_push_token`: **one per account**; a second device replaces the first |
| Push sent / failed / delivered / opened | ❌ | `sendPush()` in `lib/notify.ts` logs to console only; no receipts polled |
| In-app notification volume and read rate | ✅ | `notifications` (047) with `read_at` |
| Email sent / bounced / opened | ✅ | `email_deliveries` (100) |
| Deleted accounts | ❌ | `auth.admin.deleteUser` cascades everything away. Admin deletes write `admin_audit_log`; **self-deletes leave nothing** |
| Business approval / creator verification state | ✅ | `business_profiles.approval_status`, `profiles.verification_status`, `social_account_claims` |
| Campaigns and applications by status | ✅ | `campaigns` (125), `campaign_applications` (126) |
| Requests, proposals, projects, stages | ✅ | `collab_requests`, `project_proposals`, `campaign_projects`, `project_activity` |
| Project completion timestamp | ⚠️ | No `completed_at`; derivable from `project_activity` |
| Cancellations / manual deletions | ✅ | `cancelled_at/_by/_reason` (072), `manually_deleted_at/_by` (103) |
| Project payments: created / paid / failed / refunded | ✅ | `project_payments` (059) |
| Pro purchases: captured / failed | ✅ | `billing_events` (115): raw webhook ledger, keyed by Razorpay event id |
| Pro checkout **started but never paid** | ❌ | `/api/billing/checkout` creates a Razorpay order and writes nothing |
| Pro new vs renewal | ⚠️ | Not stored; derivable as "user's 2nd+ captured event in `billing_events`" |
| Subscription history | ⚠️ | `subscriptions` holds **one row per user, overwritten**; history only via `billing_events` |
| Profile views, link clicks | ✅ | `creator_profile_views`, `profile_views`, `business_profile_views`, `profile_link_clicks` |
| Contact reveals, saved items, pins | ✅ | `business_contact_reveals`, `saved_items`, `conversation_pins` |
| Profile shares | ❌ | Only the resulting clicks |
| Discover searches, filters, zero-result searches | ❌ | Search RPCs don't log |
| Server errors (5xx) | ✅ | Sentry (when DSN set), App Insights; read back on Observability |
| Client / mobile JS errors | ✅ | Sentry via `observability-client.ts` and `apps/mobile/lib/analytics.ts` |
| Rate-limit hits | ✅ | `rate_limit_stats` (109) |
| Chat messages | ⚠️ | Live in **GetStream**, not Postgres; counts need the Stream API or its webhook |
| Admin actions | ✅ | `admin_audit_log` |

**Design rule already used in this repo:** where a fact is already in a product table,
**derive it** and don't add an event log. `get_user_activity` (073) and
`get_platform_activity` (099) both work this way, so a feature that forgets to emit an event
cannot make a report lie. Add a new append-only table **only** for the ❌ rows above, where
nothing else records the fact.

---

## 4. Module-by-module specification

Every module below lists **what it shows**, **what the admin can do**, **the data source**
(existing or new), the **tier**, and a rough **effort** in developer-days. Effort assumes the
Phase 0 foundations exist: date-range picker, KPI tile with delta, data table with CSV,
daily rollup table.

Shared conventions for every analytics screen:
- **Date range:** Today / 7d / 30d / 90d / custom, with **compare to previous period**
  (tiles show a ▲▼ %).
- **Day boundaries:** always **Asia/Kolkata**.
- **Global filters:** role (Creator / Business), platform (Web / iOS / Android, once
  recorded), tier (Free / Pro), city.
- **Export:** CSV on every table. Every chart can be exported to CSV too.
- **Refresh:** tiles poll every 60 s. The "Live" page polls every 15–30 s. Nothing needs
  true per-second streaming.

### 4.A Workspace

#### A1. Founder Dashboard (admin · 3 d)
A single screen to answer "is the business working?"
- **Tiles:**
  - signups (split by role)
  - activation rate: creators verified ÷ creators signed up; businesses approved ÷ signed up
  - DAU / MAU and stickiness (DAU ÷ MAU)
  - requests sent
  - request → project conversion
  - projects completed
  - **GMV** (sum of paid `project_payments`)
  - **Pro revenue** and **MRR**
  - active Pro subscribers
  - churned Pro
  - open support tickets
  - pending approvals
- **Charts:**
  - 90-day GMV + Pro revenue area chart
  - signups by role, stacked bars
  - marketplace liquidity: % of live campaigns with ≥1 application; % of requests answered
    within 48 h
- **Source:** existing tables plus a new `admin_daily_metrics` rollup. MRR and churn come
  from `subscriptions` + `billing_events`.

#### A2. Overview (admin · 1 d, a fix)
Keep the current page and replace `/api/admin/dashboard` with one `SECURITY DEFINER` RPC that
returns `count(*)` values (§9.1). Add a small "today vs yesterday" delta per tile.

#### A3. Daily User Metrics (admin · 2 d, after device + activity tables)
- **Per-day table and charts:**
  - new signups by role
  - orphan signups
  - DAU / WAU / MAU by role and by platform
  - returning vs new actives
  - push opt-in rate
- **Source:** new `user_daily_activity` (§6.2) + `profiles`.

#### A4. Daily Marketplace Metrics (≈ "Daily Order Metrics") (admin · 2 d)
Per day:
- requests sent, accepted, declined
- proposals sent and agreed
- projects created, completed, cancelled
- campaign launches and applications
- payments created, paid, failed; GMV

**Source:** existing tables via the rollup.

#### A5. Product Analytics (admin · 4 d)
- **Creator funnel** (exists; extend): signed up → handle added → ownership confirmed →
  verified → first request → first project → first completed → first payout.
- **Business funnel** (new): signed up → approved → first search / profile view → first
  request or campaign → first project → first payment → second project (repeat).
- **Cohort retention grid:** signup week × weeks since, % active. Needs
  `user_daily_activity`.
- **Time-to-value:** median hours from signup to verified, and from approved to first
  project.
- **Stage drop-off:** of projects that entered stage *n*, how many reached *n+1*, plus the
  median time in each of the 12 stages. Uses `project_activity`, respecting
  `ALLOWED_TRANSITIONS` (revisions loops back, it does not go forward).

#### A6. Customer Tracking (admin · 3 d)
- **CRM-style list of every user:** lifecycle stage, role, city, tier, verification or
  approval, last active, projects, GMV, open tickets, tags.
- **Row click opens a timeline** that merges the existing per-user activity (108), payments,
  tickets, reports, notifications and emails sent.
- **Saved segments** such as "Businesses approved > 7 d with no request".

#### A7. Incomplete Signups (admin · 2 d)
Four buckets, each with count, list, age, and a **Nudge** action (push if a device exists,
otherwise email):
1. auth user with no profile (already detected on Users)
2. creators with no handle / no ownership / not verified
3. businesses in `pending_review`
4. pre-account abandonment. This last one needs PostHog (`signup_started` without
   `signup_completed`). Show it only when PostHog is configured.

#### A8. Deleted Users (admin · 3 d incl. mobile) — *Kesavan*
- **List:** deleted at, role, who deleted (self / admin), reason, days on platform, projects
  completed, lifetime GMV, Pro history.
- **Chart:** deletions per week, with reason breakdown.
- **Source:** new `deleted_accounts` tombstone, written **before** `deleteUser()` by both
  delete paths. Keep it PII-minimised: see §7.
- **Also required:** real in-app deletion on mobile (today it is a `mailto:`) and a public
  web deletion page (§9.3).

#### A9. App Activity + Heatmap (admin · 3 d)
- **App activity:**
  - DAU by platform
  - app version adoption (which versions are still in use, which matters for OTA vs
    native builds)
  - OS split
  - push permission granted %
  - devices with dead tokens
- **Heatmap:** 7 × 24 grid (weekday × hour, IST) of active users, from the hourly bitmap in
  `user_daily_activity` (§6.2).
- **Click heatmaps on web pages** are a PostHog feature. They require autocapture, which is
  **deliberately off** because the DOM carries creator PII and message drafts
  (`docs/operations/ANALYTICS.md` §3). Turn it on only as a founder decision, with masking.

#### A10. Web Analytics (super → admin · 1 d)
Already built on Observability (PostHog pageviews, Web Vitals) and gated to super admin.
Split out a business-safe version for admin: pageviews, top pages, referrers, Web Vitals.
Keep Sentry error details super-only. **Blocked on** `POSTHOG_PERSONAL_API_KEY` /
`POSTHOG_PROJECT_ID`.

#### A11. CRM Added Users / Leads (admin · 4 d)
Brands and creators the team sources offline (events, Instagram DMs, sales calls) before
they sign up.
- **Fields:** name, type, contact, source, owner (admin user), stage (new → contacted →
  interested → invited → signed up → active → lost), tags, notes, next follow-up date.
- **Actions:**
  - send an invite (email; SMS only after DLT, §5.6)
  - log a call or note
  - auto-link to the account when someone signs up with that email or phone
- **Views:** kanban by stage, "follow-ups due today" list.
- **Source:** new `crm_leads`, `crm_lead_notes`.

### 4.B Marketplace analytics (≈ "Property Analytics")

#### B1. Campaigns (admin · 2 d)
- Totals by status: draft / pending_review / live / closed / expired / removed. Here
  *removed* maps to the reference's "deleted" and *closed/expired* to "archived".
- Applications per campaign (median), time to first application, % of live campaigns with
  zero applications (a liquidity alarm), acceptance rate.
- Top niches and cities.

#### B2. Projects (admin · 2 d)
- Active / completed ("sold") / cancelled (with reason breakdown) / manually deleted.
- Stage distribution of active projects (how many sit at each of the 12 stages right now).
- Projects stuck > N days on a stage, each with a **Nudge both sides** action.
- Median project duration, completion rate, and cancellation rate by stage cancelled at.

#### B3. Requests & Deals (admin · 1 d)
Sent, accepted, declined and expired; response time; accept → proposal → project
conversion; free-tier conversion cap hits (migration 117). All derivable from existing
tables.

### 4.C Engagement features (≈ "RB Features")

| Screen | Shows | Source | Effort |
|---|---|---|---|
| Profile visits ("Site Visits") | Views/day of creator and business profiles, top viewed, view → request conversion | `creator_profile_views`, `business_profile_views`, `profile_views` | 1 d |
| Link clicks | Link-in-bio clicks by platform link | `profile_link_clicks` | 0.5 d |
| Contacts | Contact reveals/day, by business, free vs Pro | `business_contact_reveals` | 0.5 d |
| Favourites | Saves/day, most-saved creators and campaigns | `saved_items` | 0.5 d |
| Pinned | Pinned conversations per user | `conversation_pins` | 0.5 d |
| Notifications | In-app notifications by type, read rate, time-to-read | `notifications` | 1 d |
| Reminders | Nudges sent per reason (unread / your turn / new campaigns / comeback), return rate within 72 h | `notifications` type `nudge` + `user_daily_activity` | 1 d |
| Sharing | Profile shares by channel | **new** share event (needs a client hook) | 1 d |

### 4.D Payments — *Kesavan*

#### D1. Payments ledger (admin · 3 d)
One unified table over **both** money flows:

| Column | Project payment | Pro payment |
|---|---|---|
| Kind | `advance_payment` / `final_payment` / `quick_payment` | `pro_new` / `pro_renewal` |
| Status | `created` (pending) / `paid` / `failed` / `refunded` | `pending` (**new row needed**) / `captured` / `failed` / `underpaid` |
| Amount, currency | `project_payments.amount` (paise) | `billing_events.payload` |
| Payer, payee | `payer_id`, project counterparty | user |
| Razorpay ids | order, payment | order, payment, event |
| Time | `created_at`, `paid_at` | `received_at` |

- **Filters:** kind, status, date, amount range, user.
- **Tiles:** GMV, Pro revenue, success rate, failed count, pending > 30 min (likely
  abandoned).
- **Charts:** paid vs failed per day; failure reasons (Razorpay `error_description` from the
  failed payload).
- **Row action:** open in the Razorpay dashboard (a link, no API write).
- **Pending Pro gap:** write a `pro_orders` row (or a `billing_events` row of kind
  `order.created`) at checkout, or pending and abandoned Pro checkouts can never be counted.

#### D2. Pro Subscribers (admin · 2 d)
- **States:**
  - active
  - expiring ≤ 7 d
  - expired, not renewed
  - halted (failed charge)
  - never paid (Free)
- **Metrics:** active count, MRR (`active × price`, from `billing_settings`), new vs renewal
  per month, churn %, renewal rate, average lifetime.
- **Renewal detection:** a captured Pro event for a user who already has an earlier
  captured Pro event. Better: store `is_renewal` on the new order row.

#### D3. Renewal Reminders (admin · 2 d)
- A list of Pro periods ending in 7 / 3 / 1 days and those in the first days after expiry.
- An automatic reminder schedule (push + email) editable from the admin, plus **Send now**
  per row.
- Runs on the same scheduler as broadcasts (§5).
- Pro today is a fixed 30-day period bought with a one-off Order, not a mandate
  (`lib/payments/subscription.ts`), so **every** renewal is a manual repurchase. Reminders
  matter directly for revenue.

### 4.E Match system (≈ "Local / Global Match") (admin · 3 d)
- **Logging first:** a `search_events` row per Discover or campaign search. Store role,
  filters (niche, city, platform, follower range), result count, and whether any result was
  opened or requested within the session. Do not store free-text PII.
- **Screens:**
  - searches per day
  - **zero-result searches**, grouped by filter, which shows supply gaps ("Fitness creators
    in Coimbatore")
  - local (searcher city = result city) vs global matches
  - search → profile view → request conversion
  - top searched niches vs supply of verified creators in that niche

### 4.F Comms — *Kesavan* — see §5 for the full design
- **Push Notifications:** composer + history, audience split **Creators / Businesses / Both**
  plus segments.
- **Broadcasts:** one message on several channels: push, in-app pop-up / banner, tutorial
  card, email (SMS later).
- **Scheduled Pushes:** one-off at a time, or recurring (daily / weekly / monthly), with
  pause, edit and cancel.
- **Templates:** reusable titles and bodies with `{{name}}` variables.
- **Delivery log:** per broadcast (targeted, sent, failed, delivered, opened), drillable to
  the recipient.

### 4.G Support & trust (exists — small upgrades, 2 d)
- **Support:** assignee, SLA timer (first response), canned replies, CSAT after close.
- **Reports:** repeat-offender view (users with ≥ 2 reports), action history.
- **Approvals:** age of oldest pending item and median decision time.

### 4.H Logs — *Kesavan*

#### H1. OTP Logs (admin, masked · super, full · 2 d)
- **Source:** `phone_otp_sessions` + `phone_otp_audit_log`. Both are RLS-deny tables, so
  read them through a service client after `withAdmin`, or through an `is_admin()`-guarded
  RPC.
- **Tiles:** sent, verified, success %, failed, expired, rate-limited, and **estimated SMS
  spend** (sends × per-SMS cost setting).
- **Table:** time, phone (**masked** `+91 ••••• ••123` for admin, full for super admin),
  purpose, status, attempts, resend count, provider session id, linked user.
- **Charts:** sends and success rate per hour and day. Spot abuse as many sends to one
  number or a burst from new numbers.
- **Alert:** success rate < 70 % over an hour means the provider or template is broken. This
  exact failure has happened before: the retired 2Factor template silently became voice
  calls (see AGENTS.md).
- **Email OTP / confirmation mails** are Supabase Auth's. Link out to the Supabase Auth logs
  rather than rebuilding them.

#### H2. Error Logs (super · 2 d; admin summary · 0.5 d)
- **Source of truth stays Sentry + App Insights.** Do not build a second error store.
  Observability already reads Sentry's unresolved issues.
- **Add:**
  - filters (environment, platform web / iOS / Android, release, level)
  - issue → affected users count
  - a "new since last deploy" view
  - a per-user link from Customer Tracking to "errors this user hit" (Sentry search by user
    id; identify sends only the id and role)
- **Admin summary tile:** "errors in the last 24 h: N, ▲▼ vs yesterday", with no stack
  traces.
- **App-level failure log (optional):** a small `ops_events` table for **business** failures
  that are not exceptions and so never reach Sentry, e.g. webhook `underpaid`, Expo
  `DeviceNotRegistered` bursts, email bounces, vendor breaker trips.

#### H3. Existing logs
Email, Audit, and Rate limits already exist; keep them. Extend `AdminAction` with every new
action (§7).

### 4.I Report Builder (admin · 4–5 d)
- **Not free SQL.** A report is a **whitelisted dataset** (Users, Campaigns, Projects,
  Payments, Requests, OTP, Notifications) + chosen columns + filters + group-by + date range
  → table, chart, CSV.
- **Saved reports** with an owner, and an optional **scheduled email** (weekly CSV to the
  founder).
- **Each dataset is one `is_admin()` RPC** with a parameter allow-list. Never build SQL
  strings from the client.

---

## 5. Push, broadcasts, pop-ups and tutorials — full design

This is the biggest new system and the one the client asked about most directly.

### 5.1 What exists
- `notifyUser()` (`apps/web/src/lib/notify.ts`) writes a `notifications` row and sends
  **one** Expo push for **one** user. It has a kill switch (`vendor_expo_push`), a circuit
  breaker, a timeout, and cleans the token on `DeviceNotRegistered`.
- Mobile registers a token on launch (`apps/mobile/lib/push.ts`) into
  `profiles.expo_push_token`. Android uses a MAX-importance `default` channel. A tap deep
  links via `notification-link.ts`.
- **In-app pop-up cards already exist on mobile** (`lib/notification-toast.ts`). They slide
  in whenever a `notifications` row arrives over Supabase Realtime.
- **Tutorials already exist as coded guides:** 18 `GuideScript`s in
  `packages/core/src/guides`, a play-icon launcher, and auto-run once per section on web and
  mobile.
- Daily **re-engagement nudges** already pick dormant users (`nudge_candidates()`) and push
  through `notifyUser()`, fired by a GitHub Actions cron.
- Blockers noted in `APP_STORE_READINESS_2026-09-17.md`: the iOS distribution certificate
  was revoked, and the push capability and APNs key are not set up. **No iOS push reaches a
  store build until that is fixed.**

### 5.2 What is missing
1. **Multi-device:** one token per account. A creator on phone + tablet gets pushes on one.
2. **Device metadata:** no platform, app version, OS, or permission state.
3. **Bulk sending:** no batching (Expo accepts 100 messages per request), no queue, no
   retries.
4. **Receipts:** Expo's 200 response is only a *ticket*. Real delivery errors come from the
   receipts endpoint, polled later. Nothing polls it.
5. **Open tracking:** a tap is never reported back.
6. **Audience segments, scheduling, recurrence, templates, preview, test send, history.**
7. **Consent categories:** users can opt out of nudges (`nudges_opt_out`) but there is no
   "marketing / announcements" category separate from transactional pushes.
8. **Admin-authored in-app content:** pop-ups and tutorials today are only notification rows
   or code.

### 5.3 Proposed model
Full SQL sketches are in the build guide.

```
push_devices           one row per installed app instance
  user_id, expo_token (unique), platform ios|android, app_version, os_version,
  permission granted|denied|undetermined, last_seen_at, disabled_at, disabled_reason

broadcasts             one row per message the admin composes
  title, body, image_url, deep_link, kind announcement|promo|tutorial|system|reminder,
  channels {push, in_app, email},  in_app_style banner|modal|card,
  audience jsonb (segment definition), audience_count_estimate,
  schedule: send_at | recurrence (daily/weekly/monthly + time, IST) | immediate,
  quiet_hours_respected bool, status draft|scheduled|sending|sent|paused|cancelled|failed,
  created_by, approved_by, stats jsonb (targeted/sent/failed/delivered/opened/clicked)

broadcast_runs         one row per actual send of a (possibly recurring) broadcast
broadcast_deliveries   one row per recipient × channel × device
  run_id, user_id, device_id, channel, status queued|sent|error|delivered|opened,
  expo_ticket_id, expo_receipt_status, error_code, sent_at, opened_at
  UNIQUE(run_id, user_id, channel, device_id)   -- idempotent retries

announcements_seen     user_id, broadcast_id, seen_at, dismissed_at, clicked_at
notification_preferences  user_id, category (transactional|announcements|promotions|tips), push bool, email bool
```

### 5.4 Audience segments
Every segment is a whitelisted filter set compiled server-side. The composer shows **live
recipient counts** (total, with a push device, opted in) before anything sends.

- **Role:** Creators / Businesses / Both. *(Kesavan's "split to influencer and owners".)*
- **Status:** creator verification state; business approval state.
- **Plan:** Free / Pro / Pro expiring in ≤ N days / Pro expired.
- **Activity:** active in last N days / dormant N+ days / signed up between dates.
- **Location:** city; creator niche; business industry.
- **Journey:** has ≥1 project / no project yet / project stuck at stage X.
- **Device:** platform iOS / Android / web-only; app version below X ("please update").
- **Explicit list:** paste user ids or usernames, or pick from a Customer Tracking saved
  segment.

### 5.5 Sending pipeline
```
Admin composes → test-send to own device → confirm (typed confirmation if > 500 recipients)
  → broadcasts.status = scheduled
Scheduler tick (every 5 min) → due broadcasts/recurrences → create broadcast_run
  → resolve audience → insert broadcast_deliveries (queued), skipping opted-out,
    frequency-capped and quiet-hours recipients (deferred to 09:00 IST)
Sender worker → take ≤ 100 queued rows → Expo /push/send → store ticket ids / errors
  → DeviceNotRegistered → push_devices.disabled_at
Receipt poller (≥ 15 min after send) → Expo /push/getReceipts in chunks ≤ 1000
  → delivered / error; MessageRateExceeded → back off; InvalidCredentials → alert
Mobile tap → POST /api/notifications/opened {delivery_id} → opened_at
In-app channel → row in notifications (+ announcements) → existing Realtime toast on mobile,
  new banner/modal host on web and mobile; seen/dismiss/click recorded
```

**Where it runs.** The container is Azure Container Apps, which has no built-in cron. There
are two options:
- **(a)** A GitHub Actions cron hitting a `CRON_SECRET`-protected route, the same pattern as
  `/api/cron/nudges`. Its minimum interval is 5 min, and runs can be delayed or skipped under
  load.
- **(b)** Supabase `pg_cron` + `net.http_post` calling the same route every minute.

**Recommendation: (b)** for anything time-sensitive, keeping (a) as a watchdog. Either way
the route must be **idempotent**: the unique delivery key makes a double tick harmless.

**Safeguards (non-negotiable):**
- test send
- recipient preview
- typed confirmation for large sends
- quiet hours 21:00–09:00 IST for non-transactional kinds
- frequency cap: ≤ 1 promotional push per user per day, ≤ 3 per week
- respect `notification_preferences` and `nudges_opt_out`
- global kill switch (`vendor_expo_push`, exists)
- every send, pause and cancel written to `admin_audit_log`
- sends > 5,000 recipients or `kind = promo` need a second admin's approval (optional; the
  `approved_by` column is there for it)

### 5.6 Channel notes
- **Text push:** works now through Expo on Android. iOS needs the APNs setup noted in §5.1.
- **Push with image ("banners" in the client's words):**
  - Android shows a big picture from the FCM payload.
  - **iOS needs a Notification Service Extension**, which is native code and therefore a
    **new store build**, not an OTA update.
  - Check the current Expo push API field for rich content and the matching
    `expo-notifications` config before building. This area changed across SDK releases.
  - Host images on existing storage (Supabase Storage / Cloudinary) at ≤ 1 MB, 2:1.
- **In-app pop-ups:**
  - Mobile already renders toast cards for new `notifications` rows.
  - Add a **modal / banner host** on web and mobile that shows the newest unseen
    announcement on app open, with image, CTA button and deep link, and records
    seen/dismiss/click.
  - This is JS-only on mobile, so it **ships by OTA**.
- **Tutorials:**
  - Guides are code today. **v1:** a broadcast of kind `tutorial` points to an existing
    guide id (the admin picks from the 18 registered guides) or to a video URL. The app
    opens that guide.
  - **v2 (only if the client needs to author new tutorials without a developer):** move
    guide steps to a `guides` table with a small editor. Larger job (≈ 5 d), because guides
    reference UI anchors that must exist in the app.
- **"Text message" = SMS?**
  - Kesavan's wording is ambiguous; **confirm with the client.**
  - Bulk or promotional SMS in India requires **TRAI DLT registration**: a registered entity,
    sender header, and each template pre-approved.
  - The current 2Factor account is set up for the OTP template only.
  - Treat SMS broadcasts as a later channel, gated on DLT paperwork, not code.
- **Email:** reuse `lib/email` with its policy gates (opt-outs, suppression, daily cap,
  dedupe). Broadcast email needs its own `marketing` category and an unsubscribe link.

### 5.7 Scheduled and recurring
- **One-off:** `send_at` (IST in the UI, stored UTC).
- **Recurring:** daily / weekly (weekdays) / monthly (day of month) at a time. Store it
  explicitly (`frequency`, `by_weekday`, `by_monthday`, `time_ist`, `starts_on`, `ends_on`)
  instead of a raw RRULE string, which is easier to validate and display.
- **Every run re-resolves its audience.** "Weekly tip to creators without a project" must
  not message someone who has since started one.
- **Built-in automations** move onto the same engine as system-owned rows the admin can see
  and pause:
  - re-engagement nudges (currently a hard-coded cron)
  - renewal reminders (§4.D3)
  - "update your app" for old versions

---

## 6. Analytics architecture

### 6.1 Split of responsibilities
| Question | Answer from | Why |
|---|---|---|
| What is in the business (users, deals, money)? | **Postgres** (derived RPCs + rollups) | Exact, ad-blocker-proof, already the house pattern |
| Who was active, on which device, when? | **Postgres**: new `user_daily_activity`, `push_devices` | Must be exact for DAU and push targeting |
| What did people click, where did they drop in the UI, page performance? | **PostHog** (already wired, inert until keyed) | Built for it; not worth rebuilding |
| What broke? | **Sentry + App Insights** | Already wired |

### 6.2 New capture (small, and it unlocks a lot)
- **`user_daily_activity`**
  - **Key:** `(user_id, day_ist, platform)`.
  - **Columns:** `first_seen_at`, `last_seen_at`, `app_version`, `hours_bitmap` (24-bit int,
    one bit per IST hour, for the heatmap), `request_count`.
  - **Write path:** upserted in the path that already calls `touch_last_active()` from
    `withAuth` (throttled in process). At most ~one write per user per 30 min, so cost is
    negligible.
  - **Platform and version:** read from a header the mobile API client adds
    (`X-Client: ios/1.4.2`) and web adds (`web/<release>`). The mobile change is JS-only,
    so it ships OTA.
- **`push_devices`**: registration already calls `/api/profile/push-token`. Extend the body
  with platform, version, OS and permission state. Keep writing `profiles.expo_push_token`
  during migration so `notifyUser()` keeps working until it reads the new table.
- **`deleted_accounts`**: see §7.
- **`search_events`**: see §4.E.
- **Pro order rows**: see §4.D1.
- **Shares**: see §4.C.

### 6.3 Performance: roll up, don't rescan
- `get_admin_growth_series` runs a correlated `count(*)` per day per table. That is fine at
  hundreds of rows and not at hundreds of thousands.
- Add **`admin_daily_metrics(day_ist, metric, dimension, value)`**, filled by a `pg_cron`
  job at 00:10 IST for "yesterday", with a backfill function for any date range. Screens
  read the rollup for closed days and compute **today** live.
- Every RPC keeps the existing guards: `is_admin()` first, bounded windows, `STABLE`,
  `SECURITY DEFINER SET search_path = public`, `REVOKE … FROM anon`.
- Add a `completed_at` to `campaign_projects`, set by the completion path and backfilled from
  `project_activity`, so completions stop being approximated.

### 6.4 UI kit to build once (Phase 0)
Build these once on top of the existing `chart.tsx`, `stat-card.tsx`, `table.tsx`,
`section-card.tsx` and `tabs.tsx`:
- `KpiTile` (value, delta vs previous period, sparkline)
- `DateRangeBar` (presets + compare toggle, IST)
- `DataTable` (server pagination, sort, column picker, CSV)
- `FunnelChart`
- `CohortGrid`
- `WeekHourHeatmap`
- `StackedBar` (extend `BarChart`)
- `EmptyState` variants: "not recorded yet — history starts <date>" vs "no data in range"

---

## 7. Permissions, privacy and compliance

**Tiers.**
- **Admin (client):** all business analytics, payments, CRM, broadcasts, masked OTP logs,
  error summary.
- **Super admin (developer):** everything, plus full phone numbers in OTP logs, Sentry
  details, vendors and rate limits.
- Broadcast sending is an admin action. Recommend a per-environment setting that requires a
  second admin approval above a recipient threshold.

**The admin login is shared with the client today** (`lib/admin-audit.ts`). An audit log
naming one shared account cannot answer "who sent that push to 8,000 people". **Give each
person their own admin account** (`provision_admin`, migration 150) before broadcasts ship.

**New `AdminAction` values:**
- `broadcast_created`, `broadcast_scheduled`, `broadcast_sent`, `broadcast_paused`,
  `broadcast_cancelled`
- `lead_created`, `lead_updated`
- `report_exported`
- `otp_log_unmasked`
- `user_nudged`

**India DPDP Act 2023 and store policies.**
- **Deleted accounts tombstone:**
  - **Keep:** original user id, role, `created_at`, `deleted_at`, deleted_by (self/admin
    id), reason code + free text, counts (projects, completed, payments, GMV), Pro history
    summary.
  - **Do not keep:** name, email, phone or handle in clear. Store a salted hash of email and
    phone if you need to detect re-signups.
  - **Payment and invoice records** keep their own legally required retention, independent
    of the account.
- **OTP logs contain phone numbers:** mask by default, auto-purge rows older than **90
  days** with a `pg_cron` job. **Never** store the OTP code itself (we don't today; keep it
  that way).
- **Marketing pushes and emails** need consent separate from transactional ones, and an easy
  opt-out (`notification_preferences`).
- **Google Play** requires a publicly reachable **account deletion URL**. **Apple (5.1.1(v))**
  requires account deletion **inside the app**. Mobile currently opens a `mailto:` (§9.3).
- **CSV exports** are an exfiltration path: audit every export, and exclude phone and email
  columns unless the caller is super admin.

---

## 8. Phased plan

Estimates are for one experienced full-stack developer on this codebase, including
migrations, API, web UI, mobile changes and tests. Treat them as ±30 %.

### Phase 0 — Foundations (≈ 1.5 weeks)
| # | Item | Days |
|---|---|---|
| 0.1 | Fix Overview counts with a count RPC (§9.1) | 1 |
| 0.2 | Regroup admin nav into sections (Workspace, Marketplace, Engagement, Payments, Comms, Support, Logs, System) with collapsible groups like the references | 1 |
| 0.3 | UI kit: KpiTile, DateRangeBar, DataTable + CSV, FunnelChart, CohortGrid, WeekHourHeatmap | 3 |
| 0.4 | `user_daily_activity` + `X-Client` header (web + mobile OTA) | 1.5 |
| 0.5 | `admin_daily_metrics` rollup + pg_cron + backfill; IST day boundaries | 1.5 |
| 0.6 | `completed_at` on projects + backfill | 0.5 |

### Phase 1 — Kesavan's list (≈ 3 weeks)
| # | Item | Days |
|---|---|---|
| 1.1 | Deleted Users: tombstone table, both delete paths, admin screen | 2 |
| 1.2 | In-app account deletion on mobile + public web deletion page | 1.5 |
| 1.3 | OTP Logs screen (masking, tiles, charts, alert) + 90-day purge | 2 |
| 1.4 | Error Logs: Observability filters + admin summary tile (+ optional `ops_events`) | 2 |
| 1.5 | Payments ledger (both flows) + Pro order rows at checkout | 3 |
| 1.6 | Pro Subscribers + Renewal Reminders list | 2 |
| 1.7 | `push_devices` (multi-device) + registration change (mobile OTA) + `notifyUser()` fan-out to all devices | 2 |
| 1.8 | Broadcasts v1: composer, segments (role split first), preview count, test send, text push + in-app notification, delivery log, receipts, open tracking | 5 |
| 1.9 | Scheduled + recurring sends on pg_cron; move nudges and renewal reminders onto it | 2 |

### Phase 2 — Analytics depth (≈ 2.5 weeks)
Includes the Founder Dashboard, Daily User and Marketplace Metrics, Product Analytics (both
funnels, cohorts, stage drop-off), Customer Tracking, Incomplete Signups, App Activity +
Heatmap, Campaign/Project/Request analytics, the engagement feature screens, and the
Support/Approvals SLA upgrades.

### Phase 3 — CRM and growth (≈ 2–3 weeks)
Includes CRM Leads, Match/Search logging + analytics, Report Builder, in-app modal/banner
host with image + CTA, tutorial broadcasts pointing to existing guides, admin Web Analytics
split, and share tracking. **Rich image push on iOS rides the next native store build.**

### Decisions needed from the founder/client before Phase 1
1. Does "text message" mean **SMS**? If yes, start DLT registration now; it takes weeks.
2. **Who may send broadcasts**, and is a second approval required above a threshold?
3. **Quiet hours and frequency caps.** Proposed defaults are in §5.5.
4. Is **PostHog** being turned on? Several web-analytics and pre-signup screens depend on it.
   Is **autocapture/heatmaps** acceptable given the PII tradeoff?
5. **Individual admin accounts** instead of the shared login.
6. **Commission:** confirm there is no platform fee, so the reference "Commission" section is
   dropped or replaced with "Platform revenue".

---

## 9. Issues found while reading (not fixed — flagged for decision)

### 9.1 Overview KPIs stop counting at the API row cap — **High** — ✅ fixed 2026-09-17 (route)

> **Fixed** in `apps/web/src/app/api/admin/dashboard/route.ts`. Each tile is now a
> `count: 'exact', head: true` query, so Postgres counts and no rows are returned. A failed
> count returns 500 instead of a misleading 0. No migration was needed. All nine values
> matched direct SQL `count(*)` on dev. `/api/admin/users` still selects unbounded rows.
> That is a separate fix, which needs server-side pagination.

`apps/web/src/app/api/admin/dashboard/route.ts` does
`supabase.from('profiles').select('role')` (and the same for four other tables) with no
range, then counts rows in JavaScript. PostgREST returns at most the project's **Max Rows**
(Supabase default **1000**, Settings → API). Past that, "Total users", "Influencers",
"Pending approvals", request and project counts all **freeze at the cap with no error**.
`/api/admin/users` has the same shape for its list. **Fix:** a single `is_admin()`-guarded
RPC returning `count(*) FILTER (WHERE …)` values, plus server-side pagination for lists.

### 9.2 Grace period can never grant access — **Low (design inconsistency)**
- **What happens:** on `payment.failed`, `handleSubscriptionEvent` writes
  `status = 'halted'` with a 5-day `grace_until`. But `current_tier()` (migration 115) grants
  Pro only when `status IN ('active','authenticated')`, so `grace_until` is never consulted
  for a halted row.
- **Why it's harmless today:** checkout refuses users who are already Pro, so an active
  subscriber can't normally hit a failure.
- **Why it matters later:** it will matter the day renewals move to Razorpay mandates.
  Decide whether grace is real, and fix `current_tier()` or the webhook to match, **before**
  building Renewal Reminders.

### 9.3 Account deletion leaves no record and isn't in-app on mobile — **Medium**
- **No record:** `DELETE /api/profile` calls `auth.admin.deleteUser` with no audit or
  tombstone, so self-deletions are invisible.
- **Not in-app:** mobile Settings → Delete account opens a `mailto:`. This is an App Store
  review risk (guideline 5.1.1(v)) and creates manual work.
- **Web deletion URL:** Google Play also needs one.

### 9.4 One push token per account — **Medium**
- **What happens:** `profiles.expo_push_token` holds one token, so signing in on a second
  device silently takes over all pushes. The route comment accepts this for v1.
- **Why it matters now:** broadcasts and "split by platform" make it user-visible.
  §5.3 `push_devices` replaces it.

### 9.5 Analytics days are UTC — **Low**
The growth series buckets by `created_at::date` / `current_date` in UTC. Anything between
00:00 and 05:30 IST is counted on the previous day. That is visible as soon as the client
compares against their own daily numbers.

---

## 10. Appendix — relevant files

| Area | Files |
|---|---|
| Admin nav | `apps/web/src/components/dashboard/sidebar.tsx` |
| Admin pages | `apps/web/src/app/dashboard/admin/**` |
| Admin API | `apps/web/src/app/api/admin/**` |
| Admin auth tiers | `apps/web/src/lib/api.ts` (`withAdmin`, `withSuperAdmin`, `callerClient`), migrations 070, 150, 151 |
| Audit | `apps/web/src/lib/admin-audit.ts`, `admin_audit_log` |
| Charts / UI | `apps/web/src/components/ui/{chart,stat-card,table,section-card,tabs}.tsx` |
| Admin RPCs | migrations 098 (growth, funnel, support), 099 (platform activity/pulse), 108 (user activity), 113 (engagement) |
| Push | `apps/web/src/lib/notify.ts`, `apps/web/src/app/api/profile/push-token/route.ts`, `apps/mobile/lib/push.ts`, `apps/mobile/lib/notification-toast.ts`, migration 079 |
| Nudges / cron | `apps/web/src/app/api/cron/nudges/route.ts`, migration 142, `docs/operations/REENGAGEMENT_NUDGES.md` |
| Tutorials | `packages/core/src/guides/**` |
| Payments | `apps/web/src/app/api/payments/webhook/route.ts`, `apps/web/src/lib/payments/{razorpay,subscription}.ts`, `apps/web/src/app/api/billing/checkout/route.ts`, migrations 059, 115, 117 |
| OTP | `supabase/functions/phone-otp/index.ts`, migrations 022, 026, 105, `docs/operations/PHONE_OTP.md` |
| Errors / analytics | `apps/web/src/lib/{observability,observability-client,observability-dashboard,analytics}.ts`, `apps/mobile/lib/analytics.ts`, `docs/operations/{ANALYTICS,OBSERVABILITY}.md` |
| Deletion | `apps/web/src/app/api/profile/route.ts` (DELETE), `apps/web/src/app/api/admin/users/[id]/route.ts` (DELETE), `apps/mobile/app/settings.tsx` |
| Feature flags | `apps/web/src/lib/feature-flags.ts`, migration 137 (CHECK constraint lists allowed keys) |
