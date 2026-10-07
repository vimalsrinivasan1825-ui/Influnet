# Admin, analytics & monitoring — what exists, what's missing (2026-10-06)

**The goal:** nothing about the running platform should be hidden. From the
admin console (plus the few vendor dashboards we deliberately rely on) the
team should be able to see every user, every rupee, every error and every
admin action, and to be *told* when something breaks rather than finding out
from a user.

This document compares a generic "mature SaaS operations stack" (CDN, API
gateway, Redis, BullMQ, Elasticsearch, Prometheus, Grafana, Loki, Metabase,
PostHog, Sentry, audit log, RBAC, MFA) against what Influnet actually has, then
lists the gaps in priority order.

Everything below was checked against the code on `dev` at `8e7b9745`. Things
that live only in a vendor dashboard (Azure, Sentry, PostHog, UptimeRobot)
can't be seen from the repo; they're marked **verify by hand** in §6.

Related docs: [OBSERVABILITY.md](OBSERVABILITY.md) (triage routine),
[ANALYTICS.md](ANALYTICS.md) (vendor setup), [ADMIN_CRM.md](ADMIN_CRM.md)
(console build), [HANDOVER.md](HANDOVER.md) (go-live blockers).

---

## 1. Verdict in one paragraph

The **admin console is already far ahead of most startups'**: 26 delegable
sections + 7 developer pages, a three-tier team (super admin → admin → staff)
with per-section view/manage and hidden-field masking, a founder dashboard with
DAU/WAU/MAU by platform, funnels, cohorts, GMV and MRR, a report builder with
CSV export, support tickets, moderation, broadcasts and an audit log.
What is weak is the layer *around* it: **product analytics is wired but
almost no events are sent**, **nothing alerts anyone when something breaks**,
**admin accounts have no second factor**, and **a handful of things are only
visible somewhere else** (chat in GetStream, refunds in Razorpay, native
crashes nowhere). None of these need the heavy stack (Prometheus, Grafana,
Loki, Elasticsearch, BullMQ). Azure + Supabase + Sentry + PostHog already
cover those roles.

---

## 2. The generic stack vs. Influnet

| Generic component | What Influnet uses instead | Status | Need to add? |
|---|---|---|---|
| Cloudflare CDN | Azure Container Apps + Next.js static assets; landing on Azure Static Web Apps | ✅ fine for now | **No** (your call: not needed yet) |
| API gateway / load balancer | Azure Container Apps ingress | ✅ | No |
| "Microservices" (Auth, User, Campaign…) | One Next.js app with `/api/*` routes + Supabase RPCs | ✅ | **No.** Splitting into services adds ops cost with no benefit at this size |
| PostgreSQL | Supabase (separate dev and staging projects) | ✅ | No |
| Redis cache | Upstash Redis, **rate limiting only** | ⚠️ see G4 | Make sure it's actually set on the live container |
| Queue (BullMQ) | GitHub Actions crons → `/api/cron/*` (broadcasts every 5 min, nudges, maintenance) | ✅ adequate | Not yet. Revisit if broadcasts exceed what one cron tick can send |
| Object storage (S3/Blob) | Cloudinary + Supabase Storage | ✅ | No |
| Search (Elasticsearch) | Postgres; discover is exact username/link lookup by design | ✅ | No |
| Admin portal | `/dashboard/admin`, 33 pages | ✅ strong | Gaps G6–G10 |
| PostHog (funnels, retention) | PostHog web + mobile, keys in workflows | ⚠️ **wired, almost no events** | **G1, the biggest gap** |
| Session replay / heatmaps | Deliberately **off** (PII in DOM) | ⛔ by design | Optional, masked, on chosen pages only (§5) |
| Founder dashboard | `/dashboard/admin/founder` + insights `founder`/`daily`/`product` | ✅ | Small additions (G15) |
| Prometheus + Grafana | Azure Application Insights + Azure Monitor | ❓ verify by hand | **No Prometheus/Grafana**, but **alerts** (G2) |
| Loki (logs) | JSON logs to stdout → Log Analytics, correlated by `x-request-id` | ❓ verify by hand | No Loki. Make sure Log Analytics is attached |
| Sentry | Custom fetch-based reporters (web server, web browser, mobile JS) | ⚠️ partial | Native mobile crashes (G12), alert rules (G2) |
| Metabase (BI) | Report builder + 20 insight reports | ✅ adequate | Later, optional (G16) |
| Audit log | `admin_audit_log` (append-only, service-role write) | ✅ done (G6) | — |
| RBAC | Migration 176 team roles + field masking | ✅ | RPC-level scoping done (G14); needs migration 196 applied |
| MFA | TOTP for admins (2026-10-06) | ✅ built | Enrol your admins, then set `ADMIN_REQUIRE_MFA=true` (G5) |

---

## 3. What exists today — inventory

### 3.1 Admin console sections (`lib/admin-access.ts` → `ADMIN_MODULES`)

| Group | Sections |
|---|---|
| Workspace | Overview · Founder dashboard · Live activity · Analytics & metrics · Customers (incl. incomplete signups, deleted users) · App activity (versions, platforms) |
| Marketplace | Campaigns · Projects · Requests · Marketplace analytics (engagement, search) |
| Payments | Payments ledger · Pro subscribers |
| Engagement | Broadcasts (push / in-app / email) · Leads CRM · Early access · Events |
| People & support | Approvals (businesses + creator verification) · Users · Support tickets · Reports (moderation) · Feedback |
| Reports & logs | Report builder (CSV) · Error log (Sentry, business-safe view) · OTP logs |
| Team | Team & roles |
| Developer (super admin only) | Health · Vendors · Observability · Rate limits · Emails · Audit · Issues |

### 3.2 Founder / analytics metrics already computed in SQL (migration 158)

DAU / WAU / MAU split by **web, iOS, Android** · stickiness · signups by role ·
creator funnel and business funnel · weekly cohorts · repeat collaboration ·
GMV (period and lifetime) · Pro revenue and MRR · request→project % ·
signup→verified and signup→first-project time · stage distribution, stage
drop-off, median days per stage · open tickets / reports / approvals.

Counted in Postgres, so this works for users with ad blockers and needs no
vendor.

### 3.3 Errors, logs, health

| Layer | Where | Notes |
|---|---|---|
| Server errors (5xx) | `lib/observability.ts`, `instrumentation.ts` `onRequestError` | Tagged with `request_id` |
| Browser errors | `lib/observability-client.ts`, `global-error.tsx` | Strips query strings |
| Mobile JS errors | `apps/mobile/lib/analytics.ts` (plain `fetch`) | Turned on for production in `7fd1eaea` |
| Request correlation | `x-request-id` minted in `src/proxy.ts`, shown to users as `ref:` | |
| Structured logs | `lib/logger.ts` (one JSON object per line) | Searchable only if Log Analytics is attached |
| Deployment health | `/dashboard/admin/health`: 27 migration/feature probes against the live DB | |
| Public health | `/api/health` (anonymous, no error detail) | For uptime monitors |
| Weekly sweep | `.github/workflows/weekly-health.yml` (Mon 10:30 IST, dev + prod) | Opens/updates one GitHub issue |

### 3.4 Audit

`admin_audit_log` (migration 070) records actor, action, target, metadata and
IP, has no INSERT policy for browser sessions, and has a screen at
`/dashboard/admin/audit`. 24 action types are defined in `lib/admin-audit.ts`.
Team changes are audited inside SQL (migration 176).

---

## 4. Gaps, in priority order

Legend: 👤 needs the owner (dashboard, account, decision) · 💻 code change.

### P0: before real users depend on it

#### G1. Product analytics is wired but almost no events are sent 💻

> **✅ Done 2026-10-06 (web + server).** Web now identifies users; 30 of the 32
> events fire (server-side for every database fact, client-side for signup UI
> steps). Not yet sent: `social_handle_added`, `profile_completed`. Mobile
> client-only events (signup steps on the phone) are deferred until the store
> reviews return; the server events already cover mobile's funnel. Event map:
> [ANALYTICS.md §3a](ANALYTICS.md).
- **Evidence:** `AnalyticsEvent` (web `lib/analytics.ts`, mobile
  `lib/analytics.ts`) defines **32 events** from `signup_started` to
  `payment_succeeded`. Only **3 are ever called**: `support_ticket_opened`,
  `feedback_submitted`, `client_error` (plus page/screen views).
- **And:** the web app **never calls `identify()`**. Every web visitor is an
  anonymous PostHog person, so a user who signs up on web and continues on
  mobile shows up as two people. Mobile does identify (`app/_layout.tsx:82`).
- **Effect:** PostHog funnels, retention and "user journey" are empty past the
  first page view. The SQL funnels in §3.2 still work, so this is about *what
  people do between the database facts*: where they hesitate, what they tap,
  which screen they abandon.
- **Fix:**
  1. Call `identify(user.id, role)` on web wherever the session resolves, and
     `resetIdentity()` on sign-out.
  2. Fire the **money and conversion events server-side** from the route that
     records the fact: `signup_completed` (register), `collab_request_sent`
     (POST /api/collabs), `deal_agreed`, `project_created`,
     `project_completed`, `payment_succeeded` / `payment_failed` (Razorpay
     webhook). Server-side capture can't be blocked by ad blockers and can't
     double-fire on a re-render. This needs a small server `capture()` helper
     (PostHog's `/capture` HTTP endpoint with the project key).
  3. Fire the **UI-only events client-side**: `signup_started`,
     `signup_role_selected`, `profile_step_completed`, `discover_searched`,
     `creator_profile_viewed`.
  4. Build the funnel in PostHog in the order listed in ANALYTICS.md §3.

#### G2. Nothing alerts anyone 👤 (+ small 💻)
- **Evidence:** no Slack/webhook/alert integration anywhere in `lib/` or the
  workflows. The only automated alarm is the **weekly** health sweep. A
  container crash-loop on Tuesday is noticed by a user, not by us.
- **Fix (mostly vendor configuration, no new infrastructure):**

| Alert | Where to set it | Threshold to start with |
|---|---|---|
| Site down | UptimeRobot → `https://staging.influnet.io/api/health` | 1-minute check, 2 failures |
| New error type / error spike | Sentry → Alerts → Issue alert | New issue; >20 events in 5 min |
| 5xx rate | Azure Monitor alert on Application Insights | failed requests > 5% over 5 min |
| Container restarting / CPU / memory | Azure Monitor on the Container App | restarts > 0; CPU or memory > 80% for 10 min |
| DB near limits | Supabase → Usage alerts | egress, DB size, connections at 80% |
| Payment failures | 💻 cron check on `payments` (failed in last hour > N) or Sentry on webhook errors | >3 failed in an hour |
| Webhook signature failures (Razorpay, Stream) | 💻 log at `error` level so Sentry/App Insights alert | any |
| Broadcast/nudge cron failed | GitHub Actions → notify on workflow failure | any failure |

Route all of these to **one** channel (an email group or a Slack channel)
so an alert has one obvious place to land.

#### G3. Infrastructure telemetry isn't proven to be on 👤
OBSERVABILITY.md §3 lists Application Insights, Log Analytics, UptimeRobot and
"confirm Sentry receives" as human steps. None of these can be confirmed from
the repo. Until they are, **"how slow is it" and "what did request X do"
can't be answered.** Do the §6 checklist.

#### G4. Distributed rate limiting may be off on the live environment 👤💻
- **Evidence:** `UPSTASH_REDIS_REST_URL/TOKEN` are passed only in
  `deploy-prod.yml`, which has **never run** (no `main` branch).
  `deploy-staging.yml`, which deploys what is effectively production, doesn't
  pass them.
- **Effect:** if they weren't set by hand on the container, the limiter is an
  in-process counter, so each replica has its own budget and a restart resets
  it. Signup, OTP and support limits are weaker than they look.
- **Fix:** check `/dashboard/admin/rate-limits` or the container env, then add
  the two values to the `staging` GitHub Environment and pass them in
  `deploy-staging.yml` the same way as the other runtime vars.

#### G5. Admin accounts have no second factor 👤💻

> **✅ Built 2026-10-06.** Correction to the evidence below: `withAdmin` already
> had an opt-in `ADMIN_REQUIRE_MFA` check, but there was no way to enrol or to
> enter a code, so turning it on would have locked every admin out. Now:
> `AdminMfaGate` (enrol with QR, code prompt, "set it up" banner);
> `adminMfaProblem` holds an **enrolled** admin to aal2 always and everyone
> once `ADMIN_REQUIRE_MFA=true`; lost phones reset with
> `scripts/reset-admin-mfa.mjs`. **Owner steps:** confirm TOTP is enabled in
> Supabase → Authentication → Multi-Factor on both projects, enrol every
> admin, then set `ADMIN_REQUIRE_MFA=true` on the containers.
> **Still open:** `admin_*` RPCs called directly through PostgREST check
> `is_admin()`, not `aal`; folding aal2 into those is part of G14.

- **Evidence (as first written):** no MFA/TOTP/`aal2` handling anywhere in `apps/web/src`.
- **Effect:** one leaked admin password exposes every user's email, phone and
  payment history, **and** can send push/email to every real user through
  Broadcasts. This is the most dangerous single credential in the system.
- **Fix:** turn on Supabase Auth MFA (TOTP). Add an enrol screen for admins,
  and make `withAdmin` refuse any session whose `aal` isn't `aal2`. Users don't
  need MFA, only `role = 'admin'` accounts.

#### G6. The audit log has holes 💻

> **✅ Done 2026-10-06.** Every route below now calls `auditAdmin()`
> (`campaign_moderated`, `feedback_triaged`, `early_access_deleted`,
> `event_registration_updated`/`_deleted`, `event_survey_form_updated`,
> `saved_report_created`/`_deleted`, `email_test_sent`, `issue_created`/
> `_updated`/`_deleted`); `support/route.ts`'s untyped raw inserts
> (`support.replied` etc.) were replaced with typed actions
> (`support_replied`, `support_note_added`, `support_ticket_updated`);
> `user_updated` now logs `{before, after}`; opening a user's detail page
> logs `user_viewed`; the audit screen and its API gained actor/action/target
> filters.

- **Admin write routes that write no audit row:** `campaigns/[id]` (approving
  or removing a campaign), `reports` (resolving a report, even though
  `report_resolved` is a defined action type), `feedback`, `early-access/[id]`,
  `event-registrations/[id]`, `event-survey`, `reports/saved`, `emails`,
  `issues`, `broadcasts/preview`.
- **No before/after values.** Rows record *that* a user was updated, not what
  changed. "Who changed this creator's email from X to Y" can't be answered.
- **Reads of personal data aren't logged.** Opening a user's full detail
  (email, phone, payments) leaves no trace; only CSV export does
  (`report_exported`).
- **Fix:** add the missing `logAdminAction` calls (new action types:
  `campaign_moderated`, `feedback_triaged`, `early_access_updated`,
  `event_registration_updated`, `saved_report_changed`, `issue_changed`); put
  `{before, after}` of the changed fields in `metadata`; log
  `user_viewed` when an admin opens `users/[id]`. Add filters to the audit
  screen by actor, action and target.

### P1: "everything about a user in one place"

#### G7. The per-user screen is missing half the story 💻

> **✅ Done 2026-10-06.** The page is now tabbed (Overview · Money ·
> Projects & requests · Support & safety · Devices & comms · Timeline) and
> `GET /api/admin/users/[id]` returns every row in the table below, each
> gated by the same section permission its own console page already uses
> (and `null`, not an error, when the caller lacks it). Sign-in history is
> new — `admin_get_user_signins()` (migration 195) reads
> `auth.audit_log_entries` directly, since that schema isn't exposed through
> PostgREST.

`/api/admin/users/[id]` returns: profile, business/creator profile, projects,
requests, activity timeline. All of the following already exist in tables or
other console screens, but **support can't see them on one page**:

| Missing on the user page | Lives in |
|---|---|
| Payments made/received, refunds | `project_payments` / Payments section |
| Pro subscription, renewals, invoices | Subscribers section, billing tables |
| Support tickets | `support_tickets` |
| Reports filed **by** and **against** them, blocks | `user_reports`, `blocks` |
| Devices, app version, platform, push tokens | `push_devices` / App activity |
| Social accounts + verification/ownership history | verification tables |
| Emails sent to them (and bounces) | email log / Emails section |
| OTP attempts | OTP logs |
| Broadcasts / notifications received | broadcast deliveries, notifications |
| Sign-in history (when, which platform) | Supabase `auth.audit_log_entries` (not surfaced) |

**Fix:** turn the user page into tabs (Overview · Money · Projects & requests
· Support & safety · Devices & comms · Timeline), each tab behind the matching
section permission so staff only see what they're granted. Field masking
already happens in `adminJson`.

#### G8. Disputes and refunds happen outside the console 👤💻
- A payment can have status `refunded`, but **there is no refund action** in
  the console: refunds are done in the Razorpay dashboard, so the console
  can't show who refunded, why, or when.
- There is **no dispute object**. A disagreement is a support ticket, a report,
  or a cancellation, so there's no single queue for "money is contested".
- **Fix:** a `disputes` table (project, raised by, reason, amount, status,
  resolution, resolved by) with a Disputes section; a refund action that calls
  the Razorpay refund API and writes the audit row; sync refund webhooks into
  the ledger.

#### G9. Chat is invisible to the admin 👤 (policy) + 💻
Live messages are in GetStream, not Postgres. When a creator reports
harassment in chat, the moderator can't read the conversation.
**This is a policy decision first:** the recommended rule is *access only to
a conversation named in an open report, logged as `conversation_viewed`*, and
it must be stated in the privacy policy. Don't build unrestricted chat reading.

#### G10. Sign-in and security events aren't visible 💻
`login_completed` is defined but never fired, and Supabase's own auth audit
log isn't surfaced. You can't answer "did this account sign in from a new
device yesterday" or "is someone brute-forcing logins". Surface
`auth.audit_log_entries` (service role, per user and as a failed-login report).

#### G11. Data retention is undefined 👤
Only OTP logs are purged (90 days, `/api/cron/maintenance`). Activity, search,
push delivery, rate-limit, email logs and the audit log grow forever. Decide a
period per table (suggested: raw activity/search 13 months, push/email
delivery 6 months, audit log 3 years, payments as long as tax law requires),
add each to the maintenance cron, and state it in the privacy policy. India's
DPDP Act expects stated purposes and retention.

#### G12. Native mobile crashes aren't captured 👤
The mobile reporter uses plain `fetch` so it could ship as an OTA update. A
**native** crash kills the process before JS runs, so it's never reported.
Adding `@sentry/react-native` is a native dependency and needs a store build.
**Ask before adding it** (standing rule on native deps); do it with the next
planned native build. Until then, check Play Console → Android vitals and App
Store Connect → Crashes by hand.

#### G13. No performance tracing in the app 💻 (low)
The web reporters are custom and send errors only, with no traces or
breadcrumbs. Application Insights covers request latency per endpoint, which is
enough for now. Revisit only if App Insights can't explain a slow page.

#### G14. Staff section limits stop at the API 💻

> **✅ Done 2026-10-07.** `admin_has_permission(section, level)` (migration
> 196) does what `is_admin()` plus `lib/admin-access.ts`'s `allows()` would
> compute together; the 25 `admin_*` RPCs that were granted `EXECUTE` to
> `authenticated` and checked only `is_admin()` now call it instead, each
> mapped to the same section key and view/manage level its console page
> already requires. `admin_creator_applications_report` has no console page
> yet, so it's mapped to `early_access` (closest existing section) rather
> than staying ungated. The `admin_team_*` functions in migration 176 needed
> no change — they were already revoked from `authenticated` entirely.
> Migration 196 is new on this branch and not yet applied anywhere.

Documented in AGENTS.md: staff are still `is_admin()`, so a staff member
calling an `admin_*` RPC directly through PostgREST can read outside their
sections. Move each RPC to a per-section check (`admin_can_view('<section>')`).
This matters once staff are people other than the founders.

### P2: nice to have

#### G15. Founder dashboard additions 💻

> **✅ Done 2026-10-07.** All 5 added to `admin_founder_dashboard()`
> (migration 197): `top_niches` and `top_brands` by lifetime GMV,
> `campaign_success` (published campaigns vs. accepted-applicant-produced-a-
> completed-project — there's no FK from `campaign_projects` back to the
> campaign that produced it, so this is the same approximation style as the
> existing `request_to_project_pct`), `creator_earnings_distribution`
> (lifetime paid amount bucketed), and a per-day `payment_failure_rate_pct`
> in `series`. Frontend added to `/dashboard/admin/founder`.

Already present: most of the list you pasted. Missing:
**top niches/categories** by projects and GMV, **top-spending brands**,
**campaign success rate** (published → ≥1 completed project), **creator
earnings distribution**, and **payment failure rate** as a trend rather than a
count. Each is one SQL block in the `founder` insight, not a new system.

#### G16. BI tool (Metabase) 👤
Not needed while the report builder + insights answer the questions. If you
add it later, point it at a **read-only Postgres role** (never the service
key), and preferably a read replica, so ad-hoc queries can't slow the app.

#### G17. Admin activity digest 💻

> **✅ Done 2026-10-07.** `admin_digest` email template +
> `/api/cron/maintenance` now emails every super admin daily: new
> signups/GMV (`admin_period_kpis`), tickets waiting on us over 24h, pending
> approvals/verifications, and new Sentry issues (omitted with a line
> explaining why when Sentry isn't configured). No new cron — it's a third
> step inside the existing daily maintenance run.

A daily email to the founders: new users, GMV, open tickets older than 24h,
pending approvals, new Sentry issues. Built from the existing insights and
sent by the existing maintenance cron.

---

## 5. Deliberately *not* building (and why)

- **CDN, API gateway, microservices, BullMQ, Elasticsearch.** No current
  bottleneck needs them, and each one is another thing to run and pay for.
- **Prometheus + Grafana + Loki.** Application Insights, Azure Monitor and
  Log Analytics already do metrics, dashboards and log search for Azure
  Container Apps with no code. Running a second stack would duplicate them.
- **Unmasked session replay and heatmaps.** The DOM holds creator PII and
  message drafts. If you want replay, turn on PostHog replay with
  `maskAllInputs` and text masking, **only** on onboarding pages, and say so
  in the privacy policy.
- **A separate event-log table.** The activity feed is derived from the rows
  that record each fact (migration 073 approach), so it can't drift from the
  truth.

---

## 6. Verify by hand: things the repo can't prove

Tick these from the vendor dashboards. Each takes a few minutes.

- [ ] **Azure → influnet-staging → Application Insights** is enabled and shows
      requests in the last 24h.
- [ ] **Azure → Container App → Logs** is attached to a Log Analytics
      workspace; the KQL in OBSERVABILITY.md §3.2 returns rows.
- [ ] **UptimeRobot (or similar)** monitors `/api/health` and alerts someone.
- [ ] **Sentry** shows events tagged `environment: staging` (web) **and** from
      the mobile production build since `7fd1eaea`.
- [ ] **PostHog** shows `$pageview` and `screen_viewed` from both platforms.
- [ ] `/dashboard/admin/observability` renders data, which proves
      `SENTRY_API_TOKEN` and `POSTHOG_PERSONAL_API_KEY` are set.
- [ ] `/dashboard/admin/rate-limits` or the container env shows **Upstash**
      in use on staging (G4).
- [ ] `NOTIFY_EMAILS_ENABLED` on staging is what you intend, so a new support
      ticket reaches someone.
- [ ] **Supabase → staging project → Usage** alerts are on.

---

## 7. Suggested order of work

| # | Item | Who | Size |
|---|---|---|---|
| 1 | §6 checklist (App Insights, Log Analytics, uptime, Sentry, PostHog, Upstash) | 👤 | ½ day |
| 2 | G2 alerts: Sentry, Azure Monitor, UptimeRobot, Supabase, one channel | 👤 | ½ day |
| 3 | G5 admin MFA | 💻 + 👤 enrol | 1 day |
| 4 | G1 analytics events + web identify | 💻 | 1–2 days |
| 5 | ~~G6 audit gaps + before/after + view logging~~ | 💻 done 2026-10-06 | — |
| 6 | G4 Upstash on staging deploy | 💻 + 👤 secret | 1 hour |
| 7 | ~~G7 user 360 page~~ | 💻 done 2026-10-06 | — |
| 8 | G8 disputes + refunds | 👤 decide, 💻 build | 2–3 days |
| 9 | ~~G10 sign-in history~~ done 2026-10-06 (part of G7); G11 retention policy | 💻 / 👤 | 1–2 days |
| 10 | G9 chat access policy | 👤 decide first | — |
| 11 | ~~G14 RPC section scoping~~ | 💻 done 2026-10-07 | — |
| 12 | G12 native crash SDK, at next store build | 👤 approve | with build |
| 13 | ~~G15 founder additions, G17 admin digest~~ done 2026-10-07; G16 Metabase | 💻 | as wanted |

After items 1–7, the claim "nothing is hidden from the admin" holds, with
three stated, deliberate exceptions: chat (privacy policy), session replay
(PII), and native crashes until the next build.
