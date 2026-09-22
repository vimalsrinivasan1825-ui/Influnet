# Production readiness — what is actually missing, and the order to fix it

Date: 2026-09-14 · Branch: `dev` · Scope: making Influnet safe to hand to real
users and maintainable by one person for years.

This is deliberately **not** a repeat of
[HANDOVER.md](HANDOVER.md). HANDOVER answers *"what blocks go-live"*. This
answers the two questions you actually asked:

1. **When a user hits a problem, will I find out, and can I fix it?**
2. **When one part breaks, does it stay broken alone — or take the app with it?**

---

## Verdict, in one paragraph

The *code* for observability is already written and is better than most
projects at this stage — a hand-rolled Sentry client, a PostHog wrapper with a
defined event taxonomy, `x-request-id` correlation through proxy → logs →
Sentry, a deep `/api/admin/health` that probes the live database. What is
missing is almost entirely **wiring and process, not code**: keys that were
never put into the deploy pipeline, alerts that nobody configured, and a
restore that was never tested. The genuine *engineering* gap is different and
narrower than you'd expect: **fault isolation**. Composite endpoints use
`Promise.all` 20 times and `Promise.allSettled` zero times, roughly half of
outbound HTTP calls have no timeout, and the runtime kill switch that does exist
(migration 137) covers four product flags but none of the third parties.

---

## Part 1 — The instruments: written vs. actually switched on

| Instrument | Code | Wired into deploys | Reality today |
|---|---|---|---|
| **Sentry (errors)** | ✅ `apps/web/src/lib/observability.ts`, `observability-client.ts`, `apps/mobile/lib/analytics.ts` | ✅ `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` passed in `deploy-dev.yml` / `deploy-staging.yml` | Events probably arrive. **Nothing alerts you.** No alert rule, no release tagging, no source maps → stack traces point at minified bundles |
| **PostHog (product analytics)** | ✅ `apps/web/src/lib/analytics.ts` + taxonomy | ❌ `NEXT_PUBLIC_POSTHOG_KEY` appears in **no workflow** | Structurally off in every deployed environment. You have **zero funnel data**. The wrapper no-ops silently by design |
| **Upstash (distributed rate limit)** | ✅ `apps/web/src/lib/rate-limit.ts` auto-upgrades | ❌ `UPSTASH_REDIS_*` in **no workflow** | Every environment runs the in-process fallback. Correct on one replica; wrong the instant you scale to two. Also **fails open** |
| **Uptime monitor** | n/a | ❌ | `OBSERVABILITY.md` §3 *instructs* you to point UptimeRobot at `/api/health`. That is an instruction, not a fact. Unverified |
| **App Insights / Log Analytics** | n/a (JSON logs ready) | ❌ | Documented as "do this first", not confirmed enabled |
| **Request correlation** | ✅ `src/proxy.ts` → `x-request-id` | ✅ | Works. This is your best triage asset |
| **Admin health screen** | ✅ `/api/admin/health` | ✅ | Works, but probes stop at migration **113**. 114, 115, 117, 127, 138, 140, 146, 148 are invisible to it |
| **CodeQL + Dependabot** | ✅ weekly + `.github/dependabot.yml` | ✅ | Fine |
| **Backups** | Supabase automatic | — | **Never restore-tested.** An untested backup is a belief, not a backup |

**The single most important line in this table:** nothing on this list
*notifies you*. Every instrument is a place you have to remember to go and
look. That is the difference between "we have monitoring" and "I will find out."

---

## Part 2 — Isolation: where one failure becomes every failure

You said this is the main part, and you're right to. Five concrete gaps, with
evidence.

### 2.1 `Promise.all` collapses composite endpoints
20 occurrences in `apps/web/src/app/api`, **0** `Promise.allSettled`.

`Promise.all` rejects on the *first* failure and discards every sibling result.
So on a dashboard endpoint that fetches reach + views + money + pipeline in
parallel, one slow or erroring sub-query returns a 500 for the whole screen —
the user sees a blank dashboard, not three working panels and one that says
"unavailable".

**Fix shape:** `allSettled` + render per-panel degraded state. This is the
highest-leverage isolation change in the codebase and it is mechanical.

### 2.2 Half of outbound calls have no timeout
29 `fetch(` calls in `src/lib` and `src/app/api`; 15 uses of
`AbortSignal.timeout` / `AbortController`. A hung Apify, Razorpay, Stream or
Resend connection holds a request open until the platform kills it. Under any
load that consumes the request pool and the *whole app* goes slow because one
vendor did.

**Fix shape:** every outbound call gets an explicit deadline. No exceptions.

### 2.3 The runtime kill switch exists, but only covers four product flags
*Corrected 2026-09-14 — an earlier draft of this document said there was no
runtime kill switch at all. That was wrong, and the correction matters because
it makes this a much smaller job than it first looked.*

`public.feature_flags` (migration **137**) is already the authoritative source
for `phone_otp`, `notify_emails`, `subscriptions` and `ownership_gate`.
`apps/web/src/lib/feature-flags.ts` keeps a process-wide snapshot on a 45s TTL,
falls back to the env var when a key has no row and to `false` when there is no
env var either, treats a missing table as "not an error", and exposes
`flagSources()` so you can see whether a value came from the row, the env or the
default. `deploy-dev.yml` documents the whole arrangement. Flip a boolean in the
dev Supabase project and the app picks it up in about 45 seconds, no deploy.

So the mechanism is built, correct, and live. What it does **not** cover is the
third parties: there is no row you can flip when Apify starts timing out,
Razorpay is refusing, Stream is down or Resend is bouncing. That is the 2am
scenario, and it is still a redeploy today.

**Fix shape:** add integration keys to the existing table and check them at each
outbound boundary. Extending something proven, not building a system.

### 2.4 No circuit breakers
When a third party is failing, every request still tries it, waits, and fails.
Nothing stops calling a dependency that is known-down. Cheap to add once
timeouts exist.

### 2.5 Fail-open defaults still in place
AGENTS.md documents this as the source of the worst bug found in the 2026-08-08
audit (vacuous stage gate → unpaid project walked the money gate). The pattern
in `stage-items-gate.ts` is the right one: `null` = unreadable (degrade), `[]`
on a stage that should have rows = broken (fail closed). The database has been
current since 2026-08-08, so **every remaining fail-open default is guarding a
state that no longer exists.** Each one needs a deliberate decision. The rate
limiter also fails open — defensible for abuse guards, not for money paths.

### What is already well isolated (don't break it)
- **Chat is Stream, not Postgres** — a database incident does not kill messaging.
- **Error boundaries exist** on both web (`error.tsx`, `global-error.tsx`) and
  mobile (`components/error-boundary.tsx`).
- **Email, Apify, PostHog, Sentry are all optional-by-design** — absent keys
  no-op rather than crash.
- **Payment gates open only via signed webhook** — no client-trusted amounts.

---

## Part 3 — The checklist, in order

Do these top to bottom. Each block is useful on its own; nothing later depends
on you having finished everything earlier. 👤 = only you can do it (accounts,
passwords, billing). 💻 = a developer task.

### Block 0 — See what is happening (do this week)

- [ ] **0.1 👤 Confirm Sentry is actually receiving events.** Open the Sentry
      project, trigger a deliberate error on staging, confirm it lands with a
      `request_id` tag. If it does not, the DSN secret is empty in that GitHub
      Environment.
- [ ] **0.2 👤 Create two Sentry alert rules.** (a) any *new* issue → email;
      (b) an issue seen >10 times in 5 minutes → email. Without these, Sentry is
      a diary, not an alarm.
- [ ] **0.3 💻 Upload source maps + tag releases.** Right now a stack trace
      points at minified code, which costs you an hour per bug forever.
- [ ] **0.4 👤 Turn on UptimeRobot** → `https://staging.influnet.io/api/health`,
      1–5 min, alert to your email **and** phone. This is the one that tells you
      the app is *down*, which Sentry cannot.
- [ ] **0.5 👤 Enable Application Insights + Log Analytics** on the Container
      App. Zero code; gives latency percentiles and per-endpoint 5xx rate.
- [ ] **0.6 👤💻 Add `NEXT_PUBLIC_POSTHOG_KEY`** to the dev/staging GitHub
      Environments and to the deploy workflows. Until this exists you are
      guessing about where users drop off.
- [ ] **0.7 💻 Extend `/api/admin/health` probes** to migrations 114, 115, 117,
      127, 138, 140, 146, 148. Migration drift is this project's most repeated
      failure mode; the health screen should catch all of it.

**Done when:** you break something on purpose and your phone tells you.

### Block 1 — Isolation (the part you called the main thing)

- [ ] **1.1 💻 Replace `Promise.all` with `Promise.allSettled`** in all 20 API
      route call sites, and render per-section degraded state instead of a 500.
- [ ] **1.2 💻 Put a deadline on every outbound call.** One shared
      `fetchWithTimeout` helper; audit all 29 `fetch(` sites. Suggested: 5s for
      Razorpay/Stream, 10s for Apify/scrapers, 3s for Resend.
- [ ] **1.3 💻 Extend the existing `feature_flags` table (137) to the third
      parties** — apify, razorpay, stream, resend — and check the flag at each
      outbound boundary. The table, the 45s snapshot and the env fallback are
      already built and live; this adds rows and call sites, not a system. An
      admin toggle screen on top of it is the other half.
- [ ] **1.4 💻 Add a simple circuit breaker** per third party: N consecutive
      failures → skip the call and return the degraded path for M seconds.
- [ ] **1.5 💻 Review every fail-open default** and decide each deliberately,
      using the `stage-items-gate.ts` null-vs-empty distinction. Write the
      decision in a comment next to the code.
- [ ] **1.6 💻 Decide the rate-limiter posture for money paths** — fail-open is
      right for abuse guards, wrong for payment endpoints.

**Done when:** you can turn Apify off from an admin screen, with no deploy, and
every other part of the app keeps working.

### Block 2 — The production tier that does not exist yet

This is HANDOVER P0.1–P0.4 and it is unchanged. Summarised so the list is
complete:

- [ ] **2.1 👤 Provision a real production Supabase project, in its own account.**
      Today `production` points at the *staging* project (`aokdansyqxracuwsosji`).
- [ ] **2.2 💻 Fix `deploy-prod.yml`** (four known defects; it has never fired).
- [ ] **2.3 👤💻 Build the production Container App**, and pass
      `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as **both**
      build args *and* runtime env vars. AGENTS.md explains why the duplication
      is not redundant; getting this wrong produces a bare 500 on every path
      that reads like a wrong port.
- [ ] **2.4 👤 Create `main` on origin** and the `production` GitHub Environment.
- [ ] **2.5 👤 Point the mobile EAS `production` profile at production**, not dev.

### Block 3 — Data you cannot afford to lose

- [ ] **3.1 👤 Perform a real restore drill.** Restore a backup into a scratch
      project, confirm row counts and that the app boots against it. Write down
      how long it took. An untested backup is not a backup.
- [ ] **3.2 👤 Set the retention window deliberately** and know what it costs.
- [ ] **3.3 💻 Document the destructive-operation rule.** The 2026-07-30
      incident note already exists — make it a hard rule: never run a purge
      without naming which Supabase project you are pointed at first.

### Block 4 — Trust and legal, before real users

- [ ] **4.1 👤 Turn on email confirmation in Supabase.** *Standing blocker:*
      signup currently never verifies the address. This is a toggle, not a
      build. Nothing else on this list matters if anyone can sign up as anyone.
- [ ] **4.2 👤 Publish the legal pages** (terms, privacy, refund) — required by
      Razorpay, not optional.
- [ ] **4.3 👤 Real payment credentials, and move one rupee end-to-end.**
- [ ] **4.4 👤 Fix the staging phone-OTP edge function** — it is stuck on the
      retired template, so OTPs go out as *voice calls* while still billing an
      SMS credit and returning `Success`.
- [ ] **4.5 👤 Decide the subscriptions switch before launch**, not after.

### Block 5 — So you can still run this in two years

- [ ] **5.1 💻 One runbook, one page.** "Site down → check X. Payments failing
      → check Y. User says Z → search request id." Not prose, a table.
- [ ] **5.2 👤 Keep an incident log.** One line per incident: what, when, cause,
      fix. In a year this is worth more than any monitoring tool.
- [ ] **5.3 👤 Access inventory** — every account, who owns it, how to get in.
      HANDOVER §3.1 has the template; it is currently only in your head.
- [ ] **5.4 👤 Credential rotation at handover**, not before.
- [ ] **5.5 💻 Keep the E2E harness green.** `tests/e2e/` is the thing that
      proves the money path still works after a change. **Note the trap:** some
      phases assert that a bug *reproduces* — flip those when you fix the bug,
      or they become lies that pass.
- [ ] **5.6 💻 Wire the audit suite into CI on a schedule** (weekly), so
      regression is detected without you remembering to run it.

---

## Part 4 — The routine that keeps it alive

**Daily, 2 minutes** — glance at Sentry's new-issues feed and the uptime status.

**Weekly, 30 minutes** — `/dashboard/admin/health` (all integrations green, all
migrations applied); PostHog funnel for a drop; App Insights 5xx rate; merge
Dependabot PRs.

**Monthly, 1 hour** — run the E2E audit suite; check Supabase usage against
plan limits (egress binds before storage does); review the incident log for a
pattern worth fixing permanently.

**Quarterly** — restore drill. Every time.

---

## What I did not change

This is an assessment only — no code was modified. Blocks 1 and 0.7 are the
developer work; say the word and I'll start with 1.1 (the `Promise.all` →
`allSettled` sweep), which is the biggest isolation win for the least risk.
