# CI/CD Architecture — Review & Implementation Instructions

**Date:** 2026-08-06
**Role of this doc:** architecture review of the proposed 3-tier CI/CD plan, corrected
against what the repo actually contains, plus step-by-step instructions to implement.
**Who implements:** you. This document contains no code changes — only instructions.

Related: [CICD.md](CICD.md) (canonical description — currently drifted, see §6),
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## 0. Amendment — scope confirmed with the user (2026-08-06, after first draft)

Two facts from the user that change the priorities in §7. **Read this before working
from the task list.**

1. **Production is not on the roadmap right now.** Staging serves as production, in
   testing. → **§5 is deferred wholesale. T4 and T5 are deferred with it** (both exist
   only to make `deploy-prod.yml` work, and it cannot run while `main` is absent from
   `origin`). They drop from High to Low. Do them as part of §5, not now.

2. **GitHub secrets are not environment-scoped.** The dev-branch backend runs on
   **Railway**, with its secrets held in Railway. GitHub Actions secrets were therefore
   populated with **staging values only**. → This creates a serious problem that was
   invisible in the first draft: see **T0** below, which is now the highest-priority
   task in this document.

Consequence for the two "silent failure" bugs called out in the first draft: **T6a is
now the most urgent of them by a wide margin.** It fails on staging, and staging is
production. T4's silent failure can only trigger once a prod tier exists, so it waits.

> Minor drift also worth noting while you're here: `migrate-dev.yml`'s header comment
> says *"Dev's app code is deployed by Vercel's own GitHub integration"*, and
> [CICD.md](CICD.md) §2 maps `dev` → Vercel. You've said dev's backend is on **Railway**
> (`railway.json` at the repo root supports this). One of these is wrong. Correct the
> comment and the table as part of §6 so the next person isn't misled.

---

## 0.1 T0 — Stop dev CI from writing to the staging database  🔴 **Highest priority**

**Why this is the most serious finding in this document.**

`ci.yml`'s `integration-tests` job reads `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (lines 112–138).
`deploy-staging.yml` passes those **same secret names** as the staging container's
build args (lines 98–99) — so those secrets hold **staging** values. Every push and
PR on `dev` therefore runs the test suite against the **staging database, using
staging's service-role key**, which bypasses every RLS policy you have.

And these tests are **not read-only**. In `apps/web/tests/matchmaking.js`:

| Line | Operation |
|---|---|
| 59 | `sbAdmin.auth.admin.createUser(...)` — creates real auth accounts |
| 136 | `.update({ approval_status: 'approved' })` — mutates business approval state |
| 483 | `sbAdmin.auth.admin.deleteUser(id)` — deletes accounts |
| 488 | `sbAdmin.from('conversations').delete()...` — deletes conversation rows |

Because staging is currently production, **your dev CI has been creating and deleting
accounts in production on every pull request.** Cleanup is best-effort — line 484 logs
a warning and continues on failure — so failed runs leave orphaned users behind.

Two distinct risks, both live: test data polluting the environment your client is
testing (and skewing any analytics or counts), and a cancelled or crashed run leaving
half-created records with no cleanup pass.

> **Important:** **T1 does not fix this.** Narrowing triggers to `dev` stops a
> staging *merge* from being blocked; it does not change which database the job
> connects to. This needs separate secret names. Do T0 and T1 together.

**Step 1 — confirm the diagnosis before changing anything.** Don't act on my inference
alone. Go to GitHub → Settings → Secrets and variables → Actions and check whether
`NEXT_PUBLIC_SUPABASE_URL` starts with `https://aokdansyqxracuwsosji` (staging) or
`https://jaajosocopoicmqcffuu` (dev). Those two project refs are already public — they
appear in `deploy-staging.yml:48` and `migrate-dev.yml:44`. If it's the staging ref,
the problem is confirmed.

**Step 2 — add dev-specific secrets.** Create three new repository secrets holding the
**dev** project's values (from Railway, or the Supabase dashboard for the dev project
`jaajosocopoicmqcffuu`):

- `DEV_SUPABASE_URL`
- `DEV_SUPABASE_ANON_KEY`
- `DEV_SUPABASE_SERVICE_ROLE_KEY`

The explicit `DEV_` prefix is deliberate: it makes an accidental cross-wiring visible
when reading the YAML, which an unprefixed name never does. This is the first step of
the environment isolation you mentioned wanting to do properly later — the naming
convention here is what that larger cleanup should follow.

> Sanity check while you're collecting these: a service-role key is a JWT and starts
> with `eyJ`. A value starting with `sbp_` is a **personal access token**, not a
> service-role key, and will not work. This has bitten this project before.

**Step 3 — point `ci.yml` at them.** In `.github/workflows/ci.yml`, in the
`integration-tests` job **only** (lines ~110–138, four `env:` blocks across the Build,
Start server, Run integration tests, and Run E2E matchmaking steps), replace:

| Current | Replace with |
|---|---|
| `${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}` | `${{ secrets.DEV_SUPABASE_URL }}` |
| `${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}` | `${{ secrets.DEV_SUPABASE_ANON_KEY }}` |
| `${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}` | `${{ secrets.DEV_SUPABASE_SERVICE_ROLE_KEY }}` |

Apply the same substitution in the `build` job (lines 160–161), which uses the first
two. **Do not touch `deploy-staging.yml`** — its use of the unprefixed names is
correct, because it genuinely is deploying staging.

**Step 4 — verify.** Push to a branch and open a PR into `dev`. In the Actions log for
"Start server & wait for ready", the boot banner prints the active environment and
project (see `apps/web/src/instrumentation.ts`). Confirm it names the **dev** project.
Then check the staging Supabase dashboard → Authentication → Users and confirm no new
test accounts appear from that run.

**Step 5 — clean up what's already there.** Check staging's auth users for orphaned
accounts left by previous CI runs. Identify them by the pattern `matchmaking.js` uses
for test emails before deleting anything, and **do not bulk-delete by date** — there
are real client-testing accounts in that database.

> ⚠️ Before running any deletion against this project, read the incident note
> referenced in `docs/operations/AUDIT_REMEDIATION_2026-07-30.md`. A previous bulk
> purge on this project pair caused real damage.

---

## 1. Review of the proposed plan

The proposed plan described a three-tier pipeline: `dev` = code quality, `staging` =
environment health, `main` = release. **The shape is right.** But the plan was written
against an assumed repo state, not the real one. Three corrections matter.

### 1.1 Two of the three tiers already exist

| Plan says to build | Actual state |
|---|---|
| Tier 2: staging runs migrations → deploy → smoke tests, **no unit tests** | **Already built.** `deploy-staging.yml` does exactly this, and already contains zero lint/unit steps. |
| Tier 3: prod promotes image, smoke tests, manual approval | **Already built.** `deploy-prod.yml` has `environment: production` approval + smoke tests. |
| Tier 1: dev is the quality gate | **This is the only genuine gap.** `ci.yml` fires on `dev`, `staging`, `main` and `refactor/monorepo`. |

So the plan's "Required Change #2" — *remove unit tests and linting from
`deploy-staging.yml`* — is a no-op. There is nothing there to remove. Do not spend
time on it.

**The real work is narrowing `ci.yml`'s trigger, plus fixing five defects the plan
did not look for.**

### 1.2 There is no production tier, and the plan assumed one

`main` exists locally and on `upstream`, but **not on `origin`**. `origin` has only
`dev` and `staging`. `deploy-prod.yml` triggers on `push: branches: [main]`, so it
has never executed and cannot until `main` is pushed to `origin`.

Today's real topology is **two tiers, not three**:

```
feature/*  ──PR──▶  dev  ──PR──▶  staging
                (quality gate)   (deploy + prove; currently acting as production)
```

Architecture guidance follows the reality: **build the two tiers you have properly,
and treat production as a documented future step with a pre-flight checklist (§5).**
Building a third tier now means maintaining a pipeline nothing runs through.

> ⚠️ **Standing warning:** the day you `git push origin main`, `deploy-prod.yml`
> fires immediately and unattended (past the approval gate). It is currently broken
> in at least two ways — see §5. **Complete §5 before creating `main` on `origin`.**

### 1.3 The plan's premise about test isolation is factually wrong

The plan states dev runs *"Integration Tests: ... using mocked databases."* It does
not. The `integration-tests` job boots a real Next.js server and points it at the
**live dev Supabase project** using the real service-role key
(`ci.yml:112-138`). See §2 for why this is the actual cause of the pain the plan
was written to solve.

**Answer to the plan's Open Question 1 — "Do you use Turborepo caching in GitHub
Actions?": No.** There is no `TURBO_TOKEN`/`TURBO_TEAM` in any workflow and no
`remoteCache` block in `turbo.json`. Every runner starts cold. The plan's assumption
that "running tests again on staging takes 0 seconds because of the cache" is not
true today. Do not rely on it. (Turborepo caches locally within a single run only —
you can see this in the lint output: `Cached: 1 cached, 2 total`.)

---

## 2. Why the integration tests hurt you (plain explanation)

A test should answer exactly one question: **is the code correct?**

The `integration-tests` job answers two questions at once:

1. Is the code correct?
2. Is the dev Supabase database in the right state *at this exact moment*?

Question 2 is not something a pull request author controls. The job fails when
someone deletes a test row, when a migration hasn't landed on the hosted DB, when
Supabase's free tier pauses the project after 7 days idle, or when a rate limit
trips. None of those mean the code is bad.

Because `ci.yml` currently also runs on PRs into `staging`, **a dev-database hiccup
can block a release**. That is precisely the symptom the original plan opened with
— but the cause is not "flaky tests". The cause is that this job is an
*environment* test wearing a *code* test's costume, running at the wrong tier.

**The architectural rule:** environment tests belong *after* a deploy, pointed at
the environment they are testing. Code tests belong *before* a merge. Never let an
environment test gate a merge into a branch it doesn't test.

**Decision for now:** keep the job, but only on `dev`. Dev is where you *want*
noisy-but-real feedback, and it is not a release gate. Task **T1** achieves this
with no changes to the job itself.

**Later (optional, not now):** if it becomes annoying on `dev` too, move it to a
nightly `schedule:` trigger plus a post-deploy run against the live staging URL.
Do not do both at once — change the trigger first, live with it for two weeks,
then decide.

---

## 3. Target architecture (today's two tiers)

### Tier 1 — `dev`: prove the code is sound

**Trigger:** PRs targeting `dev`, and pushes to `dev`. Nothing else.

| Job | Gate | Notes |
|---|---|---|
| TypeScript Type Check | **blocks** | Covers web *and* mobile (both are workspaces with a `typecheck` script; `turbo run typecheck` fans out to both). |
| ESLint | **blocks** (after T3) | Currently advisory — a fake gate. |
| Unit Tests | **blocks** | `vitest run tests/unit/` — deterministic, no network. |
| Production Build | **blocks** | Proves Next.js compiles. |
| Integration + E2E | **blocks**, dev only | Live-DB. Accepted noise at this tier; must never reach staging. |

Separately, `migrate-dev.yml` applies migrations to the dev database on push to
`dev`. Leave it exactly as it is — it is correct, including the `--include-all` flag
and the `concurrency` guard.

### Tier 2 — `staging`: prove the environment is healthy

**Trigger:** pushes to `staging`.

Order is already correct and deliberate: **migrations first, app second**, with
`needs:` stopping the deploy if migrations fail, and a `concurrency` group that
never cancels mid-migration. Do not reorder these. The reasoning is documented in
the file's own header comment and it is sound.

What still needs work here is the *tail* of the pipeline — the smoke test step
(**T5**, **T7**).

### Tier 3 — production: **not built yet, deliberately**

See §5.

---

## 4. Implementation tasks

Do these in order. Each task is independent enough to commit separately.

---

### T1 — Narrow `ci.yml` to `dev` only, and delete the `paths` filters

**Why (two separate reasons):**

1. **Wrong tiers.** Running on `staging`/`main` lets a dev-DB problem block a
   release (§2).
2. **`paths` filters are a trap for required checks.** GitHub identifies a required
   status check by name. If a PR touches only `supabase/migrations/**` or
   `apps/mobile/**`, the current `paths` filter means `ci.yml` **never runs** — so
   the required check never reports, and the PR sits at "Expected — waiting for
   status" **forever**. You cannot merge it and you cannot un-stick it without
   removing the protection rule. Step 3 of the original plan (make it a required
   check) walks straight into this. It is the single most common self-inflicted CI
   deadlock.

   A secondary effect: `apps/mobile/**` is excluded today, so **mobile type errors
   currently reach `dev` completely unchecked**, even though `npm run typecheck`
   would have caught them.

> **Rule to remember:** `paths` filters are fine on *deploy* workflows (a skipped
> deploy is just a deploy that didn't happen). They are dangerous on any workflow
> you mark as a **required check**. Keep them in `deploy-staging.yml`. Remove them
> from `ci.yml`.

**File:** `.github/workflows/ci.yml`

**Change:** replace the entire `on:` block (currently lines 9–27) with:

```yaml
on:
  push:
    branches: [dev]
  pull_request:
    branches: [dev]
```

That also drops `refactor/monorepo`, which is a stale branch that no longer exists
on `origin`.

**Also change** the workflow's display name on line 7, because it no longer does any
CD:

```yaml
name: PR Checks (dev)
```

**Do NOT rename the file** to `pr-checks.yml` as the original plan suggested. It is
purely cosmetic, and renaming has a real cost: the `name:` field is what appears in
the GitHub UI and the **job names** are what branch protection binds to — the
filename is invisible to both. Renaming buys nothing and risks confusing anyone
reading old Action run history.

**Verify:** open a throwaway PR into `dev` that changes only a file under
`supabase/migrations/`. The checks must run. Before this change they would not.

---

### T2 — Stop wasting runner minutes on superseded runs

**Why:** every push to a PR branch currently starts a full parallel run — five jobs,
each doing its own `npm ci` from cold. Pushing three times in five minutes means
fifteen jobs running, thirteen of which are already irrelevant. Since there is no
remote cache (§1.3), this is real wall-clock time and real billed minutes.

**File:** `.github/workflows/ci.yml`

**Change:** add this block at the top level, immediately after the `on:` block and
before `env:`:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

`cancel-in-progress: true` is correct **here and only here** — cancelling a code
check is harmless. Note the deliberate contrast with `deploy-staging.yml` and
`migrate-dev.yml`, which both set `cancel-in-progress: false` because cancelling a
half-applied database migration corrupts schema state. **Never copy `true` into a
workflow that touches a database.**

**Verify:** push twice to a PR branch in quick succession. The first run should show
as "Cancelled", not run to completion.

---

### T3 — Make ESLint a real gate

**Why:** `ci.yml:70` sets `continue-on-error: true` on the lint job. The job reports
green no matter what ESLint finds. The plan's claim that dev "mathematically
guarantees" code quality cannot hold while a gate is wired to always pass. A gate
that can't fail isn't a gate; it's decoration that creates false confidence.

**Current baseline (I ran it):** `40 problems (1 error, 39 warnings)`.
`eslint src` exits non-zero on **errors only**, not warnings — so removing
`continue-on-error` gates on errors and leaves the 39 warnings advisory. That is the
right first step. Do not try to reach zero warnings now; that's a separate cleanup
with no deadline pressure.

**This task has two parts and the order matters.** Do 3a first, or `dev` goes red.

#### T3a — Fix the one blocking error

**File:** `apps/web/src/lib/hooks/use-availability.ts`, line 298, inside
`useSocialConnect`.

**The error:**

```
298:3  error  Cannot access refs during render  react-hooks/refs
```

**The current code (lines 297–298):**

```ts
const stateRef = useRef(state);
stateRef.current = state;
```

**Why it's flagged, and why it's a real bug not a lint nit:** assigning to
`ref.current` during the render body is a side effect during render. React may
render a component without committing that render (concurrent rendering, Strict
Mode's double-render, an abandoned transition). When that happens the ref has been
mutated for a render the user never sees, so `stateRef.current` can hold state from
a discarded render tree. Refs are only guaranteed consistent after commit.

**What to do:** move the assignment into an effect so it runs after commit.

```ts
const stateRef = useRef(state);
useEffect(() => {
  stateRef.current = state;
}, [state]);
```

**Why this is safe for this specific hook** — worth confirming yourself before you
commit, since the existing comment on lines 295–296 explains the ref exists to keep
`connect`'s identity stable: `stateRef.current` is read inside `connect` (line 322),
and `connect` is only ever invoked from a user event handler. Event handlers always
run after the commit phase, so the effect will have already written the current
value by then. The one behaviour that changes is a read during the same render pass
that produced the state — which does not happen here.

Make sure `useEffect` is in the import list at the top of the file (it is already
used at line 304, so it should be).

**Verify:**

```bash
npx eslint src/lib/hooks/use-availability.ts
```

Run from `apps/web/`. Expect zero errors. Then run `npm run lint` from the repo root
and confirm the summary reads `0 errors`.

#### T3b — Remove the escape hatch

**File:** `.github/workflows/ci.yml`, line 70.

**Delete this line entirely:**

```yaml
          continue-on-error: true
```

Leave `run: npm run lint` as it is.

**Verify:** after T3a lands, CI on `dev` stays green. To prove the gate genuinely
works, temporarily introduce an obvious error (e.g. an unused import with
`no-unused-vars` escalated, or just re-break line 298) on a scratch branch and
confirm the check goes red. Then discard that branch.

---

### T4 — Fix the broken production image promotion

**Why:** this is a live defect, not a refactor. `deploy-prod.yml:59` runs:

```
docker pull <registry>/influnet-web:staging-latest
```

But `deploy-staging.yml:105-106` only ever builds and pushes
`influnet-web:${{ github.sha }}`. **The tag `staging-latest` is never created by any
workflow in this repo.** Two possible outcomes, both bad:

- The tag does not exist → prod deploy fails at the `docker pull`.
- The tag exists from some earlier manual `docker push` → **prod silently ships a
  stale image that nobody tested**, while the logs report success.

The second is far worse than the first. Fix this before `main` exists.

**File:** `.github/workflows/deploy-staging.yml`, in the "Build and Push Docker
Image" step (currently lines 95–106).

**Change:** after the existing `docker push` of the SHA tag, add a tag-and-push of
`staging-latest`. The `run:` block should end up as:

```yaml
      - name: Build and Push Docker Image
        run: |
          docker build -f apps/web/Dockerfile \
            --build-arg NEXT_PUBLIC_SUPABASE_URL="${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}" \
            --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}" \
            --build-arg NEXT_PUBLIC_STREAM_API_KEY="${{ secrets.NEXT_PUBLIC_STREAM_API_KEY }}" \
            --build-arg NEXT_PUBLIC_APP_URL="${{ env.STAGING_URL }}" \
            --build-arg NEXT_PUBLIC_PHONE_OTP_ENABLED="${{ secrets.NEXT_PUBLIC_PHONE_OTP_ENABLED }}" \
            --build-arg NEXT_PUBLIC_SENTRY_DSN="${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}" \
            --build-arg NEXT_PUBLIC_RAZORPAY_KEY_ID="${{ secrets.NEXT_PUBLIC_RAZORPAY_KEY_ID }}" \
            -t ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker push ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker tag ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
                     ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:staging-latest
          docker push ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:staging-latest
```

> **Placement note:** the two new lines must go **after** the existing `docker push`
> of the SHA tag, so `staging-latest` is only ever advanced by an image that pushed
> successfully.

**Architectural caveat to be aware of (do not fix now):** `staging-latest` is a
mutable pointer. Promoting by mutable tag means prod inherits whatever staging
pushed most recently, which may not be the commit you *intended* to release if
someone merges to `staging` while a prod release is in flight. The stricter pattern
is for prod to promote an **explicit SHA** passed via `workflow_dispatch` input.
`staging-latest` is fine while staging *is* production and you are the only person
deploying. Revisit it in §5 when a real prod tier exists.

**Verify:** merge anything into `staging`, let the workflow run, then in the Azure
Portal → Container Registry → Repositories → `influnet-web`, confirm both the SHA
tag and `staging-latest` are present and share the same digest.

---

### T5 — Unify the container registry secret names

**Why:** the two deploy workflows read the same registry from **different secret
names**:

| Workflow | Secrets used |
|---|---|
| `deploy-staging.yml:19-21` | `REGISTRY_LOGIN_SERVER`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` |
| `deploy-prod.yml:53-55` | `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD` |

Since staging demonstrably works, `REGISTRY_*` is set. `ACR_*` is likely unset —
and **GitHub Actions substitutes an empty string for a missing secret rather than
failing**. The result is `docker pull /influnet-web:staging-latest` against an empty
registry host, which produces a confusing error far from its cause. This is the
second reason prod cannot work today.

**This step needs you — I have no visibility into GitHub secrets.**

1. Go to **GitHub → repo → Settings → Secrets and variables → Actions**.
2. Note which of `REGISTRY_LOGIN_SERVER` / `ACR_LOGIN_SERVER` (and the
   `USERNAME`/`PASSWORD` pairs) actually exist.
3. **Standardize on `REGISTRY_*`** — it is the pair that is proven to work, so
   changing the workflow is safer than changing the secret that staging depends on.
4. In `.github/workflows/deploy-prod.yml`, replace every occurrence of
   `secrets.ACR_LOGIN_SERVER` → `secrets.REGISTRY_LOGIN_SERVER`,
   `secrets.ACR_USERNAME` → `secrets.REGISTRY_USERNAME`,
   `secrets.ACR_PASSWORD` → `secrets.REGISTRY_PASSWORD`.
   There are 8 occurrences of `ACR_LOGIN_SERVER` (lines 53, 59, 60, 61, 62, 63, 69)
   plus the username/password on 54–55.
5. If `ACR_*` secrets exist and are now unused, delete them so nobody wires them up
   again by mistake.

**Verify:** cannot be verified until `main` exists. Record it on the §5 checklist.

---

### T6 — Harden the staging smoke test

Three separate weaknesses in one step. **T6a is the one that matters.**

#### T6a — There is no wait for the new revision to serve traffic

**Why:** `azure/container-apps-deploy-action` returns once Azure *accepts* the new
revision, not once that revision is healthy and receiving traffic. The smoke test on
line 150 then runs immediately. Two failure modes, and again the silent one is
worse:

- The new container is still cold → smoke test times out or 502s → **a good deploy
  reports as failed**, and you learn to ignore red smoke tests.
- Traffic hasn't shifted yet → **the smoke test passes against the OLD revision**,
  reporting success for a deploy that may be completely broken.

The second makes the entire smoke-test step worthless as a safety net, which is
worse than not having one, because you believe it.

**Change:** add a readiness wait as a **new step immediately before** "Run Smoke
Tests". Poll the health endpoint until it responds, with a bounded timeout:

```yaml
      - name: Wait for the new revision to serve traffic
        run: |
          for i in $(seq 1 30); do
            if curl -fsS --max-time 10 "${{ env.STAGING_URL }}/api/health" > /dev/null; then
              echo "Healthy after ${i} attempt(s)."
              exit 0
            fi
            echo "Not ready yet (attempt ${i}/30); retrying in 10s..."
            sleep 10
          done
          echo "Revision did not become healthy within 5 minutes."
          exit 1
```

This gives a 5-minute budget, which is generous for a Container Apps revision swap.

> **Known limitation, accept it for now:** polling `/api/health` proves *something*
> is healthy, not that it is the *new* revision. Closing that properly means having
> the app expose its build SHA (e.g. `/api/health` returning the `GITHUB_SHA` baked
> in at build time) and asserting it matches `${{ github.sha }}`. That is the correct
> long-term design and it is a small change — but it touches app code, so it is
> listed as a §5 pre-production item rather than something to do today.

#### T6b — Remove the unnecessary dependency install

**Why:** lines 78–85 run a full monorepo `npm ci` — which installs Expo, Playwright,
Turborepo and the entire web dependency tree — solely so that line 150 can run
`scripts/smoke.mjs`. I read that script: it is 126 lines, imports only `process`
from Node's stdlib, and uses the global `fetch`. **It has zero dependencies.**

This adds several minutes to every staging deploy and, worse, adds a failure mode:
an `npm ci` failure now fails a deploy whose image has already been built and pushed
successfully.

**Change:** delete the "Setup Node.js (for smoke tests)" and "Install dependencies
(needed for smoke test execution)" steps from `deploy-staging.yml` (lines 78–85).
The `ubuntu-latest` runner ships with Node preinstalled, and `smoke.mjs` needs
nothing else.

*Apply the same deletion to `deploy-prod.yml` lines 36–43 while you are in there
for T5 — it has the identical redundant pair.*

#### T6c — Actually exercise the profile routes

**Why:** `smoke.mjs` supports `--creator` and `--business` flags that check public
profile pages render (`/c/<username>`, `/b/<username>`). Neither workflow passes
them, so those checks are skipped every run — you can see it in the logs as
`ℹ️ Skipped creator profile check`. Public profiles are core surface area and they
depend on the database being reachable, which makes them the single best signal that
a deploy is genuinely healthy.

**Change:** update the smoke step in `deploy-staging.yml` to pass known-good
usernames that exist in the **staging** database (remember: staging has its own
Supabase project, separate from dev — a username that works on dev may not exist on
staging):

```yaml
      - name: Run Smoke Tests
        run: |
          node scripts/smoke.mjs "${{ env.STAGING_URL }}" \
            --creator "${{ vars.SMOKE_CREATOR_USERNAME }}" \
            --business "${{ vars.SMOKE_BUSINESS_USERNAME }}"
```

Use repository **variables** (Settings → Secrets and variables → Actions →
*Variables* tab), not secrets — these are public usernames, and variables are
readable in logs, which makes a failure diagnosable.

Pick accounts that are stable and will not be deleted during test cleanup. If no
such account exists on staging, create a permanent one and note it in
[DEPLOYMENT.md](DEPLOYMENT.md).

---

### T7 — Branch protection (GitHub UI — you must do this, I cannot)

**First, an important correction to the original plan.** Step 3 of the plan says:

> *"Require `deploy-staging.yml` to pass on the `staging` branch before you are
> allowed to open a PR to `main`."*

**GitHub cannot express this.** Branch protection gates **merges into** a branch; it
has no concept of gating the **opening of a PR** out of one. Nothing in the settings
UI implements that rule. The equivalent outcomes GitHub *can* give you are:

- a required status check on PRs **targeting** `main`, and/or
- the `environment: production` approval gate, **which `deploy-prod.yml` already
  has** (line 31).

Don't go looking for the setting the plan describes — you'll waste an afternoon.

**Do this now (protect `dev`):**

Settings → Branches → Add branch protection rule → branch name pattern `dev`:

- ☑️ **Require a pull request before merging**
- ☑️ **Require status checks to pass before merging**
  - ☑️ Require branches to be up to date before merging
  - Add these required checks. **These are the `name:` values of the jobs, not the
    filename** — this is why renaming the workflow file (T1) would have been
    pointless:
    - `TypeScript Type Check`
    - `ESLint`
    - `Unit Tests`
    - `Integration and E2E Tests`
    - `Production Build`
- ☑️ **Do not allow bypassing the above settings** — or leave this off if you need
  to be able to force-merge a hotfix while you are the only maintainer. Your call;
  it is reversible.

> ⚠️ **Do T1 before this.** If you add required checks while the `paths` filters are
> still in place, the very first migration-only or mobile-only PR will hang
> permanently at "Expected — waiting for status" with no way to merge it.

**Do this now (protect `staging`):**

Same screen, pattern `staging`:

- ☑️ Require a pull request before merging.
- **Do not add required status checks yet.** After T1, `ci.yml` no longer runs on
  PRs into `staging`, so any check you list here would never report — the same
  deadlock. The gate that protects staging is the fact that code must already have
  passed through `dev`.

---

## 5. Before you create `main` on `origin` — production pre-flight

**Do not push `main` to `origin` until every box below is ticked.** Pushing it fires
`deploy-prod.yml` immediately.

| # | Item | Status today |
|---|---|---|
| 1 | `staging-latest` tag is produced by staging | ❌ broken → **T4** |
| 2 | Registry secret names unified | ❌ mismatched → **T5** |
| 3 | **Prod has its own Supabase project** | ❌ Not split. Per `deploy-prod.yml`'s header comment, prod and staging currently point at the *same* project (`aokdansyqxracuwsosji`). Shipping to real customers against the staging database is not acceptable. |
| 4 | **Prod has a migrate job** | ❌ Absent, deliberately — correct while the DB is shared, **wrong the moment item 3 is done**. When you split the DB, copy the `migrate` job from `deploy-staging.yml`, point it at the prod project ref, and keep it gated behind `environment: production` approval. Schema-before-app ordering must be preserved. |
| 5 | **Resolve the platform mismatch** | ❌ **Read this one carefully.** Staging deploys to **Azure Container Apps** (`azure/container-apps-deploy-action`) and injects backend secrets afterwards via `az containerapp update --set-env-vars` (lines 124–147). Prod deploys to **Azure App Service** (`azure/webapps-deploy@v3`) and has **no equivalent step at all**. If prod ran today, the container would boot with no `SUPABASE_SERVICE_ROLE_KEY`, no Stream secret, no Razorpay keys, no Resend key — the app would start and then fail on every server-side request. Either move prod to Container Apps to mirror staging, or add App Service application settings for all 13 backend variables. **Decide deliberately; do not let it stay accidental.** |
| 6 | Prod smoke test target is set | ⚠️ Uses `secrets.PRODUCTION_APP_URL`; confirm it exists and is correct. |
| 7 | Health endpoint reports build SHA | ❌ See T6a's limitation note. Worth doing before prod: it turns the smoke test from "something is up" into "the thing I just shipped is up". |
| 8 | Promotion by explicit SHA, not mutable tag | ⚠️ See T4's caveat. Add a `workflow_dispatch` input carrying the staging SHA once more than one person can deploy. |
| 9 | Confirm-email is ON in Supabase | ❌ **Long-standing pre-prod blocker, unrelated to CI/CD but blocking launch.** Signup currently never verifies the email address. It's a Supabase dashboard toggle. |

**Recommended sequencing:** items 1, 2 and 5 are cheap and make prod *possible*.
Item 3 is the expensive one (new Supabase project, migration replay, secret
rotation, data decisions) and gates items 4 and 9's usefulness. Don't start item 3
until you actually need a customer-facing tier — while staging serves as production
in testing, the shared database is a reasonable, *documented* compromise.

---

## 6. Documentation drift to correct

While implementing, fix [CICD.md](CICD.md) — it describes an architecture that
diverged from the code:

1. **§2 Branch → environment map** claims `staging` deploys to *"Azure App
   Service (Docker)"*. It deploys to **Azure Container Apps**. `main` is the one
   targeting App Service. Correct the table.
2. **§1 Philosophy** states *"Every environment has its own Supabase project."*
   Currently staging and production share one (`deploy-prod.yml` header). Either
   correct the claim or mark it as a target state with a ⚠️.
3. **§3.1** is titled *"CI — every push & PR to `dev`/`staging`/`main`"*. After T1
   this becomes `dev` only. Retitle it and note *why* (§2 of this document).
4. **§3.1 table** already says lint is *"advisory today → make blocking"*. After T3,
   update it to blocking and delete the note.

---

## 7. Summary — what to do, in order

Re-ranked per §0 (no production tier planned; GitHub secrets hold staging values).

| # | Task | Where | Effort | Priority |
|---|---|---|---|---|
| **T0** | **Point dev CI at the dev database, not staging** | GitHub secrets + `ci.yml` | 30 min | 🔴 **Do first — writing to prod** |
| T1 | Narrow `ci.yml` to `dev`; delete `paths` filters; rename `name:` | `ci.yml` | 5 min | **High — do with T0** |
| T6a | Wait for revision health before smoke tests | `deploy-staging.yml` | 10 min | **High — silent failure, hits staging=prod today** |
| T3a | Fix ref-during-render in `use-availability.ts:298` | app code | 10 min | Medium-High |
| T3b | Delete `continue-on-error: true` from lint job | `ci.yml` | 1 min | Medium-High — **after T3a** |
| T7 | Branch protection on `dev` (and PR-required on `staging`) | GitHub UI | 10 min | Medium-High — **after T1** |
| T2 | Add `concurrency` with `cancel-in-progress: true` | `ci.yml` | 2 min | Medium |
| T6b | Drop the redundant `npm ci` from both deploy workflows | both deploys | 5 min | Medium |
| T6c | Pass `--creator` / `--business` to smoke tests | `deploy-staging.yml` + GitHub vars | 15 min | Medium — matters *more* now that staging is prod |
| §6 | Fix `CICD.md` + `migrate-dev.yml` drift (incl. Vercel vs Railway) | docs | 15 min | Low |
| T4 | Push a `staging-latest` tag | `deploy-staging.yml` | 5 min | **Deferred → §5** (prod-only) |
| T5 | Unify `ACR_*` → `REGISTRY_*` secret names | `deploy-prod.yml` + GitHub UI | 10 min | **Deferred → §5** (prod-only) |
| §5 | Production pre-flight | — | Large | **Deferred** — before creating `main` |

**If you only do three things: T0, T1, T6a.**

T0 is the only one causing active harm right now. T1 is what the whole exercise was
originally about. T6a is the one silent-failure bug that can actually bite you today,
because it fails against staging — which is your production.

T4 and T5 were High in the first draft on the assumption a prod tier was coming. It
isn't, so they're cheap insurance you can buy later. Don't spend time on them now.

---

## 8. Review checklist for when you're done

Ping me when the fixes are on `dev` and I'll review against this. What I'll be
checking:

- **T0:** that `deploy-staging.yml` still uses the *unprefixed* secret names (it
  should — it really is deploying staging) while `ci.yml` uses the `DEV_` ones. The
  most likely mistake is a global find-and-replace catching both files.
- **T0:** that all four `env:` blocks in the `integration-tests` job were updated, plus
  the `build` job. Missing one leaves the E2E step still pointed at staging, and it's
  the step that writes.
- **T1:** that `paths:` is gone from `ci.yml` but still present in `deploy-staging.yml`
  — the asymmetry is deliberate and easy to "tidy up" by mistake.
- **T2:** that `cancel-in-progress: true` landed in `ci.yml` only, and did not get
  copied into any workflow that runs migrations.
- **T3a:** whether the `stateRef` effect preserves `connect`'s stable identity — I'd
  rather confirm the hook still behaves than just see the lint pass.
- **T6a:** that the wait step sits *before* the smoke step, and that its failure
  actually fails the job.
- **T7:** the required-check names match the job `name:` values exactly, and that T1
  merged first.

Run `npm run lint` and `npm run typecheck` from the repo root before pushing —
cheaper than a red CI run.
