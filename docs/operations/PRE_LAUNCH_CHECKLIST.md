# Pre-launch checklist — before you hand the app to testers

Written 2026-08-02, for the staging tester round.

Every item says **why it matters**, **what to do**, and **how to know it worked**.
The last part is the one that gets skipped and is the reason things silently
don't work — most of this system fails *quietly* by design (a missing Sentry
DSN doesn't error, it just reports nothing).

**Legend**
- 👤 **You only** — needs an account, a credential, or a dashboard I can't reach.
- 💻 **Needs code** — not written yet; ask and I'll build it.
- ✅ **Code-complete** — already built, just needs switching on.

> **Fastest way to check most of P0:** open **`/dashboard/admin/health`**. It
> probes the live database and this deployment's config, so it tells you which
> migrations are actually applied and which integrations have credentials —
> rather than what someone remembers being true.

---

## P0 — Do before a single tester signs up

### 1. Apply the pending migrations 👤 ✅
**Why.** The live database is behind. Support, feedback, admin analytics and the
live activity feed all depend on migrations that aren't applied — those screens
return a 503 naming the missing migration until you run them.

**Do.** Apply, in order: `093` → `099` from `supabase/migrations/`.
Migrations `098` (support/feedback/analytics) and `099` (activity feed) are the
new ones and are the two that gate the admin console.

**Verify.** `/dashboard/admin/health` → *Applied migrations* — every row should
read **applied**. The "Migrations pending" tile should be `0`.

> ⚠️ I could not execute `098` or `099` against a real schema (Docker wasn't
> running here). They're carefully reviewed but **not proven**. Apply them to
> staging first and check the health page before trusting them.

---

### 2. Fix auth email delivery — this is the one that will bite you 👤
**Why.** Signup confirmation and password reset are sent by **Supabase's default
shared SMTP**, which is heavily rate-limited (a handful of emails per hour) and
has poor deliverability. Hand the link to 10 testers at once and most of them
will never receive their confirmation email — and it will look like your signup
is broken.

**Do.** Point Supabase Auth at a real sender via custom SMTP. Full walkthrough
in **[EMAIL_RESEND_SETUP.md](EMAIL_RESEND_SETUP.md)** — Resend account, verify
your sending domain (SPF/DKIM), then Supabase → Authentication → SMTP Settings.

**Verify.** Sign up with a fresh address on a personal domain (not Gmail-only)
and confirm the mail arrives, from your domain, not in spam. Then do it twice
more in a minute — the default limiter would have blocked the third.

---

### 3. Allowlist the staging redirect URLs 👤
**Why.** Password reset from web uses `window.location.origin`, and from mobile
uses `API_BASE_URL` — both now produce `https://staging.influnet.io/reset-password`.
Supabase rejects any redirect URL not on its allowlist, so reset silently fails.

**Do.** Supabase → Authentication → URL Configuration:
- Site URL: `https://staging.influnet.io`
- Redirect URLs: add `https://staging.influnet.io/**`

**Verify.** Use "Forgot password" on staging, from both web and the mobile app.
The emailed link must land on staging and actually let you set a new password.

---

### 4. Confirm Sentry is really receiving events 👤 ✅
**Why.** `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` already exist as GitHub
secrets and are injected into staging. But **every reporter fails silently by
design** — a wrong DSN produces no error anywhere. Silence is not proof it works.

**Do.** After the first traffic hits staging, open your Sentry project.

**Verify.** You see events tagged `environment: staging`. If nothing arrives
within an hour of real usage, the DSN is wrong.

---

### 5. Enable Azure Application Insights 👤
**Why.** This is your per-request telemetry — latency, throughput, failure rate,
broken down by endpoint. Zero code. Deliberately not rebuilt in the app.

**Do.** `influnet-staging` Container App → Application Insights → enable.

**Verify.** After some traffic, the Failures and Performance blades show your
`/api/*` routes.

---

### 6. Attach a Log Analytics workspace 👤
**Why.** The app emits one JSON object per line, so logs are queryable by field
— but only if they're being collected. Without this they're scrollback that
disappears.

**Do.** Attach a Log Analytics workspace to the Container App. Queries to start
with are in **[OBSERVABILITY.md](OBSERVABILITY.md) §3.2**.

**Verify.** Run the "errors in the last hour" KQL query and get rows back.
Then live-tail while you click around:
```bash
az containerapp logs show --name influnet-staging --resource-group influnet-rg --follow
```

---

### 7. Point an uptime monitor at the health endpoint 👤
**Why.** You want to hear that staging is down from a monitor, not from a tester.

**Do.** UptimeRobot (free) → `https://staging.influnet.io/api/health`, every 1–5 min.
That endpoint is anonymous, cheap, and no longer leaks database error detail.

**Verify.** The monitor shows green and alerts to somewhere you actually read.

---

### 8. Move the Stream chat webhook to staging 👤
**Why.** It still points at `https://dev.influnet.io/api/stream/webhook`. One
Stream app means one global webhook, so message notifications are being
processed by the **dev** deployment. It works today only because both share a
database — and it breaks the moment dev is down or diverges.

**Do.** Stream dashboard → Chat → Webhooks → `https://staging.influnet.io/api/stream/webhook`.

**Verify.** Send a message between two accounts; the recipient gets a push, and
the staging container logs show the webhook arriving.

---

### 9. Check the Razorpay webhook domain and secret 👤
**Why.** Payment capture confirmation arrives by webhook. If it points at dev,
staging never learns a payment succeeded and projects stall mid-flow. A
placeholder secret fails closed — safe, but nothing works.

**Do.** Razorpay dashboard → Webhooks → point at
`https://staging.influnet.io/api/payments/webhook` and confirm the signing
secret matches the `RAZORPAY_WEBHOOK_SECRET` GitHub secret.

**Verify.** Make one real test payment end-to-end and watch the project advance.
`/dashboard/admin/activity` should show a `payment_paid` event.

---

### 10. Publish the mobile OTA update pointing at staging 👤 ✅
**Why.** The code change is committed, but installed apps only pick it up when
you publish. Two traps, both verified the hard way:

**Do.**
```bash
cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=https://staging.influnet.io npx eas-cli update --channel production --clear-cache --message "Point production channel at staging"
```
- The **inline env var** beats `apps/mobile/.env.local`, which sets a LAN IP —
  without it you ship `192.168.1.5:3000` to every tester.
- **`--clear-cache`** matters: an export with the right env var still produced a
  bundle containing the *old* URL until the Metro cache was cleared.

**Verify.** In the app: Profile → share your profile link. It must read
`staging.influnet.io/...`. Then watch the Azure logs while a tester uses the
app — requests should appear there.

---

### 11. Decide on the landing page links 👤
**Why.** `influnet.io` (your **public** marketing site) currently links to
`dev.influnet.io/login`. I changed it to staging, but **that change is
uncommitted** — deliberately, because deploying it sends every real visitor to
staging, not just your testers.

**Do.** Either commit and run the "Azure Static Web Apps CI/CD" workflow
(it now has a manual trigger), or leave the public site pointing at dev and give
testers the staging URL directly. **I'd suggest the second** for a private
tester round.

**Verify.** `curl -s https://influnet.io | grep -o 'href="https://[a-z.]*influnet.io/login"'`

---

## P1 — Before real users or real money

### 12. Give production its own Supabase project 👤
**This is the biggest remaining risk.** There is exactly one
`NEXT_PUBLIC_SUPABASE_URL` secret and no environment-scoped override, so
**staging and dev share the same database**. `CICD.md` claims every environment
has its own project; that is aspirational, not true. Right now tester data and
dev data are the same rows — a bad cleanup script hits both.

### 13. Transactional email 💻
`RESEND_API_KEY`, `EMAIL_FROM` and `NOTIFY_EMAILS_ENABLED` are all configured
for code that **does not exist** — `resend` isn't even a dependency. Nobody is
emailed when a support ticket arrives, a collab request comes in, or a project
moves. Today that means **someone must watch `/dashboard/admin/support`
manually.** Ask and I'll wire it.

### 14. Distributed rate limiting 👤
`UPSTASH_*` is unset, so the limiter uses an in-process counter — correct for a
single container, wrong the moment Azure scales to two. Set
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 15. Mobile native crash reporting 💻
JS errors and React render errors are captured. A **native** crash is not — it
kills the process before JS runs. Fixing it needs `@sentry/react-native`, which
is a native module, so it requires a **new build**, not an OTA update. Schedule
it with your next real build.

### 16. Product analytics (PostHog) 👤 ✅
Built and completely inert. When you want funnels, follow
**[ANALYTICS.md](ANALYTICS.md) §3** — note `NEXT_PUBLIC_POSTHOG_KEY` must be a
**build arg**, because `NEXT_PUBLIC_*` freezes at build time and setting it in
the Azure portal afterwards does nothing.

### 17. Admin two-factor 👤 ✅
`ADMIN_REQUIRE_MFA=true` forces `aal2` on every admin route. Left off so
provisioning an admin can't lock them out. Turn it on once your admins have MFA
enrolled — the admin console now exposes a lot more than it used to.

---

## P2 — Quality, can follow

- **Integration tests never run anywhere** — 6 tests skip for want of a test
  Supabase project, including in CI.
- **5 pre-existing lint errors** (3 landing, 2 web). Next 16 doesn't lint during
  build so they don't block, but CI lint is advisory and should become blocking.
- **`NOTIFY_EMAILS_ENABLED=false`** on staging — irrelevant until #13 exists.

---

## Daily routine during the tester round

Five minutes each morning:

1. **`/dashboard/admin/health`** — anything red? A missing secret or unapplied
   migration explains most "it's broken" reports before you read them.
2. **`/dashboard/admin/activity`**, last 24h — did people *do* things, or only
   sign up? Watch **stalled creators**: signed up but never verified is your
   clearest onboarding-leak signal.
3. **`/dashboard/admin/support`** — anything waiting on you.
4. **Sentry** — new issues since yesterday.

Weekly: `/dashboard/admin/analytics` for the funnel (fix the biggest drop-off,
not the loudest complaint), `/dashboard/admin/feedback` to triage, and
`/dashboard/admin/audit` for who changed what.

---

## When a tester reports a problem

1. Ask for the **`ref:`** shown on the error, if there was one.
2. Search **Sentry** by `request_id`, and **Log Analytics** by the same string.
   Every request carries an `x-request-id` — including 401s and redirects.
3. Find the person in **`/dashboard/admin/activity`** — their recent events show
   exactly how far they got and what they tried.
4. Reply in **`/dashboard/admin/support`** so the conversation is attached to the
   account instead of being lost in WhatsApp.

---

## Tell your testers

- Use **`https://staging.influnet.io`** (not `influnet.io`, unless you did #11).
- If something breaks, **screenshot the whole screen** — the `ref:` code is what
  makes it findable in seconds instead of never.
- Use **Help & support** inside the app rather than messaging you directly, so
  the report is attached to their account.
- Payments are real. Use small amounts.

---

## Related

- **[OBSERVABILITY.md](OBSERVABILITY.md)** — where to look for what, KQL queries, triage.
- **[ANALYTICS.md](ANALYTICS.md)** — turning PostHog/Sentry on, and what's deliberately off.
- **[EMAIL_RESEND_SETUP.md](EMAIL_RESEND_SETUP.md)** — the email work in #2 and #13.
- **[QA_AND_GO_LIVE.md](QA_AND_GO_LIVE.md)** — the manual QA script to run before opening up.
