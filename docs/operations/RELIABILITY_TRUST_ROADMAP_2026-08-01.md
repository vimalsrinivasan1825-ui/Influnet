# Reliability & Trust Roadmap — 2026-08-01

**Analysis only — nothing in this report has been implemented.** A working audit of where the app already protects itself, where it doesn't, and what's worth building next: environments, backups, user-facing error handling, support, and observability. Companion tracking lives in [DEPLOYMENT.md §5](DEPLOYMENT.md#5-operational-gaps-to-close-before-real-traffic).

Scope: `apps/web` · `apps/mobile` · Supabase · CI/CD. Findings below are grounded in a live repo audit on this date — see file references per item.

---

## 1. Environments & databases

**Status: `APP_ENV` system built · DB separation unconfirmed · no guaranteed staging↔prod data isolation**

The plan — dev branch stays as-is, staging replicates from dev, production runs on its own account with its own URL — is the right shape, and the codebase already has half of it: [`apps/web/src/lib/env.ts`](../../apps/web/src/lib/env.ts) defines `APP_ENV` (`local | dev | staging | production`) independent of `NODE_ENV`, and each branch deploys through its own GitHub Actions workflow (`deploy-staging.yml` → Azure Container Apps, `deploy-prod.yml` → Azure App Service, gated behind manual approval).

What isn't confirmed from the code: whether staging and production actually point at **two different Supabase projects**. Both workflows read a secret named `NEXT_PUBLIC_SUPABASE_URL` — same name, different value per GitHub Environment, *if* they were actually set differently.

> **The one fact worth confirming this week:** GitHub repo → Settings → Environments → compare the `staging` and `production` values for `NEXT_PUBLIC_SUPABASE_URL` and the service-role key. If they match, that's the single highest-leverage fix on this page — before backups, before Sentry, before anything else.

Recommended shape:

| Environment | Supabase project | Purpose | Who touches it |
|---|---|---|---|
| Local / Dev | Current shared project | Fast iteration, disposable data, safe to reseed | Every branch |
| Staging | Clone of dev schema, own project | Replicates real flows (payments, OTP, HikerAPI) with test credentials | Pre-release verification |
| Production | New, separate project + separate Supabase **org account** | Real users, real money, real IG ownership data | You alone, via the approval-gated prod workflow |

A separate Supabase *organization* for production (not just a separate project under the same org) is worth the extra step — a compromised staging key, or a mistake made poking around dev, then can't touch prod credentials at all.

## 2. Backups & disaster recovery

**Status: not configured — documented as a TODO in three places, never actioned**

No backup script, no `pg_dump`, no PITR configuration anywhere in the repo — only checklist lines in `DEPLOYMENT.md` §5 and `SECURITY.md`. The only "backups" that exist today are hand-run JSON exports loose in the repo root (`madan-gowri-backup-*.json`) — manual, not reproducible, and shouldn't be committed to git.

What "solid stone" actually requires:

- **PITR on the production Supabase project** — a paid-tier toggle, not code. Turn it on once production has its own project (see §1).
- **A tested restore, not just an enabled backup.** A backup nobody has ever restored from is a hypothesis. Restore into a scratch project once PITR is on, confirm data comes back intact, and record the date here.
- **Scheduled logical backups as a second layer** — a small weekly GitHub Action running `pg_dump` against production into encrypted, versioned object storage (S3/Azure Blob), independent of Supabase's own backup system.
- **Payment ledger integrity** — per prior audit history this table has had hard-delete exposure before ([full-audit-2026-07-18] memory). It deserves its own append-only safeguard (a trigger blocking `DELETE`, or a separate audit table) independent of general backups.

## 3. User-facing error handling

**Status: route-level boundary exists · raw error messages leak to users in several screens · no root-level or mobile boundary**

[`apps/web/src/app/error.tsx`](../../apps/web/src/app/error.tsx) is a real, styled 500 page that reports to the observability shim (§5). It only catches errors below the root layout — a crash *in* the layout itself isn't caught, and there's no `global-error.tsx` for that case. Mobile has no equivalent boundary at all.

More pressing: several dashboard pages (e.g. `dashboard/settings`, `dashboard/admin`) surface `err.message` directly in a toast. A failed Supabase query can currently put a raw constraint-violation string in front of a user.

Fix shape (cheap once actioned):

1. One shared `toUserMessage(error)` helper mapping known error classes (network, auth, validation, rate-limit, payment) to plain-language copy; unrecognized errors fall back to a single generic line, never the raw message.
2. Add `global-error.tsx` on web; add a top-level error boundary on mobile (Expo Router supports this via `app/_layout.tsx`).
3. Every fallback screen ends with **Try again** and **Report this** — the latter feeding §4.

## 4. Support & ticket pipeline

**Status: does not exist**

"Contact support" is static text with no link behind it in the rejection banner (`components/dashboard/shell.tsx`, mobile `approval-banner.tsx`); the only real contact point is a single `mailto:` link buried in mobile account-deletion settings. No in-app way for a blocked user to reach you, no admin surface to see what's going wrong.

Two honest options, given a team of one:

| Approach | Effort | Good fit if |
|---|---|---|
| Embed a hosted helpdesk (Plain, Crisp, or a form → email) | ~1 day | Want it live fast, don't want to own another table |
| Minimal in-house ticket table — one Supabase table, a "Report a problem" sheet auto-attaching route + last error + user id, an admin list view | ~2–3 days | Want tickets linked to your own data (which project, which stage) — likely worth it given how stage/consent-specific past bugs have been |

Either way, wire the §3 "Report this" button straight into it — auto-filling route, error id, and timestamp saves the user from describing what happened.

## 5. Observability stack

**Status: custom Sentry-envelope shim, no SDK · no analytics (PostHog or otherwise) · no uptime monitor wired**

No `@sentry/*` package is installed anywhere. Instead, [`apps/web/src/lib/observability.ts`](../../apps/web/src/lib/observability.ts) is a hand-written client posting directly to Sentry's envelope API, active only when `SENTRY_DSN` is set, wired into `error.tsx`. Reasonable lightweight choice, but it's missing everything the real SDK gives for free — breadcrumbs, session replay, release tracking, source-mapped stack traces, performance traces. `NEXT_PUBLIC_SENTRY_DSN` is referenced as a deploy secret in `deploy-staging.yml`; whether it's actually populated isn't visible from code.

No PostHog or any product analytics exists — for a two-sided marketplace that's a blind spot beyond error tracking: no visibility into *where* creators or businesses drop off in the stage pipeline, only that something eventually errored.

What's worth adding:

- **Install the real Sentry SDK** on web and mobile (first-class Expo support) — replaces the hand-rolled shim; low-risk swap since the shim already proves the DSN plumbing works.
- **PostHog** (self-hostable or cloud, generous free tier) for funnel analytics on the stage pipeline — where collabs stall between proposal → sign-off → payment → completion.
- **Uptime monitoring** — `apps/web/src/app/api/health/route.ts` already exists; point a free-tier Better Stack or UptimeRobot check at it in production. Currently just a doc checkbox in `CICD.md`.
- **Azure Application Insights** is mentioned in `CICD.md` as planned; given Sentry-equivalent error tracking plus PostHog for product analytics would already exist, App Insights would mostly duplicate those. Worth skipping unless Azure platform-layer metrics (container health, request latency) turn out to matter independently.

## 6. Agentic auto-fix, honestly

**Status: good fit for narrow, well-typed problems · bad fit for open-ended "find and fix bugs"**

`.github/dependabot.yml` already exists — weekly, opens PRs for dependency bumps, capped at 10. That's the existing example of automation worth trusting: narrow scope, mechanical change, reversible, human merges it.

"Catch errors automatically and fix them" is a much bigger claim. For a payments-and-identity platform, giving an agent unsupervised write access is risky less because it might write bad code, and more because it can write plausible-looking code that silently changes payment or consent logic, passes tests, and merges clean. Prior audit history here shows the real bugs are subtle consent/authorization gaps (self-awarded badges, unilateral completion) — not syntax errors — which an automated fixer is more likely to paper over than catch.

A better-scoped version: a scheduled agent that **triages** — reads new Sentry issues daily, groups by root cause, drafts a PR only for clearly mechanical fixes (null check, missing await, off-by-one), and for anything touching auth/payments/consent opens an issue with its analysis instead of a PR. Either way a human reviews and merges; the agent just does the first pass of reading stack traces.

## 7. What to actually do first

Ordered by risk removed per hour spent, not by how interesting the work is.

1. **Confirm staging and production use different Supabase projects.** Five-minute check in GitHub secrets. Everything else assumes this is true.
2. **Enable PITR on production once it has its own project, then test one restore.** An untested backup isn't a backup — record the restore date here.
3. **Install the real Sentry SDK; replace raw `err.message` toasts with mapped copy.** Ship together in one PR — immediate reduction in "user sees a stack trace."
4. **Ship a minimal "Report a problem" flow wired to the error boundary.** Turns every future crash into a ticket instead of a silent bounce.
5. **Add PostHog for stage-pipeline funnel visibility.** Lower urgency, high value once the fires above are out.

The env-gated OTP test bypass discussed alongside this report is small, separate follow-up work for whenever the OTP flag is turned on — gated by `APP_ENV !== 'production'` rather than a number hardcoded in the database, so it can't leak into prod by forgetting a manual cleanup step. See [PHONE_OTP.md](PHONE_OTP.md) and [signup-otp-2026-07-30 memory].
