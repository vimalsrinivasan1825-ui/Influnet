# Blocks 0–5: what shipped, and what only you can do

Date: 2026-09-14 · 23 commits on `dev`, unpushed
Companion to [PRODUCTION_READINESS_CHECKLIST_2026-09-14.md](PRODUCTION_READINESS_CHECKLIST_2026-09-14.md)

Every developer-doable item across all five blocks is built, tested and
committed. What remains is the set of things that need an account, a password,
a business decision, or a lawyer — none of which a developer can do for you.

**Suite state: 523/523 unit tests pass.** It had been 6 red for some time; see
the last commit below for why, and why that matters more than it looks.

---

## What shipped

| # | Item | Commit |
|---|---|---|
| 0.3 | Sentry release tagging (server + browser, same git SHA) | `7b6a4f52` |
| 0.3 | Source maps uploaded to Sentry, deleted from the served image | `91a51490` |
| 0.6 | PostHog wired through Dockerfile + both workflows | `eb349920` |
| 0.7 | Health probes extended 109 → 146 (13 new) | `f2e19da9` |
| 1.1 | `settleAll` helper, then applied to Home + public creator profile | `1fcaf525`, `11355475` |
| 1.2 | Deadlines on every outbound call, named budgets | `531bc89c` |
| 1.3 | Vendor kill switches, default ON (migration 149) | `9eb4f430` |
| 1.4 | Circuit breaker per third party | `5a7b8388` |
| 1.3/1.4 | Both wired into all six vendor call sites | `32d0b632` |
| 1.3 | `/dashboard/admin/vendors` — the break-glass screen | `2ae6be54` |
| 1.6 | Money limiter fails closed; abuse guards stay open | `8576864b` |
| 1.5 | Fail-open audit, every guard decided and recorded | `06ac2c8d` |
| 2.2 | `deploy-prod.yml` rewritten — it could not have worked | `dfa4a77e` |
| 2.5 | Mobile store build refuses a non-production backend | `9578a718` |
| 3.3 | Destructive-operation rule promoted to the runbook | `4f55bf0e` |
| 4.2 | Terms, Privacy, Refunds, Contact pages | `e8550a20` |
| 5.1 | `RUNBOOK.md` | `55c215a7` |
| 5.2 | `INCIDENTS.md`, seeded with the four on record | `55c215a7` |
| 5.3 | `ACCESS_INVENTORY.md` template | `4f55bf0e` |
| 5.5 | Stale "KNOWN APP BUG" comment corrected in E2E phase 2 | `16faa285` |
| 5.6 | Weekly health sweep in CI | `3879d979` |
| — | Unit suite green again (Node 22 vs jsdom localStorage) | `ce3cebab` |

## Three corrections to my own assessment

Worth stating plainly, because each made the job smaller or different:

1. **There was already a runtime kill switch.** Migration 137 built
   `feature_flags` with a 45s snapshot and env fallback. Block 1.3 became
   "extend it to the vendors", not "build it".
2. **"Half of 29 outbound calls have no timeout" over-counted.** It swept in
   `apiFetch` wrappers and supabase-js internals. Razorpay, Apify, HikerAPI
   and the thumbnail fetcher were already bounded; three places genuinely
   weren't.
3. **The rate limiter did not "fail open".** It already fell back to a local
   counter. The real gap was narrower: that fallback is per-instance, so with
   N replicas a money limit silently becomes N×.

`Promise.all` was also less dangerous than stated — `supabase.from()` resolves
with `{data, error}` rather than rejecting, so only the blocks containing
throw-capable helpers actually needed changing.

---

# What only you can do

Ordered so each step unblocks the next. Times are realistic.

## A. Today — make the app able to tell you things (≈90 min)

### A1. Sentry alert rules — 10 min · **highest value on this page**
Sentry → Alerts → Create Alert:
- **New issue** → notify me. 
- **Issue seen > 10 times in 5 minutes** → notify me.

Without these Sentry is a diary. With them it is an alarm. Everything else in
Block 0 is less important than this.

### A2. Sentry auth token — 10 min
Sentry → Settings → Auth Tokens → new token, scopes `project:releases` and
`org:read`. Then:

```bash
gh secret set SENTRY_AUTH_TOKEN --env dev -R vimalsrinivasan1825-ui/Influnet
gh secret set SENTRY_ORG --env dev -R vimalsrinivasan1825-ui/Influnet
gh secret set SENTRY_PROJECT --env dev -R vimalsrinivasan1825-ui/Influnet
```

Repeat with `--env staging`. Until these exist the upload step logs one line
and skips — it will not fail your deploy.

### A3. PostHog — 15 min
Create the project at posthog.com, copy the `phc_...` key:

```bash
gh variable set POSTHOG_KEY --env dev -R vimalsrinivasan1825-ui/Influnet
gh variable set POSTHOG_KEY --env staging -R vimalsrinivasan1825-ui/Influnet
```

(Add `POSTHOG_HOST` only if you chose the EU region.)

### A4. UptimeRobot — 10 min
Free account → HTTP monitor → `https://dev.influnet.io/api/health`, every 5
minutes, alert to **email and SMS**. This is the one that tells you the site
is *down*, which Sentry structurally cannot.

### A5. Application Insights — 5 min
Azure Portal → `influnet-dev` Container App → Application Insights → Enable.
Zero code. Gives latency percentiles and per-endpoint 5xx rate.

### A6. Verify — 15 min
Push the commits, let dev deploy, then:
- `/dashboard/admin/health` → 21 migration probes, PostHog shows configured.
- `/dashboard/admin/vendors` → new screen, everything "Serving".
- Cause an error, confirm it lands in Sentry **with a release SHA** and a
  readable stack trace.

## B. This week — trust and money (≈4 hours, some waiting)

### B1. Turn on email confirmation — 2 min · **standing blocker**
Supabase → Authentication → Providers → Email → **Confirm email: ON**, for
dev and staging.

Right now signup never verifies an address; anyone can register as anyone.
This is a toggle, not a build, and nothing else on this list matters while it
is off.

### B2. Fill in the legal pages — 2 hours + legal review
Edit `apps/web/src/app/legal/legal-content.ts`. Every `[[PLACEHOLDER]]` is a
fact only you have. The pages show a draft banner and stay out of search
engines until the last one is gone — no flag to flip.

The ones that are genuine business decisions, not boilerplate:
- Your platform fee: how much, when charged, who pays.
- Is an advance refundable once a creator has started?
- Who owns delivered content, and what licence does the brand get?
- The liability cap.

**Have a lawyer review it before taking money from a stranger.** What I wrote
is structure, not legal advice.

### B3. Razorpay live credentials — 1 hour + their review
They will check the legal pages from B2 exist. Then move one real rupee end to
end, including the webhook — an unsigned webhook opens no gate, silently.

### B4. Fix staging's phone-OTP function — 20 min
Set the `TWOFACTOR_TEMPLATE` secret and redeploy the edge function. Today OTPs
go out as **voice calls** while still returning `Success` and billing an SMS
credit.

### B5. Decide the subscriptions switch — 30 min thinking
Turning paid tiers on after people have signed up free is a much harder
conversation than starting with the answer.

## C. Before real users — the production tier (≈1 day)

Nothing below can be verified until it exists, and `deploy-prod.yml` now
refuses to run against staging by mistake.

1. **Production Supabase project, in its own account.** Today "production"
   points at staging's project. The workflow will now refuse rather than
   quietly migrate the wrong database.
2. **Production Container App** — `influnet-prod` in `influnet-rg`.
3. **`main` branch on origin**, and the `production` GitHub Environment with
   required reviewers.
4. **Populate the production environment**: `SUPABASE_PROJECT_REF`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PROD_CONTAINER_URL`,
   `EMAIL_ALLOWLIST`, plus every secret. Use
   `scripts/setup-environment-secrets.sh`.
5. **Point mobile at production** in `eas.json`, then verify:
   ```bash
   cd apps/mobile && npm run check:prod-target
   ```
   It currently fails on purpose, and will keep failing until this is done —
   which is what stops a store build reaching real users on staging's database.

## D. Data — do not skip (≈2 hours)

### D1. A real restore drill
Restore a Supabase backup into a scratch project, check row counts, boot the
app against it, write down how long it took. **Until you have done this once,
you do not have backups — you have a belief.**

### D2. Set the retention window deliberately, and know its cost.

## E. Ongoing — 40 minutes, once

### E1. Fill in `docs/operations/ACCESS_INVENTORY.md`
Every account, who owns it, which vault entry holds the credential, and
whether it is recoverable. This is currently the biggest bus-factor risk on
the project: if you were unavailable for a fortnight, the app keeps serving
and nobody could deploy, rotate a key, or answer a customer.

Note the renewal calendar in it — the iOS distribution certificate expiring
already cost a day on 2026-09-01.

### E2. Then the routine
Daily 2 min (Sentry feed, uptime). Weekly 30 min (`/dashboard/admin/health`,
`/dashboard/admin/vendors`, PostHog funnel, Dependabot). Monthly 1 hour (E2E
suite, Supabase usage — egress binds before storage). Quarterly: restore
drill, every time.

The weekly sweep now does the machine-checkable part on its own and opens an
issue if it fails.

---

## Two things to know before pushing

**Pushing to `dev` triggers a real Azure deploy.** The new builder-stage and
source-map steps have never run against real Docker — I could not test them
from here. If either fails, the job stops *before* deploying, so the current
revision keeps serving. That is the intended failure mode, but expect the
first run to be the real test.

**Migration 149 is not applied anywhere yet.** It seeds nothing and no row
means "vendor on", so applying it is a no-op until you deliberately switch
something off. CI applies it automatically on the next dev deploy.
