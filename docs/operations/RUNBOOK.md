# Runbook

One page. Symptom on the left, first move on the right. Written to be read at
2am by someone who is tired and not at their best — which is usually you.

**Before anything else:** if a user reported it, get the `ref:` from their
screenshot. Every error surfaces one. Searching Sentry and the container logs
for that string turns "something is broken" into a stack trace in about
fifteen seconds.

---

## The three screens, in the order to open them

| # | Screen | Answers |
|---|---|---|
| 1 | `/dashboard/admin/health` | Is the database reachable? Which migrations are applied? Which integrations are configured? |
| 2 | `/dashboard/admin/vendors` | Is a third party out of the request path — and is that because *you* switched it off, or because the app gave up on it? |
| 3 | Sentry | What actually threw, and since which release. |

If all three are clean, the problem is almost certainly not the app — check
Azure ingress and DNS.

---

## Symptom → first move

| Symptom | First move |
|---|---|
| **Every path returns a bare 500** (no content-type, no server header) | A `NEXT_PUBLIC_*` runtime env var is missing and `instrumentation.ts` threw at boot. Check the container's env vars — *runtime*, not just build args. This reads exactly like a wrong port and never is. |
| **Site completely down** | UptimeRobot alert → Azure Portal → Container App → Revisions. Did a deploy just land? Roll back to the previous revision; that is one click and faster than diagnosing. |
| **Payments failing** | `/dashboard/admin/vendors`. If the Razorpay breaker is open, it will retry on its own in 15s. If the *switch* is off, someone turned it off. If both look fine, check the webhook secret — an unsigned webhook opens no gate, silently. |
| **A project is stuck and won't advance** | The stage machine has three exits, not one. `ALLOWED_TRANSITIONS` in `packages/core` is the source of truth — `advance` is refused on `final_payment` (needs `confirm_completion`) and `revisions` goes *back* to `sent_for_review`. Also check both parties have signed off. |
| **A gate is open that shouldn't be** | Check the checklist actually has rows. An empty `project_stage_items` on a stage that should have items is the vacuous-gate bug — `stage-items-gate.ts` fails closed on it now, but confirm the rows exist. |
| **Emails not arriving** | Three switches, in order: `notify_emails` (product), `vendor_resend` (operational), `RESEND_API_KEY` (configured at all). `/dashboard/admin/health` shows the third, `/dashboard/admin/vendors` the second. Then check Resend's own dashboard for a bounce or a domain-reputation block. |
| **OTP arrives as a phone call, not an SMS** | The 2Factor template name is wrong on that environment's edge function. It returns `Success` and bills a credit either way. Set `TWOFACTOR_TEMPLATE` and redeploy the function. |
| **Instagram data is stale or missing** | Expected when Apify is off or its breaker is open — profiles fall back to cached snapshots by design. `/dashboard/admin/vendors` confirms which. Not an outage. |
| **A feature "isn't deployed"** | Check `/dashboard/admin/health` for the migration first. Nine times out of ten the code shipped and the schema didn't. |
| **Chat not working** | Stream, not Postgres. A database incident does not cause this and vice versa. Check the Stream status page and `vendor_stream`. |
| **Signup succeeding for addresses that don't exist** | Email confirmation is off in Supabase Auth. This is a toggle, not a bug. |
| **Everything is slow, nothing is erroring** | A vendor is hanging rather than failing. `/dashboard/admin/vendors` for breaker state; App Insights for which endpoint. Every outbound call has a deadline now, so this should be self-limiting — if it isn't, something added a `fetch` without one. |

---

## Break-glass: taking a vendor out of the request path

No deploy needed. Run in the Supabase SQL editor **for that environment's
project** — takes effect within ~45 seconds:

```sql
insert into public.feature_flags (key, enabled, description)
values ('vendor_apify', false, 'timing out — disabled 02:10 IST')
on conflict (key) do update
  set enabled = excluded.enabled, description = excluded.description;
```

Valid keys: `vendor_apify`, `vendor_hikerapi`, `vendor_razorpay`,
`vendor_stream`, `vendor_resend`, `vendor_expo_push`. Set `enabled = true` to
restore. `/dashboard/admin/vendors` copies the right statement for you.

The product switches work the same way: `phone_otp`, `notify_emails`,
`subscriptions`, `ownership_gate`.

---

## Rolling back

Azure Portal → Container App → Revisions → activate the previous one. Traffic
moves in under a minute.

**A rollback does not undo a migration.** Migrations here are additive, so the
previous revision keeps working against the newer schema — that is the whole
reason the migrate job runs before the deploy job. If you ever need to undo a
migration, that is a deliberate, hand-written down-migration, not a rollback.

---

## Which database am I even looking at?

`dev` and `staging` have **separate Supabase projects**. A row missing in one
proves nothing about the other. `/dashboard/admin/health` prints the project
ref of whatever the deployment is actually pointed at — trust that over
memory.

"Production" currently points at the staging project. Until HANDOVER P0.1/P0.2
are done, treat the word as a name, not a place.

---

## Before you run anything destructive

Say out loud which project you are connected to, and check it against the
health screen. This project has an incident on record from exactly this
mistake.

---

## Escalation — when it is not the app

| Vendor | Status page |
|---|---|
| Supabase | status.supabase.com |
| Azure | status.azure.com |
| Stream | status.getstream.io |
| Razorpay | status.razorpay.com |
| Resend | status.resend.com |

---

## After it is over

Add a line to [INCIDENTS.md](INCIDENTS.md). One line. It takes thirty seconds
and in a year it is worth more than any tool on this page.

---

## The destructive-operation rule

Before any purge, truncate, bulk delete, or `supabase db reset`:

1. **Say the project ref out loud** and check it against
   `/dashboard/admin/health` on the deployment you think you are targeting.
2. `dev` and `staging` are different projects with similar-looking data. The
   fixture `qacreator` on staging is load-bearing for deploy smoke tests —
   never purge it.
3. If the operation is irreversible and the target is not dev, write down what
   you expect to happen first. If you cannot state the expected row counts,
   you do not understand the operation well enough to run it.

This project has an incident on record from exactly this mistake, which is why
it is a rule and not a suggestion.
