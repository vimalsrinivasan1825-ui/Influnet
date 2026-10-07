# What's waiting on you — 2026-10-07

Everything here needs **you**: an account, a dashboard, a credential, or a
decision. Code-side work is done or listed elsewhere. Ordered by what unblocks
the most.

Each item says where it's done and how to tell it worked. Items marked
*(from <doc>, <date>)* come from that document and were not re-checked today;
everything else was seen directly on 2026-10-07.

---

## A. To make today's admin work fully live

| # | Do this | How you know it worked |
|---|---|---|
| A1 | ✅ **Done 2026-10-07:** pushed to `dev`; CI applied migration **198** and deployed (run 37637451606, all green). | `E2E_BASE_URL=https://dev.influnet.io node --env-file=apps/web/.env.local tests/e2e/verify-198-journey.mjs` reports the journey has events. In the console, a user's **Journey** tab no longer says "appears once migration 198 is applied". |
| A2 | **Renew `SUPABASE_ACCESS_TOKEN`** in `apps/web/.env.local`. Supabase → Account → Access Tokens → new token. The current one returns **401 Unauthorized** (seen today). | `tests/e2e/lib/sql.mjs` and `scripts/apply-migration.mjs` work again. Without it nobody can apply a migration by hand or run the audit harness's SQL checks. |
| A3 | **Open the dev → staging PR** when you're happy with dev. Staging gets 196, 197 and 198 from that merge. | Same Journey check against `staging.influnet.io`. |
| A3b | **Turn on Supabase's database auth audit log** on dev and staging (Supabase → Authentication → the audit-log setting that writes to the database). Today `auth.audit_log_entries` gets no rows: an account that had just signed in showed zero sign-ins. | A user's **Sign-ins** tab lists logins after you sign in once, and the Journey shows "Signed in" rows. Nothing to deploy. |
| A4 | ✅ **Done 2026-10-07:** admins with *Team* access can open the Audit log (Team nav group). Staff never can: the database refuses Team for staff. | Sign in as an admin with Team → *Team → Audit log* opens. |

---

## B. Admin console: switches and accounts

*(from [ADMIN_AND_OBSERVABILITY_GAPS](ADMIN_AND_OBSERVABILITY_GAPS_2026-10-06.md) and [ADMIN_CRM §2](ADMIN_CRM.md), 2026-10-06)*

| # | Do this | Why |
|---|---|---|
| B1 | **Two-factor for admins.** Supabase → Authentication → Multi-Factor → enable TOTP on dev *and* staging; every admin enrols from the console banner; then set `ADMIN_REQUIRE_MFA=true` on the containers. The banner still shows on dev today ("protected by a password only"). | One leaked admin password exposes every user and can broadcast to all of them. |
| B2 | **One login per admin**, never a shared one (`scripts/create-admin.mjs`, Team page for staff). | The audit log can only say *who* did something if people don't share an account. |
| B3 | **Cron secrets:** `CRON_SECRET` on the container; `BROADCAST_ENDPOINT`, `MAINTENANCE_ENDPOINT`, `NUDGE_ENDPOINT` as repo secrets. | Without them scheduled broadcasts, nudges, the digest and the OTP-log purge silently skip. |
| B4 | **Upstash on staging:** add `UPSTASH_REDIS_REST_URL` / `_TOKEN` to the `staging` GitHub Environment and pass them in `deploy-staging.yml`. | Otherwise rate limits are per replica and reset on restart. Check `/dashboard/admin/rate-limits`. |

---

## C. Monitoring: make sure someone hears when it breaks

*(from [ADMIN_AND_OBSERVABILITY_GAPS §G2/§6](ADMIN_AND_OBSERVABILITY_GAPS_2026-10-06.md), 2026-10-06)*

Send every alert to **one** place (an email group or a Slack channel).

- [ ] **UptimeRobot** on `https://staging.influnet.io/api/health`: 1-minute check, alert after 2 failures.
- [ ] **Sentry** → Alerts → Issue alert: any new issue; more than 20 events in 5 minutes. (Webhook signature failures already report to Sentry.)
- [ ] **Azure Monitor** on Application Insights: failed requests above 5% over 5 minutes.
- [ ] **Azure Monitor** on the Container App: any restart; CPU or memory above 80% for 10 minutes.
- [ ] **Supabase → Usage** alerts on both projects: egress, DB size, connections at 80%.
- [ ] **GitHub** → notify on workflow failure (broadcast, nudge, maintenance crons).
- [ ] Confirm by eye: Application Insights shows requests; Container App logs reach Log Analytics; Sentry shows `environment: staging` events from web and mobile; PostHog shows `$pageview` and `screen_viewed` from both platforms; `/dashboard/admin/observability` and `/dashboard/admin/health` render real data.

---

## D. Decisions only you can make

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Reading chat in a dispute** (G9). Messages live in GetStream; moderators can't see a reported conversation. | Allow access *only* to a conversation named in an open report, logged as `conversation_viewed`, and say so in the privacy policy. |
| D2 | **Refunds and disputes** (G8). Refunds are done in the Razorpay dashboard, so the console can't show who refunded or why. | Approve a Disputes queue plus a refund button that calls Razorpay and writes the audit row. I can build it. |
| D3 | **Data retention** (G11). Only OTP logs are purged. India's DPDP Act expects stated retention. | Raw activity/search 13 months, push/email delivery 6 months, audit log 3 years, payments as tax law requires. Then I add them to the maintenance cron. |
| D4 | **Native crash reporting** (G12) needs `@sentry/react-native`, which is a native dependency and a store build. | Do it with the next planned native build, not before. Until then check Play Console vitals and App Store Connect crashes by hand. |

---

## E. Stores and legal

*(from [STORE_REVIEW_STATE](STORE_REVIEW_STATE_2026-10-03.md), 2026-10-03; re-check each console for live status)*

- [ ] **Play Data safety:** declare crash logs, diagnostics and analytics (the OTA that sends them is already live).
- [ ] **Play App access:** give the review creator account's login.
- [ ] **Terms:** add a user → Influnet licence to display user content (Content Rights was answered "Yes"). Needs a lawyer.
- [ ] **Mailboxes:** `support@influnet.io` and `grievance@influnet.io` have no MX, but the privacy policy names them. Set up Cloudflare Email Routing.
- [ ] **Razorpay live mode** before any real brand pays.
- [ ] **iOS distribution certificate** has been revoked twice in a month. Find out who else uses Apple team `S54MPG8G9M`.
- [ ] When reviews return: iOS is a **manual release**, so click *Release This Version*.

---

## F. Before real users depend on it (go-live)

*(from [HANDOVER.md Part 1](HANDOVER.md); that doc has the steps)*

There is **no production tier yet**. "Production" in config points at the
staging database. In order: P0.1 fix `deploy-prod.yml` (code) → **P0.2 provision
a production Supabase project** → P0.3 production Container App → P0.4 create
`main` → **P0.5 turn on email confirmation** → P0.6 publish legal pages →
**P0.7 real payment credentials, prove one rupee moves** → P0.8 decide the plan
switch → P0.9 point the mobile app at production → **P0.10 set the
fail-silently switches** (Sentry DSN, Upstash, `RESEND_WEBHOOK_SECRET`,
`APIFY_TOKEN`) → **P0.12 prove a backup restores**.

---

## Found today, worth knowing

- The **old activity timeline prints payments 100× too large** (paise shown as
  rupees: ₹15,000 reads as ₹1,500,000). It's the fallback until 198 is applied;
  the new Journey is correct. Nothing else reads that function.
- The demo/backfilled test data has projects dated **before** their creator
  signed up, so those milestone dates look odd on test accounts. That's the
  data, not the page.
