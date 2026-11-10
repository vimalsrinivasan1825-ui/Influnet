# Influnet — Sign-off & Handover

**Living document.** Update it in place; do not date-stamp a copy.
Part 0 last verified: **2026-11-10** (branch `dev`). Parts 1 to 4 were last
read against the code on 2026-09-19; see
[`LAUNCH_READINESS_AUDIT_2026-09-19.md`](LAUNCH_READINESS_AUDIT_2026-09-19.md)
and [`SYSTEM_AUDIT_2026-11-05.md`](SYSTEM_AUDIT_2026-11-05.md).

> **Signing off this week?** The ordered work plan is
> [`SIGNOFF_PLAN_2026-11-10.md`](SIGNOFF_PLAN_2026-11-10.md).

[`handover-checklist.html`](handover-checklist.html) is a tickable version of
this document **as it stood on 2026-08-12**. Several of its rows are now wrong
(it carries a banner saying so); trust this file where they differ.

This doc answers two questions and nothing else:

1. **What must be true before real users touch this?** → [Part 1](#part-1--go-live-blockers).
2. **What must be true before someone else owns this?** → [Part 3](#part-3--developer-handover-package).

Everything here is either verified in the repo or marked as *needs checking in a
dashboard I can't reach*. Where another doc already covers a topic properly, this
one links rather than repeats it — the linked doc stays canonical.

---

## Part 0 — Verified state, 2026-11-10

Checked directly on 2026-11-10 unless a row says otherwise:

| Thing | State |
|---|---|
| `npm run typecheck` | ✅ clean, 7/7 workspaces |
| `npm test` | ✅ 869 passed, 6 skipped (the 6 are `tests/integration/api.test.ts`, skipped without a live env). The E2E harness was last run on 2026-09-19 (302/302 across phases 3–9); it was **not** re-run on 2026-11-10. |
| `origin/dev` vs `origin/staging` | **Staging is behind `dev`**: last deployed 2026-10-23, and it still runs Next.js 16.3.5 (the version with remote-code-execution advisories). The fix, migration 201 and the 2026-11-10 handover fixes are on `dev` only until the dev → staging PR merges. No staging-only code exists. |
| Local `dev` vs `origin/dev` | In sync, working tree clean |
| dev / staging databases | **Isolated.** Separate Supabase projects (`jaajosocopoicmqcffuu` / `aokdansyqxracuwsosji`) in one Supabase account. This is done — nothing to do here. |
| Production branch | **`main` does not exist on `origin`.** `deploy-prod.yml` has never fired. |
| `deploy-prod.yml` | Rewritten 2026-09-14 to fix the four defects in P0.1 (it now builds its own image, targets Container Apps, sets runtime env vars and has a gated migrate job). **Still never run**, so treat it as untested. |
| Production database | **Not provisioned.** Planned as its own Supabase account, separate from the one holding dev and staging. Until then `deploy-prod.yml`'s `production` environment still points at the *staging* project. |
| Hosting topology | dev + staging share one Azure Container App environment (separate apps and images). Dev is fully on Azure (`deploy-dev.yml`; `dev.influnet.io` resolves to the Container App) and `railway.json` was deleted on 2026-11-10. Dev scales to zero, so its first request after a quiet spell is slow. Production gets its own. |
| Mobile `production` EAS profile | Points at `https://staging.influnet.io` and the **staging** Supabase project (`apps/mobile/eas.json`). |
| Migrations in repo | 197 files, through `201_audit_enumeration_and_admin_scope.sql` |
| Migration automation | `dev` applies inside `deploy-dev.yml`, `staging` inside `deploy-staging.yml`, both before the app deploy. `deploy-prod.yml` has a migrate job behind the `production` environment approval; it has never run. |
| Admin health probes | ✅ Newest probe is for migration **198**; 199–201 have none. P0.11 closed 2026-09-19. |
| Legal pages | **Published.** No `[[placeholder]]` left in `apps/web/src/app/legal/legal-content.ts`; `TERMS_VERSION` is `2026-09`; the app's text matches the landing site's again (a unit test enforces it). They name Tecstellar Solutions LLP as owner and operator. Still missing: the licence clause for user content, and working `support@` / `grievance@` mailboxes (no MX record). |
| Paid plans | Decision still open (blueprint t25): recommended launch is free (`SUBSCRIPTIONS_ENABLED=false` on production). Dev's local env currently has it `true` — confirm what production actually gets before users arrive. |

The product code is in good shape. **Every remaining blocker below is
infrastructure, configuration, or paperwork — not code.** That is worth saying
plainly, because it changes who has to do the work: mostly you, not a developer.

---

## Part 1 — Go-live blockers

> **Current work order.** The live, ticked-off plan is now
> [`launch-blueprint.html`](launch-blueprint.html) (Phases 0–5). The list below
> is kept as the reasoning behind each blocker. Items closed since 2026-08-12:
> **P0.11** (health probes) is done; the blueprint's Phase 0 code items —
> account-deletion survival (161), the manual OTA gate, Stream deletion on
> account removal, single-source notifications (165) — are done and E2E-verified.
> What remains here that the blueprint does not cover is mostly dashboard work
> only the owner can do.

Ordered. P0.1–P0.4 build the production tier; nothing else can be verified on
production until they're done. P0.2 is the one that turns a small mistake into an
unrecoverable one.

Legend: 👤 = only you can do it (needs an account/credential/dashboard) · 💻 = needs code.

### P0.1 — Fix `deploy-prod.yml`, which would fail today 💻

> **Update:** the workflow was rewritten on 2026-09-14 to address all four
> defects below. It has still never run, so the *Verify* step is what remains.

**Why.** The workflow was written but never run, so nothing has exercised it.
Read against `deploy-staging.yml`, four things are wrong:

| Defect | Effect |
|---|---|
| Pulls `influnet-web:staging-latest`; the staging build only ever pushes `:<sha>` | Fails at the first step — `manifest unknown`. That tag has never existed. |
| Deploys with `azure/webapps-deploy` (App Service) while staging uses Container Apps | Two hosting models, so the staging deploy proves nothing about prod — and it conflicts with the container plan. |
| Sets **no runtime environment variables at all** | Even on a successful deploy the app boots with no service-role key, no Stream secret, no Razorpay. Staging does this in a dedicated `az containerapp update` step; prod has no equivalent. |
| No migrate job | Correct while prod shared staging's database. Required the moment prod has its own. |

**Do.** Add a `staging-latest` tag + push to `deploy-staging.yml`; rewrite the
deploy step to Container Apps mirroring staging; copy staging's env-var step with
production values (and set `EMAIL_ALLOWLIST` **explicitly** — an omitted name
can't clear a value left behind by an earlier run); add a migrate job ahead of the
deploy, inside the `environment: production` gate.

> **Cross-account snag.** With production in a different Azure account, the
> promote step can't simply `docker pull` from staging's registry — credentials
> don't span tenants. Either give the prod workflow an ACR token scoped to pull,
> or replicate the image into a production registry. Decide before writing the
> step, not while debugging it.

**Verify.** A no-op commit promoted to `main` deploys, the smoke test passes, and
`/api/health` on production reports every required integration configured.

### P0.2 — Provision the production Supabase project, in its own account 👤

**Why.** dev and staging are already separate projects — that part is done. What
remains is production, in the separate account, on the **Pro** tier: Free pauses
after 7 days idle and has no PITR (see
[SUPABASE_CAPACITY_2026-08-02.md](SUPABASE_CAPACITY_2026-08-02.md)). Until it
exists, the `production` environment still points at staging — where the deploy
runs `supabase db push --include-all` with no approval gate, the E2E harness
creates and deletes personas, and `qacreator` is a live fixture.

**Do.**
1. Create the project. Region is set once and cannot be changed — for an
   India-first product that's `ap-south-1`.
2. Apply migrations `001` → `115` from a clean state.
3. Fill the GitHub `production` environment secrets from the new project. Confirm
   the service-role value is a JWT (`eyJ…`), not a `sbp_…` management token — that
   mix-up has bitten this repo before.
4. Configure Auth: production redirect URLs, and the SMTP sender (P0.5).

**Verify.** The `staging` and `production` environments show **different** project
refs, and production's `/dashboard/admin/health` reports 0 migrations pending.

### P0.3 — Build the production Container App 👤💻

**Why.** dev and staging can share one Container App environment — separate apps
and images, shared resources. Production should not join them: a shared
environment means shared networking and a shared blast radius.

**Settings that differ from staging, and why:**

| Setting | Production | Why not staging's value |
|---|---|---|
| Min replicas | **1** | 0 is right for staging. In production it means the first visitor after a quiet spell waits for a cold Next.js container — precisely when traffic is thin and first impressions count. |
| Max replicas | **10** | The cost ceiling. This is what makes "no surprise bill" arithmetic rather than hope. |
| Scale rule | HTTP, ~50–80 concurrent | Tune once you've seen real traffic. |
| Resources | 1.0 vCPU / 2 GiB | Next.js SSR OOMs at 0.5/1 GiB under concurrency. |
| Ingress | External, port 3000, HTTPS only | — |
| Health probe | `/api/health` | The endpoint already exists — the staging deploy polls it. Wire it as a real readiness probe so a bad revision never takes traffic. |
| Secrets | Container App *secrets*, referenced by env vars | Not plain env values, which any portal reader can see. |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Set as **runtime env vars**, not only build args | Miss these and the container never boots — the boot check reads them dynamically, so build-time inlining doesn't cover it, and Azure reports it as a bare 500 that looks like a bad port. This broke the dev cutover on 2026-08-12; see AGENTS.md. |
| Custom domain | `influnet.io` + managed certificate | DNS propagation is not a launch-day discovery. |
| Diagnostics | Log Analytics workspace + retention | Container App logs die with the revision otherwise — exactly when you want them. |
| Resource group | Its own (`influnet-prod-rg`) | Makes "delete everything non-prod" safe, and prod costs legible. |

**Do.** Write it as a script or Bicep template committed to this repo, not portal
clicks. The next person needs to know how prod was built, and you'll want it again
for a rebuild.

**Verify.** Kill the running revision and watch it return unaided. Load past the
scale threshold and confirm it scales out — and stops at 10.

### P0.3b — Finish the Railway → Azure move for dev 👤💻

✅ Done. Dev deploys through `deploy-dev.yml` (migrations, then the Container
App), and `railway.json` was deleted on 2026-11-10. If a Railway project still
exists, delete it so nobody is billed for it. Keep dev's min-replicas at 0.

### P0.4 — Create the production tier at all 👤

**Why.** `main` isn't on the remote, so nothing has ever been promoted. You cannot
discover the deploy is broken *during* launch.

**Do.** Create `main` from `staging`, protect it the same way `staging` is
protected (PR-only, no direct pushes), then let `deploy-prod.yml` run once end to
end with the production environment approval. Note there are deliberately **no
required status checks** on these branches — see
[CICD_INSTRUCTIONS_2026-08-06.md](CICD_INSTRUCTIONS_2026-08-06.md) §2 and §7.2 for
why a paths-filtered workflow must never be made required.

**Verify.** A trivial change promoted `dev → staging → main` reaches the
production URL, and the image it deployed is the one staging already tested.

### P0.5 — Turn on email confirmation 👤

**Why.** This is a standing blocker that has survived several rounds. Signup does
not currently verify that the address belongs to the person. That means password
reset can be aimed at a typo'd address, and project details get mailed to whoever
actually owns it.

**Do.** Supabase → Authentication → Providers → Email → **Confirm email: on**, on
the production project. Also point Auth at real SMTP (Resend), not Supabase's
shared sender — the shared one is rate-limited to a handful per hour and will look
exactly like "signup is broken" on launch day. Walkthrough:
[EMAIL_RESEND_SETUP.md](EMAIL_RESEND_SETUP.md).

**Do not** build a custom OTP to work around this. It is a toggle.

**Verify.** Register a fresh address; the confirmation arrives from your domain,
and the account cannot sign in until it's clicked. Do it three times in one
minute — the default limiter would have dropped the third.

### P0.6 — Publish the legal pages 💻👤

**Why.** There are none, and three separate parties require them: Razorpay will
not keep a live merchant account without published Terms, Privacy, Refund/Cancellation
and Contact pages; the App Store and Play Store both require a reachable privacy
policy URL for the mobile app; and you're processing creator PII in India (DPDP
Act) with no stated basis or retention period.

**Do.** Publish `/privacy`, `/terms`, `/refund-policy`, `/contact` and link them
from the landing footer (`apps/landing/src/components/landing/footer.tsx`) and the
app footer. The content is a legal decision, not an engineering one — get the text
from a lawyer, then wiring it up is an hour of work.

**Verify.** All four reachable on the production domain, linked from the footer,
and the URLs entered in the Razorpay dashboard and the store listings.

### P0.7 — Real payment credentials, and prove one rupee moves 👤

**Why.** `RAZORPAY_WEBHOOK_SECRET` is what makes the money gates trustworthy —
the `advance_payment` and `final_payment` checklist items open **only** when a
signed capture webhook arrives. A placeholder secret means forgeable signatures,
i.e. anyone can mark a payment captured. The code already refuses placeholders on
staging/production; make sure it isn't refusing because the value is missing.

**Do.** Put live `rzp_live_*` keys and a freshly generated webhook secret in the
production environment. Point the Razorpay webhook at the production URL.

**Verify.** Run one real low-value payment through a real project on production and
watch the gate open by itself. Then check the Razorpay dashboard shows the capture.
Never add a bypass "for testing" — the audit suite signs its own webhooks instead.

### P0.8 — Decide the plan switch before launch, not after 👤

**Why.** `SUBSCRIPTIONS_ENABLED=false` means the paid tier is *absent*, not merely
unpurchased. Flipping it later on a live user base retroactively puts existing
users over a limit they never agreed to.

**Do.** Pick one: launch free (leave it `false`), or launch with plans (`true`,
**and** Razorpay configured — turning it on without payments strands users at a
paywall they can't clear; the boot banner flags that combination). Numbers live in
the `billing_settings` table, not in code.

**Verify.** The production boot banner shows the intended combination, and
`GET /api/billing/entitlements` returns what you expect for a fresh account.

### P0.9 — Point the mobile app at production 👤💻

**Why.** `apps/mobile/eas.json`'s `production` profile currently ships the
**staging** API and staging Supabase project. A store build made today would put
real users on the QA database — including the `qacreator` fixture.

**Do.** Update the `production` profile's `EXPO_PUBLIC_API_BASE_URL`,
`EXPO_PUBLIC_SUPABASE_URL` and anon key to the production project, then cut a
fresh build (not an OTA — env is baked at build time; see
[env-var traps in AGENTS.md](../../AGENTS.md)). Remember the release-stamp bump in
`settings.tsx` that ships with every mobile update.

**Verify.** The welcome screen's build strip shows the production backend and
bundle id before you submit to either store.

### P0.10 — Turn on the things that fail silently 👤

Each of these is inert-when-unset by design, which means nothing errors — you
simply never find out.

| Switch | Consequence if left unset |
|---|---|
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | No crash reports. You learn about breakage from users. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limits are per-instance, so real limits are looser than configured — multiply by replica count. |
| `RESEND_WEBHOOK_SECRET` | Bounces and spam complaints are never suppressed. This is what gets a sending domain blacklisted. |
| `NOTIFY_EMAILS_ENABLED=true` | No product email at all. (Keep it `false` everywhere except production.) |
| `EMAIL_ALLOWLIST` | Leave it **unset in production only**. It's the net that stops a non-prod env mailing real users. |
| `APIFY_TOKEN` | Verification silently degrades to structural signals and escalates everything to manual review. |

**Verify.** `/dashboard/admin/health` — it probes live config, so it tells you what
is actually true of the running deployment rather than what someone remembers setting.

### P0.11 — ~~Extend the health probes to 113/114/115~~ ✅ Done, and then some

The probe list in `apps/web/src/app/api/admin/health/route.ts` now reaches
migration **165** (single-source request notifications, 2026-09-19). Probes are
crafted so each can actually fail — RPC probes stay zero-arg and detect PostgREST's
PGRST202, which an earlier substring check silently never matched. Keep new
migrations with behaviour worth proving on the list, and keep every probe callable
with zero arguments.

### P0.12 — Prove you can restore a backup 👤

**Why.** An untested backup is a belief, not a backup. Supabase Pro gives daily
backups and PITR; nobody here has ever restored one.

**Do.** Once, before launch: restore the production database to a scratch project
from a backup, and open the app against it.

**Verify.** You have a written note of how long the restore took. That number is
your real RTO, and it's the number to quote when someone asks "what happens if…".

---

## Part 2 — Running it yourself for the first month or two

The goal of this phase is not to add features. It is to learn what actually breaks
so the next owner inherits knowledge instead of guesses.

### Weekly, ~30 minutes

1. `/dashboard/admin/health` — every required integration configured, migrations 0 pending.
2. Sentry — triage new issue groups. An issue seen 200 times by 1 user is a loop; 1 time by 200 users is a release regression.
3. Resend — bounce and complaint rate. Above ~2% complaints, stop sending and find out why before the domain is burned.
4. Supabase → Reports — **egress and realtime connections**, not database size. Size is the least binding limit here; egress and connection count bind first.
5. Razorpay — every capture has a matching opened gate. A mismatch is a webhook problem, not an accounting one.
6. `npm audit` / Dependabot PRs — this repo already gets them; merge the patch-level ones weekly rather than in a scary batch quarterly.

### Keep a running incident log

One file, one line per incident: what the user saw, what it actually was, what
fixed it. This repo's most valuable documents are exactly this shape
(`.agents/lessons_learned.md`, the audit reports in this folder). A month of
real-user incidents is the single most useful thing you can hand a new developer,
and it cannot be reconstructed later.

### Break-glass switches — know these before you need them

- **One bad email template looping:** `EMAIL_DISABLED_TEMPLATES=<id>` silences that one template everywhere in seconds, without a deploy, and without taking the rest of the mail system down. It deliberately overrides even account-tier mail.
- **All email:** `NOTIFY_EMAILS_ENABLED=false`.
- **Paid plans misbehaving:** `SUBSCRIPTIONS_ENABLED=false` restores pre-plan behaviour for everyone.
- **Payments:** unsetting the Razorpay keys drops payment stages back to "record manual (off-platform)" rather than breaking the pipeline.
- **A bad deploy:** promote the previous image via `deploy-prod.yml` rather than reverting commits under pressure.

That set is unusually good and was built deliberately. It is also invisible from
the code — say it out loud in the handover.

### Two things to watch specifically

- **The stage machine.** Most support questions will be "my project is stuck". The three exits (mutual sign-off, `advance`, `confirm_completion`) are not interchangeable, and `ALLOWED_TRANSITIONS` in `packages/core` is the only truth. Do not resolve a stuck project by editing `stage_progress` by hand — use `record_stage_signoff()` / `revoke_stage_signoff()`.
- **Verification.** Apify's free plan returns `{demo:true}` stubs for the third-party X/Twitter actor, so X lookups do not work until the plan is upgraded. If creators complain X won't verify, that's the cause, not a bug.

---

## Part 3 — Developer handover package

"Handover complete" means a competent stranger can ship a fix on day two without
calling you. Concretely:

### 3.1 Access inventory — the part that's only in your head

Write down, in a password manager (not this repo, not a doc), for each of:
Supabase (×3 projects) · GitHub · Azure · Railway (deploys dev) · Cloudflare/DNS ·
Razorpay · Resend · Stream Chat · Apify · Sentry · Upstash · Expo/EAS · Apple
Developer · Google Play · 2Factor · Cloudinary —

- who owns the account, and **whose personal email it's tied to**;
- what it costs and when it renews;
- whether the new developer gets their own login or inherits yours.

⚠️ Two known traps in this exact area, both already paid for once:
- A Resend key from a *foreign account* silently broke staging email. Keys must belong to the account that owns the verified domain.
- The active `gh` CLI account lacks repo admin, so admin API calls 404 and read as "this doesn't exist". Don't let a new developer conclude branch protection is missing because of it.

### 3.2 Credential rotation — do this *at* handover, not before

Anything the outgoing party has seen should be rotated when they leave, and
anything the incoming party will see is now shared. At minimum: service-role keys,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `STREAM_API_SECRET`,
`RESEND_API_KEY`, `SUPABASE_ACCESS_TOKEN`.

Note `EMAIL_UNSUBSCRIBE_SECRET` is different: rotating it invalidates every
unsubscribe link already sitting in someone's inbox. Rotate that one only if it
actually leaked.

Also: `ADMIN_CREDENTIALS.local.txt` sits in the repo root. The `*-backup-*.json`
data dumps that used to sit beside it were untracked and gitignored on
2026-09-19 (local copies retained, nothing sensitive in them — audit/test
personas only — but data dumps never belong in a public repo). Delete local
copies you no longer need before granting anyone repo access.

### 3.3 The day-one reading path for a new developer

Give them this order and nothing else at first:

1. **`AGENTS.md`** (repo root) — the traps that have actually cost time here. It is short and every line was paid for.
2. `docs/README.md` → `architecture/ARCHITECTURE.md` → `operations/SECURITY.md`.
3. This document.
4. `docs/operations/CICD_INSTRUCTIONS_2026-08-06.md` before they touch a workflow.
5. `docs/operations/FULL_FLOW_AUDIT_2026-08-08.md` before they touch the stage machine or the payment gates.

Then have them do one supervised change end to end: `dev` → PR → `staging` → PR →
`main`. The branching rule is one-way and enforced by a remote ruleset; the failure
mode when someone ignores it (staging-only code drifting for days) has already
happened here and silently downgraded SMS OTPs to voice calls.

### 3.4 What "done" looks like for the handover

- [ ] Access inventory written, in a password manager, with owners named
- [ ] Secrets rotated, old ones revoked
- [ ] New developer has done one full `dev → staging → main` promotion themselves
- [ ] New developer has applied one migration and watched `/dashboard/admin/health` change
- [ ] New developer has run the E2E harness once (`tests/e2e/`, seed personas first, `NOTIFY_EMAILS_ENABLED=false` during, restored after — the personas' `@influnet-audit.test` addresses hard-bounce and damage the Resend domain reputation)
- [ ] Incident log from your first month handed over and read
- [ ] Someone other than you can cut a mobile build and submit it
- [ ] A written answer to: who gets paged, and how, when the site is down at 2am

---

## Part 4 — Accepted risks: things a new developer must not "fix" naively

These look like bugs and are not. Each has a reason, and changing one without
reading the reason has already cost time in this project.

| Looks wrong | Why it's deliberate |
|---|---|
| Every API route has a different response envelope | There is no shared envelope. Read the route. Guessing `body.data ?? body.results` yields an empty array, and empty arrays make tests pass and dashboards render blank. |
| `public.connections` table is unused | It's dead (migration 029). Use `get_collaboration_stats()` (113). Don't revive it. |
| No required status checks on `staging` | Deliberate. A paths-filtered workflow as a required check leaves PRs stuck on "Expected — waiting for status" forever. |
| `NEXT_PUBLIC_*` for runtime flags | Never. It's inlined at build time, including the server read. Runtime flags are served from an endpoint (`/api/auth/config`, `/api/billing/entitlements`). |
| Fail-open defaults around "the migration might not be applied" | Correct for a *missing table*, wrong for *zero rows*. That conflation opened both payment gates once. `apps/web/src/lib/stage-items-gate.ts` shows the distinction. The DB has been current since 2026-08-08, so any remaining fail-open is guarding a state that no longer exists — decide each one deliberately. |
| Read-modify-write on `stage_progress` | Never do it from app code; two simultaneous confirmations clobber each other and the trigger then 500s with the user's click lost. Use the RPCs from migration 114. |
| Supabase CLI not on `latest` | Pinned to 2.111.0; 2.112.0 broke `supabase link`. |
| The mobile creator profile is a WebView of `/<username>?app=1` | Deliberate since 2026-08-31 (`components/profile-web-view.tsx`), so the public profile has one implementation. Everything else in the app is native; the business profile stayed native. |
| The `qacreator` fixture on staging | Load-bearing for deploy smoke tests. Never purge it. |

---

## Appendix — related docs

| Doc | When to read it |
|---|---|
| [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md) | The verify-each-step tester-round checklist this doc's Part 1 builds on |
| [PRODUCTION_TASKS.md](PRODUCTION_TASKS.md) | Long-form, one-task-at-a-time version of the infrastructure work |
| [CLIENT_HOSTING_AND_MAINTENANCE.md](CLIENT_HOSTING_AND_MAINTENANCE.md) | Costs, scaling ceilings, what a maintenance retainer covers |
| [CICD_INSTRUCTIONS_2026-08-06.md](CICD_INSTRUCTIONS_2026-08-06.md) | Before touching any workflow |
| [SECURITY.md](SECURITY.md) | Before writing any API route or migration |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Sentry, uptime, App Insights wiring |
| [SUPABASE_CAPACITY_2026-08-02.md](SUPABASE_CAPACITY_2026-08-02.md) | Which Supabase limit actually binds (it isn't DB size) |
| [FULL_FLOW_AUDIT_2026-08-08.md](FULL_FLOW_AUDIT_2026-08-08.md) | Before touching the stage machine or payment gates |
| [LAUNCH_READINESS_AUDIT_2026-09-19.md](LAUNCH_READINESS_AUDIT_2026-09-19.md) | The current state: what passed live (302/302 E2E), what still blocks, and the exact E2E reproduction commands |
| [SYSTEM_AUDIT_2026-11-05.md](SYSTEM_AUDIT_2026-11-05.md) | Latest full-system pass: new findings, what is still open, missing architecture, and the ordered next moves |
| [GOOGLE_ANALYTICS_LANDING.md](GOOGLE_ANALYTICS_LANDING.md) | Turning on GA4 for influnet.io (and the privacy-policy change that must ship with it) |
| [../api/README.md](../api/README.md) | API reference: every route, its access rule and rate limits (Swagger UI + OpenAPI) |
| [EMAIL_SYSTEM.md](EMAIL_SYSTEM.md) | Template ids, kill switches, tiers |
