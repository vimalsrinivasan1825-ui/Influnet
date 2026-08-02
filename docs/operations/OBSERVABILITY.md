# Observability — seeing inside the app during a tester round

The goal of this document: **nothing about a tester round should be invisible.**
Who signed up, how far they got, what broke, and why — each has one place you
look, and this says which.

Read this alongside [ANALYTICS.md](ANALYTICS.md), which covers turning the
optional vendors on.

---

## 1. The four questions, and where each is answered

| Question | Where | Needs |
|---|---|---|
| Who signed up? What is happening right now? | **`/dashboard/admin/activity`** | migration 099 |
| Where do people get stuck? | **`/dashboard/admin/analytics`** | migration 098 |
| Is this deployment healthy and correctly configured? | **`/dashboard/admin/health`** | nothing |
| What broke, and what was the stack? | **Sentry** | `SENTRY_DSN` |
| How fast/slow, which endpoints 5xx? | **Azure Application Insights** | enable on the Container App |
| What exactly did request X do? | **Container logs**, by `x-request-id` | Log Analytics workspace |

If a screen says a migration is missing, `/dashboard/admin/health` tells you
which one, probed against the live database rather than assumed.

---

## 2. Request correlation — the thing that makes triage possible

Every request now carries an `x-request-id`, minted in **`src/proxy.ts`** (or
reused from the inbound header, so it matches what Azure logged).

> Next.js 16 renamed the `middleware` file convention to `proxy`, and this repo
> already had `src/proxy.ts`. Adding a `src/middleware.ts` alongside it makes
> **every route 404** — there must be exactly one. The id logic therefore lives
> inside the existing proxy, which short-circuits for `/api/*` before doing any
> Supabase work so API routes pay only a header copy (measured: ~12ms on API
> routes vs ~81ms on pages, which do the session refresh).

It flows to four places:

1. **The response header** — visible in the browser network tab.
2. **`apiFetch`** returns it, and admin screens append `(ref: …)` to error
   messages, so a tester can screenshot something you can search.
3. **Sentry** — `onRequestError` in `src/instrumentation.ts` tags every
   uncaught server error with `request_id`.
4. **The container logs** — same id in the JSON log line.

**Triage flow:** tester sends a screenshot → copy the `ref:` → search Sentry by
`request_id`, and Log Analytics by the same string → you have the stack, the
route, and the user.

Before this, `requestId()` existed in `lib/logger.ts` and was called in exactly
**one route out of 65**. There was nothing linking a complaint to a log line.

---

## 3. Human setup steps, in order

### 3.1 Azure Application Insights — do this first
On the `influnet-staging` Container App → **Application Insights** → enable.

Gives per-request telemetry with **zero code**: request rate, latency
percentiles, failure rate, and a breakdown by endpoint. This is the layer that
answers "is the app slow" and "which endpoint is throwing 500s", and it is not
worth rebuilding in application code.

### 3.2 Log Analytics — so logs are searchable, not scrollback
Container Apps writes stdout to a Log Analytics workspace when one is attached.
The app already emits **one JSON object per line** (`lib/logger.ts`), so the
fields are queryable rather than needing regex.

Useful KQL, once attached:

```kusto
// Every error in the last hour, newest first
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where Log_s has "\"level\":\"error\""
| order by TimeGenerated desc
```

```kusto
// Everything that happened for one request id from a tester's screenshot
ContainerAppConsoleLogs_CL
| where Log_s has "<paste-the-ref-here>"
| order by TimeGenerated asc
```

```kusto
// Which routes are failing most today
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1d)
| where Log_s has "unhandled server error"
| extend d = parse_json(Log_s)
| summarize count() by tostring(d.path)
| order by count_ desc
```

Live tail while a tester is on a call with you:

```bash
az containerapp logs show --name influnet-staging --resource-group influnet-rg --follow
```

### 3.3 Uptime monitor
UptimeRobot (free) → `https://staging.influnet.io/api/health`, every 1–5 min.
That endpoint is anonymous and cheap and does not leak error detail.

### 3.4 Confirm Sentry is receiving
The DSN secrets already exist and are injected into staging. After the first
traffic, check the Sentry project shows events tagged `environment: staging`.
**If nothing arrives, the DSN is wrong** — every reporter fails silently by
design, so silence is not proof it works.

---

## 4. Daily routine during a tester round

**Morning, ~5 minutes:**

1. `/dashboard/admin/health` — anything red? A missing secret or unapplied
   migration explains most "it's broken" reports before you read them.
2. `/dashboard/admin/activity`, last 24h — did people actually *do* things, or
   only sign up? Watch **stalled creators**: signed up but never verified is the
   clearest signal that onboarding is leaking.
3. `/dashboard/admin/support` — anything waiting on us.
4. Sentry — new issues since yesterday.

**When a tester reports a problem:**

1. Ask for the `ref:` if the error screen showed one.
2. Search Sentry by `request_id`, then Log Analytics by the same string.
3. Find the user in `/dashboard/admin/activity` — their last few events show
   exactly how far they got and what they tried.
4. Reply in `/dashboard/admin/support` so the conversation is recorded against
   the account rather than lost in WhatsApp.

**Weekly:**

- `/dashboard/admin/analytics` — the funnel. Fix the biggest drop-off, not the
  loudest complaint.
- `/dashboard/admin/feedback` — triage into planned / declined.
- `/dashboard/admin/audit` — who changed what.

---

## 5. What is deliberately *not* built

- **No custom APM.** Request timing, throughput and failure rates come from App
  Insights. Rebuilding that in application code is a lot of work for a worse
  version.
- **No separate event-log table.** The activity feed is *derived* from the rows
  that already record each fact (same approach as migration 073). It therefore
  covers all history, and a feature that forgets to emit an event cannot make
  the feed lie.
- **No session replay.** It would capture creator PII and message drafts.
- **No per-route logging boilerplate.** `onRequestError` catches what escapes a
  handler; `jsonError` reports what a handler caught. Neither needs 65 edits.

---

## 6. Before real users (not testers)

These are outside the observability work but are the remaining gaps that make
production risky, in priority order:

1. **A separate production Supabase project.** Staging currently shares the dev
   database — there is one `NEXT_PUBLIC_SUPABASE_URL` secret and no
   environment-scoped override. Testers and dev data are in the same place.
2. **Ticket notification email.** `NOTIFY_EMAILS_ENABLED=false`, so nobody is
   emailed when a support request arrives. Someone must watch the inbox.
3. **Stream + Razorpay webhook domains.** Both still point at `dev.influnet.io`.
4. **Mobile native crash reporting.** JS errors are covered; a native crash is
   not, and fixing that needs a new build (see ANALYTICS.md §4).
5. **Distributed rate limiting.** `UPSTASH_*` is unset, so the limiter uses an
   in-process counter — correct for one container, not across replicas.
