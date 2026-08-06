# Influnet — CI/CD & Environments

How code moves from a feature branch to production, what runs automatically at
each step, and everything you must provision once by hand.

- **Manual deploy steps** (Supabase provisioning, DNS, first-time host setup) live in the [Deployment Runbook](DEPLOYMENT.md).
- **Local env switching** (`APP_ENV`, `.env.*` files, the boot banner) is documented in [apps/web/.env.example](../../apps/web/.env.example) and implemented in `apps/web/src/lib/env.ts` + `apps/web/src/instrumentation.ts`.

> **Status legend:** ✅ built · 🛠️ planned (not yet in repo) · 👤 human-only (needs an account/credential from you)

---

## 1. Philosophy (why it's shaped this way)

- **GitHub Actions, not Jenkins** — no server to babysit; the pipeline lives in `.github/workflows/`.
- **Dev/prod parity where it matters.** `staging` runs on **Azure Container Apps** from a Docker image, and production is intended to run the same image. `dev` runs on **Railway** (`railway.json` at the repo root, same `apps/web/Dockerfile`) purely for fast iteration — it is not a parity gate. Railway also holds dev's runtime secrets, which is why GitHub Actions secrets carry staging values (see §6).
- **The container built for `staging` is the exact artifact promoted to `main`.** We don't rebuild for prod; we re-tag and redeploy the tested image.
- **Every environment has its own Supabase project.** ⚠️ (Currently staging and production share one, to be split before production launch). Local/dev/staging never touch the production database.
- **Skipped on purpose** (they'd add ops burden with no benefit here): SonarQube (→ ESLint + `npm audit` + CodeQL), Trivy/Docker Hub/Kubernetes.

---

## 2. Branch → environment map

| Branch | Deploys to | Host | `APP_ENV` | Supabase project | Purpose |
|---|---|---|---|---|---|
| `feature/*` | — (no preview deploy today) | — | `dev` | dev | Build & review in isolation |
| `dev` | Dev | Railway | `dev` | dev | Integration; always-deployable |
| `staging` | Staging | **Azure Container Apps** | `staging` | **staging (separate)** | Prod replica; client UAT |
| `main` | Production | **Azure App Service (Docker)** | `production` | production | Live |

**Flow:** `feature/*` → PR → `dev` → PR → `staging` → PR → `main`.
One fix = one commit. Migrations are append-only. Never commit `.env*`.

```
feature/*  ──PR──▶  dev  ──PR──▶  staging  ──PR──▶  main
  (CI)             (CI+CD          (CD only,        (CD only, gated)
                    Railway)        Azure)           ⚠️ no `main` on origin yet
```

---

## 3. What runs at each stage

### 3.1 CI — every push & PR to `dev`  ✅ (exists: `.github/workflows/ci.yml`)

*(Trigger narrowed to `dev` only to prevent dev database issues from blocking staging deployments)*

| Job | Command | Gate |
|---|---|---|
| Type check | `npm run typecheck` | blocks merge |
| Lint | `npm run lint` | blocks merge |
| Unit tests | `npm run test:unit --workspace=web` | blocks merge |
| Integration tests | `npm run test:integration` (against a Supabase test project) | blocks merge |
| E2E | `node apps/web/tests/matchmaking.js` | blocks merge |
| Build | `npm run build` | blocks merge |

> 🛠️ **Make CI a required merge gate** on `dev`, `staging`, and `main` (branch protection). The branch shipped with a red build once — this closes that gap.

### 3.2 CD — deploy per branch

| Trigger | Workflow (🛠️ planned) | Steps |
|---|---|---|
| push to `dev` | — (no workflow) | Railway deploys from its own GitHub integration. Only `migrate-dev.yml` runs here, applying migrations to the dev DB. |
| push to `staging` | `deploy-staging.yml` ✅ | **apply migrations to staging DB** → build Docker image → push to Azure Container Registry → deploy to **Container Apps** (staging) → inject backend env vars → wait for health → **smoke test** |
| push to `main` | `deploy-prod.yml` | **manual approval** (GitHub Environment protection) → promote the staging image to App Service (prod) → smoke test → tag Sentry release |

---

## 4. The Docker + Azure path (staging & prod)  🛠️

**Planned repo additions:**

| File | Purpose |
|---|---|
| `apps/web/Dockerfile` | Multi-stage build using Next.js `output: 'standalone'` (small runtime image) |
| `apps/web/.dockerignore` | Keep `node_modules`, `.next`, `.env*` out of the build context |
| `next.config.ts` → `output: 'standalone'` | Emit the standalone server for the container |
| `apps/web/src/app/api/health/route.ts` | Health endpoint — returns 200 + checks Supabase reachability |
| `scripts/smoke.mjs` | Post-deploy check: hits `/api/health` + key public routes, expects 200 |

**Image promotion (parity guarantee):** `deploy-staging.yml` builds and tags the image (e.g. `:<git-sha>`); `deploy-prod.yml` deploys *that same tag* to prod — no rebuild.

**Azure resources** 👤 (you provision once):
- Azure Container Registry (ACR) — stores the images.
- Azure App Service (Linux container) — one for **staging**, one for **production**.
- App Service **application settings** = the env vars from §6 (Azure's secret store).
- A service principal / OIDC credential so GitHub Actions can push to ACR and deploy.

---

## 5. Environments & `APP_ENV`  ✅

`APP_ENV` (`local | dev | staging | production`) selects **which backend/credentials** a
process runs against. It is deliberately separate from `NODE_ENV` (Next.js only allows
`development | production | test` and cannot express "staging").

- **Deployed envs:** set `APP_ENV` in the host's config (Railway variables for dev / Azure Container Apps env vars for staging).
- **Local:** the npm scripts set it via the loaded `.env.*` file (see [.env.example](../../apps/web/.env.example)):

  | Command | `APP_ENV` | Loads | Runs against |
  |---|---|---|---|
  | `npm run dev` | local | `.env.local` | local/dev backend |
  | `npm run dev:dev` | dev | `.env.dev.local` | dev backend |
  | `npm run dev:staging` | staging | `.env.staging.local` | staging backend |
  | `npm run dev:prod` | production | `.env.production.local` | **prod (guarded, warns loudly)** |

On every server boot, `instrumentation.ts` prints a banner naming the active `APP_ENV`,
the env file, and which secrets are present — your "what am I running against?" check.

---

## 6. Required secrets / config per environment  👤

Store these in **GitHub Actions secrets** (for the pipeline) and the **host's app settings**
(Railway variables for dev / Azure Container Apps env vars for staging, which
`deploy-staging.yml` sets automatically via `az containerapp update`) — never in git.

**App runtime (all envs — values differ per environment):**

| Var | Scope | Notes |
|---|---|---|
| `APP_ENV` | public | `dev` / `staging` / `production` |
| `NEXT_PUBLIC_APP_URL` | public | the env's own base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | public | that env's Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | that env's anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | that env's `service_role` **JWT** (`eyJ…`), *not* an `sbp_…` token |
| `NEXT_PUBLIC_STREAM_API_KEY` / `STREAM_API_KEY` / `STREAM_API_SECRET` | public / server / **server** | Stream Chat |
| `RESEND_API_KEY` / `EMAIL_FROM` / `NOTIFY_EMAILS_ENABLED` | server | email; keep `false` outside prod |
| `NEXT_PUBLIC_SENTRY_DSN` | public | error monitoring (§8) |

**Pipeline-only (CI/CD plumbing):**

| Secret | Used by | Purpose |
|---|---|---|
| `DEV_SUPABASE_URL` / `DEV_SUPABASE_ANON_KEY` / `DEV_SUPABASE_SERVICE_ROLE_KEY` | `ci.yml` | **dev** project — the E2E step writes, so a staging value here means dev CI mutating staging |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | `deploy-staging.yml` | **staging** project (unprefixed = staging; dev's runtime secrets live in Railway, not here) |
| `AZURE_CREDENTIALS` (or OIDC) | `deploy-staging/prod.yml` | auth to Azure |
| `REGISTRY_LOGIN_SERVER` / `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | `deploy-staging.yml` | push container images. ⚠️ `deploy-prod.yml` reads `ACR_*` instead — unify before production, see CICD_INSTRUCTIONS_2026-08-06.md T5 |
| `SMOKE_CREATOR_USERNAME` (repo **variable**, not secret) | `deploy-staging.yml` | public creator handle on **staging** for the smoke test — set to `qacreator`, see below. `SMOKE_BUSINESS_USERNAME` is deliberately unset — business profiles are private, so the check would false-pass on `/login` |

> ### ⚠️ Do not delete: `qacreator` (staging only)
>
> The staging database holds one purpose-built profile that the deploy pipeline
> depends on. Deleting it makes every staging deploy fail at the smoke step.
>
> | | |
> |---|---|
> | Username | `qacreator` (public at `/c/qacreator` → `/qacreator`) |
> | Email | `test.creator@influnet.io` |
> | Created | 2026-08-06, for `deploy-staging.yml` |
>
> It is a fixture, not a real creator — it has no password anyone holds (reset via
> the Supabase dashboard if a login is ever needed) and it is labelled in-page so
> nobody contacts it during UAT. **Exclude it from any test-data cleanup.** It is
> visible in staging's creator search like any other profile.
>
> Removing it cleanly: delete the auth user in the **staging** Supabase project —
> `profiles` and `influencer_profiles` cascade. Update this doc and the repo
> variable at the same time.

---

## 7. Smoke tests  🛠️

After each staging/prod deploy the pipeline runs `scripts/smoke.mjs` against the freshly
deployed URL. Minimum assertions:

- `GET /api/health` → `200` (app up + Supabase reachable).
- `GET /c/<known-username>` and `/b/<known-username>` → `200` (public profiles stay public).
- Logged-out `GET /dashboard` → redirects to `/login`.

A failed smoke test **fails the deploy** (and, for prod, should trigger rollback to the previous image tag).

---

## 8. Monitoring  👤 + 🛠️

The "production-ready" monitoring layer for this stack — nothing more is needed for v1:

| Tool | Role | Setup |
|---|---|---|
| **Sentry** | Runtime error + performance tracking | 👤 create project → `NEXT_PUBLIC_SENTRY_DSN`; 🛠️ wire client/server/edge + `app/error.tsx` |
| **Uptime monitor** (UptimeRobot / Better Stack) | External "is the site up?" alerting | 👤 point a monitor at `/api/health`, every 1–5 min |
| **Azure Application Insights** | Native APM: CPU/memory/latency/HTTP errors | 👤 enable on the App Service (this is our "Grafana"; no Prometheus needed) |
| **Supabase dashboard** | DB/API metrics | ✅ built-in, nothing to set up |

**Deferred:** Grafana / Prometheus / Grafana Cloud — redundant with App Insights + Sentry for a managed-hosting setup. Revisit only at scale.

---

## 9. Security scanning  🛠️

Free replacements for the SonarQube/Trivy chain:

- `.github/dependabot.yml` — automated dependency-update PRs + CVE alerts.
- **CodeQL** workflow — static analysis on push/PR (GitHub-native, free for this repo).
- `npm audit` — already available; can be a non-blocking CI step.

---

## 10. Build checklist (what's left)

**Repo work:**
- [x] `apps/web/Dockerfile` + `.dockerignore` + `output: 'standalone'`
- [x] `apps/web/src/app/api/health/route.ts`
- [x] `scripts/smoke.mjs`
- [x] ~~`deploy-dev.yml`~~ — not needed; Railway deploys `dev` from its own GitHub integration
- [x] `.github/workflows/deploy-staging.yml` (migrate → Docker → ACR → Container Apps → health wait → smoke)
- [x] `.github/workflows/deploy-prod.yml` (promote image, manual approval, smoke) — ⚠️ written but **never run**; `main` does not exist on `origin`
- [x] `.github/workflows/codeql.yml`; `.github/dependabot.yml` still outstanding
- [x] Lint is blocking as of 2026-08-06. Branch protection on `dev` deliberately **not** enabled — direct pushes to `dev` are wanted, and required status checks block those too

**Human-only (you provision):** 👤
- [x] Second Supabase project for **staging**
- [x] Railway project (dev)
- [ ] Azure Container Registry + two App Services (staging, prod) + GitHub↔Azure credential
- [ ] All §6 secrets in GitHub + each host
- [ ] Sentry project + uptime monitor + enable App Insights
