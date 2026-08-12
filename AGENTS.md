# Working in this repo

Traps that have cost real time here. Read before changing API routes, migrations
or the stage machine.

Going live, or handing this to someone else?
**[docs/operations/HANDOVER.md](docs/operations/HANDOVER.md)** is the sign-off doc:
what still blocks real users, how to run it month-to-month, and what a new owner
needs before they can ship without you.

## Response envelopes differ per route

There is no shared envelope. `/api/discover` returns `{results}`,
`/api/collabs` returns `{collabs}`, `/api/blocks` returns `{blocks}`,
`/api/projects/[id]/stage-items` returns `{items}`, `/api/conversations`
returns `{conversation}`.

**Read the route before consuming it.** Guessing with `body.data ?? body.results ?? []`
silently yields an empty array, and empty arrays make tests pass and dashboards
render blank. This produced two false findings in the 2026-08-08 audit before
anyone noticed the shapes didn't match.

## Table names are not the obvious ones

- Projects are **`campaign_projects`**, not `projects`. Its `id` is a **bigint**,
  not a uuid.
- There is no `collaborations` table and no `influencer_id` column.
- Stage rows: `project_stage_items` (the checklist), `project_stage_entries`
  (posted updates). Different things.
- `public.connections` exists and is **dead** — built in migration 029 for
  counters nothing ever wrote. Use `get_collaboration_stats()` (113) instead.

## `NEXT_PUBLIC_*` is frozen at build time

It is inlined into the JavaScript bundle. Changing it in a dashboard or a
database does nothing until the next build — and that applies to the *server*
read too, not just the browser.

If a value must be changeable at runtime, serve it from an endpoint.
`/api/auth/config` already does this for the phone-OTP flag, and the comment
there explains why. Mobile reads it correctly; web still reads the inlined
constant.

**Inlining is static, so a container still needs the real env var.** Next
replaces the literal text `process.env.NEXT_PUBLIC_FOO`. It cannot replace a
computed lookup — and `describeEnv()` in `apps/web/src/lib/env.ts` checks
required vars with `process.env[k]`, which is exactly that. So the boot check
reads the *real* process environment.

The Dockerfile's `ENV NEXT_PUBLIC_*` lines are in the **builder** stage; the
`runner` stage starts `FROM base` again and does not inherit them. A deploy
that passes these as build args only therefore boots a container with them
genuinely absent, `instrumentation.ts` throws in `register()` before the
server accepts a request, and Azure's ingress answers every path — including
nonexistent ones — with a bare 500 carrying only a `date` header. It reads
like a wrong port or a bad image; it is a missing variable.

**Every container deploy must set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as runtime env vars *as well as* build args.**
The duplication is not redundant: the build arg is what the browser bundle
gets, the runtime var is what the server reads. `deploy-dev.yml` does this and
explains it. Staging only works because `az containerapp update
--set-env-vars` is additive, so values set by hand there long ago have
outlived every deploy since — nothing in its workflow guarantees them.
Cost a full afternoon on 2026-08-12.

## Fail-open defaults: know which case you are in

Several places degrade gracefully when "the migration might not be applied".
That reasoning is **correct for a missing table** and **wrong for zero rows**,
and the two are easy to conflate.

This exact confusion caused the worst bug found in the 2026-08-08 audit: the
stage checklist was seeded lazily, so a project nobody had opened had no rows,
`blockingItems([])` returned `[]`, and every gate — including both payment
gates — stood open. `apps/web/src/lib/stage-items-gate.ts` shows how to
distinguish the two: `null` means unreadable (degrade), `[]` on a stage that
should have items means broken (fail closed).

The database has been fully current since 2026-08-08, so any remaining
fail-open default is guarding a state that no longer exists. Decide each one
deliberately.

## The stage machine has three exits, not one

Leaving a stage is not always `advance`:

- **Mutual sign-off** — 8 of the 12 stages. Both sides PATCH
  `{action:'signoff'}`; the second one moves the stage.
- **`advance`** — the `NON_SIGNOFF_STAGES`: `sent_for_review` (a fork, needs an
  explicit `stage_key`), `revisions`.
- **`confirm_completion`** — `final_payment` only. `advance` is refused there.

`ALLOWED_TRANSITIONS` in `packages/core` is the single source of truth, and it
is **not** the array order: `revisions` is followed in `STAGES` by
`final_approval`, but its only legal edge goes *back* to `sent_for_review`.
Walking the array skips the re-review a brand is supposed to do.

## Writing to `stage_progress` (jsonb)

Never read-modify-write it from application code. Two people confirming at the
same instant both read a state with neither signature, and the second write
clobbers the first — the `enforce_project_consent` trigger then rejects it,
which surfaced as a 500 with the user's click silently lost.

Use `record_stage_signoff()` / `revoke_stage_signoff()` (migration 114). They
take a row lock and write only the caller's own keys.

## Payment gates open only via a signed webhook

When Razorpay is configured, the gate checklist items for `advance_payment` and
`final_payment` cannot be ticked by hand — they open when the signed capture
webhook confirms a real payment. Amounts are derived server-side from the
agreed terms and never taken from the client. Don't add a bypass "for testing";
the audit suite drives real test-mode orders and signs its own webhooks.

## Testing

`tests/e2e/` holds an API-level multi-account harness — far faster than the
Playwright phases beside it, and the only way to test genuine simultaneity.
See `docs/operations/FULL_FLOW_AUDIT_2026-08-08.md`. Run
`seed-personas.mjs` first; every phase then runs standalone and re-runs cleanly.

- `lib/sql.mjs` gives real SQL via the Supabase **Management API** (uses
  `SUPABASE_ACCESS_TOKEN`, already in `.env.local`). Use it for schema and
  migration-state questions PostgREST can't answer. It throttles — batch
  statements into one call.
- **Turn off `NOTIFY_EMAILS_ENABLED` before a run and restore it after.** The
  personas use `@influnet-audit.test`, which hard-bounces and damages the Resend
  domain reputation.
- `auth:register` is rate-limited **per IP**, 10/min. The seeder paces itself.

## Migrations

`scripts/apply-migration.mjs <version>` applies one file and records it. CI
applies them automatically on deploy (`supabase db push --include-all`).

Pin the Supabase CLI to **2.111.0** — 2.112.0 broke `supabase link`. Never
`version: latest` in a workflow.

## Branches: work flows one way

`dev` is where everything is written. `staging` only ever *receives* — via a
pull request, never a direct push. A ruleset on the remote enforces this.

Two rules keep the two branches from drifting:

1. **Never commit to `staging` directly**, including "just a CI tweak". Three
   such commits (the OTP template rename, the staging email env, a CLI-pin
   comment) sat only on staging from 2026-08-07 to 2026-08-10. The template
   rename mattered: `dev`'s edge function kept the retired
   `Login_Verification_OTP`, which 2Factor silently downgrades to a **voice
   call** while still returning `Success` and billing an SMS credit.
2. **If something did land on staging, back-merge it** (`git merge
   origin/staging` from `dev`) rather than cherry-picking, so the next
   `dev → staging` PR doesn't propose reverting staging's own config.

`git log origin/staging..origin/dev` should be empty before you open that PR.

Staging-only *config* is fine and expected — `deploy-staging.yml` is scoped to
`push: branches: [staging]` and cannot fire from `dev`. It is staging-only
*code* that is the bug.

**No required status checks on `staging`, deliberately.** `ci.yml` runs on `dev`
only because its integration tests depend on live dev-DB state, and a
paths-filtered workflow as a required check leaves a PR stuck on "Expected —
waiting for status" forever. See `docs/operations/CICD_INSTRUCTIONS_2026-08-06.md`
§2 and §7.2.

## Environments

`dev` and `staging` have **their own Supabase project** each. Staging is not
dev's database; a row missing in one proves nothing about the other. Check which
project you're pointed at before concluding anything.

**There is no production tier yet, and this surprises people.** `main` does not
exist on `origin`, so `deploy-prod.yml` has never fired — and its `production`
environment points at the *staging* Supabase project
(`aokdansyqxracuwsosji`), which is why that workflow has no migrate job. The
mobile `production` EAS profile points at staging too. Treat "production" in
config as a name, not a place, until
[docs/operations/HANDOVER.md](docs/operations/HANDOVER.md) P0.1/P0.2 are done.

On staging, the `qacreator` fixture is load-bearing for deploy smoke tests —
never purge it.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
