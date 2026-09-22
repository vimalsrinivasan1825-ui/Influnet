# Admin CRM — how it works and how to run it

**Built:** 2026-09-17 · **Migrations:** 152–160 (applied on **dev** only)
**Plan it implements:** [../product/ADMIN_CRM_ANALYSIS_2026-09-17.md](../product/ADMIN_CRM_ANALYSIS_2026-09-17.md)
**How to extend it:** [../architecture/ADMIN_CRM_BUILD_GUIDE.md](../architecture/ADMIN_CRM_BUILD_GUIDE.md)

This is the operator's document: what each screen answers, what has to be
switched on before it is useful, and the safety rules around sending anything.

---

## 1. What is on the admin console now

Navigation is grouped (`apps/web/src/components/dashboard/sidebar.tsx`). Sections
fold, and the fold state is remembered per browser.

| Group | Screen | Answers | Source |
|---|---|---|---|
| Workspace | Overview | The original counters | `/api/admin/dashboard` |
| | **Founder dashboard** | Is the business working? Growth, liquidity, money, all vs the previous period | `admin_founder_dashboard` (158) |
| | Live activity | What is happening right now | 099 |
| | Analytics | Original growth chart + creator funnel | 098 |
| | **Daily metrics** | One row per day: users tab and marketplace/money tab | `admin_daily_metrics` (158) |
| | **Product analytics** | Both funnels, stage drop-off, retention cohorts, time-to-value | `admin_product_analytics` (158) |
| | **Customer tracking** | Everyone, their lifecycle stage, their value | `admin_customer_tracking` (159) |
| | **Incomplete signups** | Six places people stop, with a Nudge button | `admin_incomplete_signups` (159) |
| | **Deleted users** | Who left, why, what they had done | `admin_deleted_accounts` (153) |
| | **App activity** | DAU by platform, app versions, push reach, weekday × hour heatmap | `admin_app_activity` (159) |
| Marketplace | Campaigns / Projects / Requests | The existing consoles | unchanged |
| | **Marketplace analytics** | Campaign, project and request health; stuck projects | `admin_marketplace` (159) |
| | **Engagement** | Views, clicks, reveals, saves, notification read rates | `admin_engagement` (159) |
| | **Match system** | What people search for and fail to find | `admin_search_analytics` (160) |
| Payments | **Payments** | Both money flows: paid, failed, pending, abandoned | `admin_payments_ledger` (155) |
| | **Pro subscribers** | Who pays, who is about to lapse, MRR, churn, renewals | `admin_pro_subscribers` (155) |
| Engagement | **Broadcasts** | Compose / schedule / send push, in-app, tutorials, email | 157 |
| | **Leads** | People the team talks to before they sign up | `admin_crm_leads` (160) |
| People & support | Approvals, Users, Support, Reports, Feedback | unchanged | |
| Reports & logs | **Report builder** | Any whitelisted dataset → table → CSV | `admin_report_dataset` (160) |
| | **Error log** | What is breaking, for a non-developer admin | Sentry via `/api/admin/errors` |
| | **OTP logs** | Signup code delivery health, abuse, cost | `admin_otp_logs` (154) |
| System (super admin) | Health, Vendors, Observability, Rate limits, Email, Audit, Issues | unchanged | |

Every report is read through **one** route, `/api/admin/insights/<module>`, with
the module whitelisted in `apps/web/src/lib/admin-insights.ts`. Adding a report
is a row there plus a page — never a new query built from client input.

---

## 2. Before it is fully useful

| # | Step | Why it matters | Who |
|---|---|---|---|
| 2.1 | **Apply migrations 152–160 to staging** (dev is done) | Nothing works without them. Each returns a specific 503 if missing | CI on merge to staging |
| 2.2 | **Set `CRON_SECRET`** on the container, and `BROADCAST_ENDPOINT` / `MAINTENANCE_ENDPOINT` / `NUDGE_ENDPOINT` as repo secrets | Without them the scheduled workflows skip and nothing sends on a schedule | Founder |
| 2.3 | **Give each admin their own login** (`provision_admin`, 150) | The audit log cannot say who sent a broadcast if everyone shares one account | Founder |
| 2.4 | **Fix iOS push** (cert + APNs key — see APP_STORE_READINESS) | Push reaches Android only until then | Founder |
| 2.5 | **Ship the mobile OTA update** | Platform/app-version analytics, device registration, open tracking, in-app pop-ups and in-app deletion are all in the app bundle | Developer |
| 2.6 | Optional: **PostHog keys** | Only the web-analytics panel depends on them; everything else is database-derived | Founder |

**History starts when it ships.** DAU, retention cohorts, app versions, search
analytics, push delivery and deletions are recorded from the day the migration
is applied. The screens say so rather than showing a misleading empty chart.

---

## 3. Sending a broadcast

1. **Broadcasts → New broadcast.** Pick the kind (announcement / promotion /
   tutorial / reminder / system), write a title (≤65 chars — what fits on a
   lock screen) and a message (≤240).
2. **Pick channels.** Push, in-app, email. In-app has three styles: a small card
   that slides in, a banner that stays until dismissed, or a pop-up.
3. **Pick the audience.** The composer shows live counts as you choose: total,
   creators vs businesses, how many have the app installed, how many opted out.
4. **Save as draft**, then open it and **Test on my phone** — it goes only to
   your own devices, bypassing caps and quiet hours.
5. **Send now** or **Schedule** (once, daily, weekly or monthly at an IST time).
6. Watch the **delivery log**: sent, delivered (Expo receipt), opened, skipped
   with a reason, failed with the provider's error code.

**The safety rules, all enforced server-side:**

- Quiet hours **21:00–09:00 IST** for announcements, promotions and tutorials.
  Those deliveries are held, not dropped, and go out at 09:00.
- Frequency cap: **one promotional push per person per day, three per week.**
- Opt-outs per category (Settings → What we send you, on web and mobile).
  Transactional messages — stage changes, payments, chat — are never affected.
- A send above **2,000 recipients** (`BROADCAST_APPROVAL_THRESHOLD`) needs a
  **second admin** to approve; you cannot approve your own.
- Admins are never in an audience.
- Every create, schedule, send, test, pause and cancel is written to the admin
  audit log.
- `vendor_expo_push` (Vendors screen) is the kill switch for all push.
- `BROADCAST_DRY_RUN=true` records everything and calls nothing. **Use it on
  dev, which holds real people's push tokens.**

**Images:** shown on Android and in-app today. iOS needs a Notification Service
Extension, which is native code and therefore a new store build.

**Tutorials:** a broadcast of kind `tutorial` points at one of the 18 coded
guides in `packages/core/src/guides`; the id is validated against that registry.
Authoring brand-new guides from the admin is not built.

**SMS is not a channel.** Bulk SMS in India needs TRAI DLT registration (sender
header + pre-approved templates). Decide that separately; nothing here sends SMS.

---

## 4. The scheduled jobs

| Workflow | Every | Does |
|---|---|---|
| `.github/workflows/admin-broadcasts.yml` | 5 min | Enqueue due broadcasts, send queued push/in-app/email, poll Expo receipts, refresh stats |
| `.github/workflows/admin-maintenance.yml` | daily 10:30 IST | Purge OTP rows older than 90 days; send Pro renewal reminders at 7/3/1 days before expiry and once just after |
| `.github/workflows/reengagement-nudges.yml` | daily 10:00 IST | Existing dormant-user nudges |

All three skip harmlessly until their endpoint and `CRON_SECRET` secrets exist.
The broadcast cycle is **idempotent** — deliveries are unique per
run/user/channel/device and claimed with `FOR UPDATE SKIP LOCKED` — so an
overlapping or repeated run cannot double-send. If minute accuracy ever matters,
move the same route onto Supabase `pg_cron`.

**Reconciling by hand:** `POST /api/cron/broadcasts` with the bearer secret runs
one cycle immediately and returns what it did.

---

## 5. Privacy rules built into this

- **Deleted accounts** keep no name, email, phone or handle. They keep the role,
  dates, reason, city and aggregate counts, plus a keyed HMAC of email/phone (the
  key is an env secret, never in the database) so a re-signup can be recognised.
- **OTP logs** mask phone numbers for a normal admin; only a super admin sees
  them in full. Rows are purged after 90 days. Codes were never stored.
- **CSV exports** omit phone numbers and provider ids unless the caller is a
  super admin, and every export is audited with the filters used.
- **Search logging** stores structured filters and a result count only — never
  the typed query, which routinely contains a person's name.
- **Deletion is fail-closed:** if the tombstone cannot be written, the account is
  not deleted, so the report can never silently miss someone.
- A person with an **active project cannot delete their account** until it is
  completed or cancelled — that protects the other side of a paid deal.

---

## 6. Where the numbers come from

Everything is derived from the product's own tables, so a feature that forgets
to emit an event cannot make a report lie. Only six facts needed new storage,
because nothing else recorded them:

| Table | Migration | Why it had to exist |
|---|---|---|
| `user_daily_activity` | 152 | `last_active_at` is overwritten — yesterday's DAU was gone |
| `deleted_accounts` | 153 | Deletion is a hard cascade |
| `pro_orders` | 155 | A Pro checkout that was never paid left no row |
| `push_devices` | 156 | One token per account, no platform or version |
| `broadcast_deliveries` | 157 | Sends were fire-and-forget |
| `search_events` | 160 | Searches were not logged |

Two derived columns were added: `campaign_projects.completed_at` (completion was
previously approximated from `updated_at`) and `project_payments.failure_reason`.

**All days are IST.** Reports bucket by `Asia/Kolkata`, so a signup at 01:00 IST
counts on the right day.

---

## 7. Known limits

- **Cohort retention and DAU** only cover dates after 152 shipped.
- **Platform/app-version splits** stay "unknown" until the mobile OTA update is
  out and people open it.
- **Email opens and clicks** are not tracked — Resend delivery status only.
- **Chat volume** is not in these reports: messages live in GetStream, not
  Postgres.
- **Web analytics** (pageviews, referrers, Web Vitals) still needs PostHog keys.
- **Reports scan base tables live.** That is correct and fast at today's size; if
  the platform grows an order of magnitude, add the nightly rollup table
  described in the build guide (§6.3 of the analysis) rather than un-deriving
  anything.
- The **"Commission"** section of the client's reference console has no
  equivalent: Influnet takes no cut of creator payments. Revenue is Pro.
