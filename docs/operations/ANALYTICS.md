# Analytics, error tracking & support — setup guide

Everything described here is **built and merged, and completely inactive**.
No key is configured anywhere in this repo. With the environment as it stands
today, the analytics module never downloads its SDK, the error reporters make
no network calls, and the support tables sit empty. Turning each piece on is a
separate, reversible decision — this document is the order to do them in.

> **One thing must happen before any of it works:** apply **migration 098**
> (`supabase/migrations/098_support_feedback_and_admin_insights.sql`). Support,
> feedback, and the admin analytics page all read tables and functions that
> migration creates. Until it is applied, `/dashboard/admin/analytics` returns a
> specific 503 telling you exactly that, and the support pages will error.

---

## 1. What exists now

| Layer | Status | Where |
|---|---|---|
| Server error reporting (5xx) | ✅ built, inert without DSN | `apps/web/src/lib/observability.ts` |
| **Browser** error reporting | ✅ **new** — was completely missing | `apps/web/src/lib/observability-client.ts` |
| Root-layout crash boundary | ✅ **new** — was missing | `apps/web/src/app/global-error.tsx` |
| **Mobile** JS crash reporting | ✅ **new** — was missing | `apps/mobile/lib/analytics.ts` |
| Product analytics (PostHog) | ✅ **new**, inert without key | `apps/web/src/lib/analytics.ts` |
| Web Vitals | ✅ **new** | `apps/web/src/components/observability-provider.tsx` |
| Database analytics (funnel/growth) | ✅ **new**, no third party | `/api/admin/analytics` + migration 098 |
| Customer support | ✅ **new** | `/dashboard/support`, `/dashboard/admin/support` |
| Product feedback | ✅ **new** | `FeedbackWidget`, `/dashboard/admin/feedback` |
| Report moderation UI | ✅ **new** — API existed since 056 with **no screen** | `/dashboard/admin/reports` |
| Admin audit log UI | ✅ **new** — table existed since 070 with **no screen** | `/dashboard/admin/audit` |

---

## 2. Do these first — no code, no deploy, ~15 minutes each

These need no keys in the repo and give the biggest return.

### 2.1 Azure Application Insights
Enable it on the `influnet-staging` Container App (and later production).
Gives CPU, memory, request latency, and HTTP error rates with **zero code
changes**. This is the "catch problems from Azure" layer.

### 2.2 Uptime monitor
Point UptimeRobot (free) or Better Stack at:

```
https://staging.influnet.io/api/health
```

Every 1–5 minutes. The endpoint already returns `{status, database}` and no
longer leaks the database error string to anonymous callers.

### 2.3 Confirm Sentry actually receives events
`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` already exist as GitHub secrets and
are injected into staging. Once traffic flows, check the Sentry project shows
events tagged `environment: staging`. If nothing arrives, the DSN is wrong —
the reporters fail silently by design.

---

## 3. Turning on product analytics (PostHog)

### Why PostHog
One project covers **both** Next.js and Expo, the free tier is generous, and
funnels/retention are built in. GA4 handles a marketplace funnel poorly and
does not span web + mobile cleanly.

### Steps

1. Create a PostHog project → copy the **Project API key** (`phc_…`).
2. Add to GitHub secrets: `NEXT_PUBLIC_POSTHOG_KEY`, and optionally
   `NEXT_PUBLIC_POSTHOG_HOST` (defaults to `https://us.i.posthog.com`).
3. Add the build args to `.github/workflows/deploy-staging.yml`, alongside the
   existing `NEXT_PUBLIC_*` args:

   ```
   --build-arg NEXT_PUBLIC_POSTHOG_KEY="${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}" \
   --build-arg NEXT_PUBLIC_APP_ENV="staging" \
   ```

   `NEXT_PUBLIC_*` is **frozen at build time** — setting it in the Azure portal
   afterwards does nothing for browser code. It must be a build arg.
4. For mobile, set `EXPO_PUBLIC_POSTHOG_KEY` when publishing an OTA update.
   Remember the two traps from the staging cutover: pass it **inline** (so it
   beats `apps/mobile/.env.local`) and pass `--clear-cache` (so Metro does not
   reuse a stale inlined value).

### What is deliberately switched off inside PostHog

| Setting | Value | Why |
|---|---|---|
| `autocapture` | `false` | Autocapture records every click and input. This app has creator PII and message drafts in the DOM — autocapture is the classic way that leaks to a third party. |
| `capture_pageview` | `false` | It misses App Router soft navigations and double-counts first load. We send our own from `ObservabilityProvider`. |
| `disable_session_recording` | `true` | Replay would capture the same PII. Turn on deliberately, with masking, if ever needed. |
| `respect_dnt` | `true` | Honour the browser's Do Not Track signal. |

Identify sends **only** a user id and role — never email, name, or handle.
Keeping PII out of an analytics vendor is far easier than getting it deleted.

### The event vocabulary
`AnalyticsEvent` in `apps/web/src/lib/analytics.ts` is a closed union, and the
mobile copy uses the **same names** so one funnel spans both platforms. The
list is ordered by funnel position — rebuild the PostHog funnel in that order:

```
signup_started → signup_completed → profile_completed →
ownership_confirmed → verification_granted → collab_request_sent →
deal_agreed → project_created → payment_succeeded → project_completed
```

Call sites are wired for support and feedback today. Adding more is a
one-line `track('event_name', { … })` — the type stops typos at compile time.

---

## 4. Mobile crash reporting — read this before promising it

`apps/mobile/lib/analytics.ts` talks to PostHog and Sentry over **plain
`fetch`**, with no new native dependency. That is not a shortcut, it is the
constraint: `posthog-react-native` and `@sentry/react-native` both add native
modules, and **a native module can only reach a device through a new build**.
Testers already have the app installed, so this ships as an ordinary OTA
update instead of a re-download.

**What you get:** every JS error, the React error boundary, and the full
funnel.
**What you do not get:** native crash capture (a native crash kills the process
before JS runs), session replay, automatic breadcrumbs.

Switch to the native SDKs at the next real build, not before.

---

## 5. The analytics that need no vendor at all

`/dashboard/admin/analytics` is computed from Postgres via three functions in
migration 098:

- `get_admin_growth_series(days)` — signups / requests / projects per day
- `get_admin_funnel()` — where creators stop, from signup to completed collab
- `get_admin_support_stats()` — inbox counters

This works before PostHog exists, and stays correct for users running an ad
blocker — which silently drops a meaningful share of client-side analytics.
PostHog answers "what did people click"; this answers "what is in the
database", and for a marketplace the second question decides what to build.

---

## 6. Support & feedback

| Route | Who | What |
|---|---|---|
| `/dashboard/support` | any signed-in user | Open a request, track it, reply |
| `/dashboard/admin/support` | admin | Queue ordered by longest wait, reply, internal notes, priority, resolve |
| `/dashboard/admin/feedback` | admin | Feedback board with triage states |
| `/dashboard/admin/reports` | admin | Moderation queue for user reports |
| `/dashboard/admin/audit` | admin | Append-only record of admin actions |
| mobile `Settings → Help & support` | any user | Same tickets, same endpoints |

Notes worth knowing:

- **Internal notes are invisible to users at the database level.** The RLS
  SELECT policy on `ticket_messages` excludes `internal = true`, so a bug in a
  route handler cannot expose them.
- **A user cannot forge a message from support.** The RLS INSERT policy only
  lets a non-admin write rows with `from_admin = false`.
- **Ticket state is maintained by a trigger**, not by route code, so the queue
  ordering and the counters can never disagree.
- Ticket `context` is an **allowlist** (`route`, `platform`, `app_version`,
  `user_agent`, `project_id`), truncated to 300 chars. Anything else the client
  sends is dropped — see `tests/unit/support-context.test.ts`.

Emails are **not** wired to tickets. `NOTIFY_EMAILS_ENABLED` is `false` on
staging, so nobody is emailed when a ticket is opened. Someone has to watch the
inbox, or that gets wired next.

---

## 7. Error handling changes made alongside this

- 10 API routes returned raw `error.message` to the client (Postgres errors
  name tables, columns and roles). They now use `jsonError`, which logs the
  detail, reports 5xx to Sentry, and returns a written message.
- `/api/health` no longer returns the database error string — it is
  **unauthenticated**, so anything in that body is public.
- `/api/auth/register` deliberately still passes its RPC message through:
  `register_profile` raises text written for the person signing up
  ("Username already taken"). Making that opaque would turn a fixable form
  error into a dead end. The catch-all around it no longer leaks.
- `app/error.tsx` imported the **server** observability module, dragging the
  zod env schema into the browser bundle. It now uses the browser reporter.

---

## 8. Verification

```bash
npm run typecheck && npm run test:unit --workspace=web
```

The safety properties have tests: analytics is inert without a key, the error
reporter is inert without a DSN, it deduplicates and caps flooding, and it
strips query strings so a password-reset token never reaches Sentry.
